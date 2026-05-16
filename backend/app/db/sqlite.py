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

CREATE TABLE IF NOT EXISTS pedido (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_nome  TEXT NOT NULL,
  pro_cod       INTEGER,
  unidade       TEXT,
  observacao    TEXT,
  status        TEXT NOT NULL DEFAULT 'aberto',
  criado_em     DATETIME NOT NULL,
  atualizado_em DATETIME NOT NULL,
  encerrado_em  DATETIME
);
CREATE INDEX IF NOT EXISTS idx_pedido_status ON pedido (status);

CREATE TABLE IF NOT EXISTS pedido_cliente (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id          INTEGER NOT NULL,
  nome               TEXT NOT NULL,
  telefone           TEXT,
  cliente_externo_id INTEGER,
  criado_em          DATETIME NOT NULL,
  FOREIGN KEY (pedido_id) REFERENCES pedido(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pedido_cliente_pedido ON pedido_cliente (pedido_id);

CREATE TABLE IF NOT EXISTS remessas (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  pro_cod               INTEGER NOT NULL,
  pro_des               TEXT NOT NULL,
  unidade               TEXT NOT NULL,
  estoque_antigo        REAL NOT NULL,
  custo_antigo          REAL NOT NULL,
  preco_antigo          REAL NOT NULL,
  markup_pct            REAL NOT NULL,
  custo_novo            REAL NOT NULL,
  preco_sugerido        REAL NOT NULL,
  alerta_threshold_pct  REAL NOT NULL DEFAULT 0.20,
  estado                TEXT NOT NULL DEFAULT 'ativa',
  iniciada_em           DATETIME NOT NULL,
  alertada_em           DATETIME,
  notificada_em         DATETIME,
  concluida_em          DATETIME,
  cancelada_em          DATETIME,
  motivo_cancelamento   TEXT,
  preco_final           REAL
);
CREATE INDEX IF NOT EXISTS idx_remessas_estado_pro ON remessas (estado, pro_cod);
CREATE UNIQUE INDEX IF NOT EXISTS uq_remessa_ativa_por_produto
  ON remessas (pro_cod) WHERE estado IN ('ativa', 'alerta_preco');
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
        await db.execute("PRAGMA foreign_keys=ON")
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

        await _migrar_pedidos_legados(db)
        await db.commit()

        cur = await db.execute(
            "SELECT estado, COUNT(*) FROM lista_reabastecimento GROUP BY estado"
        )
        contagens = {row[0]: row[1] for row in await cur.fetchall()}
        logger.info("sqlite estado lista_reabastecimento: %s", contagens or "vazio")


async def _migrar_pedidos_legados(db: aiosqlite.Connection) -> None:
    """Copia `pedidos_clientes` (schema antigo, 1 cliente em coluna) p/ `pedido` + `pedido_cliente`."""
    cur = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos_clientes'"
    )
    if await cur.fetchone() is None:
        return

    cur = await db.execute("SELECT COUNT(*) FROM pedido")
    if (await cur.fetchone())[0] > 0:
        await db.execute("DROP TABLE pedidos_clientes")
        return

    cur = await db.execute(
        "SELECT id, produto_nome, pro_cod, cliente_nome, observacao, status, "
        "criado_em, encerrado_em FROM pedidos_clientes"
    )
    legados = await cur.fetchall()
    for (lid, prod, cod, cliente, obs, status, criado, encerrado) in legados:
        await db.execute(
            "INSERT INTO pedido (id, produto_nome, pro_cod, observacao, status, "
            "criado_em, atualizado_em, encerrado_em) VALUES (?,?,?,?,?,?,?,?)",
            (lid, prod, cod, obs, status, criado, criado, encerrado),
        )
        if cliente and cliente.strip():
            await db.execute(
                "INSERT INTO pedido_cliente (pedido_id, nome, criado_em) VALUES (?,?,?)",
                (lid, cliente.strip(), criado),
            )
    await db.execute("DROP TABLE pedidos_clientes")
    logger.info("migração pedidos: %d registros movidos", len(legados))


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(settings.sqlite_path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys=ON")
    return db
