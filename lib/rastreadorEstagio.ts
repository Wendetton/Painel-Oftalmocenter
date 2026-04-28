/**
 * Rastreador de transições de estágio.
 *
 * Por que existe: a API ProDoctor só nos dá 3 timestamps (horaCompareceu,
 * horaAtendimento, horaAtendido). Não temos `horaExame` nem `horaDilatacao`.
 * Para que o cronômetro do card "zere" sempre que o paciente troca de
 * estágio (regra operacional pedida pelo Fernando), o servidor precisa
 * rastrear ele mesmo as transições.
 *
 * Como funciona: a cada chamada de /api/painel, comparamos o estágio
 * atual de cada agendamento com o que sabíamos antes:
 * - Primeira aparição → usa um timestamp inicial (das horas que a API dá)
 *   ou a hora atual como fallback.
 * - Estágio mudou → reseta para "agora".
 * - Estágio igual → preserva o timestamp anterior.
 *
 * Limitação conhecida: serverless cold starts perdem o Map (instância nova
 * começa vazia). Mitigação: para estágios cujo timestamp a API entrega
 * com precisão (RECEPÇÃO via horaCompareceu, PRONTO_MÉDICO via
 * horaAtendimento), usamos esses como fallback. Para SALA_EXAMES e
 * DILATAÇÃO, fallback é "agora" — a inexatidão dura no máximo um cold
 * start e se autocorrige na próxima transição.
 */

import type { EstagioPaciente } from "./tipos";

interface EntradaRastreador {
  estagio: EstagioPaciente;
  desdeEm: number;
}

const rastreador = new Map<string, EntradaRastreador>();

/**
 * Registra ou atualiza um agendamento no rastreador. Devolve o timestamp
 * (em milissegundos) de quando o paciente entrou no estágio atual.
 *
 * @param fallbackTimestampMs Timestamp a usar quando o agendamento aparece
 *   pela primeira vez no rastreador. Idealmente o horário "real" do início
 *   do estágio (ex.: horaCompareceu para RECEPÇÃO). Quando não há, passar
 *   `null` que assumimos "agora".
 */
export function registrarEstagio(
  agendamentoId: string,
  estagio: EstagioPaciente,
  fallbackTimestampMs: number | null,
): number {
  const agora = Date.now();
  const entrada = rastreador.get(agendamentoId);

  let desdeEm: number;
  if (!entrada) {
    desdeEm = fallbackTimestampMs ?? agora;
  } else if (entrada.estagio !== estagio) {
    desdeEm = agora;
  } else {
    desdeEm = entrada.desdeEm;
  }

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

/**
 * Converte uma string "HH:mm" ou "HH:mm:ss" em timestamp milissegundos
 * usando a data de hoje no fuso de São Paulo. Útil para gerar o
 * fallback de horaCompareceu/horaAtendimento.
 */
export function horaSPParaTimestampMs(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] ?? "0");
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;

  const fmtData = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const partes = fmtData.formatToParts(new Date());
  const dia = partes.find((p) => p.type === "day")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  const ano = partes.find((p) => p.type === "year")?.value;
  if (!dia || !mes || !ano) return null;

  const iso = `${ano}-${mes}-${dia}T${pad2(hh)}:${pad2(mm)}:${pad2(ss)}-03:00`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : null;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
