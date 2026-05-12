"""Orquestrador de LLM para recomendação: provedor primário + fallback opcional."""

from __future__ import annotations

import logging

from app.config import settings

from .llm import anthropic as anthropic_provider
from .llm import gemini
from .llm import openai as openai_provider

logger = logging.getLogger(__name__)


class RecomendacaoError(RuntimeError):
    """Falha na geração de recomendações pela IA (todos os provedores configurados falharam)."""


_PROVEDORES = {
    "gemini": gemini.recomendar,
    "openai": openai_provider.recomendar,
    "anthropic": anthropic_provider.recomendar,
}


def _resolver(nome: str):
    fn = _PROVEDORES.get((nome or "").strip().lower())
    if fn is None:
        raise RecomendacaoError(f"LLM provider desconhecido: {nome!r}")
    return fn


def recomendar(objetivo: str, catalogo: str) -> list[dict]:
    """Retorna `[{pro_cod, nome, motivo}]`. Tenta o provedor primário; em falha, o fallback."""
    objetivo = objetivo.strip()
    if not objetivo:
        raise RecomendacaoError("objetivo vazio")

    primario = (settings.llm_provider or "gemini").strip().lower()
    fallback = (settings.llm_fallback or "").strip().lower()

    try:
        return _resolver(primario)(objetivo, catalogo)
    except Exception as exc:  # noqa: BLE001 — resiliência: cair para o fallback
        if not fallback or fallback == primario:
            logger.error("LLM %s falhou e não há fallback configurado: %s", primario, exc)
            raise RecomendacaoError(f"falha na IA ({primario}): {exc}") from exc
        logger.warning("LLM %s falhou (%s); tentando fallback %s", primario, exc, fallback)
        try:
            resultado = _resolver(fallback)(objetivo, catalogo)
            logger.info("recomendação atendida pelo fallback %s", fallback)
            return resultado
        except Exception as exc2:  # noqa: BLE001
            logger.error("fallback %s também falhou: %s", fallback, exc2)
            raise RecomendacaoError(
                f"falha na IA: {primario} ({exc}); fallback {fallback} ({exc2})"
            ) from exc2
