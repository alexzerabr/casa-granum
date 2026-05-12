"""POST /recomendacoes — Aba 1: Consultar por Objetivo."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.modules.recommendations import ai, cache, catalog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recomendacoes", tags=["recomendacoes"])


class RecomendacaoRequest(BaseModel):
    objetivo: str = Field(min_length=2, max_length=500)


class ProdutoRecomendado(BaseModel):
    pro_cod: int
    nome: str
    motivo: str


class RecomendacaoResponse(BaseModel):
    objetivo: str
    cached: bool
    total_produtos_analisados: int
    produtos: list[ProdutoRecomendado]


class CatalogoInfo(BaseModel):
    total_produtos: int


@router.get("/info", response_model=CatalogoInfo)
async def info_catalogo() -> CatalogoInfo:
    catalogo = await asyncio.to_thread(catalog.carregar_catalogo)
    return CatalogoInfo(total_produtos=catalogo.total_produtos)


@router.post("", response_model=RecomendacaoResponse)
async def gerar_recomendacao(req: RecomendacaoRequest) -> RecomendacaoResponse:
    objetivo_hash = cache.hash_objetivo(req.objetivo)

    catalogo = await asyncio.to_thread(catalog.carregar_catalogo)

    cached = await cache.buscar(objetivo_hash, catalogo.hash)
    if cached is not None:
        logger.info("cache hit objetivo=%r", req.objetivo)
        return RecomendacaoResponse(
            objetivo=req.objetivo,
            cached=True,
            total_produtos_analisados=catalogo.total_produtos,
            produtos=cached,
        )

    try:
        produtos = await asyncio.to_thread(ai.recomendar, req.objetivo, catalogo.texto)
    except ai.RecomendacaoError as exc:
        logger.error("falha na recomendação: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    await cache.salvar(objetivo_hash, req.objetivo, catalogo.hash, produtos)

    return RecomendacaoResponse(
        objetivo=req.objetivo,
        cached=False,
        total_produtos_analisados=catalogo.total_produtos,
        produtos=produtos,
    )
