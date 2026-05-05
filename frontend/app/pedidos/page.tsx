"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PedidoForm } from "@/components/PedidoForm";
import { PedidoList } from "@/components/PedidoList";
import { SearchField } from "@/components/SearchField";
import {
  atualizarStatus,
  criarPedido,
  listarPedidos,
  type NovoPedido,
  type Pedido,
  type StatusPedido,
} from "@/lib/pedidos";

type Filtro = "todos" | StatusPedido;

const filtros: { key: Filtro; label: string }[] = [
  { key: "aberto", label: "Abertos" },
  { key: "atendido", label: "Atendidos" },
  { key: "cancelado", label: "Cancelados" },
  { key: "todos", label: "Todos" },
];

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("aberto");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listarPedidos();
      setPedidos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar pedidos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pedidosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (filtro !== "todos" && p.status !== filtro) return false;
      if (!term) return true;
      return (
        p.produto_nome.toLowerCase().includes(term) ||
        (p.cliente_nome ?? "").toLowerCase().includes(term)
      );
    });
  }, [pedidos, filtro, search]);

  const contagens = useMemo(() => {
    const c: Record<Filtro, number> = {
      todos: pedidos.length,
      aberto: 0,
      atendido: 0,
      cancelado: 0,
    };
    for (const p of pedidos) c[p.status]++;
    return c;
  }, [pedidos]);

  const handleNovo = async (p: NovoPedido) => {
    const novo = await criarPedido(p);
    setPedidos((prev) => [novo, ...prev]);
  };

  const handleUpdate = async (id: number, status: StatusPedido) => {
    const atualizado = await atualizarStatus(id, status);
    setPedidos((prev) => prev.map((p) => (p.id === id ? atualizado : p)));
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pb-16 pt-10 lg:px-10">
          {/* Hero compacto */}
          <div className="mb-6">
            <p className="label mb-1.5">Aba 3 · Pedidos de Clientes</p>
            <h1 className="text-3xl font-bold tracking-tight text-ink lg:text-4xl">
              Anotações da loja
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-inkdim">
              Itens solicitados que não estavam disponíveis ou precisam ser
              encomendados. Marque como atendido quando o produto chegar.
            </p>
          </div>

          {/* Form */}
          <div className="mb-8">
            <PedidoForm onSubmit={handleNovo} />
          </div>

          {/* Filtros + busca compactos */}
          <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-wheat pb-4">
            <div
              className="segment"
              role="group"
              aria-label="Filtrar pedidos por status"
            >
              {filtros.map((f) => {
                const ativo = filtro === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFiltro(f.key)}
                    className={ativo ? "is-active" : ""}
                    aria-pressed={ativo}
                  >
                    {f.label}
                    <span
                      className={`tabular text-xs ${
                        ativo ? "text-cream/80" : "text-inkmuted"
                      }`}
                    >
                      {contagens[f.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar produto ou cliente…"
              ariaLabel="Buscar pedidos"
              className="ml-auto min-w-[240px] max-w-sm flex-1"
            />
          </div>

          {loading && (
            <p className="py-12 text-center text-sm text-inkdim">
              Carregando<span className="dots text-copper" />
            </p>
          )}

          {!loading && error && (
            <div className="rounded-md border border-danger bg-dangersoft px-6 py-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-danger">
                Falha
              </p>
              <p className="mt-2 text-base text-ink">{error}</p>
              <button
                type="button"
                onClick={() => void carregar()}
                className="mt-4 text-sm font-semibold text-copper hover:text-copperdark"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {!loading && !error && (
            <PedidoList
              pedidos={pedidosFiltrados}
              onUpdate={handleUpdate}
            />
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
