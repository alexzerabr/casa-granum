export function Footer() {
  return (
    <footer className="border-t border-wheat bg-cream">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm text-inkdim sm:flex-row lg:px-10">
        <span className="font-medium tabular">
          Casa Granum · {new Date().getFullYear()}
        </span>
        <span className="text-inkmuted">
          Naturais a granel — pesados na hora, escolhidos com cuidado.
        </span>
        <span className="label">Mercearia · Loja · Apotecário</span>
      </div>
    </footer>
  );
}
