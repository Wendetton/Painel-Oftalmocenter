"use client";

/**
 * Cabeçalho com métricas do dia: Total / [métrica do meio] / Tempo médio.
 *
 * Layout "premium" (estilo Linear/Vercel): número grande primeiro, label
 * pequeno embaixo. Hierarquia visual clara — qualquer um olhando da
 * porta da clínica vê os 3 números do dia imediatamente.
 *
 * A "métrica do meio" varia por painel:
 * - Recepção/Consultório: Atendidos
 * - Sala de Exames: Examinados (pacientes que já passaram pela sala)
 */

import type { MetricasDia } from "@/lib/calcularMetricas";

export interface MetricaCentral {
  rotulo: string;
  valor: number | string;
}

interface Props {
  metricas: MetricasDia;
  /** Sobrescreve o "Atendidos" central (ex.: Examinados em /exames). */
  metricaCentral?: MetricaCentral;
}

export default function MetricasDoDia({ metricas, metricaCentral }: Props) {
  const central: MetricaCentral = metricaCentral ?? {
    rotulo: "Atendidos",
    valor: metricas.atendidos,
  };

  return (
    <dl className="flex items-end gap-8">
      <Metric label="Pacientes do dia" valor={metricas.total} />
      <Divider />
      <Metric label={central.rotulo} valor={central.valor} />
      <Divider />
      <Metric
        label="Tempo médio"
        valor={
          metricas.tempoMedioPermanenciaMin !== null
            ? `${metricas.tempoMedioPermanenciaMin} min`
            : "—"
        }
      />
    </dl>
  );
}

function Metric({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="flex flex-col">
      <dd className="text-3xl font-bold tabular-nums leading-none tracking-tight text-slate-900">
        {valor}
      </dd>
      <dt className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
    </div>
  );
}

function Divider() {
  return (
    <span aria-hidden="true" className="h-10 w-px self-end bg-slate-200" />
  );
}
