"""Persistência local: cache de IA, lista de reabastecimento e pedidos."""

from __future__ import annotations

import logging

import aiosqlite

from app.config import settings

logger = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS recomendacao_cache (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  objetivo_hash  TEXT NOT NULL,
  objetivo_texto TEXT NOT NULL,
  catalogo_hash  TEXT NOT NULL,
  resposta_json  TEXT NOT NULL,
  gerado_em      DATETIME NOT NULL,
  valido_ate     DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rec_cache_hashes
  ON recomendacao_cache (objetivo_hash, catalogo_hash);

CREATE TABLE IF NOT EXISTS lista_reabastecimento (
  pro_cod           INTEGER PRIMARY KEY,
  pro_des           TEXT NOT NULL,
  grupo             TEXT,
  unidade           TEXT,
  unidade_venda     TEXT,
  estoque_min_kg    REAL NOT NULL,
  estoque_atual_kg  REAL,
  qtd_reposicao     REAL DEFAULT 0,
  estado            TEXT DEFAULT 'ok',
  alerta_em         DATETIME,
  reposto_em        DATETIME,
  ultima_verif      DATETIME,
  notificado_em     DATETIME
);

CREATE TABLE IF NOT EXISTS pedidos_clientes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_nome TEXT NOT NULL,
  pro_cod      INTEGER,
  cliente_nome TEXT,
  observacao   TEXT,
  status       TEXT DEFAULT 'aberto',
  criado_em    DATETIME NOT NULL,
  encerrado_em DATETIME,
  criado_por   TEXT
);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos_clientes (status);
"""


async def init_db() -> None:
    """Cria tabelas, ativa WAL e roda migrações idempotentes."""
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    pre_existia = settings.sqlite_path.exists()
    logger.info(
        "sqlite path=%s pre_existia=%s",
        settings.sqlite_path,
        pre_existia,
    )
    async with aiosqlite.connect(settings.sqlite_path) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executescript(SCHEMA)
        cursor = await db.execute("PRAGMA table_info(lista_reabastecimento)")
        cols = {row[1] for row in await cursor.fetchall()}
        if "estoque_atual_kg" not in cols:
            await db.execute(
                "ALTER TABLE lista_reabastecimento ADD COLUMN estoque_atual_kg REAL"
            )
        if "unidade" not in cols:
            await db.execute(
                "ALTER TABLE lista_reabastecimento ADD COLUMN unidade TEXT"
            )
        if "unidade_venda" not in cols:
            await db.execute(
                "ALTER TABLE lista_reabastecimento ADD COLUMN unidade_venda TEXT"
            )
        if "notificado_em" not in cols:
            await db.execute(
                "ALTER TABLE lista_reabastecimento ADD COLUMN notificado_em DATETIME"
            )
        await db.commit()

        cur = await db.execute(
            "SELECT estado, COUNT(*) FROM lista_reabastecimento GROUP BY estado"
        )
        contagens = {row[0]: row[1] for row in await cur.fetchall()}
        logger.info("sqlite estado lista_reabastecimento: %s", contagens or "vazio")


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(settings.sqlite_path)
    db.row_factory = aiosqlite.Row
    return db
