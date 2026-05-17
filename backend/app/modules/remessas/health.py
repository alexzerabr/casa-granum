"""Estado em memória do checker de remessas. Usado por GET /remessas/saude."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)

_lock = asyncio.Lock()
_iniciado_em: datetime | None = None
_origem: str | None = None
_ultima_execucao: datetime | None = None
_ultimo_sumario: dict[str, Any] | None = None
_ultimo_erro: dict[str, Any] | None = None


def estado() -> dict[str, Any]:
    return {
        "em_execucao": _lock.locked(),
        "iniciada_em": _iniciado_em.isoformat() if _iniciado_em else None,
        "origem_atual": _origem,
        "ultima_execucao": _ultima_execucao.isoformat() if _ultima_execucao else None,
        "ultimo_sumario": _ultimo_sumario,
        "ultimo_erro": _ultimo_erro,
    }


async def executar(fn: Callable[[], Awaitable[dict]], origem: str) -> dict:
    """Roda o checker registrando última execução / último erro pra observabilidade."""
    global _iniciado_em, _origem, _ultima_execucao, _ultimo_sumario, _ultimo_erro
    async with _lock:
        _iniciado_em = datetime.now(timezone.utc)
        _origem = origem
        try:
            sumario = await fn()
            _ultima_execucao = datetime.now(timezone.utc)
            _ultimo_sumario = sumario
            _ultimo_erro = None
            return sumario
        except Exception as e:
            _ultima_execucao = datetime.now(timezone.utc)
            _ultimo_erro = {
                "em": _ultima_execucao.isoformat(),
                "tipo": type(e).__name__,
                "mensagem": str(e)[:500],
            }
            raise
        finally:
            _iniciado_em = None
            _origem = None
