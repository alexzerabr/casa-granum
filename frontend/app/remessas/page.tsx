"use client";

import { Check, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NovaRemessaModal } from "@/components/NovaRemessaModal";
import { RemessaCard } from "@/components/RemessaCard";
import {
  cancelarRemessa,
  concluirManual,
  limparHistorico,
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
  const [confirmandoLimpar, setConfirmandoLimpar] = useState(false);
  const [limpando, setLimpando] = useState(false);

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

  const handleLimparHistorico = async () => {
    setLimpando(true);
    try {
      await limparHistorico();
      setConfirmandoLimpar(false);
      await recarregar();
    } catch (err) {
      alert(`Falha ao limpar: ${err instanceof Error ? err.message : "erro"}`);
    } finally {
      setLimpando(false);
    }
  };

  useEffect(() => {
    if (aba !== "historico") setConfirmandoLimpar(false);
  }, [aba]);

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

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
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
                Histórico {historico.length > 0 && `(${historico.length})`}
              </button>
            </div>

            {aba === "historico" && historico.length > 0 && (
              confirmandoLimpar ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-inkdim">
                    Apagar {historico.length} {historico.length === 1 ? "registro" : "registros"}?
                  </span>
                  <button
                    type="button"
                    onClick={handleLimparHistorico}
                    disabled={limpando}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-danger bg-cream px-2.5 text-xs font-semibold text-danger hover:bg-danger hover:text-cream disabled:opacity-55"
                    title="Confirmar limpeza"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoLimpar(false)}
                    disabled={limpando}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-wheat px-2 text-xs text-inkmuted hover:border-ink hover:text-ink disabled:opacity-55"
                    title="Cancelar"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmandoLimpar(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-wheat bg-cream px-2.5 text-xs font-semibold text-inkmuted hover:border-danger hover:text-danger"
                  title="Apagar todo o histórico"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Limpar logs
                </button>
              )
            )}
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
