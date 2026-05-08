export type Nivel = "critico" | "alerta";

export interface ItemReabastecimento {
  pro_cod: number;
  pro_des: string;
  grupo: string | null;
  /** Unidade de COMPRA (PRO_UNDE) — KG / UN / CX */
  unidade: string;
  /** Unidade de VENDA (PRO_UND) — KG / UN / CAPS */
  unidade_venda: string;
  estoque_min_kg: number;
  estoque_atual_kg: number | null;
  qtd_reposicao: number | null;
  alerta_em: string | null;
  ultima_verif: string | null;
  nivel: Nivel;
}

const SUFIXOS: Record<string, string> = {
  KG: "kg",
  UN: "un",
  CAPS: "caps",
  CX: "cx",
};

const COM_DECIMAIS = new Set(["KG"]);

export function formatarQuantidade(
  valor: number | null,
  unidade: string,
): string {
  if (valor === null) return "—";
  const und = (unidade || "KG").toUpperCase();
  const sufixo = SUFIXOS[und] ?? und.toLowerCase();
  if (COM_DECIMAIS.has(und)) {
    return `${valor.toFixed(3).replace(".", ",")} ${sufixo}`;
  }
  return `${Math.round(valor)} ${sufixo}`;
}

export interface SumarioVerificacao {
  verificados: number;
  novos_alertas: number;
  silenciados?: number;
  repostos: number;
  em_alerta: number;
  executado_em: string;
}

export interface FiltrosReabastecimento {
  texto: string;
  unidades: Set<string>;       // match em unidade OU unidade_venda
  dataDe: string | null;       // YYYY-MM-DD (compara com alerta_em)
  dataAte: string | null;      // YYYY-MM-DD (compara com alerta_em)
  nivel: "todos" | "critico" | "alerta";
}

export const FILTROS_VAZIOS: FiltrosReabastecimento = {
  texto: "",
  unidades: new Set<string>(),
  dataDe: null,
  dataAte: null,
  nivel: "todos",
};

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function filtrar(
  itens: ItemReabastecimento[],
  f: FiltrosReabastecimento,
): ItemReabastecimento[] {
  const termo = normalizar(f.texto);
  const dataDe = f.dataDe ? new Date(`${f.dataDe}T00:00:00`).getTime() : null;
  const dataAte = f.dataAte
    ? new Date(`${f.dataAte}T23:59:59.999`).getTime()
    : null;

  return itens.filter((item) => {
    if (termo) {
      const alvo = normalizar(`${item.pro_des} ${item.grupo ?? ""}`);
      if (!alvo.includes(termo)) return false;
    }
    if (f.unidades.size > 0) {
      const u1 = (item.unidade || "").toUpperCase();
      const u2 = (item.unidade_venda || "").toUpperCase();
      if (!f.unidades.has(u1) && !f.unidades.has(u2)) return false;
    }
    if (f.nivel !== "todos" && item.nivel !== f.nivel) return false;
    if ((dataDe || dataAte) && item.alerta_em) {
      const t = new Date(item.alerta_em).getTime();
      if (dataDe && t < dataDe) return false;
      if (dataAte && t > dataAte) return false;
    } else if (dataDe || dataAte) {
      return false;
    }
    return true;
  });
}

export function unidadesDisponiveis(
  itens: ItemReabastecimento[],
): string[] {
  const set = new Set<string>();
  for (const i of itens) {
    if (i.unidade) set.add(i.unidade.toUpperCase());
    if (i.unidade_venda) set.add(i.unidade_venda.toUpperCase());
  }
  return Array.from(set).sort();
}

export function filtrosAtivos(f: FiltrosReabastecimento): boolean {
  return (
    f.texto.trim().length > 0 ||
    f.unidades.size > 0 ||
    f.dataDe !== null ||
    f.dataAte !== null ||
    f.nivel !== "todos"
  );
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Falha (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

export async function listarReabastecimento(): Promise<ItemReabastecimento[]> {
  const res = await fetch(`${BACKEND_URL}/reabastecimento`, {
    cache: "no-store",
  });
  return handle<ItemReabastecimento[]>(res);
}

export async function executarVerificacao(): Promise<SumarioVerificacao> {
  const res = await fetch(`${BACKEND_URL}/reabastecimento/run`, {
    method: "POST",
  });
  return handle<SumarioVerificacao>(res);
}
