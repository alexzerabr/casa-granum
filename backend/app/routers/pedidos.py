"""CRUD de pedidos com múltiplos solicitantes por pedido."""

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


class ClienteIn(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    telefone: str | None = Field(default=None, max_length=30)
    cliente_externo_id: int | None = None


class Cliente(ClienteIn):
    id: int


class PedidoCreate(BaseModel):
    produto_nome: str = Field(min_length=1, max_length=200)
    pro_cod: int | None = None
    unidade: str | None = Field(default=None, max_length=10)
    observacao: str | None = Field(default=None, max_length=1000)
    clientes: list[ClienteIn] = Field(min_length=1)


class PedidoPatch(BaseModel):
    produto_nome: str | None = Field(default=None, min_length=1, max_length=200)
    pro_cod: int | None = None
    unidade: str | None = Field(default=None, max_length=10)
    observacao: str | None = Field(default=None, max_length=1000)
    status: Status | None = None
    clientes: list[ClienteIn] | None = None


class Pedido(BaseModel):
    id: int
    produto_nome: str
    pro_cod: int | None
    unidade: str | None
    observacao: str | None
    status: Status
    criado_em: str
    atualizado_em: str
    encerrado_em: str | None
    clientes: list[Cliente]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normaliza_telefone(v: str | None) -> str | None:
    if not v:
        return None
    digits = "".join(c for c in v if c.isdigit())
    return digits or None


async def _buscar_clientes(db: aiosqlite.Connection, pedido_id: int) -> list[Cliente]:
    cur = await db.execute(
        "SELECT id, nome, telefone, cliente_externo_id FROM pedido_cliente "
        "WHERE pedido_id = ? ORDER BY id",
        (pedido_id,),
    )
    return [
        Cliente(
            id=r["id"],
            nome=r["nome"],
            telefone=r["telefone"],
            cliente_externo_id=r["cliente_externo_id"],
        )
        for r in await cur.fetchall()
    ]


async def _montar_pedido(db: aiosqlite.Connection, row: aiosqlite.Row) -> Pedido:
    return Pedido(
        id=row["id"],
        produto_nome=row["produto_nome"],
        pro_cod=row["pro_cod"],
        unidade=row["unidade"],
        observacao=row["observacao"],
        status=row["status"],
        criado_em=row["criado_em"],
        atualizado_em=row["atualizado_em"],
        encerrado_em=row["encerrado_em"],
        clientes=await _buscar_clientes(db, row["id"]),
    )


async def _inserir_clientes(
    db: aiosqlite.Connection, pedido_id: int, clientes: list[ClienteIn]
) -> None:
    agora = _now()
    for c in clientes:
        await db.execute(
            "INSERT INTO pedido_cliente (pedido_id, nome, telefone, cliente_externo_id, criado_em) "
            "VALUES (?,?,?,?,?)",
            (
                pedido_id,
                c.nome.strip(),
                _normaliza_telefone(c.telefone),
                c.cliente_externo_id,
                agora,
            ),
        )


@router.get("", response_model=list[Pedido])
async def listar(
    status: Status | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    desde: str | None = Query(default=None, description="ISO date — inclui criado_em >="),
) -> list[Pedido]:
    sql = "SELECT * FROM pedido"
    clauses: list[str] = []
    params: list[object] = []

    if status is not None:
        clauses.append("status = ?")
        params.append(status)
    if desde:
        clauses.append("criado_em >= ?")
        params.append(desde)
    if search:
        like = f"%{search.strip()}%"
        clauses.append(
            "(produto_nome LIKE ? OR observacao LIKE ? OR id IN "
            "(SELECT pedido_id FROM pedido_cliente WHERE nome LIKE ? OR telefone LIKE ?))"
        )
        params.extend([like, like, like, like])

    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY criado_em DESC"

    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON")
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()
        return [await _montar_pedido(db, r) for r in rows]


@router.post("", response_model=Pedido, status_code=201)
async def criar(pedido: PedidoCreate) -> Pedido:
    agora = _now()
    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON")
        cursor = await db.execute(
            "INSERT INTO pedido (produto_nome, pro_cod, unidade, observacao, "
            "status, criado_em, atualizado_em) VALUES (?,?,?,?, 'aberto', ?, ?)",
            (
                pedido.produto_nome.strip(),
                pedido.pro_cod,
                pedido.unidade,
                pedido.observacao.strip() if pedido.observacao else None,
                agora,
                agora,
            ),
        )
        novo_id = cursor.lastrowid
        await _inserir_clientes(db, novo_id, pedido.clientes)
        await db.commit()

        cur = await db.execute("SELECT * FROM pedido WHERE id = ?", (novo_id,))
        row = await cur.fetchone()
        return await _montar_pedido(db, row)


@router.patch("/{pedido_id}", response_model=Pedido)
async def atualizar(pedido_id: int, patch: PedidoPatch) -> Pedido:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON")
        cur = await db.execute("SELECT * FROM pedido WHERE id = ?", (pedido_id,))
        row = await cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="pedido não encontrado")

        updates: list[str] = []
        params: list[object] = []

        if patch.produto_nome is not None:
            updates.append("produto_nome = ?")
            params.append(patch.produto_nome.strip())
        if patch.pro_cod is not None:
            updates.append("pro_cod = ?")
            params.append(patch.pro_cod)
        if patch.unidade is not None:
            updates.append("unidade = ?")
            params.append(patch.unidade)
        if patch.observacao is not None:
            updates.append("observacao = ?")
            params.append(patch.observacao.strip() or None)
        if patch.status is not None:
            updates.append("status = ?")
            params.append(patch.status)
            if patch.status in ("atendido", "cancelado"):
                updates.append("encerrado_em = ?")
                params.append(_now())
            else:
                updates.append("encerrado_em = NULL")

        if updates:
            updates.append("atualizado_em = ?")
            params.append(_now())
            params.append(pedido_id)
            await db.execute(
                f"UPDATE pedido SET {', '.join(updates)} WHERE id = ?", params
            )

        if patch.clientes is not None:
            if not patch.clientes:
                raise HTTPException(
                    status_code=400, detail="pedido precisa de pelo menos 1 cliente"
                )
            await db.execute(
                "DELETE FROM pedido_cliente WHERE pedido_id = ?", (pedido_id,)
            )
            await _inserir_clientes(db, pedido_id, patch.clientes)

        await db.commit()

        cur = await db.execute("SELECT * FROM pedido WHERE id = ?", (pedido_id,))
        row = await cur.fetchone()
        return await _montar_pedido(db, row)


