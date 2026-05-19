"""Geração de pedido de compra (IA + fallback determinístico).

Agrega duas origens em uma única lista:
  1. Estoque baixo na loja (PRO_QTD <= PRO_EMN no Firebird)
  2. Solicitações de clientes (pedido.status='aberto' no SQLite)

A IA (Gemini) sugere quantidades considerando vendas dos últimos 30 dias.
Falha do LLM cai numa regra determinística — sistema nunca depende da IA.
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Literal

import aiosqlite
from pydantic import BaseModel

from app.config import settings
from app.db.firebird import firebird_connection

logger = logging.getLogger(__name__)

VENDAS_JANELA_DIAS = 30
PASSO_KG = 0.5  # granularidade de compra a granel
ALVO_MULTIPLO_MIN = 1.5  # repor pelo menos 1,5× o mínimo
LIMITE_PRODUTOS_LLM = 80  # teto pro prompt; ordena pelos mais críticos primeiro

Origem = Literal["estoque", "cliente"]


class ItemBase(BaseModel):
    id: str  # estável: "e:<pro_cod>" ou "c:<pedido_id>"
    origem: Origem
    pro_cod: int | None
    pro_des: str
    und_venda: str
    und_compra: str
    vendas_30d: float | None
    # Estoque baixo:
    estoque_atual: float | None = None
    estoque_min: float | None = None
    # Cliente:
    clientes_solicitando: int | None = None
    clientes_nomes: list[str] | None = None


class ItemResposta(BaseModel):
    id: str
    origem: Origem
    pro_cod: int | None
    pro_des: str
    unidade: str
    qtd_sugerida: float
    clientes: list[str] | None = None


class PedidoCompra(BaseModel):
    gerado_por: Literal["llm", "regra"]
    estoque_baixo: list[ItemResposta]
    solicitacoes_clientes: list[ItemResposta]


# ─── Coleta ────────────────────────────────────────────────────────────────


def _coletar_estoque_baixo_sync() -> list[ItemBase]:
    """Produtos com PRO_QTD <= PRO_EMN (crítico). Inclui vendas dos últimos N dias.

    Uma única conexão + uma única query agregada de vendas pra todos os produtos
    de interesse (em vez de query-por-produto). Cobre 100+ críticos em < 1s.
    """
    desde = datetime.now(timezone.utc) - timedelta(days=VENDAS_JANELA_DIAS)
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(
            f"""
            SELECT FIRST {LIMITE_PRODUTOS_LLM} p.PRO_COD, p.PRO_DES,
              CAST(p.PRO_QTD AS DOUBLE PRECISION),
              CAST(p.PRO_EMN AS DOUBLE PRECISION),
              p.PRO_UND, p.PRO_UNDE
            FROM PRODUTO p
            WHERE p.PRO_SIT = 'A' AND p.PRO_IDB = 'S'
              AND p.PRO_EMN IS NOT NULL AND p.PRO_EMN > 0
              AND p.PRO_QTD <= p.PRO_EMN
            ORDER BY CAST(p.PRO_QTD AS DOUBLE PRECISION) / CAST(p.PRO_EMN AS DOUBLE PRECISION) ASC
            """,
        )
        rows = cur.fetchall()

        itens: list[ItemBase] = []
        pro_cods: list[int] = []
        for pro_cod, pro_des, qtd, emn, und_v, und_c in rows:
            und_venda = (und_v or "KG").strip().upper()
            und_compra = (und_c or und_venda).strip().upper()
            cod_int = int(pro_cod)
            pro_cods.append(cod_int)
            itens.append(
                ItemBase(
                    id=f"e:{cod_int}",
                    origem="estoque",
                    pro_cod=cod_int,
                    pro_des=pro_des,
                    und_venda=und_venda,
                    und_compra=und_compra,
                    estoque_atual=float(qtd or 0),
                    estoque_min=float(emn or 0),
                    vendas_30d=0.0,
                )
            )

        if pro_cods:
            vendas = _vendas_batch(con, pro_cods, desde)
            for item in itens:
                if item.pro_cod is not None:
                    item.vendas_30d = vendas.get(item.pro_cod, 0.0)
    return itens


def _vendas_batch(con, pro_cods: list[int], desde: datetime) -> dict[int, float]:
    """SUM(MOI_QTD) por produto pra um conjunto de pro_cod numa única query."""
    if not pro_cods:
        return {}
    placeholders = ",".join("?" * len(pro_cods))
    cur = con.cursor()
    cur.execute(
        f"""
        SELECT mi.MOI_PRO, COALESCE(SUM(mi.MOI_QTD), 0)
        FROM MOVIMENTOITENS mi
        JOIN MOVIMENTO m ON m.MOV_COD = mi.MOI_MOV
        WHERE mi.MOI_PRO IN ({placeholders})
          AND mi.MOI_SIT = 'S' AND m.MOV_SIT = 'S'
          AND mi.MOI_DTE >= ?
        GROUP BY mi.MOI_PRO
        """,
        (*pro_cods, desde),
    )
    return {int(r[0]): float(r[1] or 0) for r in cur.fetchall()}


async def _coletar_solicitacoes_clientes() -> list[ItemBase]:
    """Pedidos abertos (SQLite) + complemento com vendas_30d (Firebird) quando há pro_cod."""
    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            SELECT p.id, p.produto_nome, p.pro_cod, p.unidade,
              COUNT(pc.id) AS n_clientes,
              GROUP_CONCAT(pc.nome, '||') AS clientes_nomes
            FROM pedido p
            LEFT JOIN pedido_cliente pc ON pc.pedido_id = p.id
            WHERE p.status = 'aberto'
            GROUP BY p.id
            ORDER BY p.criado_em DESC
            """
        )
        rows = await cur.fetchall()

    itens: list[ItemBase] = []
    for row in rows:
        pro_cod = int(row["pro_cod"]) if row["pro_cod"] is not None else None
        und = (row["unidade"] or "UN").strip().upper()
        nomes = [n for n in (row["clientes_nomes"] or "").split("||") if n]
        itens.append(
            ItemBase(
                id=f"c:{row['id']}",
                origem="cliente",
                pro_cod=pro_cod,
                pro_des=row["produto_nome"],
                und_venda=und,
                und_compra=und,
                clientes_solicitando=max(1, int(row["n_clientes"] or 0)),
                clientes_nomes=nomes,
                vendas_30d=None,
            )
        )

    # vendas_30d em batch pra todos os pro_cod presentes (1 conexão, 1 query)
    cods = [i.pro_cod for i in itens if i.pro_cod is not None]
    if cods:
        try:
            desde = datetime.now(timezone.utc) - timedelta(days=VENDAS_JANELA_DIAS)
            vendas = await asyncio.to_thread(_vendas_batch_uma_conexao, cods, desde)
            for item in itens:
                if item.pro_cod is not None:
                    item.vendas_30d = vendas.get(item.pro_cod, 0.0)
        except Exception:
            logger.warning("falha lendo vendas em batch pra pedidos de cliente — segue sem dado")
    return itens


