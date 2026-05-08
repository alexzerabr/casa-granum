"use client";

import { useEffect, useRef, useState } from "react";
import { statusVarredura, type StatusVarredura } from "./reabastecimento";

const POLL_RUN_MS = 2_000;
const POLL_IDLE_MS = 30_000;

export function useScanStatus(): StatusVarredura | null {
  const [status, setStatus] = useState<StatusVarredura | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelado = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelado) return;
      try {
        const st = await statusVarredura();
        setStatus(st);
        runningRef.current = st.em_execucao;
      } catch {
        // Falha transitória: mantém estado anterior.
      } finally {
        if (!cancelado) {
          const proximo = runningRef.current ? POLL_RUN_MS : POLL_IDLE_MS;
          timeoutId = setTimeout(tick, proximo);
        }
      }
    };

    void tick();
    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return status;
}
