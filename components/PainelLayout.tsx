"use client";

/**
 * Layout compartilhado entre os 3 painéis (Recepção, Sala de Exames,
 * Consultório). Estilo "premium claro" com tipografia ampliada para TV.
 *
 * Header em UMA linha só: título à esquerda + controles à direita
 * (métricas em popover de hover, beep, cadeado, seletor de médicos).
 *
 * As métricas do dia (Pacientes / Atendidos / Tempo médio) vivem agora
 * num botãozinho com popover — o mouse em cima abre, sair fecha. Libera
 * a linha que era ocupada por elas pra mais cards na tela.
 *
 * Container alargado para 1800 px (era 1280) — aproveita melhor TVs
 * grandes sem ficar desconfortável em laptops.
 */

import type { ReactNode } from "react";

import BotaoBeep from "./BotaoBeep";
import BotaoCodigoMedico from "./BotaoCodigoMedico";
import BotaoMetricas from "./BotaoMetricas";
import BotaoModoEdicao from "./BotaoModoEdicao";
import { type MetricaCentral } from "./MetricasDoDia";
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
  /** Código do médico no Eyenote (uso compartilhado com AcaoMoverCard). */
  codigoMedicoEyenote: string | null;
  hidratadoCodigoMedico: boolean;
  onDefinirCodigoMedico: (codigo: string) => void;
  onLimparCodigoMedico: () => void;
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
  codigoMedicoEyenote,
  hidratadoCodigoMedico,
  onDefinirCodigoMedico,
  onLimparCodigoMedico,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4">
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
            <BotaoMetricas
              metricas={metricas}
              metricaCentral={metricaCentral}
            />
            <BotaoBeep ligado={beepLigado} onAlternar={onAlternarBeep} />
            <BotaoCodigoMedico
              codigoAtual={codigoMedicoEyenote}
              hidratado={hidratadoCodigoMedico}
              onDefinir={onDefinirCodigoMedico}
              onLimpar={onLimparCodigoMedico}
            />
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

      <main className="mx-auto max-w-[1800px] px-6 py-8">{children}</main>

      <RodapeStatus
        fonteOnline={fonteOnline}
        ultimoErro={ultimoErro}
        atualizadoEm={atualizadoEm}
      />
    </div>
  );
}
