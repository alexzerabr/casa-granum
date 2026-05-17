import { apiFetch } from "./http";

export type EstadoRemessa = "ativa" | "alerta_preco" | "concluida" | "cancelada";

export interface ProdutoBusca {
  pro_cod: number;
  pro_des: string;
  unidade: string;
}

export interface Snapshot {
  pro_cod: number;
  pro_des: string;
  unidade: string;
  estoque_atual: number;
  estoque_min: number;
  custo_atual: number;
  preco_atual: number;
  markup_pct: number;
  tem_pauta: boolean;
  tem_remessa_ativa: boolean;
}

export interface Remessa {
  id: number;
  pro_cod: number;
  pro_des: string;
  unidade: string;
  estoque_antigo: number;
  custo_antigo: number;
  preco_antigo: number;
  markup_pct: number;
  custo_novo: number;
  preco_sugerido: number;
  alerta_threshold_pct: number;
  estado: EstadoRemessa;
  iniciada_em: string;
  alertada_em: string | null;
  notificada_em: string | null;
  concluida_em: string | null;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
  preco_final: number | null;
  vendido: number;
  consumo_pct: number;
}

export function buscarProdutos(q: string): Promise<ProdutoBusca[]> {
  if (q.trim().length < 2) return Promise.resolve([]);
  const p = new URLSearchParams({ q: q.trim(), limite: "15" });
  return apiFetch<ProdutoBusca[]>(`/remessas/produtos?${p}`);
}

export function snapshotProduto(proCod: number): Promise<Snapshot> {
  return apiFetch<Snapshot>(`/remessas/produtos/${proCod}/snapshot`);
}

export function previewPreco(
  novoCusto: number,
  markupPct: number,
  custoAntigo?: number,
): Promise<{ preco_sugerido: number }> {
  return apiFetch("/remessas/preview-preco", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      novo_custo: novoCusto,
      markup_pct: markupPct,
      ...(custoAntigo !== undefined ? { custo_antigo: custoAntigo } : {}),
    }),
  });
}

export function listarRemessas(estado?: EstadoRemessa): Promise<Remessa[]> {
  const qs = estado ? `?estado=${estado}` : "";
  return apiFetch<Remessa[]>(`/remessas${qs}`);
}

export function criarRemessa(proCod: number, novoCusto: number): Promise<Remessa> {
  return apiFetch<Remessa>("/remessas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pro_cod: proCod, novo_custo: novoCusto }),
  });
}

export function cancelarRemessa(id: number, motivo?: string): Promise<Remessa> {
  return apiFetch<Remessa>(`/remessas/${id}/cancelar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo: motivo ?? null }),
  });
}

export function concluirManual(id: number): Promise<Remessa> {
  return apiFetch<Remessa>(`/remessas/${id}/concluir-manual`, {
    method: "POST",
  });
}

export function limparHistorico(): Promise<{ removidas: number }> {
  return apiFetch("/remessas/historico", { method: "DELETE" });
}

export function removerRemessa(id: number): Promise<{ removida: boolean }> {
  return apiFetch(`/remessas/${id}`, { method: "DELETE" });
}

const SUFIXOS: Record<string, string> = {
  KG: "kg",
  UN: "un",
  CAPS: "caps",
  CX: "cx",
};
const COM_DECIMAIS = new Set(["KG"]);

export function formatarQuantidade(valor: number, unidade: string): string {
  const und = (unidade || "KG").toUpperCase();
  const sufixo = SUFIXOS[und] ?? und.toLowerCase();
  if (COM_DECIMAIS.has(und)) {
    return `${valor.toFixed(3).replace(".", ",")} ${sufixo}`;
  }
  return `${Math.round(valor)} ${sufixo}`;
}

export function formatarReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
