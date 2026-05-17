"""Controle de remessas com snapshot de estoque/custo/preço."""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.db import firebird as fb
from app.modules.remessas import checker, events, health, nutify, pricing, repository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/remessas", tags=["remessas"])

Estado = Literal["ativa", "alerta_preco", "concluida", "cancelada"]


class ProdutoBusca(BaseModel):
    pro_cod: int
    pro_des: str
    unidade: str


class Snapshot(BaseModel):
    pro_cod: int
    pro_des: str
    unidade: str
    estoque_atual: float
    estoque_min: float
    custo_atual: float
    preco_atual: float
    markup_pct: float
    tem_pauta: bool
    tem_remessa_ativa: bool


class PreviewPrecoIn(BaseModel):
    novo_custo: float = Field(gt=0)
    markup_pct: float = Field(ge=0)
    custo_antigo: float | None = Field(default=None, gt=0)


class PreviewPrecoOut(BaseModel):
    preco_sugerido: float


class RemessaCreate(BaseModel):
    pro_cod: int
    novo_custo: float = Field(gt=0)
    # Override opcional do limiar de alerta (% restante). Default vem do .env.
    alerta_threshold_pct: float | None = Field(default=None, gt=0, lt=1)


class RemessaCancelar(BaseModel):
    motivo: str | None = Field(default=None, max_length=200)


class Remessa(BaseModel):
    id: int
    pro_cod: int
    pro_des: str
    unidade: str
    estoque_antigo: float
    custo_antigo: float
    preco_antigo: float
    markup_pct: float
    custo_novo: float
    preco_sugerido: float
    alerta_threshold_pct: float
    estado: Estado
    iniciada_em: str
    alertada_em: str | None
    notificada_em: str | None
    concluida_em: str | None
    cancelada_em: str | None
    motivo_cancelamento: str | None
    preco_final: float | None
    # Calculados ao vivo.
    vendido: float
    consumo_pct: float


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _enriquecer(r: dict) -> dict:
    """Adiciona vendido + consumo_pct (lendo Firebird).

    vendido = vendas_acumuladas_agora − vendas_baseline (snapshot da criação).
    Substitui filtro por data — MOI_DTE no Nutify é DATE, sem hora, daí vendas
    do mesmo dia anteriores à criação vazariam.
    """
    estoque_antigo = float(r["estoque_antigo"]) or 0.0
    if r["estado"] in ("ativa", "alerta_preco") and estoque_antigo > 0:
        acumulado = await asyncio.to_thread(nutify.vendas_acumuladas_cached, r["pro_cod"])
        vendido = max(0.0, acumulado - float(r["vendas_baseline"]))
        consumo = min(vendido / estoque_antigo, 1.0)
    else:
        vendido = estoque_antigo if r["estado"] == "concluida" else 0.0
        consumo = 1.0 if r["estado"] == "concluida" else 0.0
    return {**r, "vendido": vendido, "consumo_pct": consumo}


@router.get("/produtos", response_model=list[ProdutoBusca])
async def buscar_produtos(
    q: str = Query(min_length=2, max_length=80),
    limite: int = Query(default=15, ge=1, le=50),
) -> list[ProdutoBusca]:
    itens = await asyncio.to_thread(nutify.buscar_produtos, q, limite)
    return [ProdutoBusca(**i) for i in itens]


@router.get("/produtos/{pro_cod}/snapshot", response_model=Snapshot)
async def snapshot_produto(pro_cod: int) -> Snapshot:
    snap = await asyncio.to_thread(nutify.snapshot_produto, pro_cod)
    if snap is None:
        raise HTTPException(status_code=404, detail="produto não monitorável")
    tem_ativa = await repository.tem_ativa(pro_cod)
    return Snapshot(**snap, tem_remessa_ativa=tem_ativa)


@router.post("/preview-preco", response_model=PreviewPrecoOut)
def preview_preco(req: PreviewPrecoIn) -> PreviewPrecoOut:
    return PreviewPrecoOut(
        preco_sugerido=pricing.sugerir_preco(
            req.novo_custo, req.markup_pct, req.custo_antigo
        )
    )


@router.get("", response_model=list[Remessa])
async def listar(
    estado: Estado | None = Query(default=None),
) -> list[Remessa]:
    estados = [estado] if estado else None
    rows = await repository.listar(estados=estados)
    enriquecidas = await asyncio.gather(*(_enriquecer(r) for r in rows))
    return [Remessa(**r) for r in enriquecidas]


