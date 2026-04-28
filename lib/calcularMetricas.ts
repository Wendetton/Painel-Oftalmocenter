/**
 * Cálculo das métricas do dia exibidas no header dos painéis.
 *
 * Funções puras: recebem a lista atual de cards e devolvem números.
 * Importante: trabalham apenas com o que está em memória — sem chamada
 * extra à API. As métricas se atualizam automaticamente a cada polling.
 *
 * Convenção dos timestamps (vinda do ProDoctor):
 * - horaCompareceu: "HH:mm" ou "HH:mm:ss" — quando paciente bateu ponto.
 * - horaAtendido: idem — quando o atendimento terminou.
 *
 * Parsing tolerante: se vier formato inesperado, ignora silenciosamente.
 */

import type { CardPaciente } from "./tipos";

export interface MetricasDia {
  /** Pacientes do dia que já chegaram (compareceu marcado em algum momento). */
  total: number;
  /** Pacientes que já saíram do fluxo com sucesso. */
  atendidos: number;
  /** Pacientes ainda em algum estágio ativo (recepção, exames, dilatação, médico). */
  emAndamento: number;
  /** Tempo médio de permanência (em minutos) dos atendidos hoje, ou null se nenhum atendido ainda. */
  tempoMedioPermanenciaMin: number | null;
}

export function calcularMetricasDia(cards: CardPaciente[]): MetricasDia {
  let total = 0;
  let atendidos = 0;
  let emAndamento = 0;
  let somaPermanenciaMin = 0;
  let amostrasPermanencia = 0;

  for (const card of cards) {
    const compareceu =
      card.flags.compareceu || card.estagio === "ATENDIDO" || card.estagio !== "AGENDADO";

    if (compareceu) total += 1;

    if (card.estagio === "ATENDIDO") {
      atendidos += 1;
      const permanencia = diferencaMinutos(card.horaCompareceu, card.horaAtendido);
      if (permanencia !== null && permanencia >= 0) {
        somaPermanenciaMin += permanencia;
        amostrasPermanencia += 1;
      }
    } else if (
      card.estagio === "RECEPCAO" ||
      card.estagio === "SALA_EXAMES" ||
      card.estagio === "PRONTO_MEDICO" ||
      card.estagio === "DILATACAO"
    ) {
      emAndamento += 1;
    }
  }

  return {
    total,
    atendidos,
    emAndamento,
    tempoMedioPermanenciaMin:
      amostrasPermanencia > 0
        ? Math.round(somaPermanenciaMin / amostrasPermanencia)
        : null,
  };
}

/**
 * Converte "HH:mm" ou "HH:mm:ss" em minutos desde meia-noite.
 * Retorna null se a string for inválida ou ausente.
 */
function horaParaMinutos(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function diferencaMinutos(inicio: string | null, fim: string | null): number | null {
  const a = horaParaMinutos(inicio);
  const b = horaParaMinutos(fim);
  if (a === null || b === null) return null;
  return b - a;
}
