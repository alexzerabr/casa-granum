"""Endpoints de ranking de produtos mais vendidos."""

from __future__ import annotations

import csv
import io
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.modules.rank import repository

router = APIRouter(prefix="/rank", tags=["rank"])

Ordem = Literal["qtd", "valor", "movimentos"]
Direcao = Literal["asc", "desc"]
Granularidade = Literal["dia", "semana", "mes"]

_MAX_INTERVALO_DIAS = 730


class ItemRank(BaseModel):
    pro_cod: int
    pro_des: str
    pro_und: str
    grupo: str | None
    total_qtd: float
    total_valor: float
    n_vendas: int
    ultima_venda: str | None
    delta_valor_pct: float | None


class RankResposta(BaseModel):
    itens: list[ItemRank]
    total: int


class PontoSerie(BaseModel):
    dia: str
    qtd: float
    valor: float
    n_vendas: int


class GrupoOpcao(BaseModel):
    nome: str
    n_produtos: int


def _faixa(desde: date | None, ate: date | None, padrao_dias: int) -> tuple[date, date]:
    hoje = date.today()
    f_ate = ate or hoje
    f_desde = desde or (f_ate - timedelta(days=padrao_dias))
    if f_desde > f_ate:
        raise HTTPException(status_code=400, detail="desde > ate")
    if (f_ate - f_desde).days > _MAX_INTERVALO_DIAS:
        raise HTTPException(status_code=400, detail="intervalo maior que 2 anos")
    return f_desde, f_ate


def _gran_default(desde: date, ate: date) -> Granularidade:
    dias = (ate - desde).days + 1
    if dias <= 60:
        return "dia"
    if dias <= 200:
        return "semana"
    return "mes"


@router.get("", response_model=RankResposta)
async def listar(
    desde: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    grupo: str | None = Query(default=None, max_length=80),
    q: str | None = Query(default=None, max_length=80),
    limite: int = Query(default=50, ge=1, le=200),
    ordem: Ordem | None = Query(default=None),
    dir: Direcao = Query(default="desc"),
) -> RankResposta:
    d, a = _faixa(desde, ate, padrao_dias=30)
    grupo_s = grupo.strip() if grupo else None
    # Sem filtro de grupo, ordenar por qtd mistura unidades — default p/ valor.
    ordem_final: Ordem = ordem or ("qtd" if grupo_s else "valor")
    itens, total = await repository.top(
        d, a, grupo_s, q.strip() if q else None, limite, ordem_final, dir
    )
    return RankResposta(
        itens=[ItemRank(**i.__dict__) for i in itens],
        total=total,
    )


@router.get("/grupos", response_model=list[GrupoOpcao])
async def listar_grupos(
    desde: date | None = Query(default=None),
    ate: date | None = Query(default=None),
) -> list[GrupoOpcao]:
    d, a = _faixa(desde, ate, padrao_dias=30)
    return [GrupoOpcao(**g.__dict__) for g in await repository.grupos(d, a)]


@router.get("/csv")
async def exportar_csv(
    desde: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    grupo: str | None = Query(default=None, max_length=80),
    q: str | None = Query(default=None, max_length=80),
    limite: int = Query(default=200, ge=1, le=1000),
    ordem: Ordem | None = Query(default=None),
    dir: Direcao = Query(default="desc"),
):
    d, a = _faixa(desde, ate, padrao_dias=30)
    grupo_s = grupo.strip() if grupo else None
    ordem_final: Ordem = ordem or ("qtd" if grupo_s else "valor")
    itens, _ = await repository.top(
        d, a, grupo_s, q.strip() if q else None, limite, ordem_final, dir, com_delta=False
    )

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["posicao", "pro_cod", "produto", "grupo", "unidade",
                "n_vendas", "qtd_total", "valor_total", "ultima_venda"])
    for i, it in enumerate(itens, 1):
        w.writerow([
            i, it.pro_cod, it.pro_des, it.grupo or "", it.pro_und,
            it.n_vendas, f"{it.total_qtd:.3f}", f"{it.total_valor:.2f}",
            it.ultima_venda or "",
        ])
    buf.seek(0)
    nome = f"rank_{d.isoformat()}_{a.isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.get("/{pro_cod}/serie", response_model=list[PontoSerie])
async def serie(
    pro_cod: int,
    desde: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    granularidade: Granularidade | None = Query(default=None),
) -> list[PontoSerie]:
    d, a = _faixa(desde, ate, padrao_dias=30)
    g = granularidade or _gran_default(d, a)
    pontos = await repository.serie(pro_cod, d, a, g)
    return [PontoSerie(**p.__dict__) for p in pontos]
