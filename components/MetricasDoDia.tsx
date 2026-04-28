"use client";

/**
 * Cabeçalho com métricas do dia: Total / Atendidos / Tempo médio.
 * Calculadas client-side a partir da lista atual — atualizam junto com o painel.
 *
 * As 3 métricas são as que estão calculáveis sem histórico, derivadas dos
 * timestamps já vindos da API ProDoctor (PLANEJAMENTO seção 1.3).
 */

import type { MetricasDia } from "@/lib/calcularMetricas";

interface Props {
  metricas: MetricasDia;
  /**
   * Rótulo da métrica do meio. Recepção mostra "Atendidos"; Sala de Exames
   * vai mostrar "Examinados" na Fase 4. Por isso é parametrizado.
   */
  rotuloMetricaCentral?: string;
}

export default function MetricasDoDia({
  metricas,
  rotuloMetricaCentral = "Atendidos",
}: Props) {
  return (
    <dl className="flex items-stretch gap-6 text-right">
      <Metric label="Pacientes do dia" valor={metricas.total} />
      <span className="self-stretch border-l border-slate-200" />
      <Metric label={rotuloMetricaCentral} valor={metricas.atendidos} />
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
