"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  buscarProdutos,
  criarRemessa,
  formatarQuantidade,
  formatarReais,
  previewPreco,
  snapshotProduto,
  type ProdutoBusca,
  type Snapshot,
} from "@/lib/remessas";

interface Props {
  onClose: () => void;
  onCriado: () => void | Promise<void>;
}

export function NovaRemessaModal({ onClose, onCriado }: Props) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [novoCusto, setNovoCusto] = useState<string>("");
  const [precoSugerido, setPrecoSugerido] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buscaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (snap) return;
    const handler = setTimeout(async () => {
      if (termo.trim().length < 2) {
        setResultados([]);
        return;
      }
      try {
        const r = await buscarProdutos(termo);
        setResultados(r);
      } catch {
        setResultados([]);
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [termo, snap]);

  useEffect(() => {
    if (!snap) {
      setPrecoSugerido(null);
      return;
    }
    const custo = parseFloat(novoCusto.replace(",", "."));
    if (!isFinite(custo) || custo <= 0) {
      setPrecoSugerido(null);
      return;
    }
    const handler = setTimeout(async () => {
      try {
        const r = await previewPreco(custo, snap.markup_pct, snap.custo_atual);
        setPrecoSugerido(r.preco_sugerido);
      } catch {
        setPrecoSugerido(null);
      }
    }, 200);
    return () => clearTimeout(handler);
  }, [novoCusto, snap]);

  const selecionarProduto = async (p: ProdutoBusca) => {
    setErro(null);
    try {
      const s = await snapshotProduto(p.pro_cod);
      if (s.tem_remessa_ativa) {
        setErro("Já existe remessa ativa para este produto.");
        return;
      }
      setSnap(s);
      setResultados([]);
      setTermo("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao carregar produto");
    }
  };

  const voltar = () => {
    setSnap(null);
    setNovoCusto("");
    setPrecoSugerido(null);
    setErro(null);
  };

  const confirmar = async () => {
    if (!snap) return;
    const custo = parseFloat(novoCusto.replace(",", "."));
    if (!isFinite(custo) || custo <= 0) return;
    setSalvando(true);
    setErro(null);
    try {
      await criarRemessa(snap.pro_cod, custo);
      await onCriado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar remessa");
      setSalvando(false);
    }
  };

  const custoValido = (() => {
    const c = parseFloat(novoCusto.replace(",", "."));
    return isFinite(c) && c > 0;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-2 py-4 backdrop-blur-sm sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-wheat bg-cream p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Nova remessa</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-inkdim hover:bg-wheatlight hover:text-ink"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!snap ? (
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-inkmuted" />
              <input
                ref={buscaRef}
                type="search"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Buscar produto pela descrição… (ex: cacau, 70%)"
                className="text-input pl-10"
                autoComplete="off"
              />
            </div>
            {resultados.length > 0 && (
              <ul className="mt-3 max-h-72 divide-y divide-wheat overflow-y-auto rounded-md border border-wheat bg-cream">
                {resultados.map((p) => (
                  <li key={p.pro_cod}>
                    <button
                      type="button"
                      onClick={() => selecionarProduto(p)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-wheatlight/40"
                    >
                      <span className="truncate text-sm font-medium text-ink">
                        {p.pro_des}
                      </span>
                      <span className="label shrink-0 text-[0.65rem]">
                        {p.unidade}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {termo.trim().length >= 2 && resultados.length === 0 && (
              <p className="mt-4 text-center text-sm text-inkdim">
                Nenhum produto encontrado.
              </p>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-4 rounded-md border border-wheat bg-creamdeep px-4 py-3">
              <p className="text-sm font-semibold text-ink">{snap.pro_des}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                <Cell rotulo="Unidade" valor={snap.unidade} />
                <Cell
                  rotulo="Estoque atual"
                  valor={formatarQuantidade(snap.estoque_atual, snap.unidade)}
                />
                <Cell
                  rotulo="Estoque mín."
                  valor={formatarQuantidade(snap.estoque_min, snap.unidade)}
                />
                <Cell rotulo="Custo atual" valor={formatarReais(snap.custo_atual)} />
                <Cell rotulo="Preço atual" valor={formatarReais(snap.preco_atual)} />
                <Cell
                  rotulo="Markup"
                  valor={`${snap.markup_pct.toFixed(2)}%`}
                />
              </dl>
            </div>

            <label className="label mb-1 block text-[0.7rem]">
              Novo custo unitário (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={novoCusto}
              onChange={(e) =>
                setNovoCusto(e.target.value.replace(/[^\d.,]/g, ""))
              }
              placeholder="Ex: 22,50"
              className="text-input"
              autoFocus
            />

            {precoSugerido !== null && (() => {
              const custo = parseFloat(novoCusto.replace(",", "."));
              const reduziu = isFinite(custo) && custo < snap.custo_atual;
              return (
                <p
                  className={`mt-3 rounded-md border bg-cream px-3 py-2 text-sm ${
                    reduziu ? "border-good" : "border-copper"
                  }`}
                >
                  Preço sugerido:{" "}
                  <span className={`font-semibold ${reduziu ? "text-good" : "text-copper"}`}>
                    {formatarReais(precoSugerido)}
                  </span>
                  {reduziu && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-goodsoft px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-good">
                      ↓ sugere reduzir
                    </span>
                  )}
                  <span className="ml-1 text-xs text-inkdim">
                    (mantém markup atual de {snap.markup_pct.toFixed(2)}%)
                  </span>
                </p>
              );
            })()}

            {erro && (
              <p className="mt-3 text-sm text-danger" role="alert">
                {erro}
              </p>
            )}

            <div className="mt-5 flex justify-between gap-2">
              <button
                type="button"
                onClick={voltar}
                className="btn btn-secondary"
                disabled={salvando}
              >
                ← Trocar produto
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={!custoValido || salvando}
                className="btn btn-primary"
              >
                {salvando ? "Salvando…" : "Iniciar controle de remessa"}
              </button>
            </div>
          </div>
        )}

        {!snap && erro && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}

function Cell({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="label text-[0.6rem]">{rotulo}</dt>
      <dd className="mt-0.5 font-medium text-ink">{valor}</dd>
    </div>
  );
}
