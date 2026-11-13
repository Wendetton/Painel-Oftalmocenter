/**
 * Persistência do estado atual de cada agendamento no Firestore.
 *
 * Antes desta camada, o "instante em que o paciente entrou no estágio"
 * vivia só em memória do servidor Vercel — quando o serverless reiniciava
 * (cold start) ou escalava, todo cronômetro voltava ao zero. Pior: TVs
 * diferentes podiam acabar conversando com instâncias diferentes e ver
 * cronômetros divergentes.
 *
 * Estratégia:
 * - Coleção `estadoAtual` no Firestore. Chave do doc = agendamentoId.
 *   Conteúdo: { estagio, desdeEm, data, atualizadoEm }.
 * - Na primeira chamada de /api/painel após cold start, lemos os docs
 *   do dia (≤ ~50) e hidratamos o rastreador em memória.
 * - Toda primeira aparição/transição é gravada no Firestore.
 *
 * Este arquivo cuida só da LEITURA. A gravação vive em
 * lib/eventoEstagio.ts (registrarMudancaEstagio), que atualiza o estado
 * atual e cria o evento de histórico na mesma transação — quem chegar
 * primeiro vira a fonte de verdade, e as demais instâncias não duplicam.
 *
 * Custo (free tier do Firestore: 50k reads e 20k writes/dia):
 * - Reads: ~50 por cold start + ~1 por write idempotente.
 * - Writes: ~5 transições por paciente × ~50 pacientes = ~250/dia.
 * Cobertura confortável.
 */

import { Timestamp } from "firebase-admin/firestore";

import { comTimeout } from "./comTimeout";
import { obterFirestore } from "./firebase";
import type { EstagioPaciente } from "./tipos";

export interface EstadoSalvo {
  estagio: EstagioPaciente;
  desdeEmMs: number;
}

export type ResultadoCarga =
  | { ok: true; estados: Map<string, EstadoSalvo> }
  | { ok: false; erro: string };

/**
 * Consulta o estado atual de UM agendamento específico no Firestore.
 *
 * Usado como camada de defesa quando o rastreador em memória detecta
 * "primeira aparição" — antes de assumir que é mesmo novo, perguntamos
 * ao Firestore se já existe doc para este agendamentoId. Se existir,
 * usamos o timestamp salvo (= cronômetro consistente entre instâncias).
 *
 * Falhas devolvem null silenciosamente — caller assume primeira aparição
 * de verdade e segue o fluxo normal.
 */
export async function consultarEstadoAtual(
  agendamentoId: string,
): Promise<EstadoSalvo | null> {
  const fs = obterFirestore();
  if (!fs) return null;

  try {
    // Timeout de 6s: esta é a ÚNICA leitura do Firestore no caminho
    // crítico do /api/painel (await na detecção de primeira aparição).
    // É aqui que um canal travado congelava o quadro inteiro. Se estourar,
    // o catch devolve null e o chamador assume primeira aparição (segue
    // o fluxo normal, cronômetro em memória).
    const snap = await comTimeout(
      fs.collection("estadoAtual").doc(agendamentoId).get(),
      6000,
      "consultarEstadoAtual",
    );

    if (!snap.exists) return null;
    const d = snap.data();
    if (!d) return null;

    const desdeEm = d.desdeEm;
    const ms =
      desdeEm instanceof Timestamp
        ? desdeEm.toMillis()
        : typeof desdeEm === "object" &&
            desdeEm !== null &&
            "seconds" in desdeEm
          ? (desdeEm as { seconds: number }).seconds * 1000
          : Number.NaN;

    if (typeof d.estagio !== "string") return null;
    if (!Number.isFinite(ms)) return null;

    return {
      estagio: d.estagio as EstagioPaciente,
      desdeEmMs: ms,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[firebase] erro ao consultar estadoAtual de ${agendamentoId}:`,
      err,
    );
    return null;
  }
}

/**
 * Carrega todos os estados atuais para uma data específica
 * (YYYY-MM-DD em SP).
 *
 * Importante: distinguimos "Firestore desabilitado/falhou" de "Firestore
 * disse que não há docs hoje". O caller usa essa distinção para decidir
 * se marca o rastreador como hidratado (só marca se ok=true).
 */
export async function carregarEstadosDoDia(
  data: string,
): Promise<ResultadoCarga> {
  const fs = obterFirestore();
  if (!fs) {
    return {
      ok: false,
      erro: "Firestore não disponível (FIREBASE_SERVICE_ACCOUNT ausente?)",
    };
  }

  try {
    // Timeout de 8s (um pouco mais de folga que o get individual — é uma
    // query do dia inteiro, roda só no cold start). Se estourar, o catch
    // devolve ok:false e o painel opera em memória pura até a próxima
    // tentativa de hidratação.
    const snap = await comTimeout(
      fs
        .collection("estadoAtual")
        .where("data", "==", data)
        .limit(5_000)
        .get(),
      8000,
      "carregarEstadosDoDia",
    );

    const estados = new Map<string, EstadoSalvo>();
    for (const doc of snap.docs) {
      const d = doc.data();
      const desdeEm = d.desdeEm;
      const ms =
        desdeEm instanceof Timestamp
          ? desdeEm.toMillis()
          : typeof desdeEm === "object" &&
              desdeEm !== null &&
              "seconds" in desdeEm
            ? (desdeEm as { seconds: number }).seconds * 1000
            : Number.NaN;

      if (typeof d.estagio !== "string") continue;
      if (!Number.isFinite(ms)) continue;

      estados.set(doc.id, {
        estagio: d.estagio as EstagioPaciente,
        desdeEmMs: ms,
      });
    }
    return { ok: true, estados };
  } catch (err) {
    const erro = err instanceof Error ? err.message : "Erro desconhecido";
    // eslint-disable-next-line no-console
    console.error("[firebase] erro ao carregar estadoAtual:", erro);
    return { ok: false, erro };
  }
}
