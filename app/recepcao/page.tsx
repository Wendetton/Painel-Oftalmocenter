"use client";

/**
 * Painel da Recepção — Fase 3 (visual completo).
 *
 * Layout (PLANEJAMENTO seção 4.4):
 *   3 colunas:
 *     1. Em recepção (vermelho) — pacientes em compareceu puro
 *     2. Em dilatação (roxo) — compartilhada com Sala de Exames
 *     3. Próximos a chegar (cinza, sem cronômetro) — agendamentos do dia
 *
 * Header com título + métricas do dia + seletor de médicos.
 * Rodapé fixo com status da conexão e contagem regressiva.
 *
 * Cards reordenados em cada coluna por severidade (cards em alerta no topo)
 * e, no caso de empate, por horário.
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

const ESTAGIOS_BEEP_RECEPCAO: EstagioPaciente[] = ["RECEPCAO", "DILATACAO"];

export default function RecepcaoPage() {
  const { codigos, hidratado, alternar, noLimite } = useMedicosSelecionados();
  const { cards, atualizadoEm, fonteOnline, ultimoErro, carregandoInicial } =
    usePainel(codigos);
  const { ligado: beepLigado, alternar: alternarBeep } = usePreferenciaBeep();
  const edicao = useModoEdicao();
  const { mover } = useMoverPaciente(edicao.pin);
  const [cardSelecionado, setCardSelecionado] = useState<CardData | null>(null);

  useBeepEntradaEstagio({
    cards,
    estagiosAlvo: ESTAGIOS_BEEP_RECEPCAO,
    habilitado: beepLigado,
  });

  // Re-render leve a cada 5s para que a ordenação por severidade reaja
  // mesmo quando o painel não recebeu novo dado (cards podem migrar de
  // amarelo para vermelho só pelo tempo passando).
  const [tickOrdenacao, setTickOrdenacao] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTickOrdenacao((v) => v + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const colunas = useMemo(() => {
    const agora = new Date();
    const recepcao = filtrarPorEstagio(cards, "RECEPCAO");
    const dilatacao = filtrarPorEstagio(cards, "DILATACAO");
    const proximos = filtrarPorEstagio(cards, "AGENDADO");
    return {
      recepcao: ordenarPorSeveridade(recepcao, agora),
      dilatacao: ordenarPorSeveridade(dilatacao, agora),
      proximos: ordenarPorHorario(proximos),
    };
    // tickOrdenacao força reavaliação periódica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, tickOrdenacao]);

  const metricas = useMemo(() => calcularMetricasDia(cards), [cards]);

  return (
    <PainelLayout
      titulo="Recepção"
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
      edicaoLigada={edicao.ligado}
      edicaoConfiguradaNoServidor={edicao.configuradoNoServidor}
      onDestravarEdicao={edicao.destravar}
      onTravarEdicao={edicao.travar}
    >
      {!hidratado ? (
        <CarregandoInicial mensagem="Carregando preferências…" />
      ) : codigos.length === 0 ? (
        <EstadoVazio />
      ) : carregandoInicial ? (
        <CarregandoInicial mensagem="Buscando agendamentos do dia…" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Coluna
            titulo="Em recepção"
            cards={colunas.recepcao}
            mensagemVazio="Ninguém em recepção agora."
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
            titulo="Próximos a chegar"
            cards={colunas.proximos}
            mensagemVazio="Nada agendado a partir deste momento."
            destacarHorario
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
  destacarHorario = false,
  modoEdicao = false,
  onClickCard,
}: {
  titulo: string;
  cards: CardData[];
  mensagemVazio: string;
  destacarHorario?: boolean;
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
              subestado={destacarHorario ? null : null}
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
      <p className="text-base">Selecione até 2 médicos no topo para começar.</p>
      <p className="mt-2 text-xs text-slate-500">
        A escolha fica salva neste navegador. Cada TV pode ter uma dupla
        diferente.
      </p>
    </div>
  );
}

function CarregandoInicial({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
      <p>{mensagem}</p>
    </div>
  );
}

function filtrarPorEstagio(
  cards: CardData[],
  estagio: EstagioPaciente,
): CardData[] {
  return cards.filter((c) => c.estagio === estagio);
}

function ordenarPorSeveridade(cards: CardData[], agora: Date): CardData[] {
  // Severidade DESC (alertas no topo); empate por horário ASC.
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
