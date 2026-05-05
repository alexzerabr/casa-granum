"use client";

import { CalendarRange, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SearchField } from "@/components/SearchField";
import {
  FILTROS_VAZIOS,
  filtrosAtivos,
  type FiltrosReabastecimento,
} from "@/lib/reabastecimento";

interface Props {
  filtros: FiltrosReabastecimento;
  onChange: (f: FiltrosReabastecimento) => void;
  unidades: string[];
  totalCarregados: number;
  totalFiltrados: number;
}

const NIVEIS: { value: FiltrosReabastecimento["nivel"]; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "critico", label: "Críticos" },
  { value: "alerta", label: "Alerta" },
];

export function ReabastecimentoFiltros({
  filtros,
  onChange,
  unidades,
  totalCarregados,
  totalFiltrados,
}: Props) {
  const [periodoAberto, setPeriodoAberto] = useState(false);
  const periodoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!periodoAberto) return;
    const onClick = (e: MouseEvent) => {
      if (
        periodoRef.current &&
        !periodoRef.current.contains(e.target as Node)
      ) {
        setPeriodoAberto(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [periodoAberto]);

  const set = (patch: Partial<FiltrosReabastecimento>) =>
    onChange({ ...filtros, ...patch });

  const toggleUnidade = (u: string) => {
    const next = new Set(filtros.unidades);
    if (next.has(u)) next.delete(u);
    else next.add(u);
    set({ unidades: next });
  };

  const ativos = filtrosAtivos(filtros);
  const temPeriodo = filtros.dataDe || filtros.dataAte;
  const labelPeriodo = temPeriodo
    ? `${filtros.dataDe ?? "..."} → ${filtros.dataAte ?? "..."}`
    : "Período";

  return (
    <div className="space-y-3 border-b border-wheat pb-4">
      {/* Linha 1: busca + nível */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          value={filtros.texto}
          onChange={(t) => set({ texto: t })}
          placeholder="Buscar produto ou grupo…"
          ariaLabel="Buscar por descrição ou grupo"
          className="min-w-[260px] flex-1"
        />

        <div
          className="segment shrink-0"
          role="group"
          aria-label="Filtrar por nível"
        >
          {NIVEIS.map((n) => (
            <button
              key={n.value}
              type="button"
              onClick={() => set({ nivel: n.value })}
              className={filtros.nivel === n.value ? "is-active" : ""}
              aria-pressed={filtros.nivel === n.value}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* Linha 2: unidades + período + contagem */}
      <div className="flex flex-wrap items-center gap-3">
        {unidades.length > 0 && (
          <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label="Filtrar por unidade"
          >
            <span className="label mr-1">Unidade</span>
            {unidades.map((u) => {
              const active = filtros.unidades.has(u);
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => toggleUnidade(u)}
                  className={`flex h-8 cursor-pointer items-center rounded-md border px-2.5 text-xs font-semibold tracking-wide transition-colors ${
                    active
                      ? "border-copper bg-copper text-cream"
                      : "border-wheat bg-cream text-inkdim hover:border-copper hover:text-copper"
                  }`}
                  aria-pressed={active}
                >
                  {u}
                </button>
              );
            })}
          </div>
        )}

        <div className="relative" ref={periodoRef}>
          <button
            type="button"
            onClick={() => setPeriodoAberto((v) => !v)}
            className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
              temPeriodo
                ? "border-copper bg-copper/10 text-copper"
                : "border-wheat bg-cream text-inkdim hover:border-copper hover:text-copper"
            }`}
            aria-expanded={periodoAberto}
            aria-label="Filtrar por período"
          >
            <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} />
            {labelPeriodo}
          </button>

          {periodoAberto && (
            <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-md border border-wheat bg-cream p-4 shadow-lg">
              <div className="space-y-3">
                <label className="block">
                  <span className="label mb-1 block">De</span>
                  <input
                    type="date"
                    value={filtros.dataDe ?? ""}
                    onChange={(e) => set({ dataDe: e.target.value || null })}
                    className="text-input"
                  />
                </label>
                <label className="block">
                  <span className="label mb-1 block">Até</span>
                  <input
                    type="date"
                    value={filtros.dataAte ?? ""}
                    onChange={(e) => set({ dataAte: e.target.value || null })}
                    className="text-input"
                  />
                </label>
                {temPeriodo && (
                  <button
                    type="button"
                    onClick={() => set({ dataDe: null, dataAte: null })}
                    className="cursor-pointer text-sm font-semibold text-copper hover:text-copperdark"
                  >
                    Limpar período
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Contagem + limpar tudo */}
        <div className="ml-auto flex items-center gap-3 text-sm text-inkdim">
          <span className="tabular font-medium">
            {ativos
              ? `${totalFiltrados} de ${totalCarregados}`
              : `${totalCarregados} produtos`}
          </span>
          {ativos && (
            <button
              type="button"
              onClick={() =>
                onChange({ ...FILTROS_VAZIOS, unidades: new Set<string>() })
              }
              className="flex cursor-pointer items-center gap-1 text-copper hover:text-copperdark"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="font-semibold">Limpar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
