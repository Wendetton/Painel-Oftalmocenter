/**
 * Card de KPI para o cabeçalho do dashboard.
 * Número grande à direita, rótulo pequeno acima e descrição opcional embaixo.
 */

interface Props {
  rotulo: string;
  valor: string | number;
  descricao?: string | null;
  destaque?: "neutro" | "verde" | "ambar";
}

export default function KpiCard({
  rotulo,
  valor,
  descricao = null,
  destaque = "neutro",
}: Props) {
  const corValor =
    destaque === "verde"
      ? "text-emerald-700"
      : destaque === "ambar"
        ? "text-amber-700"
        : "text-slate-900";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {rotulo}
      </p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${corValor}`}>
        {valor}
      </p>
      {descricao && (
        <p className="mt-1 text-xs text-slate-500">{descricao}</p>
      )}
    </div>
  );
}
