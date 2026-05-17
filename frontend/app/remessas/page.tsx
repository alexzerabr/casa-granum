"use client";

import { Check, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NovaRemessaModal } from "@/components/NovaRemessaModal";
import { RemessaCard } from "@/components/RemessaCard";
import { Toast } from "@/components/Toast";
import {
  cancelarRemessa,
  concluirManual,
  limparHistorico,
  listarRemessas,
  removerRemessa,
  type Remessa,
} from "@/lib/remessas";

type ToastState = { msg: string; variant: "success" | "error" } | null;

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
  const [cancelando, setCancelando] = useState<Remessa | null>(null);
  const [concluindo, setConcluindo] = useState<Remessa | null>(null);
  const [apagando, setApagando] = useState<Remessa | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const erroToast = (e: unknown, prefixo: string) =>
    setToast({
      msg: `${prefixo}: ${e instanceof Error ? e.message : "erro desconhecido"}`,
      variant: "error",
    });

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

  const abrirCancelar = (id: number) => {
    const r = remessas.find((x) => x.id === id);
    if (r) setCancelando(r);
  };

  const abrirConcluir = (id: number) => {
    const r = remessas.find((x) => x.id === id);
    if (r) setConcluindo(r);
  };

  const abrirApagar = (id: number) => {
    const r = remessas.find((x) => x.id === id);
    if (r) setApagando(r);
  };

  const confirmarCancelar = async (motivo?: string) => {
    if (!cancelando) return;
    try {
      await cancelarRemessa(cancelando.id, motivo || undefined);
      setCancelando(null);
      await recarregar();
      setToast({ msg: "Remessa cancelada.", variant: "success" });
    } catch (err) {
      erroToast(err, "Falha ao cancelar");
    }
  };

  const confirmarConcluir = async () => {
    if (!concluindo) return;
    try {
      await concluirManual(concluindo.id);
      setConcluindo(null);
      await recarregar();
      setToast({ msg: "Remessa concluída.", variant: "success" });
    } catch (err) {
      erroToast(err, "Falha ao concluir");
    }
  };

  const confirmarApagar = async () => {
    if (!apagando) return;
    try {
      await removerRemessa(apagando.id);
      setApagando(null);
      await recarregar();
      setToast({ msg: "Registro removido.", variant: "success" });
    } catch (err) {
      erroToast(err, "Falha ao remover");
    }
  };

  const handleLimparHistorico = async () => {
    setLimpando(true);
    const qtd = historico.length;
    try {
      const r = await limparHistorico();
      setConfirmandoLimpar(false);
      await recarregar();
      setToast({
        msg: `${r.removidas || qtd} ${(r.removidas || qtd) === 1 ? "registro removido" : "registros removidos"}.`,
        variant: "success",
      });
    } catch (err) {
      erroToast(err, "Falha ao limpar");
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
                  onCancelar={abrirCancelar}
                  onConcluir={abrirConcluir}
                  onApagar={abrirApagar}
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
            setToast({ msg: "Remessa iniciada.", variant: "success" });
          }}
        />
      )}

      {cancelando && (
        <ConfirmDialog
          title="Cancelar remessa"
          message={`Cancelar o controle de "${cancelando.pro_des}"? O histórico é preservado.`}
          confirmLabel="Cancelar remessa"
          cancelLabel="Voltar"
          variant="danger"
          input={{
            label: "Motivo (opcional)",
            placeholder: "Ex: produto trocado, custo conferido errado…",
            maxLength: 200,
          }}
          onConfirm={confirmarCancelar}
          onClose={() => setCancelando(null)}
        />
      )}

      {concluindo && (
        <ConfirmDialog
          title="Marcar preço atualizado"
          message={`Confirma que o preço de "${concluindo.pro_des}" já foi atualizado no Nutify? O sistema vai ler o preço atual do Firebird e fechar a remessa.`}
          confirmLabel="Sim, atualizei"
          onConfirm={confirmarConcluir}
          onClose={() => setConcluindo(null)}
        />
      )}

      {apagando && (
        <ConfirmDialog
          title="Apagar registro"
          message={`Remover definitivamente "${apagando.pro_des}" do histórico? Esta ação não pode ser desfeita.`}
          confirmLabel="Apagar"
          cancelLabel="Voltar"
          variant="danger"
          onConfirm={confirmarApagar}
          onClose={() => setApagando(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.msg}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
