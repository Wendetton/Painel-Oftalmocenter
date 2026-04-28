"use client";

/**
 * Painel do Consultório — Fase 4 (PLANEJAMENTO seção 4.6).
 *
 * Layout: 2 colunas (uma grande, uma pequena)
 *   - Coluna principal (2/3 da tela) — "Pronto para chamar" (laranja):
 *     pacientes em PRONTO_MEDICO. Cards maiores, ordenados por tempo de
 *     espera (quem espera há mais tempo, no topo).
 *   - Coluna lateral (1/3) — "Em outras etapas":
 *     contagens compactas (recepção, exames, dilatação) +
 *     lista resumida dos próximos a chegar.
 *
 * Métrica central: "Atendidos".
 *
 * Reusa os componentes da Fase 3: PainelLayout, CardPaciente, hooks.
 */

import { useEffect, useMemo, useState } from "react";

import CardPaciente, { severidadeCard } from "@/components/CardPaciente";
import PainelLayout from "@/components/PainelLayout";
import { useBeepEntradaEstagio } from "@/hooks/useBeepEntradaEstagio";
import { useMedicosSelecionados } from "@/hooks/useMedicosSelecionados";
import { usePainel } from "@/hooks/usePainel";
import { usePreferenciaBeep } from "@/hooks/usePreferenciaBeep";
import { calcularMetricasDia } from "@/lib/calcularMetricas";
import { nomeMedicoCurto } from "@/lib/configuracao";
import type { CardPaciente as CardData, EstagioPaciente } from "@/lib/tipos";

const ESTAGIOS_BEEP_CONSULTORIO: EstagioPaciente[] = ["PRONTO_MEDICO"];

export default function ConsultorioPage() {
  const { codigos, hidratado, alternar, noLimite } = useMedicosSelecionados();
  const { cards, atualizadoEm, fonteOnline, ultimoErro, carregandoInicial } =
    usePainel(codigos);
  const { ligado: beepLigado, alternar: alternarBeep } = usePreferenciaBeep();

  useBeepEntradaEstagio({
    cards,
    estagiosAlvo: ESTAGIOS_BEEP_CONSULTORIO,
    habilitado: beepLigado,
  });

  // Tick periódico para reordenação por severidade do cronômetro.
  const [tickOrdenacao, setTickOrdenacao] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTickOrdenacao((v) => v + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const grupos = useMemo(() => {
    const agora = new Date();
    const prontos = ordenarPorSeveridade(filtrar(cards, "PRONTO_MEDICO"), agora);
    return {
      prontos,
      contagemRecepcao: filtrar(cards, "RECEPCAO").length,
      contagemExames: filtrar(cards, "SALA_EXAMES").length,
      contagemDilatacao: filtrar(cards, "DILATACAO").length,
      proximos: ordenarPorHorario(filtrar(cards, "AGENDADO")).slice(0, 6),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, tickOrdenacao]);

  const metricas = useMemo(() => calcularMetricasDia(cards), [cards]);

  return (
    <PainelLayout
      titulo="Consultório"
      subtitulo="Painel ao vivo · Oftalmocenter"
      metricas={metricas}
      selecionados={codigos}
      onAlternar={alternar}
      noLimite={noLimite}
      fonteOnline={fonteOnline}
      ultimoErro={ultimoErro}
      atualizadoEm={atualizadoEm}
      beepLigado={beepLigado}
      onAlternarBeep={alternarBeep}
    >
      {!hidratado ? (
        <Status mensagem="Carregando preferências…" />
      ) : codigos.length === 0 ? (
        <EstadoVazio />
      ) : carregandoInicial ? (
        <Status mensagem="Buscando agendamentos do dia…" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Coluna principal — 2/3 — Pronto para chamar */}
          <section className="flex flex-col gap-3 lg:col-span-2">
            <header className="flex items-baseline justify-between border-b border-slate-200 pb-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                Pronto para chamar
              </h2>
              <span className="text-xs text-slate-500">
                {grupos.prontos.length}
              </span>
            </header>
            {grupos.prontos.length === 0 ? (
              <p className="rounded border border-dashed border-slate-300 px-3 py-12 text-center text-sm text-slate-500">
                Nenhum paciente pronto para chamar agora.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {grupos.prontos.map((card) => (
                  <CardPaciente key={card.agendamentoId} card={card} />
                ))}
              </div>
            )}
          </section>

          {/* Coluna lateral — 1/3 — Em outras etapas */}
          <aside className="flex flex-col gap-4">
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-700">
                Em outras etapas
              </h3>
              <ul className="rounded-lg border border-slate-200 bg-white">
                <ItemContagem
                  rotulo="Em recepção"
                  contagem={grupos.contagemRecepcao}
                  cor="#A32D2D"
                />
                <ItemContagem
                  rotulo="Em sala de exames"
                  contagem={grupos.contagemExames}
                  cor="#854F0B"
                />
                <ItemContagem
                  rotulo="Em dilatação"
                  contagem={grupos.contagemDilatacao}
                  cor="#534AB7"
                  ultimo
                />
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-700">
                Próximos a chegar
              </h3>
              {grupos.proximos.length === 0 ? (
                <p className="rounded border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
                  Nada agendado a partir deste momento.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {grupos.proximos.map((card) => (
                    <li
                      key={card.agendamentoId}
                      className="flex items-baseline justify-between px-3 py-2 text-sm"
                    >
                      <span className="truncate text-slate-800">
                        <span className="font-mono text-xs tabular-nums text-slate-500">
                          {card.horarioAgendamento ?? "—"}
                        </span>{" "}
                        {card.paciente.nome}
                      </span>
                      <span className="ml-2 shrink-0 text-[11px] uppercase tracking-wider text-slate-500">
                        {nomeMedicoCurto(card.medico.codigo, card.medico.nome)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </PainelLayout>
  );
}

function ItemContagem({
  rotulo,
  contagem,
  cor,
  ultimo = false,
}: {
  rotulo: string;
  contagem: number;
  cor: string;
  ultimo?: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between px-3 py-2 ${
        !ultimo ? "border-b border-slate-200" : ""
      }`}
    >
      <span className="flex items-center gap-2 text-sm text-slate-800">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: cor }}
        />
        {rotulo}
      </span>
      <span className="text-base font-semibold tabular-nums text-slate-900">
        {contagem}
      </span>
    </li>
  );
}

function EstadoVazio() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-600">
      <p className="text-base">
        Selecione até 2 médicos no botão do canto superior direito.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        A escolha fica salva neste navegador. Cada TV pode ter uma dupla
        diferente.
      </p>
    </div>
  );
}

function Status({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
      <p>{mensagem}</p>
    </div>
  );
}

function filtrar(cards: CardData[], estagio: EstagioPaciente): CardData[] {
  return cards.filter((c) => c.estagio === estagio);
}

function ordenarPorSeveridade(cards: CardData[], agora: Date): CardData[] {
  return [...cards].sort((a, b) => {
    const sa = severidadeCard(a, agora);
    const sb = severidadeCard(b, agora);
    if (sa !== sb) return sb - sa;
    return (a.horarioAgendamento ?? "").localeCompare(b.horarioAgendamento ?? "");
  });
}

function ordenarPorHorario(cards: CardData[]): CardData[] {
  return [...cards].sort((a, b) =>
    (a.horarioAgendamento ?? "").localeCompare(b.horarioAgendamento ?? ""),
  );
}