@router.post("", response_model=Remessa, status_code=201)
async def criar(req: RemessaCreate) -> Remessa:
    snap = await asyncio.to_thread(nutify.snapshot_produto, req.pro_cod)
    if snap is None:
        raise HTTPException(status_code=404, detail="produto não monitorável")
    if not snap["tem_pauta"] or snap["markup_pct"] <= 0:
        raise HTTPException(
            status_code=422,
            detail="produto fora da pauta padrão (PTA=1) — configure preço/markup no Nutify primeiro",
        )
    baseline = await asyncio.to_thread(nutify.vendas_acumuladas, req.pro_cod)
    preco_sugerido = pricing.sugerir_preco(
        req.novo_custo, snap["markup_pct"], snap["custo_atual"]
    )
    data = {
        "pro_cod": snap["pro_cod"],
        "pro_des": snap["pro_des"],
        "unidade": snap["unidade"],
        "estoque_antigo": snap["estoque_atual"],
        "custo_antigo": snap["custo_atual"],
        "preco_antigo": snap["preco_atual"],
        "markup_pct": snap["markup_pct"],
        "custo_novo": req.novo_custo,
        "preco_sugerido": preco_sugerido,
        "alerta_threshold_pct": req.alerta_threshold_pct or settings.stock_preco_alert_pct,
        "vendas_baseline": baseline,
    }
    # INSERT cego — UNIQUE INDEX uq_remessa_ativa_por_produto resolve corrida
    # entre duas requests simultâneas; o check-then-insert anterior tinha janela.
    try:
        novo_id = await repository.criar(data)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="já existe remessa ativa para este produto — encerre antes de iniciar outra",
        )
    criada = await repository.obter(novo_id)
    assert criada is not None
    enriquecida = await _enriquecer(criada)
    return Remessa(**enriquecida)


@router.post("/{remessa_id}/cancelar", response_model=Remessa)
async def cancelar(remessa_id: int, req: RemessaCancelar) -> Remessa:
    atual = await repository.obter(remessa_id)
    if atual is None:
        raise HTTPException(status_code=404, detail="remessa não encontrada")
    if atual["estado"] not in ("ativa", "alerta_preco"):
        raise HTTPException(status_code=409, detail="remessa não está mais ativa")
    await repository.cancelar(remessa_id, req.motivo)
    final = await repository.obter(remessa_id)
    assert final is not None
    return Remessa(**(await _enriquecer(final)))


@router.post("/{remessa_id}/concluir-manual", response_model=Remessa)
async def concluir_manual(remessa_id: int) -> Remessa:
    atual = await repository.obter(remessa_id)
    if atual is None:
        raise HTTPException(status_code=404, detail="remessa não encontrada")
    if atual["estado"] not in ("ativa", "alerta_preco"):
        raise HTTPException(status_code=409, detail="remessa não está mais ativa")
    preco_atual = await asyncio.to_thread(nutify.preco_venda_atual, atual["pro_cod"])
    if preco_atual is None:
        raise HTTPException(status_code=502, detail="não foi possível ler preço atual no Firebird")
    await repository.concluir(remessa_id, preco_atual)
    final = await repository.obter(remessa_id)
    assert final is not None
    return Remessa(**(await _enriquecer(final)))


@router.post("/run")
async def run_manual() -> dict:
    return await health.executar(checker.executar_verificacao, origem="manual")


@router.get("/stream")
async def stream() -> StreamingResponse:
    """Server-Sent Events — emite `tick` ao fim de cada ciclo do checker.

    Heartbeat a cada 20 s mantém a conexão viva atrás de proxies (Cloudflare
    desconecta sem tráfego ~100 s). Frontend mantém polling em paralelo como
    fallback caso a stream caia.
    """

    async def gen():
        q = events.subscribe()
        try:
            yield ": connected\n\n"
            while True:
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield f"event: {evt['tipo']}\ndata: {json.dumps(evt)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            events.unsubscribe(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/metricas")
async def metricas() -> dict:
    """Tempo entre criação e conclusão. Útil pra calibrar threshold default."""
    return await repository.tempos_conclusao()


@router.get("/saude")
async def saude() -> dict:
    """Snapshot pra observabilidade — scheduler, contagens, dependências externas."""
    from app.modules.monitor import scheduler as global_scheduler

    proxima = global_scheduler.proxima_execucao("remessas_checker")
    contagens = await repository.contagem_por_estado()

    # Firebird: latência medida; erro vai pro `ok=False` em vez de quebrar o endpoint.
    fb_status: dict
    inicio = datetime.now(timezone.utc)
    try:
        await asyncio.to_thread(fb.ping)
        fb_status = {
            "ok": True,
            "latencia_ms": int((datetime.now(timezone.utc) - inicio).total_seconds() * 1000),
        }
    except Exception as e:
        fb_status = {"ok": False, "erro": f"{type(e).__name__}: {str(e)[:200]}"}

    return {
        "checker": {
            **health.estado(),
            "intervalo_minutos": settings.remessa_check_minutes,
            "proxima_execucao": proxima.isoformat() if proxima else None,
        },
        "remessas": contagens,
        "dependencias": {
            "firebird": fb_status,
            "telegram_configurado": bool(settings.telegram_bot_token and settings.telegram_chat_id),
        },
    }


@router.delete("/historico")
async def limpar_historico() -> dict:
    removidas = await repository.limpar_historico()
    return {"removidas": removidas}


@router.delete("/{remessa_id}")
async def remover(remessa_id: int) -> dict:
    atual = await repository.obter(remessa_id)
    if atual is None:
        raise HTTPException(status_code=404, detail="remessa não encontrada")
    if atual["estado"] not in ("concluida", "cancelada"):
        raise HTTPException(
            status_code=409,
            detail="só é possível apagar remessas concluídas ou canceladas — cancele antes",
        )
    await repository.remover(remessa_id)
    return {"removida": True}
