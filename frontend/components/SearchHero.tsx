"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SearchField } from "@/components/SearchField";
import { fetchCatalogoInfo } from "@/lib/api";

const sugestoes = [
  "Emagrecer",
  "Energia",
  "Ansiedade",
  "Imunidade",
  "Sono",
  "Memória",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (objetivo: string) => void;
  isLoading: boolean;
  hasResults: boolean;
}

export function SearchHero({
  value,
  onChange,
  onSubmit,
  isLoading,
  hasResults,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [totalProdutos, setTotalProdutos] = useState<number | null>(null);

  useEffect(() => {
    fetchCatalogoInfo()
      .then((info) => setTotalProdutos(info.total_produtos))
      .catch(() => setTotalProdutos(null));
  }, []);

  const submit = () => {
    if (!value.trim() || isLoading) return;
    onSubmit(value.trim());
  };

  const handleTag = (tag: string) => {
    onChange(tag);
    onSubmit(tag);
  };

  return (
    <section
      className={`mx-auto max-w-3xl px-6 transition-all duration-500 lg:px-10 ${
        hasResults ? "pt-10 pb-6" : "pt-16 pb-12 lg:pt-20"
      }`}
    >
      <p className="label mb-2">Aba 1 · Consulta por Objetivo</p>
      <h1
        className={`font-bold tracking-tight text-ink transition-all duration-500 ${
          hasResults ? "text-3xl lg:text-4xl" : "text-4xl lg:text-5xl"
        }`}
      >
        O que você busca <span className="text-copper">hoje?</span>
      </h1>

      {!hasResults && (
        <p className="mt-3 max-w-xl text-base leading-relaxed text-inkdim">
          Diga seu objetivo em uma frase. A Casa Granum cruza com{" "}
          <span className="font-semibold text-ink">
            {totalProdutos !== null ? `${totalProdutos} produtos` : "o catálogo"}
          </span>{" "}
          com propriedades cadastradas e recomenda o que faz sentido pra você.
        </p>
      )}

      <div className="mt-6 flex items-center gap-2">
        <SearchField
          ref={inputRef}
          value={value}
          onChange={onChange}
          onSubmit={submit}
          placeholder="Ex: dormir melhor, mais energia, foco…"
          autoFocus
          disabled={isLoading}
          ariaLabel="Buscar por objetivo"
          className="flex-1"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || isLoading}
          className="btn btn-primary"
        >
          {isLoading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream/40 border-t-cream" />
              Consultando
            </>
          ) : (
            <>
              Buscar
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </>
          )}
        </button>
      </div>

      {!hasResults && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="label mr-1">ou tente</span>
          {sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleTag(s)}
              disabled={isLoading}
              className="cursor-pointer rounded-full border border-wheat bg-cream px-3 py-1.5 text-sm font-medium text-inkdim transition-colors hover:border-copper hover:text-copper disabled:cursor-not-allowed disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
