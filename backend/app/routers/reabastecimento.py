"""GET /reabastecimento + POST /reabastecimento/run (manual trigger)."""

from __future__ import annotations

import asyncio

import aiosqlite
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings
from app.modules.monitor import checker

router = APIRouter(prefix="/reabastecimento", tags=["reabastecimento"])


class ItemReabastecimento(BaseModel):
    pro_cod: int
    pro_des: str
    grupo: str | None
    unidade: str        # unidade de COMPRA (PRO_UNDE) — KG/UN/CX
    unidade_venda: str  # unidade de VENDA  (PRO_UND)  — KG/UN/CAPS
    estoque_min_kg: float
    estoque_atual_kg: float | None
    qtd_reposicao: float | None
    alerta_em: str | None
    ultima_verif: str | None
    nivel: str  # 'critico' (abaixo do mínimo) | 'alerta' (acima do mín, dentro da margem)


class SumarioVerificacao(BaseModel):
    verificados: int
    novos_alertas: int
    repostos: int
    em_alerta: int
    executado_em: str


def _calcular_nivel(atual: float | None, minimo: float) -> str:
    if atual is None:
        return "alerta"
    return "critico" if atual <= minimo else "alerta"


@router.get("", response_model=list[ItemReabastecimento])
async def listar() -> list[ItemReabastecimento]:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT pro_cod, pro_des, grupo, unidade, unidade_venda,
                   estoque_min_kg, estoque_atual_kg, qtd_reposicao,
                   alerta_em, ultima_verif
            FROM lista_reabastecimento
            WHERE estado = 'alerta_enviado'
            ORDER BY alerta_em DESC
            """
        )
        rows = await cursor.fetchall()

    return [
        ItemReabastecimento(
            pro_cod=row["pro_cod"],
            pro_des=row["pro_des"],
            grupo=row["grupo"],
            unidade=(row["unidade"] or "KG").upper(),
            unidade_venda=(row["unidade_venda"] or row["unidade"] or "KG").upper(),
            estoque_min_kg=row["estoque_min_kg"],
            estoque_atual_kg=row["estoque_atual_kg"],
            qtd_reposicao=row["qtd_reposicao"],
            alerta_em=row["alerta_em"],
            ultima_verif=row["ultima_verif"],
            nivel=_calcular_nivel(row["estoque_atual_kg"], row["estoque_min_kg"]),
        )
        for row in rows
    ]


@router.post("/run", response_model=SumarioVerificacao)
async def executar_agora() -> SumarioVerificacao:
    """Trigger manual da verificação. Útil pra testar sem esperar o intervalo."""
    sumario = await asyncio.to_thread(checker.executar_verificacao)
    return SumarioVerificacao(**sumario)
