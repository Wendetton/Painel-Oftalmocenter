"use client";

/**
 * Painel da Recepção — versão Fase 2.
 *
 * Objetivo da Fase 2 (PLANEJAMENTO seção 5): provar que o ciclo
 * "ProDoctor → /api/painel → tela com polling" funciona em tempo real.
 *
 * É deliberadamente FEIO. Sem cores do estágio, sem cronômetro, sem
 * cards bonitos. Só lista crua agrupada por estágio. A beleza vem na
 * Fase 3 (componentes CardPaciente, Cronometro, MetricasDoDia, etc.).
 */

import { useMemo } from "react";

import SeletorMedicos from "@/components/SeletorMedicos";
import { useMedicosSelecionados } from "@/hooks/useMedicosSelecionados";
import { usePainel } from "@/hooks/usePainel";
import type { CardPaciente, EstagioPaciente } from "@/lib/tipos";

// Ordem em que os grupos aparecem na tela. ATENDIDO e FALTOU somem da
// Recepção (PLANEJAMENTO seção 2.3). Mantemos AGENDADO no fim como
// "próximos a chegar".
const ORDEM_ESTAGIOS: EstagioPaciente[] = [
  "RECEPCAO",
  "DILATACAO",
  "SALA_EXAMES",
  "PRONTO_MEDICO",
  "AGENDADO",
];

const NOME_ESTAGIO: Record<EstagioPaciente, string> = {
  RECEPCAO: "Em recepção",
  DILATACAO: "Em dilatação",
  SALA_EXAMES: "Em sala de exames",
  PRONTO_MEDICO: "Pronto para o médico",
  AGENDADO: "Próximos a chegar",
  ATENDIDO: "Atendido",
  FALTOU: "Faltou",
};

export default function RecepcaoPage() {
  const { codigos, hidratado, alternar, noLimite } = useMedicosSelecionados();
  const { cards, atualizadoEm, fonteOnline, ultimoErro, carregandoInicial } =
    usePainel(codigos);

  const grupos = useMemo(() => agruparPorEstagio(cards), [cards]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-semibold text-slate-900">
              Recepção · Painel ao vivo
            </h1>
            <p className="text-xs text-slate-500">
              Fase 2 (visual mínimo) · atualiza a cada 10 s
            </p>
          </div>
          {hidratado && (
            <SeletorMedicos
              selecionados={codigos}
              onAlternar={alternar}
              noLimite={noLimite}
            />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {!hidratado ? (
          <p className="text-slate-500">Carregando preferências…</p>
        ) : codigos.length === 0 ? (
          <EstadoVazio />
        ) : carregandoInicial ? (
          <p className="text-slate-500">Buscando agendamentos…</p>
        ) : cards.length === 0 ? (
          <p className="text-slate-500">
            Nenhum agendamento para os médicos selecionados hoje.
          </p>
        ) : (
          <div className="space-y-8">
            {ORDEM_ESTAGIOS.map((estagio) => {
              const cardsDoGrupo = grupos[estagio] ?? [];
              if (cardsDoGrupo.length === 0) return null;
              return (
                <section key={estagio}>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
                    {NOME_ESTAGIO[estagio]} ({cardsDoGrupo.length})
                  </h2>
                  <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
                    {cardsDoGrupo.map((card) => (
                      <li key={card.agendamentoId} className="px-3 py-2 text-sm">
                        <LinhaCard card={card} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white px-6 py-2 text-xs text-slate-600">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span>
            <StatusFonte online={fonteOnline} />
            {ultimoErro && (
              <span className="ml-3 text-red-600">erro: {ultimoErro}</span>
            )}
          </span>
          <span>
            {atualizadoEm
              ? `última atualização: ${formatarHora(atualizadoEm)}`
              : "—"}
          </span>
        </div>
      </footer>
    </div>
  );
}

function LinhaCard({ card }: { card: CardPaciente }) {
  const partesCabecalho = [
    card.horarioAgendamento,
    card.paciente.idade !== null ? `${card.paciente.idade} anos` : null,
    card.medico.nome,
    card.convenio,
  ].filter((p): p is string => Boolean(p));

  return (
    <div>
      <p className="font-medium text-slate-900">{card.paciente.nome}</p>
      <p className="text-xs text-slate-500">{partesCabecalho.join(" · ")}</p>
      {card.complemento && (
        <p className="mt-1 text-xs italic text-slate-700">
          “{card.complemento.trim()}”
        </p>
      )}
    </div>
  );
}

function StatusFonte({ online }: { online: boolean }) {
  return online ? (
    <span className="text-emerald-700">● ProDoctor conectado</span>
  ) : (
    <span className="text-red-600">● ProDoctor desconectado</span>
  );
}

function EstadoVazio() {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
      <p className="text-base">Selecione até 2 médicos no topo para começar.</p>
      <p className="mt-2 text-xs">
        A escolha fica salva neste navegador (cada TV pode ter sua dupla
        diferente).
      </p>
    </div>
  );
}

function agruparPorEstagio(
  cards: CardPaciente[],
): Partial<Record<EstagioPaciente, CardPaciente[]>> {
  const agrupado: Partial<Record<EstagioPaciente, CardPaciente[]>> = {};
  for (const card of cards) {
    const lista = agrupado[card.estagio] ?? [];
    lista.push(card);
    agrupado[card.estagio] = lista;
  }
  // Ordena cada grupo por horário do agendamento (estável o suficiente).
  for (const estagio of Object.keys(agrupado) as EstagioPaciente[]) {
    const lista = agrupado[estagio];
    if (!lista) continue;
    lista.sort((a, b) => {
      const ha = a.horarioAgendamento ?? "";
      const hb = b.horarioAgendamento ?? "";
      return ha.localeCompare(hb);
    });
  }
  return agrupado;
}

function formatarHora(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso;
  }
}