def _vendas_batch_uma_conexao(pro_cods: list[int], desde: datetime) -> dict[int, float]:
    with firebird_connection() as con:
        return _vendas_batch(con, pro_cods, desde)


# ─── Regra determinística (fallback) ───────────────────────────────────────


def _passo(unidade: str) -> float:
    return PASSO_KG if unidade.upper() == "KG" else 1.0


def _arredondar_cima(valor: float, passo: float) -> float:
    if valor <= 0:
        return passo
    return round(math.ceil(valor / passo) * passo, 3)


def _regra_estoque(item: ItemBase) -> float:
    passo = _passo(item.und_compra)
    minimo = item.estoque_min or 0
    atual = item.estoque_atual or 0
    vendas = item.vendas_30d or 0
    # Cobrir vendas + repor até alvo, descontando o que já tem.
    alvo = max(minimo * ALVO_MULTIPLO_MIN, atual + vendas)
    gap = max(passo, alvo - atual)
    return _arredondar_cima(gap, passo)


def _regra_cliente(item: ItemBase) -> float:
    passo = _passo(item.und_compra)
    base = max(1, item.clientes_solicitando or 1)
    return _arredondar_cima(float(base), passo)


def _gerar_via_regra(estoque: list[ItemBase], clientes: list[ItemBase]) -> dict[str, float]:
    return {
        **{i.id: _regra_estoque(i) for i in estoque},
        **{i.id: _regra_cliente(i) for i in clientes},
    }


# ─── Gemini ────────────────────────────────────────────────────────────────


class _Sugestao(BaseModel):
    item_id: str
    qtd_sugerida: float


