"""Backup automático do SQLite via API .backup() (online, seguro com WAL)."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


def _diretorio_backups() -> Path:
    return settings.sqlite_path.parent / "backups"


def executar_backup() -> Path | None:
    """Copia o SQLite ativo para data/backups/casa_granum.db.<data>.bak. Rotaciona retention."""
    src = settings.sqlite_path
    if not src.exists():
        logger.warning("backup ignorado — sqlite ainda não criado em %s", src)
        return None

    dst_dir = _diretorio_backups()
    dst_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M")
    dst = dst_dir / f"{src.name}.{timestamp}.bak"

    src_conn = sqlite3.connect(src)
    dst_conn = sqlite3.connect(dst)
    try:
        with dst_conn:
            src_conn.backup(dst_conn)
    finally:
        src_conn.close()
        dst_conn.close()

    backups = sorted(dst_dir.glob(f"{src.name}.*.bak"))
    excedentes = backups[: -settings.backup_retention] if len(backups) > settings.backup_retention else []
    for old in excedentes:
        old.unlink(missing_ok=True)

    logger.info(
        "backup salvo em %s (%d snapshots mantidos, %d removidos)",
        dst.name,
        min(len(backups), settings.backup_retention),
        len(excedentes),
    )
    return dst
