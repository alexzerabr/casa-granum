"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NovaRemessaModal } from "@/components/NovaRemessaModal";
import { RemessaCard } from "@/components/RemessaCard";
import {
  cancelarRemessa,
  concluirManual,
  listarRemessas,
  type Remessa,
} from "@/lib/remessas";

type Aba = "ativas" | "historico";

const POLL_MS_NORMAL = 30_000;
const POLL_MS_ALERTA = 5_000;

export default function RemessasPage() {
  const [aba, setAba] = useState<Aba>("ativas");
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const data = await listarRemessas();
      setRemessas(data);
    } catch (err) {
      console.error("falha ao listar remessas", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const temAlerta = useMemo(
    () => remessas.some((r) => r.estado === "alerta_preco"),
    [remessas],
  );

  useEffect(() => {
    const intervalo = temAlerta ? POLL_MS_ALERTA : POLL_MS_NORMAL;
    const id = setInterval(() => void recarregar(), intervalo);
    return () => clearInterval(id);
  }, [recarregar, temAlerta]);

  const ativas = remessas.filter(
    (r) => r.estado === "ativa" || r.estado === "alerta_preco",
  );
  const historico = remessas.filter(
    (r) => r.estado === "concluida" || r.estado === "cancelada",
  );

  const visiveis = aba === "ativas" ? ativas : historico;

  const handleCancelar = async (id: number) => {
    const motivo = window.prompt("Motivo do cancelamento (opcional):") ?? undefined;
    try {
      await cancelarRemessa(id, motivo || undefined);
      await recarregar();
    } catch (err) {
      alert(`Falha ao cancelar: ${err instanceof Error ? err.message : "erro"}`);
    }
  };

  const handleConcluir = async (id: number) => {
    if (!confirm("Confirma que o preço foi atualizado no Nutify?")) return;
    try {
      await concluirManual(id);
      await recarregar();
    } catch (err) {
      alert(`Falha ao concluir: ${err instanceof Error ? err.message : "erro"}`);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pb-16 pt-10 lg:px-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-wheat pb-4">
            <div>
              <p className="label mb-1">Aba 3 · Remessas</p>
              <h1 className="text-3xl font-bold tracking-tight text-ink lg:text-4xl">
                Controle de remessa
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-inkdim">
                Quando chega mercadoria com custo diferente, registra o snapshot do
                estoque antigo e avisa quando estiver na hora de revisar o preço.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setModalAberto(true)}
            >
              + Nova remessa
            </button>
          </div>

          <div className="mb-5 flex items-center gap-3">
            <div className="segment" role="group" aria-label="Aba">
              <button
                type="button"
                className={aba === "ativas" ? "is-active" : ""}
                onClick={() => setAba("ativas")}
              >
                Ativas {ativas.length > 0 && `(${ativas.length})`}
              </button>
              <button
                type="button"
                className={aba === "historico" ? "is-active" : ""}
                onClick={() => setAba("historico")}
              >
                Histórico
              </button>
            </div>
          </div>

          {loading ? (
            <p className="py-12 text-center text-sm text-inkdim">
              Carregando<span className="dots text-copper" />
            </p>
          ) : visiveis.length === 0 ? (
            <div className="rounded-md border border-wheat bg-cream px-6 py-12 text-center">
              <p className="text-base font-semibold text-ink">
                {aba === "ativas"
                  ? "Nenhuma remessa em controle."
                  : "Sem histórico ainda."}
              </p>
              {aba === "ativas" && (
                <p className="mt-1.5 text-sm text-inkdim">
                  Clique em <strong>Nova remessa</strong> ao receber mercadoria
                  com custo diferente.
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-4">
              {visiveis.map((r) => (
                <RemessaCard
                  key={r.id}
                  remessa={r}
                  onCancelar={handleCancelar}
                  onConcluir={handleConcluir}
                />
              ))}
            </ul>
          )}
        </section>
      </main>

      <Footer />

      {modalAberto && (
        <NovaRemessaModal
          onClose={() => setModalAberto(false)}
          onCriado={async () => {
            setModalAberto(false);
            await recarregar();
          }}
        />
      )}
    </div>
  );
}
