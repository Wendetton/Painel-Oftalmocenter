"use client";

/**
 * Coluna de cards usada nos 3 painéis.
 *
 * Header da coluna ganhou identidade visual: barra superior colorida
 * + fundo translúcido na cor do estágio + título com bolinha. De longe,
 * já dá pra reconhecer qual coluna é qual sem ler o texto.
 *
 * Quando vazia, mostra mensagem leve em texto cinza dentro de um
 * container tracejado.
 */

import CardPaciente from "./CardPaciente";

import { CORES_POR_ESTAGIO } from "@/lib/cores";
import type { CardPaciente as CardData, EstagioPaciente } from "@/lib/tipos";

interface Props {
  /** Texto que aparece no topo da coluna (ex.: "Em recepção"). */
  titulo: string;
  /** Estágio que essa coluna representa — define a cor do header. */
  estagioCor: EstagioPaciente;
  cards: CardData[];
  mensagemVazio: string;
  /** Modo edição liga? Se sim, cards viram clicáveis. */
  modoEdicao?: boolean;
  /** Handler quando usuário clica num card (para abrir o action sheet). */
  onClickCard?: (card: CardData) => void;
}

export default function ColunaCards({
  titulo,
  estagioCor,
  cards,
  mensagemVazio,
  modoEdicao = false,
  onClickCard,
}: Props) {
  const cores = CORES_POR_ESTAGIO[estagioCor];

  return (
    <section className="flex flex-col gap-3">
      <header
        className="flex items-center justify-between rounded-t-xl border-t-4 px-4 py-3"
        style={{
          borderTopColor: cores.borda,
          backgroundColor: cores.bg,
        }}
      >
        <h2
          className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]"
          style={{ color: cores.texto }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: cores.borda }}
          />
          {titulo}
        </h2>
        <span
          className="text-base font-bold tabular-nums"
          style={{ color: cores.texto }}
        >
          {cards.length}
        </span>
      </header>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-slate-500">
          {mensagemVazio}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
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
