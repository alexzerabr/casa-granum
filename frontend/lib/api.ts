import { apiFetch } from "./http";

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

export interface CatalogoInfo {
  total_produtos: number;
}

export function fetchCatalogoInfo(): Promise<CatalogoInfo> {
  return apiFetch<CatalogoInfo>("/recomendacoes/info");
}

export function fetchRecomendacoes(
  objetivo: string,
): Promise<RecomendacaoResponse> {
  return apiFetch<RecomendacaoResponse>("/recomendacoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objetivo }),
  });
}
