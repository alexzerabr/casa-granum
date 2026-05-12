"""Provedor Anthropic (Messages API) com tool_use forçado e prompt caching do catálogo."""

from __future__ import annotations

import logging
from functools import lru_cache

from app.config import settings

from .base import INSTRUCOES, SCHEMA_LISTA, LLMError, normalizar

logger = logging.getLogger(__name__)

_TOOL = {
    "name": "registrar_recomendacoes",
    "description": "Registra os produtos recomendados para o objetivo do cliente.",
    "input_schema": SCHEMA_LISTA,
}


@lru_cache(maxsize=1)
def _client():
    if not settings.anthropic_api_key:
        raise LLMError("ANTHROPIC_API_KEY não configurada")
    try:
        import anthropic  # import preguiçoso — só carrega se este provedor for usado
    except ImportError as exc:  # pragma: no cover
        raise LLMError("pacote 'anthropic' não instalado") from exc
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def recomendar(objetivo: str, catalogo: str) -> list[dict]:
    client = _client()
    try:
        resp = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=4096,
            system=[
                {"type": "text", "text": INSTRUCOES},
                # cache_control no bloco do catálogo: cacheia INSTRUCOES + catálogo
                # juntos; o objetivo do cliente (volátil) fica nas messages, fora do prefixo.
                {"type": "text", "text": catalogo, "cache_control": {"type": "ephemeral"}},
            ],
            messages=[{"role": "user", "content": f"Objetivo do cliente: {objetivo}"}],
            tools=[_TOOL],
            tool_choice={"type": "tool", "name": "registrar_recomendacoes"},
            temperature=0.3,
        )
    except Exception as exc:  # noqa: BLE001 — qualquer falha de API vira LLMError
        raise LLMError(f"erro na Anthropic API: {exc}") from exc

    usage = getattr(resp, "usage", None)
    if usage is not None:
        logger.info(
            "anthropic usage",
            extra={
                "input_tokens": getattr(usage, "input_tokens", None),
                "output_tokens": getattr(usage, "output_tokens", None),
                "cache_read": getattr(usage, "cache_read_input_tokens", None),
                "cache_creation": getattr(usage, "cache_creation_input_tokens", None),
            },
        )

    for block in resp.content:
        if getattr(block, "type", None) == "tool_use":
            entrada = block.input or {}
            return normalizar(entrada.get("produtos", []))
    raise LLMError("Anthropic não retornou bloco tool_use")
