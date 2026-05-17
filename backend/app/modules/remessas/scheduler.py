"""Registra o job das remessas no scheduler global."""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.modules.remessas import checker, health

logger = logging.getLogger(__name__)


async def _job_remessas() -> None:
    try:
        await health.executar(checker.executar_verificacao, origem="auto")
    except Exception:
        logger.exception("falha na execução do checker de remessas")


def register(scheduler: AsyncIOScheduler) -> None:
    scheduler.add_job(
        _job_remessas,
        trigger=IntervalTrigger(minutes=settings.remessa_check_minutes),
        id="remessas_checker",
        replace_existing=True,
    )
    logger.info(
        "remessas: job agendado a cada %d min (threshold %.0f%%)",
        settings.remessa_check_minutes,
        settings.stock_preco_alert_pct * 100,
    )
