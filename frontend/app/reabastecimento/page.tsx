"use client";

import { AlertTriangle, CheckCircle2, Database, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PedidoCompraModal } from "@/components/PedidoCompraModal";
import { ReabastecimentoTable } from "@/components/ReabastecimentoTable";
import { ReabastecimentoFiltros } from "@/components/ReabastecimentoFiltros";
import {
  executarVerificacao,
  filtrar,
  filtrosAtivos,
  FILTROS_VAZIOS,
  listarReabastecimento,
  type SumarioVerificacao,
  unidadesDisponiveis,
  type FiltrosReabastecimento,
  type ItemReabastecimento,
} from "@/lib/reabastecimento";
import { useScanStatus } from "@/lib/useScanStatus";

const POLL_LISTA_MS = 60_000;
const TOAST_DURATION = 6_000;

export default function ReabastecimentoPage() {
  const status = useScanStatus();
  const running = status?.em_execucao ?? false;
  const origemRun = status?.origem ?? null;

  const [itens, setItens] = useState<ItemReabastecimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [fonte, setFonte] = useState<"cache" | "ao-vivo">("cache");
  const [sumario, setSumario] = useState<SumarioVerificacao | null>(null);
  const [mostrarPedidoCompra, setMostrarPedidoCompra] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosReabastecimento>({
    ...FILTROS_VAZIOS,
    unidades: new Set<string>(),
  });

  const runningRef = useRef(running);
  runningRef.current = running;

  const carregar = useCallback(
    async (origem: "cache" | "ao-vivo" = "cache") => {
      setError(null);
      try {
        const data = await listarReabastecimento();
        setItens(data);
        setUltimaAtualizacao(new Date());
        setFonte(origem);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar lista");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Detecta transição running→idle (varredura finalizada, manual ou auto)
  // e atualiza lista + mostra banner com último sumário.
  const wasRunningRef = useRef(running);
  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = running;
    if (wasRunning && !running) {
      void carregar("ao-vivo");
      if (status?.ultimo_sumario) setSumario(status.ultimo_sumario);
    }
  }, [running, status?.ultimo_sumario, carregar]);

  // Carga inicial da lista + poll mais lento que o do status.
  useEffect(() => {
    void carregar("cache");
    const id = setInterval(() => {
      if (!runningRef.current) void carregar("cache");
    }, POLL_LISTA_MS);
    return () => clearInterval(id);
  }, [carregar]);

  const handleRunNow = async () => {
    if (running) return;
    setSumario(null);
    try {
      const resultado = await executarVerificacao();
      await carregar("ao-vivo");
      setSumario(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro na verificação");
    }
  };

  useEffect(() => {
    if (!sumario) return;
    const id = setTimeout(() => setSumario(null), TOAST_DURATION);
    return () => clearTimeout(id);
  }, [sumario]);

  const formatHora = (d: Date | null) =>
    d
      ? d.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "—";

  const unidades = useMemo(() => unidadesDisponiveis(itens), [itens]);
  const itensFiltrados = useMemo(
    () => filtrar(itens, filtros),
    [itens, filtros],
  );
  const temFiltro = filtrosAtivos(filtros);
  const criticos = useMemo(
    () => itens.filter((i) => i.nivel === "critico").length,
    [itens],
  );

  const labelBotao = running
    ? origemRun === "auto"
      ? "Varredura automática…"
      : "Consultando…"
    : "Verificar agora";

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 lg:px-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label mb-2">Aba 2 · Reabastecimento</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-ink lg:text-4xl">
                  O que precisa repor
                </h1>
                {criticos > 0 && (
                  <span className="badge-critico">
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
                    {criticos} {criticos === 1 ? "crítico" : "críticos"}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-inkdim">
                {itens.length} produtos abaixo do mínimo · sincroniza a cada
                minuto
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarPedidoCompra(true)}
                  className="btn btn-secondary inline-flex items-center gap-1.5"
                  title="Gerar pedido de compra com IA (estoque baixo + pedidos abertos)"
                >
                  <Sparkles className="h-4 w-4" strokeWidth={2.25} />
                  Pedido de compra (IA)
                </button>
                <button
                  type="button"
                  onClick={handleRunNow}
                  disabled={running}
                  className="btn btn-secondary"
                  aria-live="polite"
                  aria-busy={running}
                >
                  {running ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-inkmuted/30 border-t-ink" />
                      {labelBotao}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" strokeWidth={2} />
                      {labelBotao}
                    </>
                  )}
                </button>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-inkdim tabular">
                {fonte === "ao-vivo" && (
                  <Database
                    className="h-3.5 w-3.5 text-copper"
                    strokeWidth={2}
                  />
                )}
                {fonte === "ao-vivo" ? "Ao vivo" : "Atualizado"}{" "}
                {formatHora(ultimaAtualizacao)}
              </span>
            </div>
          </div>

          {sumario && !running && (
            <div
              role="status"
              aria-live="polite"
              className="mb-6 flex items-start gap-3 rounded-md border border-good bg-goodsoft px-4 py-3 text-sm text-ink"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" strokeWidth={2.5} />
              <div className="flex-1">
                <p className="font-semibold">Verificação concluída</p>
                <p className="mt-0.5 text-inkdim">
                  {sumario.verificados} produtos varridos ·{" "}
                  {sumario.novos_alertas > 0 ? (
                    <span className="font-semibold text-danger">
                      {sumario.novos_alertas}{" "}
                      {sumario.novos_alertas === 1 ? "novo alerta" : "novos alertas"}
                    </span>
                  ) : (
                    "nenhum novo alerta"
                  )}
                  {sumario.repostos > 0 &&
                    ` · ${sumario.repostos} ${sumario.repostos === 1 ? "reposto/desativado" : "repostos/desativados"}`}
                  {" · "}
                  {sumario.em_alerta} em alerta no total
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSumario(null)}
                className="text-xs font-semibold text-inkdim hover:text-ink"
                aria-label="Dispensar"
              >
                ✕
              </button>
            </div>
          )}

          {!loading && !error && itens.length > 0 && (
            <div className="mb-6">
              <ReabastecimentoFiltros
                filtros={filtros}
                onChange={setFiltros}
                unidades={unidades}
                totalCarregados={itens.length}
                totalFiltrados={itensFiltrados.length}
              />
            </div>
          )}

          {loading && (
            <p className="py-16 text-center text-sm text-inkdim">
              {running
                ? "Aguardando primeira varredura concluir"
                : "Carregando"}
              <span className="dots text-copper" />
            </p>
          )}

          {!loading && error && (
            <div className="rounded-md border border-danger bg-dangersoft px-6 py-8 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-danger">
                Falha
              </p>
              <p className="mt-2 text-base text-ink">{error}</p>
              <button
                type="button"
                onClick={() => void carregar("cache")}
                className="mt-4 cursor-pointer text-sm font-semibold text-copper hover:text-copperdark"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {!loading && !error && (
            <ReabastecimentoTable
              itens={itensFiltrados}
              vazio={
                temFiltro && itens.length > 0 ? (
                  <div className="rounded-md border border-wheat bg-cream py-12 text-center">
                    <p className="text-base font-semibold text-ink">
                      Nenhum produto bate com esses filtros.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setFiltros({
                          ...FILTROS_VAZIOS,
                          unidades: new Set<string>(),
                        })
                      }
                      className="mt-3 cursor-pointer text-sm font-semibold text-copper hover:text-copperdark"
                    >
                      Limpar filtros
                    </button>
                  </div>
                ) : undefined
              }
            />
          )}

          {!loading && !error && itens.length === 0 && !running && (
            <div className="mt-8 rounded-md border border-wheat bg-cream px-6 py-6 text-sm leading-relaxed text-inkdim">
              <p className="label mb-2">Como ativar o monitoramento</p>
              <p>
                Para um produto entrar nessa lista, ele precisa estar ativo e
                marcado para visualização no Nutify PDV (
                <code className="font-mono text-ink">PRO_SIT=A</code>,{" "}
                <code className="font-mono text-ink">PRO_IDB=S</code>) com
                estoque mínimo preenchido (
                <code className="font-mono text-ink">PRO_EMN</code> maior que
                zero, na unidade de venda do produto). A próxima verificação
                automática já incluirá o produto.
              </p>
            </div>
          )}
        </section>
      </main>

      <Footer />

      {mostrarPedidoCompra && (
        <PedidoCompraModal onClose={() => setMostrarPedidoCompra(false)} />
      )}
    </div>
  );
}
