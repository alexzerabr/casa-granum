"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  Trophy,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RankChart } from "@/components/RankChart";
import { SearchField } from "@/components/SearchField";
import {
  type Direcao,
  type Granularidade,
  type GrupoOpcao,
  type ItemRank,
  type Ordem,
  type PontoSerie,
  formatDecimal,
  formatMoeda,
  isoDaysAgo,
  listarGrupos,
  serieRank,
  topRank,
  urlCsv,
} from "@/lib/rank";

type Periodo = "7" | "30" | "90" | "365";

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "7", label: "7 dias" },
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
  { key: "365", label: "12 meses" },
];

const ORDENS: { key: Ordem; label: string }[] = [
  { key: "qtd", label: "Quantidade" },
  { key: "valor", label: "Valor" },
  { key: "movimentos", label: "Nº vendas" },
];

const LIMITE_PADRAO = 50;

function granularidadeFor(periodo: Periodo): Granularidade {
  if (periodo === "365") return "mes";
  if (periodo === "90") return "semana";
  return "dia";
}

export default function RankPage() {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [grupo, setGrupo] = useState<string>("");
  const [grupos, setGrupos] = useState<GrupoOpcao[]>([]);
  const [ordem, setOrdem] = useState<Ordem>("valor");
  const [direcao, setDirecao] = useState<Direcao>("desc");
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(LIMITE_PADRAO);

  const [itens, setItens] = useState<ItemRank[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [aberto, setAberto] = useState<number | null>(null);
  const [serie, setSerie] = useState<PontoSerie[]>([]);
  const [loadingSerie, setLoadingSerie] = useState(false);

  const desde = useMemo(() => isoDaysAgo(parseInt(periodo, 10)), [periodo]);
  const granularidade = useMemo(() => granularidadeFor(periodo), [periodo]);

  // Sem filtro de grupo, "Quantidade" mistura unidades — força "Valor".
  const ordemEfetiva: Ordem = !grupo && ordem === "qtd" ? "valor" : ordem;

  const filtroQuery = useMemo(
    () => ({
      desde,
      grupo: grupo || undefined,
      q: busca.trim() || undefined,
      ordem: ordemEfetiva,
      dir: direcao,
      limite,
    }),
    [desde, grupo, busca, ordemEfetiva, direcao, limite],
  );

  useEffect(() => {
    listarGrupos(desde).then(setGrupos).catch(() => setGrupos([]));
  }, [desde]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    setAberto(null);
    try {
      const data = await topRank(filtroQuery);
      setItens(data.itens);
      setTotal(data.total);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar rank");
    } finally {
      setLoading(false);
    }
  }, [filtroQuery]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const expandir = async (item: ItemRank) => {
    if (aberto === item.pro_cod) {
      setAberto(null);
      return;
    }
    setAberto(item.pro_cod);
    setLoadingSerie(true);
    setSerie([]);
    try {
      setSerie(await serieRank(item.pro_cod, desde, undefined, granularidade));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao buscar série");
    } finally {
      setLoadingSerie(false);
    }
  };

  const metricaChart: "qtd" | "valor" =
    ordemEfetiva === "qtd" ? "qtd" : "valor";

  const stats = (pontos: PontoSerie[]) => {
    if (pontos.length < 3) return null;
    const valores = pontos.map((p) =>
      metricaChart === "qtd" ? p.qtd : p.valor,
    );
    const soma = valores.reduce((a, b) => a + b, 0);
    const mediaDiaVendido = soma / pontos.length;
    let pico = pontos[0];
    for (const p of pontos) {
      const v = metricaChart === "qtd" ? p.qtd : p.valor;
      const vp = metricaChart === "qtd" ? pico.qtd : pico.valor;
      if (v > vp) pico = p;
    }
    return { mediaDiaVendido, pico, diasComVenda: pontos.length };
  };

  const formatarDataHora = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 lg:px-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-ink lg:text-4xl">
                Mais vendidos
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-inkdim">
                Ranking baseado no histórico de saídas do Nutify. Clique num
                produto para ver o gráfico do período.
              </p>
            </div>
            <a
              href={urlCsv(filtroQuery)}
              className="inline-flex items-center gap-2 rounded-md border border-wheat px-3 py-2 text-xs font-semibold text-ink hover:border-copper hover:text-copper"
              download
              title="Exportar para CSV"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
              CSV
            </a>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-wheat pb-4">
            <div className="segment" role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriodo(p.key)}
                  className={periodo === p.key ? "is-active" : ""}
                  aria-pressed={periodo === p.key}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <select
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              className="text-input max-w-[180px] py-1.5 text-xs font-semibold"
              aria-label="Grupo de produto"
            >
              <option value="">Todos os grupos</option>
              {grupos.map((g) => (
                <option key={g.nome} value={g.nome}>
                  {g.nome} ({g.n_produtos})
                </option>
              ))}
            </select>

            <div className="segment" role="group" aria-label="Ordenar por">
              {ORDENS.filter((o) => o.key !== "qtd" || grupo).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setOrdem(o.key)}
                  className={ordemEfetiva === o.key ? "is-active" : ""}
                  aria-pressed={ordemEfetiva === o.key}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setDirecao((d) => (d === "desc" ? "asc" : "desc"))
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-wheat px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-copper hover:text-copper"
              title={
                direcao === "desc"
                  ? "Maior para menor (clique pra inverter)"
                  : "Menor para maior (clique pra inverter)"
              }
              aria-label={`Direção: ${direcao}`}
            >
              {direcao === "desc" ? (
                <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.5} />
              ) : (
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
              )}
              <span className="tabular">
                {direcao === "desc" ? "Maior" : "Menor"}
              </span>
            </button>

            <SearchField
              value={busca}
              onChange={setBusca}
              placeholder="Filtrar por nome…"
              ariaLabel="Buscar produto"
              className="w-full sm:ml-auto sm:min-w-[220px] sm:max-w-sm sm:flex-1"
            />
          </div>

          {loading && (
            <p className="py-12 text-center text-sm text-inkdim">
              Carregando<span className="dots text-copper" />
            </p>
          )}

          {!loading && erro && (
            <div className="rounded-md border border-danger bg-dangersoft px-6 py-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-danger">
                Falha
              </p>
              <p className="mt-2 text-base text-ink">{erro}</p>
              <button
                type="button"
                onClick={() => void carregar()}
                className="mt-4 text-sm font-semibold text-copper hover:text-copperdark"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {!loading && !erro && itens.length === 0 && (
            <p className="py-12 text-center text-sm text-inkdim">
              Nenhuma venda no período/filtro selecionado.
            </p>
          )}

          {!loading && !erro && itens.length > 0 && (
            <>
              <p className="mb-3 text-xs text-inkmuted tabular">
                {itens.length} de {total} produtos
                {total > itens.length && " · top mostrado abaixo"}
              </p>
              <ol className="space-y-2">
                {itens.map((it, idx) => {
                  const expandido = aberto === it.pro_cod;
                  const s = expandido ? stats(serie) : null;
                  const delta = it.delta_valor_pct;
                  return (
                    <li
                      key={it.pro_cod}
                      className="overflow-hidden rounded-md border border-wheat bg-cream"
                    >
                      <button
                        type="button"
                        onClick={() => void expandir(it)}
                        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-4 py-3 text-left hover:bg-wheat/20"
                        aria-expanded={expandido}
                      >
                        <span className="tabular w-8 text-right text-lg font-bold text-copper">
                          {idx + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">
                            {it.pro_des}
                          </span>
                          <span className="block text-xs text-inkdim tabular">
                            {it.grupo ? `${it.grupo} · ` : ""}
                            {it.pro_und} · última{" "}
                            {formatarDataHora(it.ultima_venda)}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-sm font-bold text-ink tabular">
                            {ordemEfetiva === "qtd"
                              ? `${formatDecimal(it.total_qtd, 3)} ${it.pro_und.toLowerCase()}`
                              : ordemEfetiva === "valor"
                                ? formatMoeda(it.total_valor)
                                : `${it.n_vendas} ${it.n_vendas === 1 ? "venda" : "vendas"}`}
                          </span>
                          <span className="block text-[11px] text-inkmuted tabular">
                            {ordemEfetiva === "valor"
                              ? `${it.n_vendas} vendas · ${formatDecimal(it.total_qtd, 3)} ${it.pro_und.toLowerCase()}`
                              : ordemEfetiva === "qtd"
                                ? `${it.n_vendas} vendas · ${formatMoeda(it.total_valor)}`
                                : `${formatMoeda(it.total_valor)} · ${formatDecimal(it.total_qtd, 3)} ${it.pro_und.toLowerCase()}`}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          {delta !== null && (
                            <span
                              className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular ${
                                delta >= 0 ? "text-good" : "text-danger"
                              }`}
                              title="Variação vs período anterior de mesmo tamanho"
                            >
                              {delta >= 0 ? (
                                <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
                              ) : (
                                <TrendingDown className="h-3 w-3" strokeWidth={2.5} />
                              )}
                              {delta >= 0 ? "+" : ""}
                              {delta.toFixed(0)}%
                            </span>
                          )}
                          <ChevronRight
                            className={`h-4 w-4 text-inkmuted transition-transform ${
                              expandido ? "rotate-90" : ""
                            }`}
                          />
                        </span>
                      </button>

                      {expandido && (
                        <div className="border-t border-wheat bg-creamdeep/40 px-4 py-4">
                          {loadingSerie ? (
                            <p className="py-6 text-center text-sm text-inkdim">
                              Carregando série<span className="dots text-copper" />
                            </p>
                          ) : (
                            <>
                              {s && (
                                <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-inkdim">
                                  <span>
                                    <Trophy className="mr-1 inline h-3 w-3 text-copper" />
                                    Pico:{" "}
                                    <span className="font-semibold text-ink tabular">
                                      {metricaChart === "qtd"
                                        ? `${formatDecimal(s.pico.qtd, 3)} ${it.pro_und.toLowerCase()}`
                                        : formatMoeda(s.pico.valor)}{" "}
                                      em {s.pico.dia}
                                    </span>
                                  </span>
                                  <span>
                                    Média por {granularidade === "dia" ? "dia" : granularidade === "semana" ? "semana" : "mês"} vendido:{" "}
                                    <span className="font-semibold text-ink tabular">
                                      {metricaChart === "qtd"
                                        ? `${formatDecimal(s.mediaDiaVendido, 3)} ${it.pro_und.toLowerCase()}`
                                        : formatMoeda(s.mediaDiaVendido)}
                                    </span>
                                  </span>
                                  <span>
                                    {s.diasComVenda}{" "}
                                    {granularidade === "dia"
                                      ? s.diasComVenda === 1
                                        ? "dia"
                                        : "dias"
                                      : granularidade === "semana"
                                        ? s.diasComVenda === 1
                                          ? "semana"
                                          : "semanas"
                                        : s.diasComVenda === 1
                                          ? "mês"
                                          : "meses"}{" "}
                                    com venda
                                  </span>
                                </div>
                              )}
                              <RankChart
                                pontos={serie}
                                metrica={metricaChart}
                                unidade={it.pro_und}
                                granularidade={granularidade}
                              />
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              {total > itens.length && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setLimite((n) => n + LIMITE_PADRAO)}
                    className="rounded-md border border-wheat px-4 py-2 text-xs font-semibold text-ink hover:border-copper hover:text-copper"
                  >
                    Ver mais {Math.min(LIMITE_PADRAO, total - itens.length)}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
