"use client";

import { Download, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  gerarPedidoCompra,
  type ItemPedidoCompra,
  type PedidoCompra,
} from "@/lib/reabastecimento";

interface Props {
  onClose: () => void;
  onConcluido?: (totalItens: number) => void;
}

type Linha = ItemPedidoCompra & { qtdInput: string };

function paraLinha(item: ItemPedidoCompra): Linha {
  return { ...item, qtdInput: formatarQtd(item.qtd_sugerida) };
}

function formatarQtd(v: number): string {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function parseQtd(s: string): number | null {
  const v = parseFloat(s.replace(/\./g, "").replace(",", "."));
  if (!isFinite(v) || v <= 0) return null;
  return v;
}

export function PedidoCompraModal({ onClose, onConcluido }: Props) {
  const [estoque, setEstoque] = useState<Linha[]>([]);
  const [clientes, setClientes] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r: PedidoCompra = await gerarPedidoCompra();
      setEstoque(r.estoque_baixo.map(paraLinha));
      setClientes(r.solicitacoes_clientes.map(paraLinha));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar lista");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const removerEstoque = (id: string) =>
    setEstoque((xs) => xs.filter((x) => x.id !== id));
  const removerCliente = (id: string) =>
    setClientes((xs) => xs.filter((x) => x.id !== id));

  const atualizarQtd = (
    origem: "estoque" | "cliente",
    id: string,
    valor: string,
  ) => {
    const fn = (xs: Linha[]) =>
      xs.map((x) => (x.id === id ? { ...x, qtdInput: valor } : x));
    if (origem === "estoque") setEstoque(fn);
    else setClientes(fn);
  };

  const validas = (linhas: Linha[]) => linhas.every((l) => parseQtd(l.qtdInput) !== null);
  const podeBaixar = validas(estoque) && validas(clientes) && (estoque.length + clientes.length) > 0;

  const baixar = () => {
    const txt = montarTxt(estoque, clientes);
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedido-compra-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onConcluido?.(estoque.length + clientes.length);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-2 py-4 backdrop-blur-sm sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-wheat bg-cream p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Sparkles className="h-5 w-5 text-copper" />
            Pedido de compra
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-inkdim hover:bg-wheatlight hover:text-ink"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {carregando && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-inkdim">
            <Loader2 className="h-4 w-4 animate-spin text-copper" />
            Gerando lista
            <span className="dots text-copper" />
          </div>
        )}

        {erro && (
          <div className="mb-4 rounded-md border border-danger bg-dangersoft px-3 py-2 text-sm text-danger">
            {erro}
            <button
              type="button"
              onClick={() => void carregar()}
              className="ml-2 underline hover:text-ink"
            >
              tentar de novo
            </button>
          </div>
        )}

        {!carregando && !erro && (
          <>
            {estoque.length === 0 && clientes.length === 0 ? (
              <p className="py-10 text-center text-sm text-inkdim">
                Nada a comprar agora. Sem produtos abaixo do mínimo e sem pedidos abertos.
              </p>
            ) : (
              <>
                <Secao
                  titulo="Estoque baixo"
                  total={estoque.length}
                  linhas={estoque}
                  onQtd={(id, v) => atualizarQtd("estoque", id, v)}
                  onRemover={removerEstoque}
                />
                <Secao
                  titulo="Solicitações de clientes"
                  total={clientes.length}
                  linhas={clientes}
                  onQtd={(id, v) => atualizarQtd("cliente", id, v)}
                  onRemover={removerCliente}
                  mostrarClientes
                />
              </>
            )}

            <div className="mt-5 flex justify-between gap-2">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancelar
              </button>
              <button
                type="button"
                onClick={baixar}
                disabled={!podeBaixar}
                className="btn btn-primary inline-flex items-center gap-1.5"
              >
                <Download className="h-4 w-4" strokeWidth={2.25} />
                Salvar e baixar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Secao({
  titulo,
  total,
  linhas,
  onQtd,
  onRemover,
  mostrarClientes,
}: {
  titulo: string;
  total: number;
  linhas: Linha[];
  onQtd: (id: string, v: string) => void;
  onRemover: (id: string) => void;
  mostrarClientes?: boolean;
}) {
  if (total === 0) return null;
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between border-b border-wheat pb-1.5">
        <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
        <span className="text-xs text-inkmuted">
          {linhas.length} {linhas.length === 1 ? "item" : "itens"}
        </span>
      </div>
      <ul className="space-y-2">
        {linhas.map((l) => {
          const valido = parseQtd(l.qtdInput) !== null;
          return (
            <li
              key={l.id}
              className="rounded-md border border-wheat bg-creamdeep px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {l.pro_des}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={l.qtdInput}
                  onChange={(e) =>
                    onQtd(l.id, e.target.value.replace(/[^\d.,]/g, ""))
                  }
                  className={`h-8 w-20 rounded-md border bg-cream px-2 text-right text-sm text-ink focus:outline-none focus:ring-2 focus:ring-copper/40 ${
                    valido ? "border-wheat" : "border-danger"
                  }`}
                  aria-label="Quantidade"
                  aria-invalid={!valido}
                />
                <span className="w-10 shrink-0 text-xs uppercase tracking-wider text-inkmuted">
                  {l.unidade}
                </span>
                <button
                  type="button"
                  onClick={() => onRemover(l.id)}
                  className="rounded-md p-1.5 text-inkmuted hover:bg-dangersoft hover:text-danger"
                  aria-label="Remover"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                </button>
              </div>
              {mostrarClientes && l.clientes && l.clientes.length > 0 && (
                <p className="ml-1 mt-1 text-[0.7rem] text-inkmuted">
                  ↳ {l.clientes.length === 1 ? "1 cliente: " : `${l.clientes.length} clientes: `}
                  {l.clientes.join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function montarTxt(estoque: Linha[], clientes: Linha[]): string {
  const data = new Date().toLocaleDateString("pt-BR");
  const linhas = [`Pedido de compra — Casa Granum`, data, ""];
  if (estoque.length > 0) {
    linhas.push("== Estoque baixo ==");
    for (const l of estoque) {
      const qtd = parseQtd(l.qtdInput) ?? 0;
      linhas.push(`- ${l.pro_des} × ${formatarQtd(qtd)} ${l.unidade.toLowerCase()}`);
    }
    linhas.push("");
  }
  if (clientes.length > 0) {
    linhas.push("== Solicitações de clientes ==");
    for (const l of clientes) {
      const qtd = parseQtd(l.qtdInput) ?? 0;
      linhas.push(`- ${l.pro_des} × ${formatarQtd(qtd)} ${l.unidade.toLowerCase()}`);
    }
    linhas.push("");
  }
  linhas.push(`Total: ${estoque.length + clientes.length} itens`);
  return linhas.join("\n");
}
