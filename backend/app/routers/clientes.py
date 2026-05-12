"""Busca de clientes diretamente no Nutify (Firebird, somente leitura)."""

from __future__ import annotations

import asyncio
import time
import unicodedata
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.db.firebird import firebird_connection

router = APIRouter(prefix="/clientes", tags=["clientes"])

_CACHE_TTL = 300.0
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_lock = asyncio.Lock()


class ClienteExterno(BaseModel):
    id: int
    nome: str
    apelido: str | None = None
    telefone: str | None = None


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


def _buscar_no_firebird(termo: str, limite: int) -> list[dict[str, Any]]:
    """Busca por substring (case-insensitive) em PESSOA.PES_RAZ, telefone via CONTATOWHASAPP."""
    sql = """
        SELECT FIRST ?
          P.PES_COD,
          P.PES_RAZ,
          P.PES_APE,
          W.CWA_NDI,
          W.CWA_NRO
        FROM CLIENTE C
        JOIN PESSOA P ON P.PES_COD = C.CLI_PES
        LEFT JOIN CONTATOWHASAPP W
               ON W.CWA_INT = P.PES_COD AND W.CWA_VLD = 'S' AND W.CWA_TPC = 'O'
        WHERE C.CLI_ILI = 'N'
          AND UPPER(P.PES_RAZ) LIKE ?
        ORDER BY P.PES_RAZ
    """
    pattern = f"%{_strip_accents(termo).upper()}%"
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(sql, (limite, pattern))
        out: list[dict[str, Any]] = []
        for cod, nome, ape, ddi, nro in cur.fetchall():
            tel = None
            if nro:
                tel = (ddi or "") + nro.strip()
            out.append(
                {
                    "id": int(cod),
                    "nome": (nome or "").strip(),
                    "apelido": (ape or "").strip() or None,
                    "telefone": tel,
                }
            )
        return out


@router.get("/buscar", response_model=list[ClienteExterno])
async def buscar(
    q: str = Query(min_length=2, max_length=80),
    limite: int = Query(default=15, ge=1, le=50),
) -> list[ClienteExterno]:
    chave = f"{q.strip().lower()}|{limite}"
    agora = time.time()

    async with _lock:
        cached = _cache.get(chave)
        if cached and (agora - cached[0]) < _CACHE_TTL:
            return [ClienteExterno(**c) for c in cached[1]]

    rows = await asyncio.to_thread(_buscar_no_firebird, q.strip(), limite)

    async with _lock:
        _cache[chave] = (agora, rows)
        if len(_cache) > 256:
            mais_antiga = min(_cache.items(), key=lambda kv: kv[1][0])[0]
            _cache.pop(mais_antiga, None)

    return [ClienteExterno(**c) for c in rows]
