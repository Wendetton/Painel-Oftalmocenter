/**
 * Hora de chegada dos pacientes em dias ANTIGOS.
 *
 * Os eventos gravados antes de o painel passar a registrar a chegada não
 * têm essa informação, mas o ProDoctor guarda a `horaCompareceu` de cada
 * agendamento. Aqui buscamos essa hora uma única vez e guardamos no
 * Firestore (coleção `chegadasDia`, 1 documento por dia). O dashboard
 * junta essas chegadas aos eventos antigos na leitura — os eventos em si
 * não são alterados.
 *
 * Consumo, de propósito mínimo:
 * - ProDoctor: 1 chamada por bloco de até 7 dias AINDA NÃO recuperados
 *   (30 dias = 5 chamadas, uma vez na vida). Dia já recuperado não gera
 *   chamada. Só roda quando alguém aperta o botão no dashboard (com PIN).
 * - Firestore: 1 gravação por dia recuperado; 1 leitura por dia do
 *   período ao abrir o dashboard, e só enquanto houver eventos antigos.
 */

import { idDoAgendamento } from "./agendamentoId";
import { comTimeout } from "./comTimeout";
import { dataYYYYMMDDBrasil } from "./configuracao";
import { obterFirestore } from "./firebase";
import { instanteNoDia } from "./horaChegada";
import { buscarAgendaDoPeriodo } from "./prodoctor-client";

const COLECAO = "chegadasDia";

/** Dias por chamada à ProDoctor. */
const DIAS_POR_BLOCO = 7;

/** Teto de dias por pedido de recuperação. */
export const MAX_DIAS_RECUPERACAO = 62;

/** Pausa entre chamadas seguidas à ProDoctor (respeito ao limite/min). */
const PAUSA_ENTRE_CHAMADAS_MS = 1500;

interface ChegadaGuardada {
  id: string;
  ms: number;
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (formato da ProDoctor). */
function paraDataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** "DD/MM/YYYY" → "YYYY-MM-DD"; null se o formato for outro. */
function paraDataISO(br: string | null): string | null {
  const m = br?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function diasDoPeriodo(dataInicio: string, dataFim: string): string[] {
  const inicio = Date.parse(`${dataInicio}T12:00:00Z`);
  const fim = Date.parse(`${dataFim}T12:00:00Z`);
  const dias: string[] = [];
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return dias;
  for (let t = inicio; t <= fim; t += 86_400_000) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

/**
 * Chegadas recuperadas do período: agendamentoId → instante (epoch ms).
 * Falhas devolvem mapa vazio — o dashboard segue sem elas.
 */
export async function carregarChegadasHistoricas(
  dataInicio: string,
  dataFim: string,
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const fs = obterFirestore();
  if (!fs) return mapa;

  try {
    const snap = await comTimeout(
      fs
        .collection(COLECAO)
        .where("data", ">=", dataInicio)
        .where("data", "<=", dataFim)
        .get(),
      8000,
      "carregarChegadasHistoricas",
    );
    for (const doc of snap.docs) {
      const lista: unknown = doc.data().chegadas;
      if (!Array.isArray(lista)) continue;
      for (const item of lista as Partial<ChegadaGuardada>[]) {
        if (typeof item?.id === "string" && typeof item.ms === "number") {
          mapa.set(item.id, item.ms);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[firebase] erro ao carregar chegadas históricas:", err);
  }
  return mapa;
}

export interface ResultadoRecuperacao {
  /** Dias do período que ainda não tinham sido recuperados. */
  diasProcessados: number;
  /** Agendamentos com hora de chegada encontrada na ProDoctor. */
  chegadasEncontradas: number;
  /** Chamadas feitas à API da ProDoctor neste pedido. */
  chamadasProDoctor: number;
}

/**
 * Busca na ProDoctor a hora de chegada dos dias do período que ainda não
 * foram recuperados e guarda no Firestore. Lança erro se a ProDoctor ou o
 * Firestore falharem (o chamador mostra a mensagem).
 */
export async function recuperarChegadas(
  dataInicio: string,
  dataFim: string,
): Promise<ResultadoRecuperacao> {
  const fs = obterFirestore();
  if (!fs) throw new Error("Firestore não disponível.");

  const hoje = dataYYYYMMDDBrasil();
  const dias = diasDoPeriodo(dataInicio, dataFim).filter((d) => d <= hoje);
  if (dias.length === 0 || dias.length > MAX_DIAS_RECUPERACAO) {
    throw new Error(
      `Escolha um período de até ${MAX_DIAS_RECUPERACAO} dias para recuperar.`,
    );
  }

  // Dias já recuperados não geram chamada nova. O dia de hoje sempre é
  // refeito (ainda pode estar recebendo pacientes).
  const jaFeitos = new Set<string>();
  const snap = await comTimeout(
    fs
      .collection(COLECAO)
      .where("data", ">=", dias[0])
      .where("data", "<=", dias[dias.length - 1])
      .select("data")
      .get(),
    8000,
    "recuperarChegadas:consulta",
  );
  for (const doc of snap.docs) {
    if (doc.id !== hoje) jaFeitos.add(doc.id);
  }

  const pendentes = dias.filter((d) => !jaFeitos.has(d));
  const resultado: ResultadoRecuperacao = {
    diasProcessados: pendentes.length,
    chegadasEncontradas: 0,
    chamadasProDoctor: 0,
  };

  for (let i = 0; i < pendentes.length; i += DIAS_POR_BLOCO) {
    const bloco = pendentes.slice(i, i + DIAS_POR_BLOCO);
    const primeiro = bloco[0];
    const ultimo = bloco[bloco.length - 1];
    if (!primeiro || !ultimo) continue;

    if (resultado.chamadasProDoctor > 0) {
      await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CHAMADAS_MS));
    }
    const agendamentos = await buscarAgendaDoPeriodo(
      paraDataBR(primeiro),
      paraDataBR(ultimo),
    );
    resultado.chamadasProDoctor += 1;

    const porDia = new Map<string, ChegadaGuardada[]>();
    for (const dia of bloco) porDia.set(dia, []);

    for (const ag of agendamentos) {
      const dia = paraDataISO(ag.data);
      if (!dia) continue;
      const lista = porDia.get(dia);
      if (!lista) continue; // dia fora do bloco (ou já recuperado)
      const ms = instanteNoDia(dia, ag.estadoAgendaConsulta?.horaCompareceu);
      if (ms === null) continue;
      lista.push({ id: idDoAgendamento(ag), ms });
    }

    const lote = fs.batch();
    for (const [dia, chegadas] of porDia) {
      lote.set(fs.collection(COLECAO).doc(dia), {
        data: dia,
        chegadas,
        atualizadoEm: new Date(),
      });
      resultado.chegadasEncontradas += chegadas.length;
    }
    await comTimeout(lote.commit(), 10_000, "recuperarChegadas:gravacao");
  }

  return resultado;
}
