"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Variant = "default" | "danger";

interface InputProps {
  label: string;
  placeholder?: string;
  maxLength?: number;
}

interface Props {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  input?: InputProps;
  onConfirm: (value?: string) => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  input,
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState("");
  const [executando, setExecutando] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (input) inputRef.current?.focus();
    else cancelRef.current?.focus();
  }, [input]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !executando) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [executando, onClose]);

  const confirmar = async () => {
    setExecutando(true);
    try {
      await onConfirm(input ? value : undefined);
    } finally {
      setExecutando(false);
    }
  };

  const confirmClasses =
    variant === "danger"
      ? "btn"
      : "btn btn-primary";
  const confirmStyle =
    variant === "danger"
      ? {
          backgroundColor: "var(--color-danger)",
          color: "var(--color-cream)",
          border: "1px solid var(--color-danger)",
        }
      : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-2 py-4 backdrop-blur-sm sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => !executando && onClose()}
    >
      <div
        className="w-full max-w-md rounded-lg border border-wheat bg-cream p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2
            id="confirm-dialog-title"
            className="text-base font-semibold text-ink"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={executando}
            className="rounded-md p-1 text-inkdim hover:bg-wheatlight hover:text-ink disabled:opacity-55"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {message && (
          <p className="mb-4 text-sm text-inkdim">{message}</p>
        )}

        {input && (
          <>
            <label className="label mb-1 block text-[0.7rem]">
              {input.label}
            </label>
            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={input.placeholder}
              maxLength={input.maxLength}
              rows={3}
              className="text-input resize-none py-2"
              style={{ height: "auto", minHeight: "5rem" }}
            />
            {input.maxLength && (
              <p className="mt-1 text-right text-[0.65rem] tabular text-inkmuted">
                {value.length}/{input.maxLength}
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={executando}
            className="btn btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={executando}
            className={confirmClasses}
            style={confirmStyle}
          >
            {executando ? "Processando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
