"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  formatarQuantidade,
  formatarReais,
  type Remessa,
} from "@/lib/remessas";

interface Props {
  remessa: Remessa;
  onCancelar: (id: number) => void;
  onConcluir: (id: number) => void;
  onApagar?: (id: number) => void;
}

function corBarra(consumoPct: number, thresholdPct: number, estado: string): string {
  if (estado === "alerta_preco") return "bg-danger";
  const limiar = 1 - thresholdPct;
  if (consumoPct >= limiar) return "bg-danger";
  if (consumoPct >= limiar * 0.5) return "bg-copper";
  return "bg-copperglow";
}

function rotuloEstado(estado: Remessa["estado"]): { label: string; klass: string } {
  switch (estado) {
    case "alerta_preco":
      return {
        label: "Atualizar preço",
        klass: "bg-danger text-cream",
      };
    case "ativa":
      return {
        label: "Em consumo",
        klass: "bg-wheatlight text-inkdim",
      };
    case "concluida":
      return {
        label: "Concluída",
        klass: "bg-goodsoft text-good",
      };
    case "cancelada":
      return {
        label: "Cancelada",
        klass: "bg-creamdeep text-inkmuted",
      };
  }
}

export function RemessaCard({ remessa, onCancelar, onConcluir, onApagar }: Props) {
  const [aberto, setAberto] = useState(false);

  const ativa = remessa.estado === "ativa" || remessa.estado === "alerta_preco";
  const consumo = Math.max(0, Math.min(1, remessa.consumo_pct));
  const consumoFmt = (consumo * 100).toFixed(0);
  const marcaAlerta = (1 - remessa.alerta_threshold_pct) * 100;
  const cor = corBarra(consumo, remessa.alerta_threshold_pct, remessa.estado);
  const rotulo = rotuloEstado(remessa.estado);
  const custoReduziu = remessa.custo_novo < remessa.custo_antigo;

  return (
    <li className="rounded-md border border-wheat bg-cream p-4 transition-colors hover:border-copper">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{remessa.pro_des}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider ${rotulo.klass}`}
            >
              {rotulo.label}
            </span>
            {ativa && custoReduziu && (
              <span
                className="rounded-full bg-goodsoft px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-good"
                title="Custo caiu — sugestão é reduzir o preço"
              >
                ↓ sugere reduzir
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-inkdim">
            Unidade <span className="font-semibold tracking-wider text-copper">{remessa.unidade}</span>
            {" · "}custo R$ {remessa.custo_antigo.toFixed(2)} →{" "}
            <span className="font-semibold text-ink">
              R$ {remessa.custo_novo.toFixed(2)}
            </span>
            {" · "}
            <span className="text-inkmuted">desde {formatarData(remessa.iniciada_em)}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!ativa && onApagar && (
            <button
              type="button"
              onClick={() => onApagar(remessa.id)}
              className="rounded-md border border-wheat px-2 py-1 text-xs font-medium text-inkmuted hover:border-danger hover:text-danger"
              aria-label="Apagar registro"
              title="Apagar registro"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setAberto((s) => !s)}
            className="rounded-md border border-wheat px-2 py-1 text-xs font-medium text-inkdim hover:border-copper hover:text-copper"
            aria-label={aberto ? "Fechar detalhes" : "Abrir detalhes"}
          >
            {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {ativa && (
        <>
          <div className="mt-4">
            <div
              className="relative h-3 overflow-hidden rounded-full bg-wheatlight"
              aria-label={`Consumo ${consumoFmt}%`}
              role="progressbar"
              aria-valuenow={Math.round(consumo * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${cor}`}
                style={{ width: `${consumoFmt}%` }}
              />
              <div
                className="absolute top-0 h-full w-px bg-ink/40"
                style={{ left: `${marcaAlerta}%` }}
                title={`Alerta em ${marcaAlerta.toFixed(0)}%`}
              />
            </div>
            <p className="mt-2 text-xs text-inkdim">
              Consumiu{" "}
              <span className="font-semibold text-ink">
                {formatarQuantidade(remessa.vendido, remessa.unidade)}
              </span>
              {" "}de{" "}
              <span className="font-semibold text-ink">
                {formatarQuantidade(remessa.estoque_antigo, remessa.unidade)}
              </span>
              {" "}({consumoFmt}%) · preço atual{" "}
              <span className="font-semibold text-ink">
                {formatarReais(remessa.preco_antigo)}
              </span>{" "}
              · sugerido{" "}
              <span className={`font-semibold ${custoReduziu ? "text-good" : "text-copper"}`}>
                {formatarReais(remessa.preco_sugerido)}
              </span>
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onConcluir(remessa.id)}
              className="btn btn-secondary"
              style={{ borderColor: "var(--color-good)", color: "var(--color-good)" }}
            >
              Marcar preço atualizado
            </button>
            <button
              type="button"
              onClick={() => onCancelar(remessa.id)}
              className="btn btn-secondary"
              style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
            >
              Cancelar
            </button>
          </div>
        </>
      )}

      {aberto && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-wheat pt-4 text-xs sm:grid-cols-3">
          <Linha
            rotulo="Estoque antigo"
            valor={formatarQuantidade(remessa.estoque_antigo, remessa.unidade)}
          />
          <Linha
            rotulo="Markup praticado"
            valor={`${remessa.markup_pct.toFixed(2)}%`}
          />
          <Linha
            rotulo="Alerta em"
            valor={`${((1 - remessa.alerta_threshold_pct) * 100).toFixed(0)}% consumido`}
          />
          <Linha
            rotulo="Iniciada"
            valor={formatarData(remessa.iniciada_em)}
          />
          {remessa.alertada_em && (
            <Linha rotulo="Alertada" valor={formatarData(remessa.alertada_em)} />
          )}
          {remessa.concluida_em && (
            <Linha rotulo="Concluída" valor={formatarData(remessa.concluida_em)} />
          )}
          {remessa.preco_final !== null && (
            <Linha rotulo="Preço final" valor={formatarReais(remessa.preco_final)} />
          )}
          {remessa.cancelada_em && (
            <Linha rotulo="Cancelada" valor={formatarData(remessa.cancelada_em)} />
          )}
          {remessa.motivo_cancelamento && (
            <Linha rotulo="Motivo" valor={remessa.motivo_cancelamento} />
          )}
        </dl>
      )}
    </li>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="label text-[0.65rem]">{rotulo}</dt>
      <dd className="mt-0.5 font-medium text-ink">{valor}</dd>
    </div>
  );
}

function formatarData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
