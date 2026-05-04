"use client";

/**
 * Card de paciente conforme PLANEJAMENTO seção 4.2 (Anatomia do card),
 * com os ajustes feitos pós-validação:
 *
 * 1. Barra colorida lateral esquerda (8 px) na cor do estágio.
 * 2. Cabeçalho com etiqueta do estágio à esquerda + ícones de tipo
 *    (consulta/retorno/exame) à direita, ao estilo ProDoctor.
 * 3. Nome do paciente em destaque + idade ao lado.
 * 4. Linha de contexto: horário · médico (apelido) · convênio.
 * 5. Faixa do complemento (quando existe).
 * 6. Linha inferior: subestado à esquerda + cronômetro tabular à direita.
 *
 * O cronômetro reseta ao trocar de estágio porque usa `estagioDesdeEm`,
 * timestamp gerado pelo rastreador no servidor a cada transição.
 *
 * Modo edição (clicavel=true):
 * - Card vira <button>: cursor pointer, hover destacado, mini hint
 *   "mover" no canto. Ao clicar, dispara onClick (parent abre o action
 *   sheet de movimentação).
 * - Modo leitura (clicavel=false, default): card é <article> normal,
 *   sem mudança visual em relação ao comportamento anterior.
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
  /**
   * Quando true, o card vira clicável (cursor pointer + hover destacado)
   * e dispara onClick. Usado pelo modo edição para abrir o action sheet.
   */
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

  if (clicavel) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative flex w-full gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm ring-blue-300 transition hover:shadow-md hover:ring-2 focus:outline-none focus:ring-2"
        style={{ borderLeft: `8px solid ${cores.borda}` }}
        title="Clique para mover este paciente"
      >
        <ConteudoCard card={card} subestado={subestado} cores={cores} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 hidden text-[10px] font-semibold uppercase tracking-wider text-blue-600 group-hover:inline"
        >
          mover →
        </span>
      </button>
    );
  }

  return (
    <article
      className="relative flex gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      style={{ borderLeft: `8px solid ${cores.borda}` }}
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
