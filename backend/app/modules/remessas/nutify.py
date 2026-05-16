"""Leituras Firebird para o módulo de Remessas.

Read-only no Nutify PDV. Toda escrita acontece no SQLite local.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from app.db.firebird import firebird_connection

logger = logging.getLogger(__name__)

PTA_PADRAO = 1  # Pauta única ativa: "PAUTA PADRÃO (PREÇO LOJA)".


def _normalizar(s: str) -> str:
    import unicodedata

    nfd = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn").upper().strip()


def buscar_produtos(termo: str, limite: int = 15) -> list[dict]:
    """Busca produtos monitoráveis que contenham `termo` na descrição (case/acento-insensitive)."""
    termo_norm = _normalizar(termo)
    if len(termo_norm) < 2:
        return []
    padrao = f"%{termo_norm}%"
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(
            """
            SELECT FIRST ? p.PRO_COD, p.PRO_DES, p.PRO_UND
            FROM PRODUTO p
            WHERE p.PRO_SIT = 'A' AND p.PRO_IDB = 'S'
              AND p.PRO_EMN IS NOT NULL AND p.PRO_EMN > 0
              AND UPPER(p.PRO_DES) LIKE ?
            ORDER BY p.PRO_DES
            """,
            (limite, padrao),
        )
        return [
            {"pro_cod": int(c), "pro_des": d, "unidade": (u or "KG").strip().upper()}
            for c, d, u in cur
        ]


def snapshot_produto(pro_cod: int) -> Optional[dict]:
    """Snapshot ao vivo do produto + preço/markup atual."""
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(
            """
            SELECT
              p.PRO_DES, p.PRO_UND,
              CAST(p.PRO_QTD AS DOUBLE PRECISION),
              CAST(p.PRO_VLC AS DOUBLE PRECISION),
              CAST(p.PRO_EMN AS DOUBLE PRECISION),
              CAST(pp.PTP_VLR AS DOUBLE PRECISION),
              CAST(pp.PTP_PRC AS DOUBLE PRECISION)
            FROM PRODUTO p
            LEFT JOIN PAUTAPRODUTO pp
              ON pp.PTP_PRO = p.PRO_COD AND pp.PTP_PTA = ?
            WHERE p.PRO_COD = ?
              AND p.PRO_SIT = 'A' AND p.PRO_IDB = 'S'
              AND p.PRO_EMN IS NOT NULL AND p.PRO_EMN > 0
            """,
            (PTA_PADRAO, pro_cod),
        )
        row = cur.fetchone()
        if not row:
            return None
        des, und, qtd, vlc, emn, vlr, prc = row
        return {
            "pro_cod": pro_cod,
            "pro_des": des,
            "unidade": (und or "KG").strip().upper(),
            "estoque_atual": float(qtd or 0),
            "estoque_min": float(emn or 0),
            "custo_atual": float(vlc or 0),
            "preco_atual": float(vlr or 0),
            "markup_pct": float(prc or 0),
        }


def preco_venda_atual(pro_cod: int) -> Optional[float]:
    """Apenas o PTP_VLR atual — usado pelo scheduler pra detectar mudança."""
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(
            "SELECT CAST(PTP_VLR AS DOUBLE PRECISION) FROM PAUTAPRODUTO "
            "WHERE PTP_PTA = ? AND PTP_PRO = ?",
            (PTA_PADRAO, pro_cod),
        )
        row = cur.fetchone()
        return float(row[0]) if row and row[0] is not None else None


def saidas_desde(pro_cod: int, desde: datetime) -> float:
    """Soma de unidades vendidas desde `desde` (filtra só vendas confirmadas)."""
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(
            """
            SELECT COALESCE(SUM(mi.MOI_QTD), 0)
            FROM MOVIMENTOITENS mi
            JOIN MOVIMENTO m ON m.MOV_COD = mi.MOI_MOV
            JOIN MOVIMENTOTIPO mt ON mt.MVT_COD = m.MOV_OPE
            WHERE mi.MOI_PRO = ?
              AND mi.MOI_SIT = 'S'
              AND mt.MVT_TIP = 'S'
              AND mi.MOI_DTE >= ?
            """,
            (pro_cod, desde),
        )
        row = cur.fetchone()
        return float(row[0] or 0)
