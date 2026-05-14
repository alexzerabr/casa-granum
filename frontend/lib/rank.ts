import { apiFetch, apiUrl } from "./http";

export interface ItemRank {
  pro_cod: number;
  pro_des: string;
  pro_und: string;
  grupo: string | null;
  total_qtd: number;
  total_valor: number;
  n_vendas: number;
  ultima_venda: string | null;
  delta_valor_pct: number | null;
}

export interface RankResposta {
  itens: ItemRank[];
  total: number;
}

export interface PontoSerie {
  dia: string;
  qtd: number;
  valor: number;
  n_vendas: number;
}

export interface GrupoOpcao {
  nome: string;
  n_produtos: number;
}

export type Ordem = "qtd" | "valor" | "movimentos";
export type Direcao = "asc" | "desc";
export type Granularidade = "dia" | "semana" | "mes";

export interface FiltroRank {
  desde?: string;
  ate?: string;
  grupo?: string;
  q?: string;
  limite?: number;
  ordem?: Ordem;
  dir?: Direcao;
}

function montarQS(opts: FiltroRank): string {
  const p = new URLSearchParams();
  if (opts.desde) p.set("desde", opts.desde);
  if (opts.ate) p.set("ate", opts.ate);
  if (opts.grupo) p.set("grupo", opts.grupo);
  if (opts.q) p.set("q", opts.q);
  if (opts.limite) p.set("limite", String(opts.limite));
  if (opts.ordem) p.set("ordem", opts.ordem);
  if (opts.dir) p.set("dir", opts.dir);
  return p.toString();
}

export function topRank(opts: FiltroRank = {}): Promise<RankResposta> {
  const qs = montarQS(opts);
  return apiFetch<RankResposta>(`/rank${qs ? `?${qs}` : ""}`);
}

export function listarGrupos(
  desde?: string,
  ate?: string,
): Promise<GrupoOpcao[]> {
  const p = new URLSearchParams();
  if (desde) p.set("desde", desde);
  if (ate) p.set("ate", ate);
  const qs = p.toString();
  return apiFetch<GrupoOpcao[]>(`/rank/grupos${qs ? `?${qs}` : ""}`);
}

export function serieRank(
  proCod: number,
  desde?: string,
  ate?: string,
  granularidade?: Granularidade,
): Promise<PontoSerie[]> {
  const p = new URLSearchParams();
  if (desde) p.set("desde", desde);
  if (ate) p.set("ate", ate);
  if (granularidade) p.set("granularidade", granularidade);
  const qs = p.toString();
  return apiFetch<PontoSerie[]>(
    `/rank/${proCod}/serie${qs ? `?${qs}` : ""}`,
  );
}

export function urlCsv(opts: FiltroRank): string {
  const qs = montarQS({ ...opts, limite: opts.limite ?? 200 });
  return apiUrl(`/rank/csv${qs ? `?${qs}` : ""}`);
}

export function isoDaysAgo(days: number): string {
  // Usa fuso local — "últimos 7 dias" no contexto do usuário, não em UTC.
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDecimal(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
