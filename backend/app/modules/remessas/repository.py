"""Persistência SQLite das remessas."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

import aiosqlite

from app.config import settings

Estado = Literal["ativa", "alerta_preco", "concluida", "cancelada"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_dict(row: aiosqlite.Row) -> dict:
    return dict(row)


async def listar(estados: Optional[list[Estado]] = None) -> list[dict]:
    where = ""
    params: tuple = ()
    if estados:
        placeholders = ",".join("?" * len(estados))
        where = f"WHERE estado IN ({placeholders})"
        params = tuple(estados)
    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            f"SELECT * FROM remessas {where} ORDER BY iniciada_em DESC", params
        )
        rows = await cur.fetchall()
        return [row_to_dict(r) for r in rows]


async def obter(remessa_id: int) -> Optional[dict]:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM remessas WHERE id = ?", (remessa_id,))
        row = await cur.fetchone()
        return row_to_dict(row) if row else None


async def tem_ativa(pro_cod: int) -> bool:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        cur = await db.execute(
            "SELECT 1 FROM remessas WHERE pro_cod = ? AND estado IN ('ativa','alerta_preco') LIMIT 1",
            (pro_cod,),
        )
        return (await cur.fetchone()) is not None


async def criar(data: dict) -> int:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        cur = await db.execute(
            """
            INSERT INTO remessas
              (pro_cod, pro_des, unidade,
               estoque_antigo, custo_antigo, preco_antigo, markup_pct,
               custo_novo, preco_sugerido, alerta_threshold_pct,
               estado, iniciada_em, vendas_baseline)
            VALUES (?,?,?, ?,?,?,?, ?,?,?, 'ativa', ?, ?)
            """,
            (
                data["pro_cod"],
                data["pro_des"],
                data["unidade"],
                data["estoque_antigo"],
                data["custo_antigo"],
                data["preco_antigo"],
                data["markup_pct"],
                data["custo_novo"],
                data["preco_sugerido"],
                data["alerta_threshold_pct"],
                _now(),
                data["vendas_baseline"],
            ),
        )
        await db.commit()
        return cur.lastrowid


async def marcar_alerta(remessa_id: int, *, notificada: bool) -> None:
    agora = _now()
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute(
            "UPDATE remessas SET estado='alerta_preco', alertada_em=?, "
            "notificada_em=CASE WHEN ? THEN ? ELSE notificada_em END WHERE id=?",
            (agora, notificada, agora, remessa_id),
        )
        await db.commit()


async def marcar_notificada(remessa_id: int) -> None:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute(
            "UPDATE remessas SET notificada_em=? WHERE id=?", (_now(), remessa_id)
        )
        await db.commit()


async def reverter_alerta(remessa_id: int) -> None:
    """Volta de alerta_preco → ativa. Preserva alertada_em (histórico)."""
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute(
            "UPDATE remessas SET estado='ativa' WHERE id=? AND estado='alerta_preco'",
            (remessa_id,),
        )
        await db.commit()


async def concluir(remessa_id: int, preco_final: float) -> None:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute(
            "UPDATE remessas SET estado='concluida', concluida_em=?, preco_final=? WHERE id=?",
            (_now(), preco_final, remessa_id),
        )
        await db.commit()


async def cancelar(remessa_id: int, motivo: Optional[str]) -> None:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute(
            "UPDATE remessas SET estado='cancelada', cancelada_em=?, motivo_cancelamento=? WHERE id=?",
            (_now(), motivo, remessa_id),
        )
        await db.commit()


async def limpar_historico() -> int:
    """Apaga remessas concluídas/canceladas. Retorna nº de linhas removidas."""
    async with aiosqlite.connect(settings.sqlite_path) as db:
        cur = await db.execute(
            "DELETE FROM remessas WHERE estado IN ('concluida','cancelada')"
        )
        await db.commit()
        return cur.rowcount or 0


async def remover(remessa_id: int) -> None:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute("DELETE FROM remessas WHERE id = ?", (remessa_id,))
        await db.commit()


async def contagem_por_estado() -> dict[str, int]:
    """Quantas remessas existem em cada estado. Estados ausentes retornam 0."""
    estados = ("ativa", "alerta_preco", "concluida", "cancelada")
    async with aiosqlite.connect(settings.sqlite_path) as db:
        cur = await db.execute(
            "SELECT estado, COUNT(*) FROM remessas GROUP BY estado"
        )
        rows = await cur.fetchall()
    base = {e: 0 for e in estados}
    base.update({estado: total for estado, total in rows})
    return base
