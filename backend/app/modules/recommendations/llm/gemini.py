"""Provedor Gemini (google-genai) com structured output."""

from __future__ import annotations

import logging
from functools import lru_cache

from google import genai
from google.genai import errors, types

from app.config import settings

from .base import INSTRUCOES, LLMError, ProdutoRecomendado, normalizar

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client() -> genai.Client:
    if not settings.gemini_api_key:
        raise LLMError("GEMINI_API_KEY não configurada")
    return genai.Client(api_key=settings.gemini_api_key)


def recomendar(objetivo: str, catalogo: str) -> list[dict]:
    try:
        response = _client().models.generate_content(
            model=settings.gemini_model,
            contents=[f"Objetivo do cliente: {objetivo}"],
            config=types.GenerateContentConfig(
                system_instruction=[INSTRUCOES, catalogo],
                response_mime_type="application/json",
                response_schema=list[ProdutoRecomendado],
                temperature=0.3,
            ),
        )
    except errors.APIError as exc:
        raise LLMError(f"erro na Gemini API: {exc}") from exc

    usage = response.usage_metadata
    if usage is not None:
        logger.info(
            "gemini usage",
            extra={
                "prompt_tokens": usage.prompt_token_count,
                "candidates_tokens": usage.candidates_token_count,
                "cached_tokens": getattr(usage, "cached_content_token_count", None),
            },
        )

    parsed = response.parsed
    if not isinstance(parsed, list):
        raise LLMError(f"resposta sem produtos parseáveis (text={response.text!r})")
    return normalizar(
        [p.model_dump() if isinstance(p, ProdutoRecomendado) else p for p in parsed]
    )
