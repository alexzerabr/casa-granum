"""Estado em memória da varredura de reabastecimento. Garante execução serializada via lock."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger(__name__)

_lock = asyncio.Lock()
_iniciado_em: datetime | None = None
_origem: str | None = None
_ultimo_sumario: dict[str, Any] | None = None


def estado() -> dict[str, Any]:
    """Snapshot do estado atual — usado pelo endpoint GET /reabastecimento/status."""
    return {
        "em_execucao": _lock.locked(),
        "iniciado_em": _iniciado_em.isoformat() if _iniciado_em else None,
        "origem": _origem,
        "ultimo_sumario": _ultimo_sumario,
    }


async def executar(fn: Callable[[], dict], origem: str) -> dict:
    """Roda fn em thread sob lock; chamadas concorrentes serializam e recebem o sumário do scan ativo."""
    global _iniciado_em, _origem, _ultimo_sumario
    async with _lock:
        _iniciado_em = datetime.now(timezone.utc)
        _origem = origem
        try:
            sumario = await asyncio.to_thread(fn)
        finally:
            _iniciado_em = None
            _origem = None
        _ultimo_sumario = sumario
        return sumario
