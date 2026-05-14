const PREFIX = "/api";

export function apiUrl(path: string): string {
  return `${PREFIX}${path}`;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Falha (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
