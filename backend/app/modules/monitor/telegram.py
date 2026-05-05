"""Disparo de alertas via Telegram. No-op silencioso se token ausente."""

from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.modules.monitor.units import formatar


logger = logging.getLogger(__name__)


def _formatar_mensagem(produto: dict) -> str:
    und_compra = produto.get("unidade") or "KG"  # PRO_UNDE
    und_venda = produto.get("unidade_venda") or und_compra  # PRO_UND
    sufixo_unidades = (
        f"unidade: {und_compra}"
        if und_compra == und_venda
        else f"compra: {und_compra} · venda: {und_venda}"
    )
    return (
        "🔴 *Estoque Mínimo Atingido — Casa Granum*\n\n"
        f"📦 Produto: *{produto['pro_des']}*\n"
        f"📁 Grupo: {produto.get('grupo') or '—'}\n"
        f"📐 {sufixo_unidades}\n"
        f"⚖️ Estoque atual: {formatar(produto['estoque_atual_kg'], und_venda)}\n"
        f"🎯 Estoque mínimo: {formatar(produto['estoque_min_kg'], und_venda)}\n"
        f"🛒 Qtd. sugerida de reposição: {formatar(produto.get('qtd_reposicao') or 0, und_compra)}\n\n"
        "➡️ Item incluído na Lista de Reabastecimento."
    )


def enviar_alerta(produto: dict) -> bool:
    """Retorna True se enviou, False se não configurado ou se falhou."""
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        logger.info(
            "telegram não configurado — pulando alerta de %s", produto.get("pro_des")
        )
        return False

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        resp = httpx.post(
            url,
            json={
                "chat_id": settings.telegram_chat_id,
                "text": _formatar_mensagem(produto),
                "parse_mode": "Markdown",
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        logger.info("telegram alert enviado para %s", produto.get("pro_des"))
        return True
    except httpx.HTTPError as exc:
        logger.error("falha ao enviar telegram: %s", exc)
        return False
