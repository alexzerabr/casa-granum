"""Loop de verificação de estoque mínimo. Idempotente: alerta apenas na transição ok→alerta."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.db.firebird import firebird_connection
from app.modules.monitor import telegram

logger = logging.getLogger(__name__)

# Janela mínima entre dois disparos Telegram pro mesmo produto, mesmo que
# o estado em SQLite tenha sido perdido entre restarts.
NOTIFICATION_COOLDOWN = timedelta(hours=24)


# PRO_UNDE = unidade de compra (KG/UN/CX); PRO_UND = unidade de venda (KG/UN/CAPS).
_QUERY_MONITORADOS = """
SELECT
  p.PRO_COD,
  p.PRO_DES,
  g.GRU_DES,
  p.PRO_UNDE,
  p.PRO_UND,
  CAST(p.PRO_QTD AS DOUBLE PRECISION) AS estoque_atual,
  CAST(p.PRO_EMN AS DOUBLE PRECISION) AS estoque_min,
  CAST(p.PRO_PMC AS DOUBLE PRECISION) AS qtd_reposicao
FROM PRODUTO p
JOIN GRUPO g ON g.GRU_COD = p.PRO_GRU
WHERE p.PRO_SIT = 'A'
  AND p.PRO_IDB = 'S'
  AND p.PRO_EMN IS NOT NULL
  AND p.PRO_EMN > 0
