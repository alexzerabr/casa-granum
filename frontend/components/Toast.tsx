"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import { useEffect } from "react";

type Variant = "success" | "error";

interface Props {
  message: string;
  variant?: Variant;
  durationMs?: number;
  onDismiss: () => void;
}

export function Toast({
  message,
  variant = "success",
  durationMs = 4000,
  onDismiss,
}: Props) {
  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(id);
  }, [durationMs, onDismiss]);

  const isError = variant === "error";
  const Icone = isError ? XCircle : CheckCircle2;
  const borda = isError ? "border-danger" : "border-good";
  const corIcone = isError ? "text-danger" : "text-good";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
    >
      <div
        className={`pointer-events-auto flex max-w-md items-start gap-2.5 rounded-md border ${borda} bg-cream px-3.5 py-2.5 shadow-lg`}
      >
        <Icone
          className={`mt-0.5 h-4 w-4 shrink-0 ${corIcone}`}
          strokeWidth={2.5}
        />
        <p className="flex-1 text-sm text-ink">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar"
          className="rounded-md p-0.5 text-inkmuted hover:bg-wheatlight hover:text-ink"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
