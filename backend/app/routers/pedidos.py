"""CRUD de pedidos de clientes (Aba 3) — 100% SQLite, sem Firebird."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config import settings

router = APIRouter(prefix="/pedidos", tags=["pedidos"])

Status = Literal["aberto", "atendido", "cancelado"]


class PedidoCreate(BaseModel):
    produto_nome: str = Field(min_length=1, max_length=200)
    cliente_nome: str | None = Field(default=None, max_length=200)
    observacao: str | None = Field(default=None, max_length=1000)
    criado_por: str | None = Field(default=None, max_length=100)


class PedidoUpdate(BaseModel):
    status: Status


class Pedido(BaseModel):
    id: int
    produto_nome: str
    pro_cod: int | None
    cliente_nome: str | None
    observacao: str | None
    status: Status
    criado_em: str
    encerrado_em: str | None
    criado_por: str | None


def _row_to_pedido(row: aiosqlite.Row) -> Pedido:
    return Pedido(
        id=row["id"],
        produto_nome=row["produto_nome"],
        pro_cod=row["pro_cod"],
        cliente_nome=row["cliente_nome"],
        observacao=row["observacao"],
        status=row["status"],
        criado_em=row["criado_em"],
        encerrado_em=row["encerrado_em"],
        criado_por=row["criado_por"],
    )


@router.get("", response_model=list[Pedido])
async def listar(
    status: Status | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
) -> list[Pedido]:
    sql = "SELECT * FROM pedidos_clientes"
    clauses: list[str] = []
    params: list[object] = []

    if status is not None:
        clauses.append("status = ?")
        params.append(status)

    if search:
        like = f"%{search.strip()}%"
        clauses.append("(produto_nome LIKE ? OR cliente_nome LIKE ?)")
        params.extend([like, like])

    if clauses:
        sql += " WHERE " + " AND ".join(clauses)

    sql += " ORDER BY criado_em DESC"

    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()

    return [_row_to_pedido(r) for r in rows]


@router.post("", response_model=Pedido, status_code=201)
async def criar(pedido: PedidoCreate) -> Pedido:
    agora = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            INSERT INTO pedidos_clientes
              (produto_nome, cliente_nome, observacao, criado_em, criado_por, status)
            VALUES (?, ?, ?, ?, ?, 'aberto')
            """,
            (
                pedido.produto_nome.strip(),
                pedido.cliente_nome.strip() if pedido.cliente_nome else None,
                pedido.observacao.strip() if pedido.observacao else None,
                agora,
                pedido.criado_por.strip() if pedido.criado_por else None,
            ),
        )
        await db.commit()
        novo_id = cursor.lastrowid
        cursor = await db.execute(
            "SELECT * FROM pedidos_clientes WHERE id = ?", (novo_id,)
        )
        row = await cursor.fetchone()

    if row is None:
        raise HTTPException(status_code=500, detail="falha ao criar pedido")
    return _row_to_pedido(row)


@router.patch("/{pedido_id}", response_model=Pedido)
async def atualizar_status(pedido_id: int, update: PedidoUpdate) -> Pedido:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM pedidos_clientes WHERE id = ?", (pedido_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="pedido não encontrado")
        if row["status"] != "aberto" and update.status != row["status"]:
            raise HTTPException(
                status_code=409,
                detail=f"pedido já está '{row['status']}', não pode mudar para '{update.status}'",
            )

        encerrado_em = (
            datetime.now(timezone.utc).isoformat()
            if update.status in ("atendido", "cancelado")
            else None
        )
        await db.execute(
            "UPDATE pedidos_clientes SET status = ?, encerrado_em = ? WHERE id = ?",
            (update.status, encerrado_em, pedido_id),
        )
        await db.commit()

        cursor = await db.execute(
            "SELECT * FROM pedidos_clientes WHERE id = ?", (pedido_id,)
        )
        row = await cursor.fetchone()

    assert row is not None
    return _row_to_pedido(row)


@router.delete("/{pedido_id}")
async def excluir(pedido_id: int) -> Response:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        cursor = await db.execute(
            "DELETE FROM pedidos_clientes WHERE id = ?", (pedido_id,)
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="pedido não encontrado")
    return Response(status_code=204)
