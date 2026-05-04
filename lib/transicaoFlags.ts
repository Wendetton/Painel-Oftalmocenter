/**
 * Mapeamento "estágio destino → flags do ProDoctor".
 *
 * Quando o usuário no modo edição clica "Mover para X", precisamos enviar
 * para o PATCH /api/v1/Agenda/AlterarStatus o conjunto de flags que coloca
 * o agendamento no estágio X. A tabela abaixo é fiel à convenção
 * operacional descrita no PLANEJAMENTO seção 2.2.
 *
 * Importante: enviamos o ESTADO COMPLETO de cada flag relevante (true ou
 * false), não delta. Assim a mutação é determinística — funciona não
 * importa em que estágio o paciente esteja antes. O ProDoctor preserva
 * os timestamps (horaCompareceu, etc.) quando uma flag já tinha sido
 * marcada antes.
 *
 * Notas especiais:
 * - ATENDIDO: só marcamos `atendido = true`, deixamos as outras como estão
 *   (o classificador retorna ATENDIDO independente).
 * - FALTOU: a API do ProDoctor exige que faltou seja exclusivo — todas as
 *   outras flags principais devem ser false. Cuidamos disso aqui.
 */

import type { EstagioPaciente } from "./tipos";

export interface FlagsParaEnviar {
  /** null = não tocar; true/false = setar explicitamente. */
  compareceu?: boolean | null;
  atendimento?: boolean | null;
  atrasado?: boolean | null;
  exameSituacao?: boolean | null;
  atendido?: boolean | null;
  faltou?: boolean | null;
}

/**
 * Estágios para os quais o usuário pode mover um paciente pelo painel.
 * AGENDADO está fora porque "voltar para agendado" significa apagar a
 * marcação de chegada — operação mais delicada, melhor fazer pelo ProDoctor.
 */
export type EstagioDestino =
  | "RECEPCAO"
  | "SALA_EXAMES"
  | "PRONTO_MEDICO"
  | "DILATACAO"
  | "ATENDIDO"
  | "FALTOU";

export const DESTINOS_DISPONIVEIS: EstagioDestino[] = [
  "RECEPCAO",
  "SALA_EXAMES",
  "PRONTO_MEDICO",
  "DILATACAO",
  "ATENDIDO",
  "FALTOU",
];

export function flagsParaDestino(destino: EstagioDestino): FlagsParaEnviar {
  switch (destino) {
    case "RECEPCAO":
      return {
        compareceu: true,
        exameSituacao: false,
        atendimento: false,
        atrasado: false,
        atendido: false,
        faltou: false,
      };
    case "SALA_EXAMES":
      return {
        compareceu: true,
        exameSituacao: true,
        atendimento: false,
        atrasado: false,
        atendido: false,
        faltou: false,
      };
    case "PRONTO_MEDICO":
      return {
        compareceu: true,
        atendimento: true,
        exameSituacao: false,
        atrasado: false,
        atendido: false,
        faltou: false,
      };
    case "DILATACAO":
      return {
        compareceu: true,
        atrasado: true,
        atendimento: false,
        exameSituacao: false,
        atendido: false,
        faltou: false,
      };
    case "ATENDIDO":
      return {
        atendido: true,
        faltou: false,
      };
    case "FALTOU":
      return {
        // Atenção: o ProDoctor recusa faltou=true junto de qualquer outra
        // flag de atividade. Limpamos tudo antes.
        compareceu: false,
        atendimento: false,
        atrasado: false,
        exameSituacao: false,
        atendido: false,
        faltou: true,
      };
  }
}

/**
 * Função auxiliar para validação de input em /api/transicao.
 * Devolve null se a string não corresponder a um EstagioDestino válido.
 */
export function parseDestino(input: unknown): EstagioDestino | null {
  if (typeof input !== "string") return null;
  if (DESTINOS_DISPONIVEIS.includes(input as EstagioDestino)) {
    return input as EstagioDestino;
  }
  return null;
}

/**
 * Lista os destinos disponíveis ao usuário a partir do estágio atual,
 * excluindo o próprio estágio (não faz sentido "mover para onde já está").
 */
export function destinosDisponiveisDe(
  estagioAtual: EstagioPaciente,
): EstagioDestino[] {
  return DESTINOS_DISPONIVEIS.filter((d) => d !== estagioAtual);
}
