"use client";

import {
  Activity,
  AlertCircle,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  obterMetricas,
  obterSaude,
  type Metricas,
  type Saude,
} from "@/lib/remessas";

interface Props {
  onClose: () => void;
}

export function SaudeModal({ onClose }: Props) {
  const [saude, setSaude] = useState<Saude | null>(null);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [s, m] = await Promise.all([obterSaude(), obterMetricas()]);
      setSaude(s);
      setMetricas(m);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-2 py-4 backdrop-blur-sm sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-wheat bg-cream p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Activity className="h-5 w-5 text-copper" />
            Estado do sistema
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void carregar()}
              disabled={carregando}
              className="rounded-md p-1.5 text-inkdim hover:bg-wheatlight hover:text-ink disabled:opacity-50"
              aria-label="Atualizar"
              title="Atualizar"
            >
              <RefreshCw
                className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-inkdim hover:bg-wheatlight hover:text-ink"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {erro && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-danger bg-dangersoft px-3 py-2 text-sm text-danger">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {!saude || !metricas ? (
          <p className="py-10 text-center text-sm text-inkdim">
            Carregando<span className="dots text-copper" />
          </p>
        ) : (
          <div className="space-y-5">
            <SecaoChecker saude={saude} />
            <SecaoContagens saude={saude} />
            <SecaoDependencias saude={saude} />
            {metricas.total > 0 && <SecaoMetricas metricas={metricas} />}
          </div>
        )}
      </div>
    </div>
  );
}

