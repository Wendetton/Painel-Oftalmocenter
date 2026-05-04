"use client";

/**
 * Card de paciente — refinamento visual "premium claro" com tipografia
 * dimensionada para TV (visualizada de 2-4 m).
 *
 * Hierarquia visual decidida em conversa com Fernando:
 * 1. Cronômetro DOMINANTE (48 px peso 700, tabular). É o primeiro
 *    elemento que o olho captura.
 * 2. Nome do paciente em destaque (30 px peso 600).
 * 3. Idade ao lado em peso normal (18 px).
 * 4. Etiqueta do estágio + ícone de tipo de agendamento (32 px) no topo.
 * 5. Linha de contexto (horário · médico · convênio) discreta.
 * 6. Faixa do complemento (quando há) sólida na cor do estágio.
 *
 * Aura sutil ao redor do card na cor do estágio (box-shadow rgba) deixa
 * o painel "respirando" sem virar ruído visual.
 */

import Cronometro, { minutosDesdeIso, nivelDoCronometro } from "./Cronometro";
import IconeTipoAgendamento from "./IconeTipoAgendamento";

import { nomeMedicoCurto } from "@/lib/configuracao";
import { CORES_POR_ESTAGIO, type CoresEstagio } from "@/lib/cores";
import type { CardPaciente as CardPacienteData, EstagioPaciente } from "@/lib/tipos";

interface Props {
  card: CardPacienteData;
  /** Subtexto opcional (ex.: "veio dos exames"). */
  subestado?: string | null;
  /** Quando true, o card vira clicável (modo edição). */
  clicavel?: boolean;
  onClick?: () => void;
}

export default function CardPaciente({
  card,
  subestado = null,
  clicavel = false,
  onClick,
}: Props) {
  const cores = CORES_POR_ESTAGIO[card.estagio];

  // Sombra colorida do estágio (aura sutil) + sombra base para profundidade.
  const sombra = `0 1px 3px rgba(0,0,0,0.05), 0 8px 24px ${cores.sombra}`;
  const estiloBase = {
    borderLeft: `10px solid ${cores.borda}`,
    boxShadow: sombra,
  } as const;

  if (clicavel) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative flex w-full gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white text-left ring-blue-300 transition hover:-translate-y-0.5 hover:ring-2 focus:outline-none focus:ring-2"
        style={estiloBase}
        title="Clique para mover este paciente"
      >
        <ConteudoCard card={card} subestado={subestado} cores={cores} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-4 hidden text-xs font-bold uppercase tracking-widest text-blue-600 group-hover:inline"
        >
          mover →
        </span>
      </button>
    );
  }

  return (
    <article
      className="relative flex gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white"
      style={estiloBase}
    >
      <ConteudoCard card={card} subestado={subestado} cores={cores} />
    </article>
  );
}

function ConteudoCard({
  card,
  subestado,
  cores,
}: {
  card: CardPacienteData;
  subestado: string | null;
  cores: CoresEstagio;
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-xs font-bold uppercase tracking-[0.18em]"
          style={{ color: cores.borda }}
        >
          {cores.rotulo}
        </p>
        <IconeTipoAgendamento tipo={card.tipoAgendamento} size={32} />
      </div>

      <h3 className="text-3xl font-semibold leading-tight tracking-tight text-slate-900">
        {card.paciente.nome}
        {card.paciente.idade !== null && (
          <span className="ml-2 text-lg font-normal text-slate-500">
            · {card.paciente.idade}
          </span>
        )}
      </h3>

      <p className="text-sm text-slate-500">
        {[
          card.horarioAgendamento,
          nomeMedicoCurto(card.medico.codigo, card.medico.nome),
          card.convenio,
        ]
          .filter((p): p is string => Boolean(p))
          .join(" · ")}
      </p>

      {card.complemento && card.complemento.trim() !== "" && (
        <div
          className="mt-1 flex items-start gap-2 rounded-lg px-3 py-2 text-base"
          style={{ backgroundColor: cores.borda, color: "#FFFFFF" }}
        >
          <span className="font-semibold leading-snug line-clamp-2">
            {card.complemento.trim()}
          </span>
        </div>
      )}

      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-xs uppercase tracking-widest text-slate-400">
          {subestado ?? ""}
        </span>
        {card.estagio === "AGENDADO" ? (
          <span className="text-2xl font-bold tabular-nums text-slate-700">
            {card.horarioAgendamento ?? "—"}
          </span>
        ) : (
          <Cronometro desdeEm={card.estagioDesdeEm} className="text-5xl font-bold" />
        )}
      </div>
    </div>
  );
}

/**
 * Helper exportado para reordenar listas: cards em alerta no topo.
 * AGENDADO/FALTOU não têm cronômetro → severidade -1.
 */
export function severidadeCard(card: CardPacienteData, agora: Date): number {
  if (card.estagio === "AGENDADO" || card.estagio === "FALTOU") return -1;
  const min = minutosDesdeIso(card.estagioDesdeEm, agora.getTime());
  const nivel = nivelDoCronometro(min);
  switch (nivel) {
    case "critico":
      return 3;
    case "alerta":
      return 2;
    case "atencao":
      return 1;
    default:
      return 0;
  }
}

export const ESTAGIO_LABEL: Record<EstagioPaciente, string> = {
  RECEPCAO: "Em recepção",
  SALA_EXAMES: "Em sala de exames",
  PRONTO_MEDICO: "Pronto para médico",
  DILATACAO: "Em dilatação",
  ATENDIDO: "Atendido",
  AGENDADO: "Próximo a chegar",
  FALTOU: "Faltou",
};
