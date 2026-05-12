"use client";

import type { Produto } from "@/lib/api";

interface Props {
  produtos: Produto[];
  totalAnalisados: number;
  cached: boolean;
  objetivo: string;
}

export function ResultsList({
  produtos,
  totalAnalisados,
  cached,
  objetivo,
}: Props) {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-24 lg:px-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-wheat pb-4">
        <div>
          <p className="label mb-1">Recomendações para</p>
          <h2 className="text-xl font-semibold text-ink">“{objetivo}”</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-inkdim">
          <span className="tabular">
            <span className="font-semibold text-ink">{totalAnalisados}</span>{" "}
            produtos analisados
          </span>
          {cached && (
            <span className="rounded-full border border-wheat px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wider text-inkmuted">
              cache
            </span>
          )}
        </div>
      </header>

      {produtos.length === 0 ? (
        <div className="rounded-md border border-wheat bg-cream px-6 py-10 text-center">
          <p className="text-base font-semibold text-ink">
            Nenhum produto com propriedades cadastradas bate com esse objetivo.
          </p>
          <p className="mt-1.5 text-sm text-inkdim">
            Tente reformular ou usar um termo mais amplo. Conforme mais produtos
            ganham descrição de benefícios no Nutify, o catálogo cresce.
          </p>
        </div>
      ) : (
        <ol className="space-y-4">
          {produtos.map((p, idx) => (
            <li
              key={`${p.pro_cod}-${idx}`}
              className="flex gap-4 rounded-md border border-wheat bg-cream p-4 transition-colors hover:border-copper"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold tabular text-cream">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink">{p.nome}</h3>
                  <span className="label tabular shrink-0">
                    Nº {String(p.pro_cod).padStart(3, "0")}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-inkdim">
                  {p.motivo}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-10 text-center text-xs leading-relaxed text-inkmuted">
        Recomendações geradas a partir dos benefícios cadastrados no catálogo da
        loja. Consulte um profissional de saúde antes de iniciar qualquer
        suplementação.
      </p>
    </section>
  );
}
