import Link from "next/link";

const PAINEIS = [
  {
    href: "/exames",
    titulo: "Sala de exames",
    descricao: "Pacientes em exame e em dilatação.",
    cor: "from-amber-50 to-amber-100 border-amber-200",
  },
  {
    href: "/dashboard",
    titulo: "Dashboard",
    descricao: "Análise de tempos de espera e atendimento.",
    cor: "from-sky-50 to-sky-100 border-sky-200",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Painel Oftalmocenter
        </p>
        <h1 className="text-4xl font-semibold text-slate-900">
          Escolha o painel para abrir nesta tela
        </h1>
        <p className="max-w-2xl text-base text-slate-600">
          A TV da sala de exames deve ficar fixa no painel ao vivo, que
          atualiza sozinho a partir do ProDoctor. O dashboard mostra o
          histórico de tempos.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {PAINEIS.map((painel) => (
          <Link
            key={painel.href}
            href={painel.href}
            className={`group rounded-2xl border bg-gradient-to-br p-6 shadow-sm transition hover:shadow-md ${painel.cor}`}
          >
            <h2 className="text-xl font-semibold text-slate-900">
              {painel.titulo}
            </h2>
            <p className="mt-1 text-sm text-slate-700">{painel.descricao}</p>
            <p className="mt-6 text-sm font-medium text-slate-800 group-hover:underline">
              Abrir {painel.titulo.toLowerCase()} →
            </p>
          </Link>
        ))}
      </section>

      <footer className="mt-auto border-t border-slate-200 pt-6 text-xs text-slate-500">
        Os painéis de Recepção e Consultório foram desativados.
      </footer>
    </main>
  );
}
