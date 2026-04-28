import Link from "next/link";

const PAINEIS = [
  {
    href: "/recepcao",
    titulo: "Recepção",
    descricao: "Pacientes em recepção e em dilatação.",
    cor: "from-rose-50 to-rose-100 border-rose-200",
  },
  {
    href: "/exames",
    titulo: "Sala de exames",
    descricao: "Pacientes em exame e em dilatação.",
    cor: "from-amber-50 to-amber-100 border-amber-200",
  },
  {
    href: "/consultorio",
    titulo: "Consultório",
    descricao: "Pacientes prontos para o médico.",
    cor: "from-orange-50 to-orange-100 border-orange-200",
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
          Cada TV da clínica deve abrir uma URL específica e permanecer nela.
          Os painéis atualizam sozinhos a partir do ProDoctor.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
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
        Versão de desenvolvimento · Fase 1 (Fundação invisível) concluída.
      </footer>
    </main>
  );
}
