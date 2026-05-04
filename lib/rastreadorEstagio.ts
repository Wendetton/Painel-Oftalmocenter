/**
 * Rastreador de transições de estágio.
 *
 * Mantém um Map em memória <agendamentoId, {estagio, desdeEm}> e devolve
 * o instante em que o servidor primeiro viu cada card no estágio atual.
 *
 * Hidratação: a memória pode ser pré-populada a partir do Firestore na
 * primeira chamada após cold start, via hidratarEstados(). Assim o
 * cronômetro do card mostra o tempo "real" desde a transição, mesmo que
 * o servidor tenha acabado de subir e nunca tenha visto aquele paciente.
 *
 * Regras (uniformes para todos os estágios):
 * - Primeira aparição de um agendamentoId → desdeEm = agora.
 *   (O caller pode aproveitar e persistir no Firestore.)
 * - Estágio mudou → desdeEm = agora (cronômetro zera).
 * - Estágio igual ao da chamada anterior → preserva desdeEm.
 *
 * A persistência no Firestore vive em lib/estadoAtualPersistente.ts. O
 * rastreador em si não conhece esse detalhe — é responsabilidade do
 * caller (app/api/painel/route.ts) chamar hidratarEstados na primeira
 * vez e salvarEstadoAtual em cada transição/primeira aparição.
 */

import type { EstadoSalvo } from "./estadoAtualPersistente";
import type { EstagioPaciente } from "./tipos";

interface EntradaRastreador {
  estagio: EstagioPaciente;
  desdeEm: number;
}

export interface ResultadoRastreador {
  /** Timestamp (ms epoch) de quando o servidor primeiro viu o card neste estágio. */
  desdeEm: number;
  /**
   * `true` quando vemos pela primeira vez este agendamentoId nesta
   * instância (pode ter vindo do Firestore via hidratação, ou ser
   * paciente novo do dia). O caller usa para gravar/atualizar o estado
   * no Firestore.
   */
  primeiraAparicao: boolean;
  /**
   * `true` quando observamos uma TRANSIÇÃO real de estágio (o anterior
   * era diferente). O caller usa para gravar evento na coleção
   * `eventosEstagio` (analytics).
   */
  transicaoObservada: boolean;
  /** Estágio anterior, ou null se primeira aparição. */
  estagioAnterior: EstagioPaciente | null;
}

const rastreador = new Map<string, EntradaRastreador>();
let dataDaHidratacao: string | null = null;

/**
 * Pré-popula o rastreador com estados vindos do Firestore. Idempotente:
 * se já está hidratado para a mesma data, ignora. Se chega data nova,
 * limpa estados antigos antes (para não vazar dia anterior).
 */
export function hidratarEstados(
  estados: Map<string, EstadoSalvo>,
  paraData: string,
): void {
  if (dataDaHidratacao !== paraData) {
    rastreador.clear();
    dataDaHidratacao = paraData;
  }
  for (const [id, est] of estados) {
    // Não sobrescreve entradas já em memória — a memória pode ter
    // info mais nova que o Firestore (ex.: transição feita por esta
    // instância nos últimos segundos).
    if (!rastreador.has(id)) {
      rastreador.set(id, { estagio: est.estagio, desdeEm: est.desdeEmMs });
    }
  }
}

/**
 * Diz se o rastreador já foi hidratado para a data informada nesta
 * instância. O /api/painel usa para decidir se precisa carregar do
 * Firestore (lazy load por instância).
 */
export function jaHidratadoPara(data: string): boolean {
  return dataDaHidratacao === data;
}

/**
 * Substitui (sobrescreve) a entrada de um agendamento no rastreador
 * com um valor específico. Usado quando descobrimos via lookup pontual
 * no Firestore que o paciente já tinha desdeEm registrado, mas o Map
 * em memória estava sem essa info.
 */
export function forcarEntrada(
  agendamentoId: string,
  estagio: EstagioPaciente,
  desdeEmMs: number,
): void {
  rastreador.set(agendamentoId, { estagio, desdeEm: desdeEmMs });
}

/**
 * Registra ou atualiza um agendamento. Devolve o instante em que o paciente
 * entrou no estágio atual + flags indicando primeira aparição/transição.
 */
export function registrarEstagio(
  agendamentoId: string,
  estagio: EstagioPaciente,
): ResultadoRastreador {
  const agora = Date.now();
  const entrada = rastreador.get(agendamentoId);

  let desdeEm: number;
  let primeiraAparicao: boolean;
  let transicaoObservada: boolean;
  let estagioAnterior: EstagioPaciente | null;

  if (!entrada) {
    desdeEm = agora;
    primeiraAparicao = true;
    transicaoObservada = false;
    estagioAnterior = null;
  } else if (entrada.estagio !== estagio) {
    desdeEm = agora;
    primeiraAparicao = false;
    transicaoObservada = true;
    estagioAnterior = entrada.estagio;
  } else {
    desdeEm = entrada.desdeEm;
    primeiraAparicao = false;
    transicaoObservada = false;
    estagioAnterior = entrada.estagio;
  }

  rastreador.set(agendamentoId, { estagio, desdeEm });
  return { desdeEm, primeiraAparicao, transicaoObservada, estagioAnterior };
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
