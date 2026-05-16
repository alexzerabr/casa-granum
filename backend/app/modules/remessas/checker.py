"""Ciclo de verificação das remessas ativas.

Calcula consumo (saídas desde a data de início), dispara alerta em ≥(1-threshold),
fecha automaticamente quando o preço no Firebird muda em relação ao snapshot.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.modules.remessas import nutify, repository

logger = logging.getLogger(__name__)

# Mesmo cooldown do monitor de reabastecimento, pelos mesmos motivos.
NOTIFICATION_COOLDOWN = timedelta(hours=24)


def _notificou_recentemente(notificada_em: str | None, agora: datetime) -> bool:
    if not notificada_em:
        return False
    try:
        last = datetime.fromisoformat(notificada_em)
    except ValueError:
        return False
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return (agora - last) < NOTIFICATION_COOLDOWN


async def executar_verificacao() -> dict:
    """Roda um ciclo completo. Retorna sumário das ações tomadas."""
    from app.modules.monitor import telegram  # evita ciclo de import

    agora = datetime.now(timezone.utc)
    ativas = await repository.listar(estados=["ativa", "alerta_preco"])

    novos_alertas = 0
    silenciados = 0
    concluidas = 0

    for r in ativas:
        try:
            iniciada = datetime.fromisoformat(r["iniciada_em"])
            if iniciada.tzinfo is None:
                iniciada = iniciada.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            logger.warning("remessa %s tem iniciada_em inválido — pulando", r["id"])
            continue

        # 1) Detectar mudança de preço → conclui.
        preco_agora = nutify.preco_venda_atual(r["pro_cod"])
        if preco_agora is not None and abs(preco_agora - float(r["preco_antigo"])) > 1e-6:
            await repository.concluir(r["id"], preco_agora)
            concluidas += 1
            continue

        # 2) Verificar consumo do estoque antigo.
        vendido = nutify.saidas_desde(r["pro_cod"], iniciada)
        estoque_antigo = float(r["estoque_antigo"])
        if estoque_antigo <= 0:
            continue
        consumo_pct = min(vendido / estoque_antigo, 1.0)
        threshold = float(r["alerta_threshold_pct"])

        if consumo_pct >= (1.0 - threshold) and r["estado"] == "ativa":
            deve_notificar = not _notificou_recentemente(r.get("notificada_em"), agora)
            await repository.marcar_alerta(r["id"], notificada=deve_notificar)
            if deve_notificar:
                try:
                    telegram.enviar_alerta_remessa({**r, "consumo_pct": consumo_pct})
                    novos_alertas += 1
                except Exception:
                    logger.exception("falha ao enviar alerta Telegram da remessa %s", r["id"])
            else:
                silenciados += 1

    sumario = {
        "verificadas": len(ativas),
        "novos_alertas": novos_alertas,
        "silenciados": silenciados,
        "concluidas_auto": concluidas,
        "executado_em": agora.isoformat(),
    }
    logger.info(
        "remessas: verificadas=%d novos_alertas=%d silenciados=%d concluidas=%d",
        len(ativas),
        novos_alertas,
        silenciados,
        concluidas,
    )
    return sumario
