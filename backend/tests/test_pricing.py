import pytest

from app.modules.remessas.pricing import arredondar_par_01, sugerir_preco


@pytest.mark.parametrize(
    "entrada,esperado",
    [
        (87.50, 88.01),
        (87.00, 88.01),
        (88.00, 88.01),
        (88.10, 90.01),
        (110.41, 112.01),
        # Borda: par+,01 exato — fica.
        (88.01, 88.01),
        # Decimais altos que estouram pro próximo par.
        (89.99, 90.01),
        # Ímpar baixo.
        (1.00, 2.01),
    ],
)
def test_arredondar_par_01(entrada: float, esperado: float) -> None:
    assert arredondar_par_01(entrada) == esperado


def test_sugerir_preco_mantem_markup() -> None:
    # custo 20, markup 100% → bruto 40 → 40.01.
    assert sugerir_preco(20.0, 100.0) == 40.01


def test_sugerir_preco_caso_real_cacau() -> None:
    # CACAU EM PO 100% — custo 19.94, markup 341.37% → bruto ≈ 88.0093 → 88.01.
    assert sugerir_preco(19.94, 341.37) == 88.01
