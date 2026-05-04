"use client";

/**
 * Layout compartilhado entre os 3 painéis (Recepção, Sala de Exames,
 * Consultório). Estilo "premium claro" com tipografia ampliada para TV.
 *
 * Header em duas linhas:
 *   1) Título grande + 3 botões de controle à direita (beep, cadeado, médicos).
 *   2) Métricas do dia (3 números grandes) com separadores verticais.
 *
 * Espaçamento generoso, fonte Inter, números tabulares — passa caráter
 * de produto sério sem virar over-engineering.
 */

import type { ReactNode } from "react";

import BotaoBeep from "./BotaoBeep";
import BotaoModoEdicao from "./BotaoModoEdicao";
import MetricasDoDia, { type MetricaCentral } from "./MetricasDoDia";
import RodapeStatus from "./RodapeStatus";
import SeletorMedicos from "./SeletorMedicos";

import type { MetricasDia } from "@/lib/calcularMetricas";

interface Props {
  titulo: string;
  subtitulo?: string;
  metricas: MetricasDia;
  /** Override da métrica central (ex.: Examinados em /exames). */
  metricaCentral?: MetricaCentral;
  selecionados: number[];
  onAlternar: (codigo: number) => void;
  noLimite: (codigo: number) => boolean;
  fonteOnline: boolean;
  ultimoErro: string | null;
  atualizadoEm: string | null;
  /** Estado e toggle do beep — vem do hook usePreferenciaBeep no nivel da pagina. */
  beepLigado: boolean;
  onAlternarBeep: () => void;
  /** Estado e controles do modo edição — vêm de useModoEdicao no nivel da pagina. */
  edicaoLigada: boolean;
  edicaoConfiguradaNoServidor: boolean;
  onDestravarEdicao: (
    pin: string,
  ) => Promise<{ ok: true } | { ok: false; mensagem: string }>;
  onTravarEdicao: () => void;
  children: ReactNode;
}

export default function PainelLayout({
  titulo,
  subtitulo,
  metricas,
  metricaCentral,
  selecionados,
  onAlternar,
  noLimite,
  fonteOnline,
  ultimoErro,
  atualizadoEm,
  beepLigado,
  onAlternarBeep,
  edicaoLigada,
  edicaoConfiguradaNoServidor,
  onDestravarEdicao,
  onTravarEdicao,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
        <div className="mx-auto max-w-7xl">
          {/* Linha 1: título à esquerda, controles à direita */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-4xl font-bold leading-none tracking-tight text-slate-900">
                {titulo}
              </h1>
              {subtitulo && (
                <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-slate-400">
                  {subtitulo}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BotaoBeep ligado={beepLigado} onAlternar={onAlternarBeep} />
              <BotaoModoEdicao
                ligado={edicaoLigada}
                configuradoNoServidor={edicaoConfiguradaNoServidor}
                onDestravar={onDestravarEdicao}
                onTravar={onTravarEdicao}
              />
              <SeletorMedicos
                selecionados={selecionados}
                onAlternar={onAlternar}
                noLimite={noLimite}
              />
            </div>
          </div>

          {/* Linha 2: métricas do dia */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <MetricasDoDia metricas={metricas} metricaCentral={metricaCentral} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>

      <RodapeStatus
        fonteOnline={fonteOnline}
        ultimoErro={ultimoErro}
        atualizadoEm={atualizadoEm}
      />
    </div>
  );
}
