"""Roda o monitor em background a cada N minutos."""

from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.modules.monitor import checker

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _job() -> None:
    try:
        await asyncio.to_thread(checker.executar_verificacao)
    except Exception:
        logger.exception("falha na execução do monitor")


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _job,
        trigger=IntervalTrigger(minutes=settings.monitor_interval_minutes),
        id="stock_monitor",
        next_run_time=None,
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "scheduler iniciado — intervalo=%d min", settings.monitor_interval_minutes
    )
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("scheduler encerrado")
