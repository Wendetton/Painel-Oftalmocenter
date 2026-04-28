/**
 * Rastreador de transições de estágio.
 *
 * Mantém um Map em memória <agendamentoId, {estagio, desdeEm}> e devolve
 * o instante em que o servidor primeiro viu cada card no estágio atual.
 *
 * Regras (simples e uniformes para todos os estágios):
 * - Primeira aparição de um agendamentoId → desdeEm = agora.
 * - Estágio mudou → desdeEm = agora (cronômetro zera).
 * - Estágio igual ao da chamada anterior → preserva desdeEm.
 *
 * Limitação aceita: serverless cold starts perdem o Map. Quando isso
 * acontece, todos os cronômetros voltam a 00:00 — comportamento idêntico
 * ao caso de "nova chegada". Como o Vercel mantém a instância quente
 * enquanto há tráfego (polling de 10s das TVs), na prática isso só
 * ocorre depois de horas sem uso (madrugada), quando o impacto é nulo.
 *
 * Decisão de design: NÃO tentamos restaurar tempos perdidos a partir dos
 * timestamps da API ProDoctor (horaCompareceu, horaAtendimento). Eles são
 * "primeira marcação" e não acompanham toggles — usá-los como fallback
 * causa erros sutis para pacientes que voltam de dilatação ao consultório.
 */

import type { EstagioPaciente } from "./tipos";

interface EntradaRastreador {
  estagio: EstagioPaciente;
  desdeEm: number;
}

const rastreador = new Map<string, EntradaRastreador>();

/**
 * Registra ou atualiza um agendamento. Devolve o timestamp (ms) de quando
 * o paciente entrou no estágio atual segundo o ponto de vista do servidor.
 */
export function registrarEstagio(
  agendamentoId: string,
  estagio: EstagioPaciente,
): number {
  const agora = Date.now();
  const entrada = rastreador.get(agendamentoId);

  const desdeEm =
    !entrada || entrada.estagio !== estagio ? agora : entrada.desdeEm;

  rastreador.set(agendamentoId, { estagio, desdeEm });
  return desdeEm;
}

/**
 * Remove do rastreador entradas que não estão mais na agenda do dia.
 * Evita acumular estado de dias passados em instâncias serverless de
 * vida longa. Chamar ao final de cada ciclo de polling.
 */
export function limparAusentes(idsAtivos: ReadonlySet<string>): void {
  for (const id of rastreador.keys()) {
    if (!idsAtivos.has(id)) {
      rastreador.delete(id);
    }
  }
}