_PROMPT = (
    "Você é assistente de reposição da Casa Granum (loja de granéis e naturais).\n\n"
    "Para cada produto abaixo, sugira `qtd_sugerida` na unidade de COMPRA do produto.\n"
    "Considere:\n"
    "- origem=estoque: cobrir vendas dos últimos 30 dias + repor até pelo menos 1,5× o mínimo.\n"
    "- origem=cliente: pelo menos o suficiente pra atender os clientes solicitantes (use clientes_solicitando).\n"
    "- Arredondar à granularidade comercial: KG em múltiplos de 0,5 · UN/CAPS/CX em inteiros.\n"
    "- Se vendas_30d=null ou 0 e estoque>0, sugerir reposição mínima.\n\n"
    "Retorne APENAS o JSON estruturado, sem justificativas. Use o item_id exato de cada linha."
)


def _formatar_payload(estoque: list[ItemBase], clientes: list[ItemBase]) -> str:
    linhas = []
    for i in estoque + clientes:
        if i.origem == "estoque":
            v = f"{i.vendas_30d:.2f}" if i.vendas_30d is not None else "null"
            linhas.append(
                f"- [estoque] item_id={i.id} · {i.pro_des} · venda={i.und_venda} compra={i.und_compra}"
                f" · atual={i.estoque_atual:.2f} · min={i.estoque_min:.2f} · vendas_30d={v}"
            )
        else:
            v = f"{i.vendas_30d:.2f}" if i.vendas_30d is not None else "null"
            cod = i.pro_cod if i.pro_cod is not None else "null"
            linhas.append(
                f"- [cliente] item_id={i.id} · pro_cod={cod} · {i.pro_des}"
                f" · venda={i.und_venda} compra={i.und_compra}"
                f" · clientes_solicitando={i.clientes_solicitando} · vendas_30d={v}"
            )
    return "\n".join(linhas)


def _gerar_via_gemini(estoque: list[ItemBase], clientes: list[ItemBase]) -> dict[str, float]:
    from google import genai
    from google.genai import errors, types

    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY não configurada")

    client = genai.Client(api_key=settings.gemini_api_key)
    payload = _formatar_payload(estoque, clientes)
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[f"PRODUTOS:\n{payload}"],
            config=types.GenerateContentConfig(
                system_instruction=[_PROMPT],
                response_mime_type="application/json",
                response_schema=list[_Sugestao],
                temperature=0.2,
            ),
        )
    except errors.APIError as exc:
        raise RuntimeError(f"erro Gemini API: {exc}") from exc

    parsed = response.parsed
    if not isinstance(parsed, list):
        raise RuntimeError(f"resposta sem itens parseáveis (text={response.text!r})")
    sugestoes: dict[str, float] = {}
    for s in parsed:
        d = s.model_dump() if isinstance(s, _Sugestao) else s
        sugestoes[d["item_id"]] = float(d["qtd_sugerida"])
    return sugestoes


# ─── Entry point ───────────────────────────────────────────────────────────


async def gerar() -> PedidoCompra:
    estoque_task = asyncio.to_thread(_coletar_estoque_baixo_sync)
    clientes_task = _coletar_solicitacoes_clientes()
    estoque, clientes = await asyncio.gather(estoque_task, clientes_task)

    if not estoque and not clientes:
        return PedidoCompra(gerado_por="regra", estoque_baixo=[], solicitacoes_clientes=[])

    sugestoes: dict[str, float]
    gerado_por: Literal["llm", "regra"]
    try:
        sugestoes = await asyncio.to_thread(_gerar_via_gemini, estoque, clientes)
        gerado_por = "llm"
        # Garante que todo item tem sugestão; gap = regra
        regra_fallback = _gerar_via_regra(estoque, clientes)
        for k, v in regra_fallback.items():
            sugestoes.setdefault(k, v)
    except Exception as e:
        logger.warning("Gemini falhou em pedido_compra; usando regra determinística: %s", e)
        sugestoes = _gerar_via_regra(estoque, clientes)
        gerado_por = "regra"

    def _resp(item: ItemBase) -> ItemResposta:
        return ItemResposta(
            id=item.id,
            origem=item.origem,
            pro_cod=item.pro_cod,
            pro_des=item.pro_des,
            unidade=item.und_compra,
            qtd_sugerida=sugestoes.get(item.id, 1.0),
            clientes=item.clientes_nomes if item.origem == "cliente" else None,
        )

    return PedidoCompra(
        gerado_por=gerado_por,
        estoque_baixo=[_resp(i) for i in estoque],
        solicitacoes_clientes=[_resp(i) for i in clientes],
    )
