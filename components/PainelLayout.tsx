"use client";

/**
 * Layout compartilhado entre os 3 painéis (Recepção, Sala de Exames,
 * Consultório). Concentra:
 * - Header em UMA linha só: título à esquerda, métricas + seletor compacto à direita.
 * - Container de colunas (children).
 * - Rodapé fixo de status.
 *
 * O seletor de médicos foi colapsado em um botão compacto (ícone +
 * apelidos + chevron) para liberar a linha que antes era dele inteiro
 * — agora cabe mais card na tela útil.
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
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-slate-900">
              {titulo}
            </h1>
            {subtitulo && (
              <p className="truncate text-xs text-slate-500">{subtitulo}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MetricasDoDia metricas={metricas} metricaCentral={metricaCentral} />
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
