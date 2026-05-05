"use client";

/**
 * Card de paciente — versão COMPACTA pós-feedback de uso real.
 *
 * Mudanças em relação à versão "premium" anterior:
 * - Cronômetro saiu da linha inferior dedicada e foi pra mesma linha
 *   do header (etiqueta + tag médico + ícone de tipo). Economiza uma
 *   linha vertical inteira → quase dobra a quantidade de cards visíveis
 *   na tela sem rolagem.
 * - Tamanhos ligeiramente reduzidos pra ganhar densidade sem perder
 *   legibilidade na TV.
 * - Padding interno reduzido (py-3 em vez de py-4).
 *
 * Hierarquia visual mantida:
 * 1. Cronômetro (36 px peso 700 tabular) ainda é o maior elemento.
 * 2. Nome do paciente em destaque (24 px peso 600).
 * 3. Etiqueta + tag médico identificam estágio e responsável.
 * 4. Linha de contexto e complemento ficam discretos.
 */

import Cronometro, { minutosDesdeIso, nivelDoCronometro } from "./Cronometro";
import IconeTipoAgendamento from "./IconeTipoAgendamento";
import TagMedico from "./TagMedico";

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

  // Aura sutil colorida do estágio + sombra base para profundidade.
  const sombra = `0 1px 3px rgba(0,0,0,0.05), 0 6px 18px ${cores.sombra}`;
  const estiloBase = {
    borderLeft: `8px solid ${cores.borda}`,
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
    <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
      {/* Linha 1: identificação + cronômetro juntos para economizar altura */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: cores.borda }}
          >
            {cores.rotulo}
          </p>
          <TagMedico
            codigo={card.medico.codigo}
            nomeCompleto={card.medico.nome}
            tamanho="compacto"
          />
          <IconeTipoAgendamento tipo={card.tipoAgendamento} size={24} />
        </div>
        {card.estagio === "AGENDADO" ? (
          <span className="text-xl font-bold tabular-nums text-slate-700">
            {card.horarioAgendamento ?? "—"}
          </span>
        ) : (
          <Cronometro
            desdeEm={card.estagioDesdeEm}
            className="text-4xl font-bold leading-none"
          />
        )}
      </div>

      {/* Linha 2: nome do paciente (elemento de destaque) */}
      <h3 className="text-2xl font-semibold leading-tight tracking-tight text-slate-900">
        {card.paciente.nome}
        {card.paciente.idade !== null && (
          <span className="ml-2 text-base font-normal text-slate-500">
            · {card.paciente.idade}
          </span>
        )}
      </h3>

      {/* Linha 3: contexto curto */}
      <p className="text-xs text-slate-500">
        {[card.horarioAgendamento, card.convenio]
          .filter((p): p is string => Boolean(p))
          .join(" · ")}
      </p>

      {/* Linha 4 (opcional): complemento em faixa colorida */}
      {card.complemento && card.complemento.trim() !== "" && (
        <div
          className="rounded-md px-2.5 py-1.5 text-sm"
          style={{ backgroundColor: cores.borda, color: "#FFFFFF" }}
        >
          <span className="font-semibold leading-snug line-clamp-2">
            {card.complemento.trim()}
          </span>
        </div>
      )}

      {/* Subestado só aparece se houver — não desperdiça altura quando vazio */}
      {subestado && subestado.length > 0 && (
        <p className="text-[11px] uppercase tracking-widest text-slate-400">
          {subestado}
        </p>
      )}
    </div>
  );
}

/**
 * Helper exportado para reordenar listas. A regra mudou após feedback
 * de uso real: agora ordenamos pelo TEMPO no estágio (mais antigo no
 * topo) em vez de severidade + horário. Quem espera há mais tempo deve
 * ser visto/atendido primeiro.
 *
 * Quem não tem cronômetro (AGENDADO/FALTOU) cai no fim — mas as colunas
 * que mostram esses estágios geralmente usam ordenação por horário.
 */
export function tempoNoEstagioMs(card: CardPacienteData, agora: Date): number {
  if (!card.estagioDesdeEm) return -1;
  const t = Date.parse(card.estagioDesdeEm);
  if (!Number.isFinite(t)) return -1;
  return agora.getTime() - t;
}

/**
 * Mantida apenas para compatibilidade — ainda pode ser útil no futuro
 * para destacar visualmente cards em alerta. Não é mais usada como
 * critério primário de ordenação.
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
