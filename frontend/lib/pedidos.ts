export type StatusPedido = "aberto" | "atendido" | "cancelado";

export interface Pedido {
  id: number;
  produto_nome: string;
  pro_cod: number | null;
  cliente_nome: string | null;
  observacao: string | null;
  status: StatusPedido;
  criado_em: string;
  encerrado_em: string | null;
  criado_por: string | null;
}

export interface NovoPedido {
  produto_nome: string;
  cliente_nome?: string;
  observacao?: string;
  criado_por?: string;
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

export async function listarPedidos(opts?: {
  status?: StatusPedido;
  search?: string;
}): Promise<Pedido[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.search) params.set("search", opts.search);
  const qs = params.toString() ? `?${params}` : "";
  const res = await fetch(`${BACKEND_URL}/pedidos${qs}`);
  return handle<Pedido[]>(res);
}

export async function criarPedido(p: NovoPedido): Promise<Pedido> {
  const res = await fetch(`${BACKEND_URL}/pedidos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  return handle<Pedido>(res);
}

export async function atualizarStatus(
  id: number,
  status: StatusPedido,
): Promise<Pedido> {
  const res = await fetch(`${BACKEND_URL}/pedidos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return handle<Pedido>(res);
}
