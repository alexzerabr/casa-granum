"""Pub/sub in-process pra emitir eventos do checker via SSE.

Cada subscriber tem queue própria com maxsize — cliente lento perde eventos
em vez de bloquear o publisher. Suficiente pro use case atual (1-3 clientes,
ciclo a cada 5 min); pra cenário multi-instância migrar pra Redis pub/sub.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

_subscribers: set[asyncio.Queue] = set()


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=32)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def publish(event: dict[str, Any]) -> None:
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("SSE subscriber lento — descartando evento")
