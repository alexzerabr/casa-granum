"""Cache SQLite de recomendações por (objetivo_hash, catalogo_hash)."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timedelta, timezone

import aiosqlite

from app.config import settings

logger = logging.getLogger(__name__)


def hash_objetivo(objetivo: str) -> str:
    normalizado = re.sub(r"\s+", " ", objetivo.strip().lower())
    return hashlib.sha256(normalizado.encode("utf-8")).hexdigest()


async def buscar(objetivo_hash: str, catalogo_hash: str) -> list[dict] | None:
    agora = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(settings.sqlite_path) as db:
        cursor = await db.execute(
            """
            SELECT resposta_json FROM recomendacao_cache
            WHERE objetivo_hash = ? AND catalogo_hash = ? AND valido_ate > ?
            ORDER BY id DESC LIMIT 1
            """,
            (objetivo_hash, catalogo_hash, agora),
        )
        row = await cursor.fetchone()
    if row is None:
        return None
    try:
        return json.loads(row[0])
    except json.JSONDecodeError:
        logger.warning("cache row com JSON inválido — ignorando")
        return None


async def salvar(
    objetivo_hash: str,
    objetivo_texto: str,
    catalogo_hash: str,
    produtos: list[dict],
) -> None:
    agora = datetime.now(timezone.utc)
    expira = agora + timedelta(hours=settings.cache_ttl_hours)
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute(
            """
            INSERT INTO recomendacao_cache
              (objetivo_hash, objetivo_texto, catalogo_hash, resposta_json, gerado_em, valido_ate)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                objetivo_hash,
                objetivo_texto,
                catalogo_hash,
                json.dumps(produtos, ensure_ascii=False),
                agora.isoformat(),
                expira.isoformat(),
            ),
        )
        await db.commit()
