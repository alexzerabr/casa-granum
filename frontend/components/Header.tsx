"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScanStatus } from "@/lib/useScanStatus";

const tabs = [
  { label: "Consulta", href: "/", active: true },
  { label: "Reabastecimento", href: "/reabastecimento", active: true },
  { label: "Pedidos", href: "/pedidos", active: true },
  { label: "Rank", href: "/rank", active: true },
];

export function Header() {
  const pathname = usePathname();
  const status = useScanStatus();
  const varrendo = status?.em_execucao ?? false;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="relative z-10 bg-forest text-cream">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5 md:flex-row md:items-center md:justify-between md:gap-4 lg:px-12">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="Casa Granum — Painel de Gestão"
          >
            <Image
              src="/logo-brand.png"
              alt="Casa Granum"
              width={1479}
              height={474}
              priority
              className="h-8 w-auto sm:h-9 lg:h-10"
            />
            <span className="hidden border-l border-cream/25 pl-3 text-xs font-medium uppercase tracking-wider text-cream/80 sm:inline">
              Painel de Gestão
            </span>
          </Link>

          {varrendo && (
            <span
              role="status"
              aria-live="polite"
              className="flex shrink-0 items-center gap-2 rounded-full border border-cream/25 bg-cream/10 px-2.5 py-1 text-[0.7rem] font-medium text-cream md:hidden"
              title={
                status?.origem === "manual"
                  ? "Varredura manual em andamento"
                  : "Varredura automática em andamento"
              }
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-copperglow opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-copperglow" />
              </span>
              Varrendo
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {varrendo && (
            <span
              role="status"
              aria-live="polite"
              className="hidden items-center gap-2 rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs font-medium text-cream md:flex"
              title={
                status?.origem === "manual"
                  ? "Varredura manual em andamento"
                  : "Varredura automática em andamento"
              }
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-copperglow opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-copperglow" />
              </span>
              Varrendo banco
            </span>
          )}

          <nav className="-mx-4 flex items-center gap-5 overflow-x-auto px-4 sm:mx-0 sm:gap-7 sm:overflow-visible sm:px-0">
            {tabs.map((tab) => {
              const active = tab.active && isActive(tab.href);
              if (!tab.active) {
                return (
                  <span
                    key={tab.label}
                    className="tab-link label shrink-0 cursor-not-allowed text-cream/55"
                    title="em breve"
                  >
                    {tab.label}
                  </span>
                );
              }
              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className={`tab-link label shrink-0 transition-colors ${
                    active
                      ? "is-active text-cream"
                      : "text-cream/85 hover:text-cream"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
