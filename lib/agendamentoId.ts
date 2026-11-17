/**
 * Identificador único de um agendamento no painel:
 *   médico - data (DD/MM/YYYY) - hora - paciente
 *
 * É a chave dos documentos em `estadoAtual`, o campo `agendamentoId` dos
 * eventos e a chave das chegadas recuperadas do histórico. Vive num lugar
 * só para que os três nunca divirjam.
 */

import type { AgendamentoProDoctor } from "./tipos";

export function idDoAgendamento(ag: AgendamentoProDoctor): string {
  return `${ag.usuario?.codigo ?? "x"}-${ag.data ?? "x"}-${ag.hora ?? "x"}-${ag.paciente?.codigo ?? "x"}`;
}
