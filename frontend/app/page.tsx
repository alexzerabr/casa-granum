"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { SearchHero } from "@/components/SearchHero";
import { ResultsList } from "@/components/ResultsList";
import { Footer } from "@/components/Footer";
import { LoadingState, ErrorState } from "@/components/StateMessages";
import { fetchRecomendacoes, type RecomendacaoResponse } from "@/lib/api";

export default function HomePage() {
  const [objetivo, setObjetivo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RecomendacaoResponse | null>(null);

  const runSearch = async (q: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchRecomendacoes(q);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  const dismissError = () => {
    setError(null);
  };

  const hasResults = results !== null && !isLoading;

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <SearchHero
          value={objetivo}
          onChange={setObjetivo}
          onSubmit={runSearch}
          isLoading={isLoading}
          hasResults={hasResults || isLoading || !!error}
        />

        {isLoading && <LoadingState />}

        {!isLoading && error && (
          <ErrorState message={error} onDismiss={dismissError} />
        )}

        {!isLoading && !error && results && (
          <ResultsList
            produtos={results.produtos}
            totalAnalisados={results.total_produtos_analisados}
            cached={results.cached}
            objetivo={results.objetivo}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
