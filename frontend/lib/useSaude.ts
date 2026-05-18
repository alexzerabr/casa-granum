"use client";

import { useEffect, useRef, useState } from "react";
import { obterSaude, type Saude } from "./remessas";

const POLL_MS = 60_000;

export type StatusSaude = "verde" | "amarelo" | "vermelho" | "indeterminado";

export interface SaudeHook {
  saude: Saude | null;
  status: StatusSaude;
  recarregar: () => void;
}

function derivarStatus(saude: Saude | null): StatusSaude {
  if (!saude) return "indeterminado";
  if (!saude.dependencias.firebird.ok) return "vermelho";
  if (saude.checker.ultimo_erro) return "amarelo";
  return "verde";
}

export function useSaude(): SaudeHook {
  const [saude, setSaude] = useState<Saude | null>(null);
  const [forceTick, setForceTick] = useState(0);
  const ultimoOk = useRef(true);

  useEffect(() => {
    let cancelado = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelado) return;
      try {
        const s = await obterSaude();
        if (!cancelado) {
          setSaude(s);
          ultimoOk.current = s.dependencias.firebird.ok;
        }
      } catch {
        // Falha de fetch (backend caído) — sinaliza vermelho via null + ultimoOk=false.
        if (!cancelado) {
          ultimoOk.current = false;
          setSaude((prev) =>
            prev
              ? {
                  ...prev,
                  dependencias: {
                    ...prev.dependencias,
                    firebird: { ok: false, erro: "backend inacessível" },
                  },
                }
              : null,
          );
        }
      } finally {
        if (!cancelado) {
          timeoutId = setTimeout(tick, POLL_MS);
        }
      }
    };

    void tick();
    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [forceTick]);

  return {
    saude,
    status: derivarStatus(saude),
    recarregar: () => setForceTick((n) => n + 1),
  };
}
