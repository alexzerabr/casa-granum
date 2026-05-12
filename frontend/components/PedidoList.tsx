"use client";

import {
  Check,
  ChevronDown,
  Pencil,
  Phone,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  formatarTelefone,
  type Pedido,
  type StatusPedido,
} from "@/lib/pedidos";

interface Props {
  pedidos: Pedido[];
  onEditar: (p: Pedido) => void;
  onMover: (id: number, status: StatusPedido) => Promise<void>;
  onRemover: (id: number) => Promise<void>;
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

const formatData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function PedidoList({ pedidos, onEditar, onMover, onRemover }: Props) {
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);

  if (pedidos.length === 0) {
    return (
      <div className="rounded-md border border-wheat bg-cream py-12 text-center">
        <p className="text-base font-semibold text-ink">Nenhum pedido por aqui ainda.</p>
        <p className="mt-1 text-sm text-inkdim">
          registros aparecem assim que forem adicionados
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
            <span className="label tabular">Nº {String(p.id).padStart(3, "0")}</span>
            <span className="mt-1 tabular">{formatData(p.criado_em)}</span>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-wheat/40 px-2 py-0.5 text-[11px] font-semibold tabular text-ink">
              {p.clientes.length} {p.clientes.length === 1 ? "pessoa" : "pessoas"}
            </span>
          </div>

          <div className="min-w-0">
            <h3
              className={`text-base font-semibold text-ink ${
                p.status === "cancelado" ? "line-through" : ""
              }`}
            >
              {p.produto_nome}
            </h3>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink">
              {p.clientes.map((c) => (
                <li
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-md bg-creamdeep px-2 py-0.5"
                >
                  <span>{c.nome}</span>
                  {c.telefone && (
                    <span className="inline-flex items-center gap-0.5 text-inkdim tabular">
                      <Phone className="h-3 w-3" strokeWidth={2} />
                      {formatarTelefone(c.telefone)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {p.observacao && (
              <p className="mt-2 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-inkdim">
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
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onEditar(p)}
                className="rounded-md border border-wheat px-2 py-1 text-xs font-semibold text-ink hover:border-copper hover:text-copper"
                title="Editar pedido"
              >
                <Pencil className="h-3 w-3" strokeWidth={2.5} />
              </button>

              <MoverMenu
                statusAtual={p.status}
                onEscolher={(s) => onMover(p.id, s)}
              />

              {confirmandoId === p.id ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await onRemover(p.id);
                      setConfirmandoId(null);
                    }}
                    className="rounded-md border border-danger bg-dangersoft px-2 py-1 text-xs font-semibold text-danger hover:bg-danger hover:text-cream"
                    title="Confirmar remoção"
                  >
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoId(null)}
                    className="rounded-md border border-wheat px-2 py-1 text-xs text-inkmuted hover:border-ink"
                    title="Cancelar"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmandoId(p.id)}
                  className="rounded-md border border-wheat px-2 py-1 text-xs font-semibold text-inkmuted hover:border-danger hover:text-danger"
                  title="Remover pedido"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function MoverMenu({
  statusAtual,
  onEscolher,
}: {
  statusAtual: StatusPedido;
  onEscolher: (s: StatusPedido) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const opcoes: StatusPedido[] = ["aberto", "atendido", "cancelado"];
  const restantes = opcoes.filter((o) => o !== statusAtual);

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        className="inline-flex items-center gap-0.5 rounded-md border border-wheat px-2 py-1 text-xs font-semibold text-ink hover:border-copper hover:text-copper"
        title="Mover para outro status"
      >
        <Undo2 className="h-3 w-3" strokeWidth={2.5} />
        <ChevronDown className="h-3 w-3" />
      </button>
      {aberto && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-md border border-wheat bg-cream shadow-md">
          {restantes.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setAberto(false);
                void onEscolher(s);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs font-semibold text-ink hover:bg-wheat/40"
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
