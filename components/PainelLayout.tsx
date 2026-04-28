"use client";

/**
 * Layout compartilhado entre os 3 painéis (Recepção, Sala de Exames,
 * Consultório). Concentra:
 * - Header com título + métricas + seletor de médicos.
 * - Container de colunas (children).
 * - Rodapé fixo de status.
 *
 * Os 3 painéis vão usar este shell e variar só o conteúdo das colunas.
 */

import type { ReactNode } from "react";

import MetricasDoDia from "./MetricasDoDia";
import RodapeStatus from "./RodapeStatus";
import SeletorMedicos from "./SeletorMedicos";

import type { MetricasDia } from "@/lib/calcularMetricas";

interface Props {
  titulo: string;
  subtitulo?: string;
  metricas: MetricasDia;
  rotuloMetricaCentral?: string;
  selecionados: number[];
  onAlternar: (codigo: number) => void;
  noLimite: (codigo: number) => boolean;
  fonteOnline: boolean;
  ultimoErro: string | null;
  atualizadoEm: string | null;
  children: ReactNode;
}

export default function PainelLayout({
  titulo,
  subtitulo,
  metricas,
  rotuloMetricaCentral,
  selecionados,
  onAlternar,
  noLimite,
  fonteOnline,
  ultimoErro,
  atualizadoEm,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">{titulo}</h1>
              {subtitulo && (
                <p className="text-sm text-slate-500">{subtitulo}</p>
              )}
            </div>
            <MetricasDoDia
              metricas={metricas}
              rotuloMetricaCentral={rotuloMetricaCentral}
            />
          </div>
          <SeletorMedicos
            selecionados={selecionados}
            onAlternar={onAlternar}
            noLimite={noLimite}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>

      <RodapeStatus
        fonteOnline={fonteOnline}
        ultimoErro={ultimoErro}
        atualizadoEm={atualizadoEm}
      />
    </div>
  );
}
