"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScanStatus } from "@/lib/useScanStatus";

const tabs = [
  { label: "Consulta", href: "/", active: true },
  { label: "Reabastecimento", href: "/reabastecimento", active: true },
  { label: "Pedidos", href: "/pedidos", active: true },
];

export function Header() {
  const pathname = usePathname();
  const status = useScanStatus();
  const varrendo = status?.em_execucao ?? false;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="relative z-10 bg-forest text-cream">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5 lg:px-12">
        <Link href="/" className="flex items-center gap-4">
          <Image
            src="/logo-light.png"
            alt="Casa Granum"
            width={56}
            height={56}
            priority
            className="h-12 w-12 [filter:brightness(0)_invert(1)]"
          />
          <div className="hidden flex-col leading-none sm:flex">
            <span className="text-lg font-bold tracking-tight text-cream">
              Casa Granum
            </span>
            <span className="mt-1 text-xs font-medium text-cream/80">
              Mercearia Natural
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-6">
          {varrendo && (
            <span
              role="status"
              aria-live="polite"
              className="hidden items-center gap-2 rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs font-medium text-cream sm:flex"
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

          <nav className="flex items-center gap-7">
            {tabs.map((tab) => {
              const active = tab.active && isActive(tab.href);
              if (!tab.active) {
                return (
                  <span
                    key={tab.label}
                    className="tab-link label cursor-not-allowed text-cream/55"
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
                  className={`tab-link label transition-colors ${
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
