"use client";

/**
 * Gráfico de barras horizontais. Usado para "tempo médio por convênio",
 * "pacientes por médico", etc. Cada barra ocupa uma largura proporcional
 * ao maior valor da lista. Visual limpo, sem dependência de bibliotecas.
 */

interface ItemBarras {
  rotulo: string;
  valor: number;
  valorFormatado?: string;
}

interface Props {
  titulo: string;
  itens: ItemBarras[];
  /** Sufixo do valor padrão (ex.: "min" ou "pacientes"). */
  unidade?: string;
  cor?: string;
  vazioMensagem?: string;
}

export default function BarrasHorizontais({
  titulo,
  itens,
  unidade = "",
  cor = "#1F4FA8",
  vazioMensagem = "Sem dados no período.",
}: Props) {
  const max = itens.reduce((m, i) => Math.max(m, i.valor), 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-700">
        {titulo}
      </h2>

      {itens.length === 0 || max === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">{vazioMensagem}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {itens.map((item) => {
            const pct = max > 0 ? (item.valor / max) * 100 : 0;
            const valorMostrado =
              item.valorFormatado ??
              `${formatarValor(item.valor)}${unidade ? ` ${unidade}` : ""}`;
            return (
              <li key={item.rotulo} className="grid grid-cols-[12rem_1fr_auto] items-center gap-3">
                <span
                  className="truncate text-sm text-slate-700"
                  title={item.rotulo}
                >
                  {item.rotulo}
                </span>
                <div className="relative h-6 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded transition-all"
                    style={{ width: `${pct}%`, backgroundColor: cor, opacity: 0.85 }}
                  />
                </div>
                <span className="tabular-nums text-xs text-slate-600">
                  {valorMostrado}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatarValor(v: number): string {
  if (v < 10) return v.toFixed(1);
  return Math.round(v).toString();
}
