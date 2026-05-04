"use client";

/**
 * Painel da Sala de Exames — Fase 4 (PLANEJAMENTO seção 4.5).
 *
 * Layout: 3 colunas verticais
 *   1. Em exames (amarelo) — pacientes em SALA_EXAMES.
 *   2. Em dilatação (roxo, compartilhada com Recepção) — pacientes em
 *      DILATAÇÃO. A equipe de exames também precisa enxergar quem está
 *      dilatando para chamar de volta na hora certa.
 *   3. Aguardando vir (cinza) — pacientes em RECEPÇÃO. Estão na ficha mas
 *      em breve vão entrar na sala de exames; útil pra equipe se preparar.
 *
 * Métrica central: "Examinados" (quem já passou pela sala hoje).
 *
 * Reusa os componentes da Fase 3: PainelLayout, CardPaciente, hooks.
 */

import { useEffect, useMemo, useState } from "react";

import AcaoMoverCard from "@/components/AcaoMoverCard";
import CardPaciente, { severidadeCard } from "@/components/CardPaciente";
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

  // Tick para reordenação periódica por severidade do cronômetro.
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
        <div className="grid gap-5 lg:grid-cols-3">
          <Coluna
            titulo="Em exames"
            cards={colunas.exames}
            mensagemVazio="Nenhum paciente na sala de exames."
            modoEdicao={edicao.ligado}
            onClickCard={setCardSelecionado}
          />
          <Coluna
            titulo="Em dilatação"
            cards={colunas.dilatacao}
            mensagemVazio="Ninguém dilatando agora."
            modoEdicao={edicao.ligado}
            onClickCard={setCardSelecionado}
          />
          <Coluna
            titulo="Aguardando vir"
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

function Coluna({
  titulo,
  cards,
  mensagemVazio,
  modoEdicao = false,
  onClickCard,
}: {
  titulo: string;
  cards: CardData[];
  mensagemVazio: string;
  modoEdicao?: boolean;
  onClickCard?: (card: CardData) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between border-b border-slate-200 pb-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
          {titulo}
        </h2>
        <span className="text-xs text-slate-500">{cards.length}</span>
      </header>

      {cards.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
          {mensagemVazio}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <CardPaciente
              key={card.agendamentoId}
              card={card}
              clicavel={modoEdicao}
              onClick={modoEdicao ? () => onClickCard?.(card) : undefined}
            />
          ))}
        </div>
      )}
    </section>
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
