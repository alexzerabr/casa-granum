"""Jobs em background: monitor de estoque, refresh do catálogo da IA e backup do SQLite."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.modules import backup
from app.modules.monitor import checker, scan_state
from app.modules.recommendations import catalog

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _job_monitor() -> None:
    try:
        await scan_state.executar(checker.executar_verificacao, origem="auto")
    except Exception:
        logger.exception("falha na execução do monitor")


async def _job_catalog_refresh() -> None:
    await asyncio.to_thread(catalog.refresh_em_background)


async def _job_backup() -> None:
    try:
        await asyncio.to_thread(backup.executar_backup)
    except Exception:
        logger.exception("falha no backup do SQLite")


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _job_monitor,
        trigger=IntervalTrigger(minutes=settings.monitor_interval_minutes),
        id="stock_monitor",
        next_run_time=None,
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_catalog_refresh,
        trigger=IntervalTrigger(seconds=settings.catalog_refresh_seconds),
        id="catalog_refresh",
        next_run_time=None,
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_backup,
        trigger=IntervalTrigger(
            hours=24,
            start_date=datetime.now(timezone.utc) + timedelta(seconds=30),
        ),
        id="sqlite_backup",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "scheduler iniciado — monitor=%dmin · catalog_refresh=%ds · backup=24h (retention=%d)",
        settings.monitor_interval_minutes,
        settings.catalog_refresh_seconds,
        settings.backup_retention,
    )
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("scheduler encerrado")