function SecaoChecker({ saude }: { saude: Saude }) {
  const { checker } = saude;
  const okGeral = !checker.ultimo_erro;
  const Icone = okGeral ? CheckCircle2 : AlertCircle;
  const corIcone = okGeral ? "text-good" : "text-danger";

  return (
    <section>
      <h3 className="label mb-2 flex items-center gap-1.5 text-[0.7rem]">
        <Icone className={`h-3.5 w-3.5 ${corIcone}`} strokeWidth={2.5} />
        Checker
      </h3>
      <div className="rounded-md border border-wheat bg-creamdeep p-3">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <Linha
            rotulo="Em execução agora"
            valor={checker.em_execucao ? "Sim" : "Não"}
            destaque={checker.em_execucao ? "good" : undefined}
          />
          <Linha
            rotulo="Intervalo"
            valor={`a cada ${checker.intervalo_minutos} min`}
          />
          <Linha
            rotulo="Última execução"
            valor={tempoRelativo(checker.ultima_execucao)}
          />
          <Linha
            rotulo="Próxima execução"
            valor={tempoRelativo(checker.proxima_execucao, true)}
          />
        </dl>

        {checker.ultimo_sumario && (
          <div className="mt-3 border-t border-wheat pt-3">
            <p className="label mb-1.5 text-[0.65rem]">Último ciclo</p>
            <div className="flex flex-wrap gap-1.5 text-[0.7rem]">
              <Pilula label="verificadas" valor={checker.ultimo_sumario.verificadas} />
              <Pilula
                label="alertas novos"
                valor={checker.ultimo_sumario.novos_alertas}
                cor={checker.ultimo_sumario.novos_alertas > 0 ? "danger" : undefined}
              />
              <Pilula label="silenciados" valor={checker.ultimo_sumario.silenciados} />
              <Pilula
                label="concluídas auto"
                valor={checker.ultimo_sumario.concluidas_auto}
                cor={checker.ultimo_sumario.concluidas_auto > 0 ? "good" : undefined}
              />
              <Pilula label="revertidas" valor={checker.ultimo_sumario.revertidas} />
            </div>
          </div>
        )}

        {checker.ultimo_erro && (
          <div className="mt-3 rounded-md border border-danger bg-dangersoft p-2 text-xs">
            <p className="font-semibold text-danger">
              {checker.ultimo_erro.tipo}
            </p>
            <p className="mt-0.5 text-inkdim">
              {checker.ultimo_erro.mensagem || "(sem mensagem)"}
            </p>
            <p className="mt-1 text-[0.65rem] text-inkmuted">
              {tempoRelativo(checker.ultimo_erro.em)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function SecaoContagens({ saude }: { saude: Saude }) {
  const { remessas } = saude;
  return (
    <section>
      <h3 className="label mb-2 flex items-center gap-1.5 text-[0.7rem]">
        <Clock className="h-3.5 w-3.5 text-copper" strokeWidth={2.5} />
        Remessas por estado
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Caixa label="Ativas" valor={remessas.ativa} cor="copper" />
        <Caixa
          label="Em alerta"
          valor={remessas.alerta_preco}
          cor={remessas.alerta_preco > 0 ? "danger" : "inkmuted"}
        />
        <Caixa label="Concluídas" valor={remessas.concluida} cor="good" />
        <Caixa label="Canceladas" valor={remessas.cancelada} cor="inkmuted" />
      </div>
    </section>
  );
}

function SecaoDependencias({ saude }: { saude: Saude }) {
  const { dependencias } = saude;
  const fbOk = dependencias.firebird.ok;
  return (
    <section>
      <h3 className="label mb-2 text-[0.7rem]">Dependências</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div
          className={`flex items-center gap-2 rounded-md border bg-cream p-2.5 text-xs ${
            fbOk ? "border-good/40" : "border-danger"
          }`}
        >
          <Database
            className={`h-4 w-4 shrink-0 ${fbOk ? "text-good" : "text-danger"}`}
            strokeWidth={2.5}
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Firebird</p>
            {fbOk ? (
              <p className="text-inkdim">
                conectado · {dependencias.firebird.latencia_ms} ms
              </p>
            ) : (
              <p className="truncate text-danger" title={dependencias.firebird.erro}>
                {dependencias.firebird.erro || "indisponível"}
              </p>
            )}
          </div>
        </div>

        <div
          className={`flex items-center gap-2 rounded-md border bg-cream p-2.5 text-xs ${
            dependencias.telegram_configurado ? "border-good/40" : "border-wheat"
          }`}
        >
          {dependencias.telegram_configurado ? (
            <Bell className="h-4 w-4 shrink-0 text-good" strokeWidth={2.5} />
          ) : (
            <BellOff className="h-4 w-4 shrink-0 text-inkmuted" strokeWidth={2.5} />
          )}
          <div>
            <p className="font-semibold text-ink">Telegram</p>
            <p className={dependencias.telegram_configurado ? "text-inkdim" : "text-inkmuted"}>
              {dependencias.telegram_configurado ? "configurado" : "não configurado (alertas desativados)"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SecaoMetricas({ metricas }: { metricas: Metricas }) {
  return (
    <section>
      <h3 className="label mb-2 flex items-center gap-1.5 text-[0.7rem]">
        <TrendingUp className="h-3.5 w-3.5 text-copper" strokeWidth={2.5} />
        Tempo até conclusão · {metricas.total} {metricas.total === 1 ? "remessa" : "remessas"}
      </h3>
      <div className="rounded-md border border-wheat bg-creamdeep p-3">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="Média" valor={formatarHoras(metricas.media_horas)} />
          <Stat label="Mín" valor={formatarHoras(metricas.min_horas)} />
          <Stat label="Máx" valor={formatarHoras(metricas.max_horas)} />
        </div>

        {metricas.top_produtos.length > 0 && (
          <div className="mt-3 border-t border-wheat pt-3">
            <p className="label mb-1.5 text-[0.65rem]">Top produtos por conclusões</p>
            <ul className="space-y-1 text-xs">
              {metricas.top_produtos.map((p) => (
                <li
                  key={p.pro_cod}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {p.pro_des}
                  </span>
                  <span className="shrink-0 text-inkdim">
                    {p.total}× · média {formatarHoras(p.media_h)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

type Cor = "copper" | "good" | "danger" | "inkmuted";

function Caixa({ label, valor, cor }: { label: string; valor: number; cor: Cor }) {
  const corClasses: Record<Cor, string> = {
    copper: "border-copper/40 text-copper",
    good: "border-good/40 text-good",
    danger: "border-danger bg-dangersoft text-danger",
    inkmuted: "border-wheat text-inkmuted",
  };
  return (
    <div
      className={`rounded-md border bg-cream p-2.5 text-center ${corClasses[cor]}`}
    >
      <p className="text-xl font-bold">{valor}</p>
      <p className="label text-[0.6rem]">{label}</p>
    </div>
  );
}

function Pilula({
  label,
  valor,
  cor,
}: {
  label: string;
  valor: number;
  cor?: "good" | "danger";
}) {
  const klass =
    cor === "good"
      ? "border-good/40 text-good"
      : cor === "danger"
        ? "border-danger text-danger"
        : "border-wheat text-inkdim";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border bg-cream px-2 py-0.5 ${klass}`}
    >
      <span className="font-semibold">{valor}</span>
      <span className="text-inkmuted">{label}</span>
    </span>
  );
}

function Linha({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: "good" | "danger";
}) {
  const corValor =
    destaque === "good"
      ? "text-good"
      : destaque === "danger"
        ? "text-danger"
        : "text-ink";
  return (
    <div>
      <dt className="label text-[0.6rem]">{rotulo}</dt>
      <dd className={`mt-0.5 font-medium ${corValor}`}>{valor}</dd>
    </div>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-md border border-wheat bg-cream p-2">
      <p className="text-base font-semibold text-ink">{valor}</p>
      <p className="label text-[0.6rem]">{label}</p>
    </div>
  );
}

function tempoRelativo(iso: string | null, futuro = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(Math.abs(diffMs) / 60_000);
  const abs = d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diffMin === 0) return `agora · ${abs}`;
  const prefixo = futuro ? "em " : "há ";
  if (diffMin < 60) return `${prefixo}${diffMin} min · ${abs}`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  const rel = m === 0 ? `${h}h` : `${h}h${m}min`;
  return `${prefixo}${rel} · ${abs}`;
}

function formatarHoras(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1).replace(".", ",")} h`;
  return `${(h / 24).toFixed(1).replace(".", ",")} d`;
}
