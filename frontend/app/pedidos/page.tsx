"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PedidoEditor } from "@/components/PedidoEditor";
import { PedidoList } from "@/components/PedidoList";
import { SearchField } from "@/components/SearchField";
import {
  atualizarPedido,
  criarPedido,
  listarPedidos,
  removerPedido,
  type Pedido,
  type StatusPedido,
} from "@/lib/pedidos";

type Filtro = "todos" | StatusPedido;

const FILTROS: { key: Filtro; label: string }[] = [
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
  const [editor, setEditor] = useState<{ aberto: boolean; pedido: Pedido | null }>(
    { aberto: false, pedido: null },
  );

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPedidos(await listarPedidos());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar pedidos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (filtro !== "todos" && p.status !== filtro) return false;
      if (!term) return true;
      if (p.produto_nome.toLowerCase().includes(term)) return true;
      if (p.observacao?.toLowerCase().includes(term)) return true;
      return p.clientes.some(
        (c) =>
          c.nome.toLowerCase().includes(term) ||
          (c.telefone ?? "").toLowerCase().includes(term),
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

  const abrirNovo = () => setEditor({ aberto: true, pedido: null });
  const abrirEditar = (p: Pedido) => setEditor({ aberto: true, pedido: p });
  const fechar = () => setEditor({ aberto: false, pedido: null });

  const salvar = async (dados: {
    produto_nome: string;
    observacao?: string;
    status?: StatusPedido;
    clientes: { nome: string; telefone?: string | null; cliente_externo_id?: number | null }[];
  }) => {
    if (editor.pedido) {
      const atualizado = await atualizarPedido(editor.pedido.id, dados);
      setPedidos((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)));
    } else {
      const novo = await criarPedido({
        produto_nome: dados.produto_nome,
        observacao: dados.observacao,
        clientes: dados.clientes,
      });
      setPedidos((prev) => [novo, ...prev]);
    }
    fechar();
  };

  const mover = async (id: number, status: StatusPedido) => {
    const atualizado = await atualizarPedido(id, { status });
    setPedidos((prev) => prev.map((p) => (p.id === id ? atualizado : p)));
  };

  const remover = async (id: number) => {
    await removerPedido(id);
    setPedidos((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pb-16 pt-10 lg:px-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label mb-1.5">Aba 3 · Pedidos de Clientes</p>
              <h1 className="text-3xl font-bold tracking-tight text-ink lg:text-4xl">
                Anotações da loja
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-inkdim">
                Itens solicitados que não estavam disponíveis ou precisam ser encomendados.
                Cada pedido pode ter várias pessoas — clique em adicionar para incluir mais
                de um solicitante.
              </p>
            </div>
            <button
              type="button"
              onClick={abrirNovo}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-forest"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Novo pedido
            </button>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-wheat pb-4">
            <div
              className="segment"
              role="group"
              aria-label="Filtrar pedidos por status"
            >
              {FILTROS.map((f) => {
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
              placeholder="Buscar produto, cliente ou telefone…"
              ariaLabel="Buscar pedidos"
              className="w-full sm:ml-auto sm:min-w-[240px] sm:max-w-sm sm:flex-1"
            />
          </div>

          {loading && (
            <p className="py-12 text-center text-sm text-inkdim">
              Carregando<span className="dots text-copper" />
            </p>
          )}

          {!loading && error && (
            <div className="rounded-md border border-danger bg-dangersoft px-6 py-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-danger">Falha</p>
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
              pedidos={filtrados}
              onEditar={abrirEditar}
              onMover={mover}
              onRemover={remover}
            />
          )}
        </section>
      </main>

      <Footer />

      {editor.aberto && (
        <PedidoEditor
          pedido={editor.pedido}
          onSalvar={salvar}
          onCancelar={fechar}
        />
      )}
    </div>
  );
}
