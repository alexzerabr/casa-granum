"""Provedor OpenAI (chat completions) com structured output em json_schema strict."""

from __future__ import annotations

import json
import logging
from functools import lru_cache

from app.config import settings

from .base import INSTRUCOES, SCHEMA_LISTA, LLMError, normalizar

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client():
    if not settings.openai_api_key:
        raise LLMError("OPENAI_API_KEY não configurada")
    try:
        import openai  # import preguiçoso — só carrega se este provedor for usado
    except ImportError as exc:  # pragma: no cover
        raise LLMError("pacote 'openai' não instalado") from exc
    return openai.OpenAI(api_key=settings.openai_api_key)


def recomendar(objetivo: str, catalogo: str) -> list[dict]:
    client = _client()
    try:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": f"{INSTRUCOES}\n\n{catalogo}"},
                {"role": "user", "content": f"Objetivo do cliente: {objetivo}"},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "recomendacoes",
                    "strict": True,
                    "schema": SCHEMA_LISTA,
                },
            },
            temperature=0.3,
        )
    except Exception as exc:  # noqa: BLE001 — qualquer falha de API vira LLMError
        raise LLMError(f"erro na OpenAI API: {exc}") from exc

    usage = getattr(resp, "usage", None)
    if usage is not None:
        logger.info(
            "openai usage",
            extra={
                "prompt_tokens": getattr(usage, "prompt_tokens", None),
                "completion_tokens": getattr(usage, "completion_tokens", None),
            },
        )

    content = resp.choices[0].message.content if resp.choices else None
    if not content:
        raise LLMError("OpenAI não retornou conteúdo")
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise LLMError(f"OpenAI retornou JSON inválido: {content!r}") from exc
    return normalizar(data.get("produtos", []))
