"use client";

import { Check, X } from "lucide-react";
import type { Pedido, StatusPedido } from "@/lib/pedidos";

interface Props {
  pedidos: Pedido[];
  onUpdate: (id: number, status: StatusPedido) => Promise<void>;
}

const STATUS_BADGE: Record<StatusPedido, string> = {
  aberto: "bg-warnsoft text-warn border-warn/40",
  atendido: "bg-emerald-50 text-emerald-800 border-emerald-700/40",
  cancelado: "bg-inkmuted/10 text-inkmuted border-inkmuted/40",
};

const STATUS_LABEL: Record<StatusPedido, string> = {
  aberto: "Aberto",
  atendido: "Atendido",
  cancelado: "Cancelado",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function PedidoList({ pedidos, onUpdate }: Props) {
  if (pedidos.length === 0) {
    return (
      <div className="rounded-md border border-wheat bg-cream py-12 text-center">
        <p className="text-base font-semibold text-ink">
          Nenhum pedido por aqui ainda.
        </p>
        <p className="mt-1 text-sm text-inkdim">
          registros aparecem assim que forem adicionados acima
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {pedidos.map((p) => (
        <li
          key={p.id}
          className={`grid grid-cols-[auto_1fr_auto] items-start gap-4 rounded-md border border-wheat bg-cream p-4 transition-colors hover:border-copper ${
            p.status === "cancelado" ? "opacity-60" : ""
          }`}
        >
          <div className="flex flex-col items-start text-xs text-inkdim">
            <span className="label tabular">
              Nº {String(p.id).padStart(3, "0")}
            </span>
            <span className="mt-1 tabular">{formatDate(p.criado_em)}</span>
          </div>

          <div className="min-w-0">
            <h3
              className={`text-base font-semibold text-ink ${
                p.status === "cancelado" ? "line-through" : ""
              }`}
            >
              {p.produto_nome}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-inkdim">
              {p.cliente_nome && (
                <span>
                  <span className="font-semibold text-inkdim">Cliente:</span>{" "}
                  {p.cliente_nome}
                </span>
              )}
              {p.criado_por && (
                <span>
                  <span className="font-semibold text-inkdim">Por:</span>{" "}
                  {p.criado_por}
                </span>
              )}
            </div>
            {p.observacao && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
                {p.observacao}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <span
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_BADGE[p.status]}`}
            >
              {STATUS_LABEL[p.status]}
            </span>
            {p.status === "aberto" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUpdate(p.id, "atendido")}
                  className="flex items-center gap-1 rounded-md border border-emerald-700/30 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                  title="marcar como atendido"
                >
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                  Atender
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(p.id, "cancelado")}
                  className="flex items-center gap-1 rounded-md border border-wheat px-2 py-1 text-xs font-semibold text-inkmuted transition-colors hover:border-danger hover:text-danger"
                  title="cancelar pedido"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
