export interface Produto {
  pro_cod: number;
  nome: string;
  motivo: string;
}

export interface RecomendacaoResponse {
  objetivo: string;
  cached: boolean;
  total_produtos_analisados: number;
  produtos: Produto[];
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function fetchRecomendacoes(
  objetivo: string,
): Promise<RecomendacaoResponse> {
  const res = await fetch(`${BACKEND_URL}/recomendacoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objetivo }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Falha (${res.status}) ao consultar o catálogo${detail ? `: ${detail}` : ""}`,
    );
  }

  return res.json();
}