"""


def _ler_monitorados() -> list[dict]:
    monitorados: list[dict] = []
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(_QUERY_MONITORADOS)
        for cod, des, gru, unde, und, qtd, minimo, reposicao in cur:
            monitorados.append(
                {
                    "pro_cod": int(cod),
                    "pro_des": des,
                    "grupo": gru,
                    "unidade": (unde or und or "KG").strip().upper(),
                    "unidade_venda": (und or "KG").strip().upper(),
                    "estoque_atual_kg": float(qtd) if qtd is not None else 0.0,
                    "estoque_min_kg": float(minimo),
                    "qtd_reposicao": float(reposicao) if reposicao else 0.0,
                }
            )
    return monitorados


def _ler_pcods_ativos() -> set[int]:
    """Retorna o conjunto de pro_cod monitoráveis hoje (sem ler estoque/min)."""
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(
            "SELECT p.PRO_COD FROM PRODUTO p "
            "WHERE p.PRO_SIT = 'A' AND p.PRO_IDB = 'S' "
            "AND p.PRO_EMN IS NOT NULL AND p.PRO_EMN > 0"
        )
        return {int(row[0]) for row in cur}


def _notificou_recentemente(notificado_em: str | None, agora: datetime) -> bool:
    if not notificado_em:
        return False
    try:
        last = datetime.fromisoformat(notificado_em)
    except ValueError:
        return False
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return (agora - last) < NOTIFICATION_COOLDOWN


def executar_verificacao() -> dict:
    """Roda um ciclo completo: lê Firebird, atualiza SQLite, dispara alertas com cooldown."""
    inicio = datetime.now(timezone.utc)
    monitorados = _ler_monitorados()

    fator_alerta = settings.stock_alert_factor
    fator_reposicao = settings.stock_restore_factor

    novos_alertas = 0
    silenciados = 0
    repostos = 0
    desativados = 0
    em_alerta = 0
    agora_iso = inicio.isoformat()
    pcods_monitorados = {p["pro_cod"] for p in monitorados}

    with sqlite3.connect(settings.sqlite_path) as db:
        db.row_factory = sqlite3.Row
        for p in monitorados:
            limiar_alerta = p["estoque_min_kg"] * fator_alerta
            limiar_reposicao = p["estoque_min_kg"] * fator_reposicao
            atual = p["estoque_atual_kg"]

            row = db.execute(
                "SELECT estado, notificado_em FROM lista_reabastecimento WHERE pro_cod = ?",
                (p["pro_cod"],),
            ).fetchone()
            estado_anterior = row["estado"] if row else "ok"
            notificado_em = row["notificado_em"] if row else None

            if atual <= limiar_alerta and estado_anterior != "alerta_enviado":
                deve_notificar = not _notificou_recentemente(notificado_em, inicio)
                novo_notificado_em = agora_iso if deve_notificar else notificado_em

                db.execute(
                    """
                    INSERT INTO lista_reabastecimento
                      (pro_cod, pro_des, grupo, unidade, unidade_venda,
                       estoque_min_kg, estoque_atual_kg, qtd_reposicao,
                       estado, alerta_em, ultima_verif, notificado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'alerta_enviado', ?, ?, ?)
                    ON CONFLICT(pro_cod) DO UPDATE SET
                      pro_des = excluded.pro_des,
                      grupo = excluded.grupo,
                      unidade = excluded.unidade,
                      unidade_venda = excluded.unidade_venda,
                      estoque_min_kg = excluded.estoque_min_kg,
                      estoque_atual_kg = excluded.estoque_atual_kg,
                      qtd_reposicao = excluded.qtd_reposicao,
                      estado = 'alerta_enviado',
                      alerta_em = excluded.alerta_em,
                      reposto_em = NULL,
                      ultima_verif = excluded.ultima_verif,
                      notificado_em = excluded.notificado_em
                    """,
                    (
                        p["pro_cod"],
                        p["pro_des"],
                        p["grupo"],
                        p["unidade"],
                        p["unidade_venda"],
                        p["estoque_min_kg"],
                        atual,
                        p["qtd_reposicao"],
                        agora_iso,
                        agora_iso,
                        novo_notificado_em,
                    ),
                )
                if deve_notificar:
                    telegram.enviar_alerta(p)
                    novos_alertas += 1
                else:
                    silenciados += 1
                em_alerta += 1

            elif estado_anterior == "alerta_enviado":
                if atual > limiar_reposicao:
                    db.execute(
                        """
                        UPDATE lista_reabastecimento SET
                          estoque_atual_kg = ?,
                          estado = 'ok',
                          reposto_em = ?,
                          ultima_verif = ?,
                          notificado_em = NULL
                        WHERE pro_cod = ?
                        """,
                        (atual, agora_iso, agora_iso, p["pro_cod"]),
                    )
                    repostos += 1
                else:
                    db.execute(
                        """
                        UPDATE lista_reabastecimento SET
                          estoque_atual_kg = ?,
                          unidade = ?,
                          unidade_venda = ?,
                          pro_des = ?,
                          grupo = ?,
                          estoque_min_kg = ?,
                          ultima_verif = ?
                        WHERE pro_cod = ?
                        """,
                        (
                            atual,
                            p["unidade"],
                            p["unidade_venda"],
                            p["pro_des"],
                            p["grupo"],
                            p["estoque_min_kg"],
                            agora_iso,
                            p["pro_cod"],
                        ),
                    )
                    em_alerta += 1

        # Limpeza de zumbis: produto saiu do conjunto monitorável mas estava em alerta.
        zumbis = db.execute(
            "SELECT pro_cod FROM lista_reabastecimento WHERE estado = 'alerta_enviado'"
        ).fetchall()
        for (cod,) in [(r["pro_cod"],) for r in zumbis]:
            if cod not in pcods_monitorados:
                db.execute(
                    """
                    UPDATE lista_reabastecimento SET
                      estado = 'ok',
                      reposto_em = ?,
                      ultima_verif = ?,
                      notificado_em = NULL
                    WHERE pro_cod = ?
                    """,
                    (agora_iso, agora_iso, cod),
                )
                desativados += 1

        db.commit()

    sumario = {
        "verificados": len(monitorados),
        "novos_alertas": novos_alertas,
        "silenciados": silenciados,
        "repostos": repostos + desativados,
        "em_alerta": em_alerta,
        "executado_em": agora_iso,
    }
    logger.info(
        "monitor: verificados=%d novos_alertas=%d silenciados=%d repostos=%d desativados=%d em_alerta=%d",
        sumario["verificados"],
        novos_alertas,
        silenciados,
        repostos,
        desativados,
        em_alerta,
    )
    return sumario


def limpar_inativos() -> int:
    """Remove da lista os itens que não estão mais no conjunto monitorável. Sem alertas. Retorna quantos foram removidos."""
    try:
        ativos = _ler_pcods_ativos()
    except Exception:
        logger.exception("limpar_inativos: falha ao ler ativos do Firebird")
        return 0

    agora_iso = datetime.now(timezone.utc).isoformat()
    desativados = 0
    with sqlite3.connect(settings.sqlite_path) as db:
        db.row_factory = sqlite3.Row
        zumbis = db.execute(
            "SELECT pro_cod FROM lista_reabastecimento WHERE estado = 'alerta_enviado'"
        ).fetchall()
        for r in zumbis:
            cod = int(r["pro_cod"])
            if cod not in ativos:
                db.execute(
                    """
                    UPDATE lista_reabastecimento SET
                      estado = 'ok',
                      reposto_em = ?,
                      ultima_verif = ?,
                      notificado_em = NULL
                    WHERE pro_cod = ?
                    """,
                    (agora_iso, agora_iso, cod),
                )
                desativados += 1
        db.commit()
    return desativados
