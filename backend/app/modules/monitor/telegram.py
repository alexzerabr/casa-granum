"""Disparo de alertas via Telegram. No-op silencioso se token ausente."""

from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.modules.monitor.units import formatar


logger = logging.getLogger(__name__)


def _formatar_mensagem(produto: dict) -> str:
    und_compra = produto.get("unidade") or "KG"
    und_venda = produto.get("unidade_venda") or und_compra
    linha_unidade = (
        f"Unidade: {und_compra}"
        if und_compra == und_venda
        else f"Compra: {und_compra} · Venda: {und_venda}"
    )
    linhas = [
        "🔴 *Estoque Mínimo Atingido — Casa Granum*",
        "",
        f"Produto: *{produto['pro_des']}*",
        f"Grupo: {produto.get('grupo') or '—'}",
        linha_unidade,
        f"Estoque atual: {formatar(produto['estoque_atual_kg'], und_venda)}",
        f"Estoque mínimo: {formatar(produto['estoque_min_kg'], und_venda)}",
    ]
    qtd_rep = produto.get("qtd_reposicao") or 0
    if qtd_rep > 0:
        linhas.append(f"Qtd. sugerida de reposição: {formatar(qtd_rep, und_compra)}")
    linhas.extend(["", "Item incluído na Lista de Reabastecimento."])
    return "\n".join(linhas)


def enviar_alerta(produto: dict) -> bool:
    """Retorna True se enviou, False se não configurado ou se falhou."""
    return _enviar(_formatar_mensagem(produto), produto.get("pro_des"))


def _formatar_mensagem_remessa(r: dict) -> str:
    und = r.get("unidade") or "KG"
    consumo_pct = float(r.get("consumo_pct") or 0) * 100
    vendido = float(r.get("vendido") or 0)
    linhas = [
        "🏷 *Atualizar preço — Casa Granum*",
        "",
        f"Produto: *{r['pro_des']}*",
        f"Consumo do estoque antigo: {consumo_pct:.0f}% "
        f"({formatar(vendido, und)} de {formatar(float(r['estoque_antigo']), und)})",
        "",
        f"Custo: R$ {float(r['custo_antigo']):.2f} → R$ {float(r['custo_novo']):.2f}",
        f"Preço atual: R$ {float(r['preco_antigo']):.2f}",
        f"Preço sugerido: *R$ {float(r['preco_sugerido']):.2f}*",
    ]
    return "\n".join(linhas)


def enviar_alerta_remessa(remessa: dict) -> bool:
    return _enviar(_formatar_mensagem_remessa(remessa), remessa.get("pro_des"))


def _enviar(texto: str, label: str | None) -> bool:
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        logger.info("telegram não configurado — pulando alerta de %s", label)
        return False
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        resp = httpx.post(
            url,
            json={
                "chat_id": settings.telegram_chat_id,
                "text": texto,
                "parse_mode": "Markdown",
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        logger.info("telegram enviado para %s", label)
        return True
    except httpx.HTTPError as exc:
        logger.error("falha ao enviar telegram: %s", exc)
        return False
