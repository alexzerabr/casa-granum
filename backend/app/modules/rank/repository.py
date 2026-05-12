"""Queries de ranking de vendas sobre MOVIMENTOITENS (Nutify, somente leitura)."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from app.db.firebird import firebird_connection

# MVT_COD: 4=VENDA, 8=VENDA EM ABERTO. MOI_SIT='S' descarta linhas canceladas.
_VENDAS_BASE = "M.MOV_MVT IN (4, 8) AND MI.MOI_SIT = 'S'"

_CACHE_TTL = 60.0
_cache: dict[str, tuple[float, Any]] = {}
_lock = asyncio.Lock()

_COLUNAS_ORDEM = {
    "qtd": "TOTAL_QTD",
    "valor": "TOTAL_VALOR",
    "movimentos": "N_VENDAS",
}


@dataclass
class RankItem:
    pro_cod: int
    pro_des: str
    pro_und: str
    grupo: str | None
    total_qtd: float
    total_valor: float
    n_vendas: int
    ultima_venda: str | None
    delta_valor_pct: float | None


@dataclass
class SerieDia:
    dia: str
    qtd: float
    valor: float
    n_vendas: int


@dataclass
class Grupo:
    nome: str
    n_produtos: int


def _to_float(v: Decimal | int | float | None) -> float:
    if v is None:
        return 0.0
    return float(v)


def _agregar_window(desde: date, ate: date, grupo: str | None, q: str | None) -> dict[int, float]:
    """Total de valor por produto no intervalo dado — usado para o delta vs período anterior."""
    sql = f"""
        SELECT MI.MOI_PRO, SUM(MI.MOI_TOT)
        FROM MOVIMENTOITENS MI
        JOIN MOVIMENTO M ON M.MOV_COD = MI.MOI_MOV
        JOIN PRODUTO   P ON P.PRO_COD = MI.MOI_PRO
        LEFT JOIN GRUPO G ON G.GRU_COD = P.PRO_GRU
        WHERE {_VENDAS_BASE}
          AND MI.MOI_DTE BETWEEN ? AND ?
    """
    params: list[Any] = [desde, ate]
    if grupo:
        sql += " AND UPPER(G.GRU_DES) = ?"
        params.append(grupo.upper())
    if q:
        sql += " AND UPPER(P.PRO_DES) LIKE ?"
        params.append(f"%{q.upper()}%")
    sql += " GROUP BY MI.MOI_PRO"

    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(sql, params)
        return {int(cod): _to_float(tot) for cod, tot in cur.fetchall()}


def _top_sync(
    desde: date,
    ate: date,
    grupo: str | None,
    q: str | None,
    limite: int,
    ordem: str,
    direcao: str,
    com_delta: bool,
) -> tuple[list[RankItem], int]:
    coluna = _COLUNAS_ORDEM.get(ordem, "TOTAL_VALOR")
    sentido = "ASC" if direcao == "asc" else "DESC"
    sql = f"""
        SELECT FIRST ?
          P.PRO_COD,
          P.PRO_DES,
          P.PRO_UND,
          G.GRU_DES,
          SUM(MI.MOI_QTD)            AS TOTAL_QTD,
          SUM(MI.MOI_TOT)            AS TOTAL_VALOR,
          COUNT(DISTINCT MI.MOI_MOV) AS N_VENDAS,
          MAX(M.MOV_DHE)             AS ULTIMA_HORA
        FROM MOVIMENTOITENS MI
        JOIN MOVIMENTO M ON M.MOV_COD = MI.MOI_MOV
        JOIN PRODUTO   P ON P.PRO_COD = MI.MOI_PRO
        LEFT JOIN GRUPO G ON G.GRU_COD = P.PRO_GRU
        WHERE {_VENDAS_BASE}
          AND MI.MOI_DTE BETWEEN ? AND ?
    """
    params: list[Any] = [int(limite), desde, ate]
    if grupo:
        sql += " AND UPPER(G.GRU_DES) = ?"
        params.append(grupo.upper())
    if q:
        sql += " AND UPPER(P.PRO_DES) LIKE ?"
        params.append(f"%{q.upper()}%")
    sql += (
        " GROUP BY P.PRO_COD, P.PRO_DES, P.PRO_UND, G.GRU_DES "
        f"ORDER BY {coluna} {sentido}, P.PRO_DES"
    )

    # Total de produtos distintos no filtro (sem o FIRST) — informativo.
    sql_total = f"""
        SELECT COUNT(DISTINCT MI.MOI_PRO)
        FROM MOVIMENTOITENS MI
        JOIN MOVIMENTO M ON M.MOV_COD = MI.MOI_MOV
        JOIN PRODUTO   P ON P.PRO_COD = MI.MOI_PRO
        LEFT JOIN GRUPO G ON G.GRU_COD = P.PRO_GRU
        WHERE {_VENDAS_BASE}
          AND MI.MOI_DTE BETWEEN ? AND ?
    """
    params_total: list[Any] = [desde, ate]
    if grupo:
        sql_total += " AND UPPER(G.GRU_DES) = ?"
        params_total.append(grupo.upper())
    if q:
        sql_total += " AND UPPER(P.PRO_DES) LIKE ?"
        params_total.append(f"%{q.upper()}%")

    delta = {}
    if com_delta:
        dur = (ate - desde).days + 1
        ant_ate = desde - timedelta(days=1)
        ant_desde = ant_ate - timedelta(days=dur - 1)
        delta_atual = _agregar_window(desde, ate, grupo, q)
        delta_anterior = _agregar_window(ant_desde, ant_ate, grupo, q)
        for cod, atual in delta_atual.items():
            ant = delta_anterior.get(cod, 0.0)
            if ant <= 0:
                delta[cod] = None
            else:
                delta[cod] = (atual - ant) / ant * 100.0

    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(sql, params)
        itens: list[RankItem] = []
        for cod, des, und, gru, qtd, valor, n, ult in cur.fetchall():
            cod_i = int(cod)
            itens.append(
                RankItem(
                    pro_cod=cod_i,
                    pro_des=(des or "").strip(),
                    pro_und=(und or "").strip(),
                    grupo=(gru or "").strip() or None,
                    total_qtd=_to_float(qtd),
                    total_valor=_to_float(valor),
                    n_vendas=int(n or 0),
                    ultima_venda=ult.isoformat() if ult else None,
                    delta_valor_pct=delta.get(cod_i) if com_delta else None,
                )
            )
        cur.execute(sql_total, params_total)
        total = int((cur.fetchone() or [0])[0] or 0)
        return itens, total


def _serie_sync(
    pro_cod: int, desde: date, ate: date, granularidade: str
) -> list[SerieDia]:
    sql = f"""
        SELECT MI.MOI_DTE,
               SUM(MI.MOI_QTD),
               SUM(MI.MOI_TOT),
               COUNT(DISTINCT MI.MOI_MOV)
        FROM MOVIMENTOITENS MI
        JOIN MOVIMENTO M ON M.MOV_COD = MI.MOI_MOV
        WHERE {_VENDAS_BASE}
          AND MI.MOI_PRO = ?
          AND MI.MOI_DTE BETWEEN ? AND ?
        GROUP BY MI.MOI_DTE
        ORDER BY 1
    """
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(sql, (pro_cod, desde, ate))
        diarios = [
            (d, _to_float(q), _to_float(v), int(n or 0))
            for d, q, v, n in cur.fetchall()
        ]

    if granularidade == "dia" or not diarios:
        return [
            SerieDia(dia=d.isoformat(), qtd=q, valor=v, n_vendas=n)
            for d, q, v, n in diarios
        ]

    buckets: dict[str, list[float]] = {}
    for d, q, v, n in diarios:
        if granularidade == "semana":
            inicio = d - timedelta(days=d.weekday())
            chave = inicio.isoformat()
        else:
            chave = d.replace(day=1).isoformat()
        agg = buckets.setdefault(chave, [0.0, 0.0, 0])
        agg[0] += q
        agg[1] += v
        agg[2] += n
    return [
        SerieDia(dia=k, qtd=v[0], valor=v[1], n_vendas=int(v[2]))
        for k, v in sorted(buckets.items())
    ]


def _grupos_sync(desde: date, ate: date) -> list[Grupo]:
    sql = f"""
        SELECT G.GRU_DES, COUNT(DISTINCT P.PRO_COD)
        FROM MOVIMENTOITENS MI
        JOIN MOVIMENTO M ON M.MOV_COD = MI.MOI_MOV
        JOIN PRODUTO   P ON P.PRO_COD = MI.MOI_PRO
        JOIN GRUPO     G ON G.GRU_COD = P.PRO_GRU
        WHERE {_VENDAS_BASE}
          AND MI.MOI_DTE BETWEEN ? AND ?
        GROUP BY G.GRU_DES
        ORDER BY 2 DESC
    """
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute(sql, (desde, ate))
        return [
            Grupo(nome=(g or "").strip(), n_produtos=int(n or 0))
            for g, n in cur.fetchall()
            if g
        ]


async def _cached(chave: str, fn, *args):
    agora = time.time()
    async with _lock:
        hit = _cache.get(chave)
        if hit and (agora - hit[0]) < _CACHE_TTL:
            return hit[1]
    valor = await asyncio.to_thread(fn, *args)
    async with _lock:
        _cache[chave] = (agora, valor)
        if len(_cache) > 128:
            mais_antiga = min(_cache.items(), key=lambda kv: kv[1][0])[0]
            _cache.pop(mais_antiga, None)
    return valor


async def top(
    desde: date,
    ate: date,
    grupo: str | None,
    q: str | None,
    limite: int,
    ordem: str,
    direcao: str,
    com_delta: bool = True,
) -> tuple[list[RankItem], int]:
    chave = (
        f"top|{desde}|{ate}|{grupo or ''}|{(q or '').lower()}|"
        f"{limite}|{ordem}|{direcao}|{int(com_delta)}"
    )
    return await _cached(
        chave, _top_sync, desde, ate, grupo, q, limite, ordem, direcao, com_delta
    )


async def serie(
    pro_cod: int, desde: date, ate: date, granularidade: str = "dia"
) -> list[SerieDia]:
    chave = f"serie|{pro_cod}|{desde}|{ate}|{granularidade}"
    return await _cached(chave, _serie_sync, pro_cod, desde, ate, granularidade)


async def grupos(desde: date, ate: date) -> list[Grupo]:
    chave = f"grupos|{desde}|{ate}"
    return await _cached(chave, _grupos_sync, desde, ate)
