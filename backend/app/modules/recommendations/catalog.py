"""Catálogo de produtos do Firebird formatado para prompt da IA, com cache em memória."""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass

from app.config import settings
from app.db.firebird import decode_blob, firebird_connection

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Catalogo:
    texto: str
    hash: str
    total_produtos: int


# Só produtos com benefícios cadastrados (PRO_BCO) — a IA recomenda só o que a
# loja descreveu, nada de inferir propriedade pelo nome. Cresce conforme o
# lojista preenche o campo no Nutify (refletido em até CATALOG_REFRESH_SECONDS).
_QUERY = """
SELECT p.PRO_COD, p.PRO_DES, g.GRU_DES, p.PRO_VLC, p.PRO_UND, p.PRO_QTD, p.PRO_BCO
FROM PRODUTO p
JOIN GRUPO g ON g.GRU_COD = p.PRO_GRU
WHERE p.PRO_SIT = 'A' AND p.PRO_IDB = 'S' AND p.PRO_BCO IS NOT NULL
ORDER BY p.PRO_DES
"""

# CAPS no Nutify identifica o pote (ex.: "60 caps"), não a cápsula avulsa — trata como unidade.
_SUFIXO_UNIDADE = {"KG": "kg", "UN": "un", "CAPS": "un"}


def _formatar_preco(preco, unidade: str | None) -> str:
    und = (unidade or "").strip().upper()
    sufixo = _SUFIXO_UNIDADE.get(und, und.lower() or "un")
    return f"R$ {float(preco):.2f}/{sufixo}".replace(".", ",")


def _formatar_produto(
    cod: int, nome: str, grupo: str, preco, unidade: str | None, estoque, beneficios: str | None
) -> str:
    preco_fmt = _formatar_preco(preco, unidade)
    indisponivel = " [SEM ESTOQUE]" if estoque is None or float(estoque) <= 0 else ""
    cabecalho = f"[{cod}] {nome} ({grupo}, {preco_fmt}){indisponivel}"
    if beneficios:
        texto = beneficios.strip().replace("\r\n", "\n").replace("\r", "\n")
        return f"{cabecalho}\nBenefícios: {texto}"
    return cabecalho


def _carregar_do_firebird() -> Catalogo:
    blocos: list[str] = ["=== CATÁLOGO CASA GRANUM ===\n"]
    total = 0

    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(_QUERY)
        for cod, nome, grupo, preco, unidade, estoque, bco in cur:
            beneficios = decode_blob(bco)
            beneficios_norm = beneficios.strip() if beneficios else None
            if not beneficios_norm:
                continue
            blocos.append(
                _formatar_produto(cod, nome, grupo, preco, unidade, estoque, beneficios_norm)
            )
            total += 1

    texto = "\n\n".join(blocos)
    digest = hashlib.sha256(texto.encode("utf-8")).hexdigest()
    logger.info("catalog loaded: %d produtos com benefícios, hash=%s", total, digest[:12])
    return Catalogo(texto=texto, hash=digest, total_produtos=total)


_cache: tuple[float, Catalogo] | None = None


def carregar_catalogo(force_refresh: bool = False) -> Catalogo:
    """Retorna o catálogo formatado, usando cache em memória com TTL de settings.catalog_refresh_seconds."""
    global _cache
    agora = time.monotonic()
    if not force_refresh and _cache is not None:
        timestamp, catalogo = _cache
        if agora - timestamp < settings.catalog_refresh_seconds:
            return catalogo
    catalogo = _carregar_do_firebird()
    _cache = (agora, catalogo)
    return catalogo


def refresh_em_background() -> None:
    """Hook do scheduler: força refresh do catálogo, log silencia falhas transitórias."""
    try:
        carregar_catalogo(force_refresh=True)
    except Exception:
        logger.exception("falha ao atualizar catálogo")
