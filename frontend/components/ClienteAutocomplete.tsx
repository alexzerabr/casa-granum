"use client";

import { useEffect, useRef, useState } from "react";
import {
  buscarClientesExternos,
  formatarTelefone,
  type ClienteExterno,
} from "@/lib/pedidos";

interface Props {
  valor: string;
  onChange: (nome: string) => void;
  onEscolher: (cliente: ClienteExterno) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export function ClienteAutocomplete({
  valor,
  onChange,
  onEscolher,
  placeholder,
  disabled,
  ariaLabel,
}: Props) {
  const [sugestoes, setSugestoes] = useState<ClienteExterno[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ultimaBuscaRef = useRef<string>("");

  useEffect(() => {
    const termo = valor.trim();
    if (termo.length < MIN_CHARS) {
      setSugestoes([]);
      setErro(null);
      return;
    }
    if (termo === ultimaBuscaRef.current) return;
    const handle = setTimeout(async () => {
      ultimaBuscaRef.current = termo;
      setCarregando(true);
      setErro(null);
      try {
        const data = await buscarClientesExternos(termo);
        setSugestoes(data);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro na busca");
        setSugestoes([]);
      } finally {
        setCarregando(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [valor]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const mostrar = aberto && valor.trim().length >= MIN_CHARS;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={valor}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        placeholder={placeholder ?? "Nome do cliente"}
        className="text-input"
        disabled={disabled}
        aria-label={ariaLabel ?? "Cliente"}
        autoComplete="off"
      />
      {mostrar && (sugestoes.length > 0 || carregando || erro) && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-wheat bg-cream shadow-lg"
        >
          {carregando && (
            <li className="px-3 py-2 text-xs text-inkdim">Buscando…</li>
          )}
          {erro && !carregando && (
            <li className="px-3 py-2 text-xs text-danger">{erro}</li>
          )}
          {!carregando &&
            !erro &&
            sugestoes.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onEscolher(c);
                    setAberto(false);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-wheat/40"
                >
                  <span className="font-semibold text-ink">{c.nome}</span>
                  {c.telefone && (
                    <span className="text-xs text-inkdim tabular">
                      {formatarTelefone(c.telefone)}
                    </span>
                  )}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
