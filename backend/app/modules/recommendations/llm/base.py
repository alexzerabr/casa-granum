"""Contrato comum dos provedores de LLM para recomendação por objetivo."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LLMError(RuntimeError):
    """Falha de um provedor de LLM (chave ausente, erro de API, resposta inválida)."""


class ProdutoRecomendado(BaseModel):
    pro_cod: int = Field(description="Código do produto (PRO_COD do Firebird).")
    nome: str = Field(description="Nome do produto exatamente como aparece no catálogo.")
    motivo: str = Field(
        description=(
            "Frase única em português ligando um benefício específico do "
            "produto ao objetivo informado pelo cliente."
        )
    )


INSTRUCOES = (
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

# Schema com raiz objeto (exigido por OpenAI strict mode e por tool_use da Anthropic).
SCHEMA_LISTA: dict = {
    "type": "object",
    "properties": {
        "produtos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "pro_cod": {"type": "integer"},
                    "nome": {"type": "string"},
                    "motivo": {"type": "string"},
                },
                "required": ["pro_cod", "nome", "motivo"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["produtos"],
    "additionalProperties": False,
}


def normalizar(produtos: list) -> list[dict]:
    """Valida cada item contra o schema e devolve dicts limpos. Levanta LLMError se inválido."""
    try:
        return [ProdutoRecomendado(**p).model_dump() for p in produtos]
    except Exception as exc:  # noqa: BLE001
        raise LLMError(f"resposta da IA não bate com o schema esperado: {exc}") from exc
