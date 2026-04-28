"use client";

/**
 * Cabeçalho com métricas do dia: Total / [métrica do meio] / Tempo médio.
 * Calculadas client-side a partir da lista atual — atualizam junto com o painel.
 *
 * A "métrica do meio" varia por painel:
 * - Recepção/Consultório: Atendidos
 * - Sala de Exames: Examinados (pacientes que já passaram pela sala)
 *
 * O componente expõe a escolha por meio do prop `metricaCentral`.
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
    <dl className="flex items-stretch gap-6 text-right">
      <Metric label="Pacientes do dia" valor={metricas.total} />
      <span className="self-stretch border-l border-slate-200" />
      <Metric label={central.rotulo} valor={central.valor} />
      <span className="self-stretch border-l border-slate-200" />
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
    <div className="text-right">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="text-2xl font-semibold tabular-nums text-slate-900">{valor}</dd>
    </div>
  );
}
