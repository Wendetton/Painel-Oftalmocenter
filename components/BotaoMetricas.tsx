"use client";

/**
 * Botão compacto que mostra os KPIs do dia em popover ao passar o mouse
 * (ou clicar — fica robusto pra touch também).
 *
 * O objetivo é liberar a linha inteira que era ocupada pelos números no
 * header. Quem quiser ver o resumo posiciona o cursor no ícone — é um
 * gesto natural, sem ocupar área permanente da tela.
 */

import { useEffect, useRef, useState } from "react";

import type { MetricasDia } from "@/lib/calcularMetricas";
import type { MetricaCentral } from "./MetricasDoDia";

interface Props {
  metricas: MetricasDia;
  metricaCentral?: MetricaCentral;
}

export default function BotaoMetricas({ metricas, metricaCentral }: Props) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click fora fecha (importante quando aberto via tap em mobile/touch).
  useEffect(() => {
    if (!aberto) return;
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  // ESC fecha
  useEffect(() => {
    if (!aberto) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [aberto]);

  const central: MetricaCentral = metricaCentral ?? {
    rotulo: "Atendidos",
    valor: metricas.atendidos,
  };
  const tempoMedio =
    metricas.tempoMedioPermanenciaMin !== null
      ? `${metricas.tempoMedioPermanenciaMin} min`
      : "—";

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title="Ver KPIs do dia"
        aria-label="Métricas do dia"
        aria-expanded={aberto}
        className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white p-2 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
      >
        <IconeBarras />
      </button>

      {aberto && (
        <div
          role="dialog"
          className="absolute right-0 z-30 mt-2 w-[320px] origin-top-right rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Resumo do dia
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-3">
            <Bloco label="Pacientes" valor={metricas.total} />
            <Bloco label={central.rotulo} valor={central.valor} />
            <Bloco label="Tempo médio" valor={tempoMedio} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Bloco({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="flex flex-col">
      <dd className="text-2xl font-bold tabular-nums leading-none tracking-tight text-slate-900">
        {valor}
      </dd>
      <dt className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
    </div>
  );
}

function IconeBarras() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="20" x2="6" y2="11" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="14" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  );
}
