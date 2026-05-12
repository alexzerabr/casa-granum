"use client";

import { Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ClienteAutocomplete } from "./ClienteAutocomplete";
import {
  formatarTelefone,
  type ClienteEntrada,
  type Pedido,
  type StatusPedido,
} from "@/lib/pedidos";

interface Props {
  pedido?: Pedido | null;
  onSalvar: (dados: {
    produto_nome: string;
    observacao?: string;
    status?: StatusPedido;
    clientes: ClienteEntrada[];
  }) => Promise<void>;
  onCancelar: () => void;
}

interface Linha extends ClienteEntrada {
  uid: string;
}

function novaLinha(parcial?: ClienteEntrada): Linha {
  return {
    uid: crypto.randomUUID(),
    nome: parcial?.nome ?? "",
    telefone: parcial?.telefone ?? null,
    cliente_externo_id: parcial?.cliente_externo_id ?? null,
  };
}

export function PedidoEditor({ pedido, onSalvar, onCancelar }: Props) {
  const [produto, setProduto] = useState(pedido?.produto_nome ?? "");
  const [observacao, setObservacao] = useState(pedido?.observacao ?? "");
  const [status, setStatus] = useState<StatusPedido>(pedido?.status ?? "aberto");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    pedido && pedido.clientes.length > 0
      ? pedido.clientes.map((c) => novaLinha(c))
      : [novaLinha()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const editando = !!pedido;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancelar();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onCancelar, submitting]);

  const atualizar = (uid: string, dados: Partial<Linha>) =>
    setLinhas((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, ...dados } : l)),
    );

  const remover = (uid: string) =>
    setLinhas((prev) => (prev.length > 1 ? prev.filter((l) => l.uid !== uid) : prev));

  const adicionar = () => setLinhas((prev) => [...prev, novaLinha()]);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    const limpas = linhas
      .map((l) => ({
        nome: l.nome.trim(),
        telefone: l.telefone?.toString().trim() || null,
        cliente_externo_id: l.cliente_externo_id ?? null,
      }))
      .filter((l) => l.nome);
    if (!produto.trim() || limpas.length === 0) {
      setErro("Informe o produto e ao menos um cliente.");
      return;
    }
    setSubmitting(true);
    setErro(null);
    try {
      await onSalvar({
        produto_nome: produto.trim(),
        observacao: observacao.trim() || undefined,
        status: editando ? status : undefined,
        clientes: limpas,
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-ink/40 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Editar pedido" : "Novo pedido"}
    >
      <form
        onSubmit={handle}
        className="relative w-full max-w-2xl rounded-md border border-wheat bg-cream p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onCancelar}
          disabled={submitting}
          className="absolute right-3 top-3 rounded-md p-1 text-inkmuted hover:bg-wheat/40 hover:text-ink"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5">
          <p className="label mb-1">{editando ? `Pedido nº ${pedido!.id}` : "Novo pedido"}</p>
          <h2 className="text-xl font-bold text-ink">
            {editando ? "Editar pedido" : "Anotar pedido"}
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="ed-produto" className="label mb-1.5 block">
              Produto <span className="text-danger">*</span>
            </label>
            <input
              id="ed-produto"
              type="text"
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
              placeholder="o que o cliente pediu"
              className="text-input"
              disabled={submitting}
              maxLength={200}
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="label">
                Clientes <span className="text-danger">*</span>{" "}
                <span className="ml-1 font-normal text-inkmuted">
                  {linhas.length} {linhas.length === 1 ? "pessoa" : "pessoas"}
                </span>
              </span>
            </div>
            <ul className="space-y-2">
              {linhas.map((linha, idx) => (
                <li
                  key={linha.uid}
                  className="grid grid-cols-[1fr_180px_auto] gap-2 rounded-md border border-wheat bg-creamdeep/60 p-2"
                >
                  <ClienteAutocomplete
                    valor={linha.nome}
                    onChange={(v) =>
                      atualizar(linha.uid, {
                        nome: v,
                        cliente_externo_id: null,
                      })
                    }
                    onEscolher={(c) =>
                      atualizar(linha.uid, {
                        nome: c.nome,
                        telefone: c.telefone,
                        cliente_externo_id: c.id,
                      })
                    }
                    disabled={submitting}
                    placeholder={`Cliente ${idx + 1}`}
                    ariaLabel={`Nome cliente ${idx + 1}`}
                  />
                  <input
                    type="tel"
                    value={
                      linha.cliente_externo_id
                        ? formatarTelefone(linha.telefone ?? "")
                        : (linha.telefone ?? "")
                    }
                    onChange={(e) =>
                      atualizar(linha.uid, { telefone: e.target.value })
                    }
                    placeholder="Telefone"
                    className="text-input tabular text-sm"
                    disabled={submitting || !!linha.cliente_externo_id}
                    maxLength={30}
                    aria-label={`Telefone cliente ${idx + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => remover(linha.uid)}
                    disabled={submitting || linhas.length === 1}
                    className="rounded-md p-2 text-inkmuted hover:bg-dangersoft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    title="Remover cliente"
                    aria-label={`Remover cliente ${idx + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={adicionar}
              disabled={submitting}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-wheat px-3 py-1.5 text-xs font-semibold text-copper hover:border-copper hover:bg-cream"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Adicionar cliente
            </button>
          </div>

          <div>
            <label htmlFor="ed-obs" className="label mb-1.5 block">
              Observação
            </label>
            <textarea
              id="ed-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="quantidade, prazo, instruções…"
              className="text-input min-h-[60px] resize-y"
              disabled={submitting}
              maxLength={1000}
              rows={2}
            />
          </div>

          {editando && (
            <div>
              <label htmlFor="ed-status" className="label mb-1.5 block">
                Status
              </label>
              <select
                id="ed-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusPedido)}
                className="text-input"
                disabled={submitting}
              >
                <option value="aberto">Aberto</option>
                <option value="atendido">Atendido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          {erro ? (
            <span className="text-sm font-medium text-danger">{erro}</span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancelar}
              disabled={submitting}
              className="rounded-md border border-wheat px-4 py-2 text-sm font-semibold text-inkmuted hover:bg-wheat/30"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !produto.trim()}
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-forest disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Salvando…" : editando ? "Salvar alterações" : "Criar pedido"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
