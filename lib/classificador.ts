/**
 * Classificador de estágio do paciente.
 *
 * Aplica a tabela mestre da seção 2.3 do PLANEJAMENTO.md para mapear cada
 * combinação de checkboxes do ProDoctor para um único estágio do fluxo da
 * Oftalmocenter. Função pura — sem efeitos colaterais, sem dependência de
 * histórico ou tempo.
 *
 * REGRAS (em ordem de precedência — primeira que casa, ganha):
 *
 *   1. atendido        → ATENDIDO        (paciente já saiu do fluxo)
 *   2. faltou          → FALTOU
 *   3. compareceu+atrasado → DILATAÇÃO   (atrasado = "está dilatando", segundo
 *                                          a convenção operacional da equipe)
 *   4. compareceu+atendimento → PRONTO_MEDICO
 *   5. compareceu+exameSituacao → SALA_EXAMES
 *   6. compareceu (sozinho) → RECEPCAO
 *   7. nenhuma flag    → AGENDADO
 *
 * IMPORTANTE: a flag `atrasado` é semanticamente reaproveitada pela equipe
 * para indicar "paciente em dilatação" (ver seção 2.2 do PLANEJAMENTO.md).
 * O nome `atrasado` é herança do ProDoctor; aqui significa "dilatação".
 */

import type { EstadoAgendaConsulta, EstagioPaciente } from "./tipos";

export function classificarEstagio(
  estado: EstadoAgendaConsulta | null,
): EstagioPaciente {
  if (!estado) {
    return "AGENDADO";
  }

  if (estado.atendido) {
    return "ATENDIDO";
  }

  if (estado.faltou) {
    return "FALTOU";
  }

  if (estado.compareceu && estado.atrasado) {
    return "DILATACAO";
  }

  if (estado.compareceu && estado.atendimento) {
    return "PRONTO_MEDICO";
  }

  if (estado.compareceu && estado.exameSituacao) {
    return "SALA_EXAMES";
  }

  if (estado.compareceu) {
    return "RECEPCAO";
  }

  return "AGENDADO";
}
