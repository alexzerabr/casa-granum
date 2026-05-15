"use client";

import { AlertTriangle, ShoppingCart, Triangle } from "lucide-react";
import {
  formatarQuantidade,
  type ItemReabastecimento,
} from "@/lib/reabastecimento";

interface Props {
  itens: ItemReabastecimento[];
  vazio?: React.ReactNode;
}

const formatDate = (iso: string | null) =>
  iso === null
    ? "—"
    : new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });

export function ReabastecimentoTable({ itens, vazio }: Props) {
  if (itens.length === 0) {
    return (
      <>
        {vazio ?? (
          <div className="rounded-md border border-wheat bg-cream py-16 text-center">
            <p className="text-lg font-semibold text-ink">Tudo em ordem.</p>
            <p className="mt-2 text-sm text-inkdim">
              Nenhum produto abaixo do mínimo.
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-wheat bg-cream">
      <div className="min-w-[640px]">
      {/* Header da tabela */}
      <div className="grid grid-cols-[28px_minmax(0,1fr)_120px_120px_140px] items-center gap-x-4 border-b border-wheat bg-creamdeep px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-inkdim">
        <span aria-hidden />
        <span>Produto</span>
        <span className="text-right">Atual</span>
        <span className="text-right">Mínimo</span>
        <span className="text-right">Alerta</span>
      </div>

      <ol className="divide-y divide-wheat">
        {itens.map((item) => {
          const isCritico = item.nivel === "critico";
          const dot = isCritico
            ? "bg-danger"
            : "bg-warn";
          const valueColor = isCritico ? "text-danger" : "text-ink";

          return (
            <li
              key={item.pro_cod}
              className="grid grid-cols-[28px_minmax(0,1fr)_120px_120px_140px] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-wheatlight/40"
            >
              {/* Status dot */}
              <span
                className={`flex h-2.5 w-2.5 rounded-full ${dot}`}
                title={isCritico ? "Crítico — abaixo do mínimo" : "Em alerta"}
                aria-label={isCritico ? "crítico" : "alerta"}
              />

              {/* Produto */}
              <div className="min-w-0">
                <p className="truncate text-[0.95rem] font-semibold text-ink">
                  {item.pro_des}
                </p>
                <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-inkdim">
                  {item.grupo && <span className="truncate">{item.grupo}</span>}
                  {item.grupo && <span className="text-wheat">·</span>}
                  <span className="font-semibold tracking-wider text-copper">
                    {item.unidade === item.unidade_venda
                      ? item.unidade
                      : `${item.unidade_venda} → ${item.unidade}`}
                  </span>
                  {item.qtd_reposicao !== null &&
                    item.qtd_reposicao !== undefined &&
                    item.qtd_reposicao > 0 && (
                      <>
                        <span className="text-wheat">·</span>
                        <span className="flex items-center gap-1 text-copper">
                          <ShoppingCart className="h-3 w-3" strokeWidth={2} />
                          repor{" "}
                          {formatarQuantidade(
                            item.qtd_reposicao,
                            item.unidade,
                          )}
                        </span>
                      </>
                    )}
                </p>
              </div>

              {/* Atual */}
              <div
                className={`text-right tabular text-base font-semibold ${valueColor}`}
              >
                {formatarQuantidade(item.estoque_atual_kg, item.unidade)}
              </div>

              {/* Mínimo */}
              <div className="text-right tabular text-sm font-medium text-inkdim">
                {formatarQuantidade(item.estoque_min_kg, item.unidade)}
              </div>

              {/* Alerta */}
              <div className="flex items-center justify-end gap-1.5 text-right text-sm text-inkdim tabular">
                {isCritico ? (
                  <Triangle
                    className="h-3 w-3 fill-danger text-danger"
                    strokeWidth={2}
                  />
                ) : (
                  <AlertTriangle
                    className="h-3 w-3 text-warn"
                    strokeWidth={2}
                  />
                )}
                <span>{formatDate(item.alerta_em)}</span>
              </div>
            </li>
          );
        })}
      </ol>
      </div>
    </div>
  );
}
