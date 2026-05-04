"use client";

/**
 * Painel da Sala de Exames (PLANEJAMENTO seção 4.5).
 *
 * 3 colunas:
 *   1. Em exames (amarelo) — pacientes em SALA_EXAMES.
 *   2. Em dilatação (roxo) — compartilhada com Recepção.
 *   3. Aguardando vir (cinza/recepção) — pacientes em RECEPÇÃO que em
 *      breve serão liberados pra sala.
 *
 * Métrica central: "Examinados" (passaram pela sala hoje).
 */

import { useEffect, useMemo, useState } from "react";

import AcaoMoverCard from "@/components/AcaoMoverCard";
import { severidadeCard } from "@/components/CardPaciente";
import ColunaCards from "@/components/ColunaCards";
import PainelLayout from "@/components/PainelLayout";
import { useBeepEntradaEstagio } from "@/hooks/useBeepEntradaEstagio";
import { useMedicosSelecionados } from "@/hooks/useMedicosSelecionados";
import { useModoEdicao } from "@/hooks/useModoEdicao";
import { useMoverPaciente } from "@/hooks/useMoverPaciente";
import { usePainel } from "@/hooks/usePainel";
import { usePreferenciaBeep } from "@/hooks/usePreferenciaBeep";
import { calcularMetricasDia } from "@/lib/calcularMetricas";
import type { CardPaciente as CardData, EstagioPaciente } from "@/lib/tipos";

const ESTAGIOS_BEEP_EXAMES: EstagioPaciente[] = ["SALA_EXAMES", "DILATACAO"];

export default function ExamesPage() {
  const { codigos, hidratado, alternar, noLimite } = useMedicosSelecionados();
  const { cards, atualizadoEm, fonteOnline, ultimoErro, carregandoInicial } =
    usePainel(codigos);
  const { ligado: beepLigado, alternar: alternarBeep } = usePreferenciaBeep();
  const edicao = useModoEdicao();
  const { mover } = useMoverPaciente(edicao.pin);
  const [cardSelecionado, setCardSelecionado] = useState<CardData | null>(null);

  useBeepEntradaEstagio({
    cards,
    estagiosAlvo: ESTAGIOS_BEEP_EXAMES,
    habilitado: beepLigado,
  });

  const [tickOrdenacao, setTickOrdenacao] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTickOrdenacao((v) => v + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const colunas = useMemo(() => {
    const agora = new Date();
    return {
      exames: ordenarPorSeveridade(filtrar(cards, "SALA_EXAMES"), agora),
      dilatacao: ordenarPorSeveridade(filtrar(cards, "DILATACAO"), agora),
      aguardando: ordenarPorHorario(filtrar(cards, "RECEPCAO")),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, tickOrdenacao]);

  const metricas = useMemo(() => calcularMetricasDia(cards), [cards]);

  return (
    <PainelLayout
      titulo="Sala de exames"
      subtitulo="Painel ao vivo · Oftalmocenter"
      metricas={metricas}
      metricaCentral={{ rotulo: "Examinados", valor: metricas.examinados }}
      selecionados={codigos}
      onAlternar={alternar}
      noLimite={noLimite}
      fonteOnline={fonteOnline}
      ultimoErro={ultimoErro}
      atualizadoEm={atualizadoEm}
      beepLigado={beepLigado}
      onAlternarBeep={alternarBeep}
      edicaoLigada={edicao.ligado}
      edicaoConfiguradaNoServidor={edicao.configuradoNoServidor}
      onDestravarEdicao={edicao.destravar}
      onTravarEdicao={edicao.travar}
    >
      {!hidratado ? (
        <Status mensagem="Carregando preferências…" />
      ) : codigos.length === 0 ? (
        <EstadoVazio />
      ) : carregandoInicial ? (
        <Status mensagem="Buscando agendamentos do dia…" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <ColunaCards
            titulo="Em exames"
            estagioCor="SALA_EXAMES"
            cards={colunas.exames}
            mensagemVazio="Nenhum paciente na sala de exames."
            modoEdicao={edicao.ligado}
            onClickCard={setCardSelecionado}
          />
          <ColunaCards
            titulo="Em dilatação"
            estagioCor="DILATACAO"
            cards={colunas.dilatacao}
            mensagemVazio="Ninguém dilatando agora."
            modoEdicao={edicao.ligado}
            onClickCard={setCardSelecionado}
          />
          <ColunaCards
            titulo="Aguardando vir"
            estagioCor="RECEPCAO"
            cards={colunas.aguardando}
            mensagemVazio="Recepção está vazia."
            modoEdicao={edicao.ligado}
            onClickCard={setCardSelecionado}
          />
        </div>
      )}

      {cardSelecionado && (
        <AcaoMoverCard
          card={cardSelecionado}
          onFechar={() => setCardSelecionado(null)}
          onMover={async (destino) => {
            if (!cardSelecionado.chaveAgendamento) {
              return { ok: false, mensagem: "Sem dados do agendamento." };
            }
            return mover(cardSelecionado.chaveAgendamento, destino);
          }}
        />
      )}
    </PainelLayout>
  );
}

function EstadoVazio() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center text-slate-600 shadow-sm">
      <p className="text-lg font-medium">
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
    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
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
