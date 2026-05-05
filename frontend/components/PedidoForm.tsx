"use client";

import { Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import type { NovoPedido } from "@/lib/pedidos";

interface Props {
  onSubmit: (p: NovoPedido) => Promise<void>;
}

export function PedidoForm({ onSubmit }: Props) {
  const [produto, setProduto] = useState("");
  const [cliente, setCliente] = useState("");
  const [observacao, setObservacao] = useState("");
  const [criadoPor, setCriadoPor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    if (!produto.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        produto_nome: produto.trim(),
        cliente_nome: cliente.trim() || undefined,
        observacao: observacao.trim() || undefined,
        criado_por: criadoPor.trim() || undefined,
      });
      setProduto("");
      setCliente("");
      setObservacao("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handle}
      className="rounded-md border border-wheat bg-cream p-5 lg:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <Plus className="h-4 w-4 text-copper" strokeWidth={2.2} />
        <span className="label">Novo registro</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor="pedido-produto"
            className="label mb-1.5 block"
          >
            Produto <span className="text-danger">*</span>
          </label>
          <input
            id="pedido-produto"
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
          <label htmlFor="pedido-cliente" className="label mb-1.5 block">
            Cliente
          </label>
          <input
            id="pedido-cliente"
            type="text"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            placeholder="opcional"
            className="text-input"
            disabled={submitting}
            maxLength={200}
          />
        </div>

        <div>
          <label htmlFor="pedido-criado-por" className="label mb-1.5 block">
            Registrado por
          </label>
          <input
            id="pedido-criado-por"
            type="text"
            value={criadoPor}
            onChange={(e) => setCriadoPor(e.target.value)}
            placeholder="nome do funcionário"
            className="text-input"
            disabled={submitting}
            maxLength={100}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="pedido-obs" className="label mb-1.5 block">
            Observação
          </label>
          <textarea
            id="pedido-obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="quando chegar, avisar... / quantidade desejada / etc."
            className="text-input min-h-[60px] resize-y"
            disabled={submitting}
            maxLength={1000}
            rows={2}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {error ? (
          <span className="text-sm font-medium text-danger">{error}</span>
        ) : (
          <span className="text-xs text-inkmuted">
            campos com <span className="text-danger">*</span> são obrigatórios
          </span>
        )}
        <button
          type="submit"
          disabled={!produto.trim() || submitting}
          className="flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-forest disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Registrando" : "Adicionar pedido"}
        </button>
      </div>
    </form>
  );
}
