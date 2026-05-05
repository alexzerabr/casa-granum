"""Formatação de quantidades conforme a unidade (KG com decimais, demais inteiros)."""

from __future__ import annotations

UNIDADES_DECIMAIS = {"KG"}
SUFIXOS = {
    "KG": "kg",
    "UN": "un",
    "CAPS": "caps",
    "CX": "cx",
}


def normalizar(unidade: str | None) -> str:
    if not unidade:
        return "KG"
    return unidade.strip().upper() or "KG"


def formatar(valor: float | None, unidade: str | None) -> str:
    if valor is None:
        return "—"
    und = normalizar(unidade)
    sufixo = SUFIXOS.get(und, und.lower())
    if und in UNIDADES_DECIMAIS:
        return f"{valor:.3f}".replace(".", ",") + f" {sufixo}"
    return f"{int(round(valor))} {sufixo}"
