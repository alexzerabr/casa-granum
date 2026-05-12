export type StatusPedido = "aberto" | "atendido" | "cancelado";

export interface ClienteEntrada {
  nome: string;
  telefone?: string | null;
  cliente_externo_id?: number | null;
}

export interface Cliente extends ClienteEntrada {
  id: number;
}

export interface Pedido {
  id: number;
  produto_nome: string;
  pro_cod: number | null;
  unidade: string | null;
  observacao: string | null;
  status: StatusPedido;
  criado_em: string;
  atualizado_em: string;
  encerrado_em: string | null;
  clientes: Cliente[];
}

export interface NovoPedido {
  produto_nome: string;
  pro_cod?: number | null;
  unidade?: string | null;
  observacao?: string;
  clientes: ClienteEntrada[];
}

export interface PatchPedido {
  produto_nome?: string;
  pro_cod?: number | null;
  unidade?: string | null;
  observacao?: string | null;
  status?: StatusPedido;
  clientes?: ClienteEntrada[];
}

export interface ClienteExterno {
  id: number;
  nome: string;
  apelido: string | null;
  telefone: string | null;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Falha (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function listarPedidos(opts?: {
  status?: StatusPedido;
  search?: string;
  desde?: string;
}): Promise<Pedido[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.search) params.set("search", opts.search);
  if (opts?.desde) params.set("desde", opts.desde);
  const qs = params.toString() ? `?${params}` : "";
  return handle(await fetch(`${BACKEND_URL}/pedidos${qs}`));
}

export async function criarPedido(p: NovoPedido): Promise<Pedido> {
  return handle(
    await fetch(`${BACKEND_URL}/pedidos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    }),
  );
}

export async function atualizarPedido(
  id: number,
  patch: PatchPedido,
): Promise<Pedido> {
  return handle(
    await fetch(`${BACKEND_URL}/pedidos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function removerPedido(id: number): Promise<void> {
  await handle<void>(
    await fetch(`${BACKEND_URL}/pedidos/${id}`, { method: "DELETE" }),
  );
}

export async function buscarClientesExternos(
  q: string,
  limite = 15,
): Promise<ClienteExterno[]> {
  const params = new URLSearchParams({ q, limite: String(limite) });
  return handle(await fetch(`${BACKEND_URL}/clientes/buscar?${params}`));
}

export function formatarTelefone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return raw;
}
