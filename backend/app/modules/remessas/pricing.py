"""Cálculo do preço sugerido conforme regra da Casa Granum."""

from __future__ import annotations

import math


def arredondar_par_01(valor: float) -> float:
    """Próximo número par+0,01 ≥ valor (sempre pra cima).

    Exemplos: 87.50 → 88.01 · 87.00 → 88.01 · 88.00 → 88.01 ·
              88.10 → 90.01 · 110.41 → 112.01.
    """
    base = math.floor(valor)
    candidato = base if base % 2 == 0 else base + 1
    # Epsilon evita ruído de float (ex.: 19.94 × 4.4137 ≈ 88.0093 ainda cabe em 88.01).
    if valor > candidato + 0.01 + 1e-9:
        candidato += 2
    return round(candidato + 0.01, 2)


def sugerir_preco(novo_custo: float, markup_pct: float) -> float:
    """Mantém o markup atual do produto sobre o novo custo, arredondado pra par+0,01."""
    bruto = novo_custo * (1 + markup_pct / 100)
    return arredondar_par_01(bruto)
