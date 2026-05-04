"use client";

/**
 * Gráfico de barras verticais. Usado para distribuição por hora do dia,
 * pacientes por dia, etc. A altura de cada barra é proporcional ao maior
 * valor da lista. Mostra o valor em cima da barra apenas quando há
 * espaço suficiente.
 */

interface ItemBarras {
  rotulo: string;
  valor: number;
}

interface Props {
  titulo: string;
  itens: ItemBarras[];
  /** Altura máxima do gráfico em px. */
  alturaMax?: number;
  cor?: string;
  vazioMensagem?: string;
}

export default function BarrasVerticais({
  titulo,
  itens,
  alturaMax = 160,
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
        <div
          className="flex items-end gap-1 overflow-x-auto pb-1"
          style={{ height: `${alturaMax + 24}px` }}
        >
          {itens.map((item) => {
            const pct = max > 0 ? (item.valor / max) * 100 : 0;
            const altura = (pct / 100) * alturaMax;
            return (
              <div
                key={item.rotulo}
                className="flex min-w-[1.5rem] flex-1 flex-col items-center gap-1"
                title={`${item.rotulo}: ${item.valor}`}
              >
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${altura}px`,
                    backgroundColor: cor,
                    opacity: 0.85,
                  }}
                />
                <span className="text-[10px] tabular-nums text-slate-500">
                  {item.rotulo}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
