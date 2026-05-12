"""Recomendação por objetivo via Gemini com structured output e prompt caching implícito."""

from __future__ import annotations

import logging
from functools import lru_cache

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger(__name__)


class RecomendacaoError(RuntimeError):
    """Falha na geração de recomendações pela IA."""


class ProdutoRecomendado(BaseModel):
    pro_cod: int = Field(description="Código do produto (PRO_COD do Firebird).")
    nome: str = Field(description="Nome do produto exatamente como aparece no catálogo.")
    motivo: str = Field(
        description=(
            "Frase única em português ligando um benefício específico do "
            "produto ao objetivo informado pelo cliente."
        )
    )


_INSTRUCOES = (
    "Você é o assistente da Casa Granum, loja de produtos a granel naturais. "
    "Dado o catálogo abaixo (cada produto traz código, nome, grupo, preço e um "
    "texto de benefícios), recomende os produtos que melhor atendem ao objetivo "
    "do cliente. Use apenas produtos presentes no catálogo e baseie cada "
    "justificativa no texto de benefícios do próprio produto — não invente "
    "propriedades. Para cada produto escolhido, escreva UMA frase em português "
    "ligando um benefício específico ao objetivo. Retorne de 1 a 6 itens, "
    "ordenados do mais ao menos relevante. Se nenhum produto do catálogo se "
    "conectar ao objetivo, retorne uma lista vazia."
)


@lru_cache(maxsize=1)
def _client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RecomendacaoError("GEMINI_API_KEY não configurada")
    return genai.Client(api_key=settings.gemini_api_key)


def recomendar(objetivo: str, catalogo: str) -> list[dict]:
    """Retorna lista de `{pro_cod, nome, motivo}`. Levanta `RecomendacaoError` em falha."""
    objetivo_normalizado = objetivo.strip()
    if not objetivo_normalizado:
        raise RecomendacaoError("objetivo vazio")

    try:
        response = _client().models.generate_content(
            model=settings.gemini_model,
            contents=[f"Objetivo do cliente: {objetivo_normalizado}"],
            config=types.GenerateContentConfig(
                system_instruction=[_INSTRUCOES, catalogo],
                response_mime_type="application/json",
                response_schema=list[ProdutoRecomendado],
                temperature=0.3,
            ),
        )
    except errors.APIError as exc:
        logger.error("gemini api error: %s", exc, extra={"code": getattr(exc, "code", None)})
        raise RecomendacaoError(f"falha na chamada à Gemini API: {exc}") from exc

    usage = response.usage_metadata
    if usage is not None:
        logger.info(
            "gemini usage",
            extra={
                "prompt_tokens": usage.prompt_token_count,
                "candidates_tokens": usage.candidates_token_count,
                "cached_tokens": getattr(usage, "cached_content_token_count", None),
                "total_tokens": usage.total_token_count,
            },
        )

    parsed = response.parsed
    if not isinstance(parsed, list):
        raise RecomendacaoError(
            f"resposta sem produtos parseáveis (text={response.text!r})"
        )

    # Lista vazia é válida: significa "nada no catálogo se conecta ao objetivo".
    return [p.model_dump() if isinstance(p, ProdutoRecomendado) else p for p in parsed]
