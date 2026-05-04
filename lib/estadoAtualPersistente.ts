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
 * Idempotência: a gravação usa transação. Se já existe doc com o MESMO
 * estagio, mantém o desdeEm antigo. Se não existe ou estagio mudou,
 * grava o novo. Isso evita race conditions entre múltiplas instâncias
 * serverless competindo para "primeiro" gravar — quem chegar primeiro
 * vira a fonte de verdade.
 *
 * Custo (free tier do Firestore: 50k reads e 20k writes/dia):
 * - Reads: ~50 por cold start + ~1 por write idempotente.
 * - Writes: ~5 transições por paciente × ~50 pacientes = ~250/dia.
 * Cobertura confortável.
 */

import { Timestamp } from "firebase-admin/firestore";

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
    const snap = await fs
      .collection("estadoAtual")
      .doc(agendamentoId)
      .get();

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
    const snap = await fs
      .collection("estadoAtual")
      .where("data", "==", data)
      .limit(5_000)
      .get();

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

/**
 * Persiste o estado atual de um agendamento de forma IDEMPOTENTE:
 * - Se já existe doc com o MESMO estagio para este agendamentoId:
 *   NÃO sobrescreve. Mantém o desdeEm antigo (= primeira gravação ganha).
 * - Se não existe ou tem outro estagio: grava o novo.
 *
 * Isso resolve a race condition entre múltiplas instâncias serverless
 * tentando gravar "primeira aparição" do mesmo paciente — só uma vence,
 * as outras leem o que ela gravou.
 *
 * Fire-and-forget: falhas são logadas, não jogadas pra cima.
 */
export async function salvarEstadoAtual(
  agendamentoId: string,
  estagio: EstagioPaciente,
  desdeEm: Date,
  data: string,
): Promise<void> {
  const fs = obterFirestore();
  if (!fs) return;

  const ref = fs.collection("estadoAtual").doc(agendamentoId);

  try {
    await fs.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const d = snap.data();
        if (d?.estagio === estagio) {
          // Já existe doc para este estágio — mantém o desdeEm antigo.
          // Atualiza só `atualizadoEm` para auditoria (last seen).
          tx.update(ref, { atualizadoEm: new Date() });
          return;
        }
        // Estágio diferente: o paciente fez transição entre o último save
        // e agora. Sobrescreve com o novo estagio + desdeEm.
      }
      // Novo doc OU transição real: grava normalmente.
      tx.set(ref, { estagio, desdeEm, data, atualizadoEm: new Date() });
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[firebase] erro ao salvar estadoAtual:", err);
  }
}
