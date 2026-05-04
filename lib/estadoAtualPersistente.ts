/**
 * Persistência do estado atual de cada agendamento no Firestore.
 *
 * Antes desta camada, o "instante em que o paciente entrou no estágio"
 * vivia só em memória do servidor Vercel — ou seja, quando o serverless
 * reiniciava (cold start) ou escalava, todo cronômetro voltava ao zero.
 * Pior: TVs diferentes podiam acabar conversando com instâncias
 * diferentes e ver cronômetros divergentes.
 *
 * Estratégia desta camada:
 * - Coleção `estadoAtual` no Firestore. Chave do doc = agendamentoId.
 * - Cada doc guarda { estagio, desdeEm, data, atualizadoEm }.
 * - Na primeira chamada de /api/painel após cold start, lemos todos os
 *   docs do dia (≤ ~50) e hidratamos o rastreador em memória.
 * - Toda primeira aparição ou transição é gravada no Firestore.
 * - Chamadas seguintes na mesma instância usam memória (já hidratada),
 *   sem ler do Firestore de novo.
 *
 * Custo (free tier do Firestore: 50k reads e 20k writes por dia):
 * - Reads: ~50 docs por cold start. Vercel cold start é raro durante
 *   uso ativo; ~10-20 cold starts/dia = ~1k reads/dia.
 * - Writes: ~5 transições por paciente × 50 pacientes = ~250 writes/dia.
 * Cobertura confortável.
 */

import { Timestamp } from "firebase-admin/firestore";

import { obterFirestore } from "./firebase";
import type { EstagioPaciente } from "./tipos";

export interface EstadoSalvo {
  estagio: EstagioPaciente;
  desdeEmMs: number;
}

/**
 * Carrega todos os estados atuais para uma data específica
 * (YYYY-MM-DD em SP). Devolve Map vazio em caso de erro — o painel
 * continua funcionando, só sem hidratação inicial.
 */
export async function carregarEstadosDoDia(
  data: string,
): Promise<Map<string, EstadoSalvo>> {
  const fs = obterFirestore();
  if (!fs) return new Map();

  try {
    const snap = await fs
      .collection("estadoAtual")
      .where("data", "==", data)
      .limit(5_000)
      .get();

    const map = new Map<string, EstadoSalvo>();
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

      map.set(doc.id, {
        estagio: d.estagio as EstagioPaciente,
        desdeEmMs: ms,
      });
    }
    return map;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[firebase] erro ao carregar estadoAtual:", err);
    return new Map();
  }
}

/**
 * Persiste o estado atual de um agendamento. Fire-and-forget — se falhar,
 * só logamos e o painel continua funcionando (próxima transição vai
 * tentar de novo).
 */
export async function salvarEstadoAtual(
  agendamentoId: string,
  estagio: EstagioPaciente,
  desdeEm: Date,
  data: string,
): Promise<void> {
  const fs = obterFirestore();
  if (!fs) return;

  try {
    await fs
      .collection("estadoAtual")
      .doc(agendamentoId)
      .set(
        {
          estagio,
          desdeEm,
          data,
          atualizadoEm: new Date(),
        },
        { merge: false },
      );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[firebase] erro ao salvar estadoAtual:", err);
  }
}
