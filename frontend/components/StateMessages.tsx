"use client";

export function LoadingState() {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-24 text-center lg:px-10">
      <p className="text-base text-inkdim">
        Consultando o catálogo<span className="dots text-copper" />
      </p>
      <p className="mt-2 text-xs text-inkmuted">
        cruzando objetivos com benefícios — pode levar alguns segundos
      </p>
      <div className="mx-auto mt-6 h-0.5 w-32 overflow-hidden rounded-full bg-wheat">
        <div className="h-full w-1/2 animate-pulse bg-copper" />
      </div>
    </section>
  );
}

interface ErrorProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorState({ message, onDismiss }: ErrorProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-24 lg:px-10">
      <div className="rounded-md border border-danger bg-dangersoft px-6 py-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-danger">
          Falha na consulta
        </p>
        <p className="mt-2 text-base text-ink">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 text-sm font-semibold text-copper hover:text-copperdark"
        >
          Tentar de novo
        </button>
      </div>
    </section>
  );
}