@router.post("/{pedido_id}/clientes", response_model=Cliente, status_code=201)
async def adicionar_cliente(pedido_id: int, cliente: ClienteIn) -> Cliente:
    agora = _now()
    async with aiosqlite.connect(settings.sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON")
        cur = await db.execute("SELECT 1 FROM pedido WHERE id = ?", (pedido_id,))
        if await cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="pedido não encontrado")
        cur = await db.execute(
            "INSERT INTO pedido_cliente (pedido_id, nome, telefone, cliente_externo_id, criado_em) "
            "VALUES (?,?,?,?,?)",
            (
                pedido_id,
                cliente.nome.strip(),
                _normaliza_telefone(cliente.telefone),
                cliente.cliente_externo_id,
                agora,
            ),
        )
        await db.execute(
            "UPDATE pedido SET atualizado_em = ? WHERE id = ?", (agora, pedido_id)
        )
        await db.commit()
        return Cliente(
            id=cur.lastrowid,
            nome=cliente.nome.strip(),
            telefone=_normaliza_telefone(cliente.telefone),
            cliente_externo_id=cliente.cliente_externo_id,
        )


@router.delete("/{pedido_id}/clientes/{cliente_id}")
async def remover_cliente(pedido_id: int, cliente_id: int) -> Response:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute("PRAGMA foreign_keys=ON")
        cur = await db.execute(
            "SELECT COUNT(*) FROM pedido_cliente WHERE pedido_id = ?", (pedido_id,)
        )
        total = (await cur.fetchone())[0]
        if total <= 1:
            raise HTTPException(
                status_code=409,
                detail="pedido precisa de pelo menos 1 cliente; remova o pedido inteiro",
            )
        cur = await db.execute(
            "DELETE FROM pedido_cliente WHERE id = ? AND pedido_id = ?",
            (cliente_id, pedido_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="cliente não encontrado")
        await db.execute(
            "UPDATE pedido SET atualizado_em = ? WHERE id = ?", (_now(), pedido_id)
        )
        await db.commit()
    return Response(status_code=204)


@router.delete("/{pedido_id}")
async def excluir(pedido_id: int) -> Response:
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute("PRAGMA foreign_keys=ON")
        cursor = await db.execute("DELETE FROM pedido WHERE id = ?", (pedido_id,))
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="pedido não encontrado")
    return Response(status_code=204)
