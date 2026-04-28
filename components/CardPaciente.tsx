"use client";

/**
 * Card de paciente conforme PLANEJAMENTO seção 4.2 (Anatomia do card),
 * com os ajustes solicitados pelo Fernando após a Fase 3:
 *
 * 1. Barra colorida lateral esquerda (8 px) na cor do estágio.
 * 2. Cabeçalho com etiqueta do estágio à esquerda + ícones de tipo
 *    (consulta/retorno/exame) à direita, ao estilo ProDoctor.
 * 3. Nome do paciente em destaque + idade ao lado.
 * 4. Linha de contexto: horário · médico · convênio.
 * 5. Faixa do complemento (quando existe).
 * 6. Linha inferior: subestado à esquerda + cronômetro tabular à direita.
 *
 * O cronômetro reseta ao trocar de estágio porque usa `estagioDesdeEm`,
 * timestamp gerado pelo rastreador no servidor a cada transição.
 *
 * Princípio 3: tempo é a métrica visual primária — o cronômetro é o
 * elemento maior da linha inferior. Nome é segundo. Convênio é terciário.
 */

import Cronometro, { minutosDesdeIso, nivelDoCronometro } from "./Cronometro";
import IconeTipoAgendamento from "./IconeTipoAgendamento";

import { nomeMedicoCurto } from "@/lib/configuracao";
import { CORES_POR_ESTAGIO } from "@/lib/cores";
import type { CardPaciente as CardPacienteData, EstagioPaciente } from "@/lib/tipos";

interface Props {
  card: CardPacienteData;
  /** Subtexto opcional (ex.: "veio dos exames", para Fase 4 do Consultório). */
  subestado?: string | null;
}

export default function CardPaciente({ card, subestado = null }: Props) {
  const cores = CORES_POR_ESTAGIO[card.estagio];

  return (
    <article
      className="relative flex gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      style={{ borderLeft: `8px solid ${cores.borda}` }}
    >
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: cores.borda }}
          >
            {cores.rotulo}
          </p>
          <IconeTipoAgendamento tipo={card.tipoAgendamento} size={22} />
        </div>

        <h3 className="text-xl font-medium leading-tight text-slate-900">
          {card.paciente.nome}
          {card.paciente.idade !== null && (
            <span className="ml-2 text-base font-normal text-slate-500">
              · {card.paciente.idade}
            </span>
          )}
        </h3>

        <p className="text-xs text-slate-500">
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
            className="mt-1 flex items-start gap-2 rounded px-2 py-1.5 text-sm"
            style={{ backgroundColor: cores.bg, color: cores.texto }}
          >
            <span
              className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: cores.borda }}
              aria-hidden="true"
            />
            <span className="font-medium leading-snug line-clamp-2">
              {card.complemento.trim()}
            </span>
          </div>
        )}

        <div className="mt-1 flex items-end justify-between gap-2">
          <span className="text-xs text-slate-500">{subestado ?? ""}</span>
          {card.estagio === "AGENDADO" ? (
            <span className="text-base font-semibold text-slate-700 tabular-nums">
              {card.horarioAgendamento ?? "—"}
            </span>
          ) : (
            <Cronometro desdeEm={card.estagioDesdeEm} className="text-2xl" />
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Helper exportado para reordenar listas: cards em alerta no topo.
 * Usa o cronômetro do estágio atual (estagioDesdeEm) e o classifica em
 * 4 níveis. AGENDADO/FALTOU não têm cronômetro → severidade -1.
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
