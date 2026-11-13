/**
 * Leitura de eventos de transição do Firestore.
 *
 * Para a Fase B (dashboard de análise), consultamos a coleção
 * `eventosEstagio` populada pela Fase A. O filtro principal é o período
 * em `data` (string YYYY-MM-DD, que ordena bem alfabeticamente).
 *
 * Decisão de design: não filtramos por médico/convênio aqui. Isso evita
 * precisar criar índices compostos no Firestore (que pedem ação manual
 * no Console). Filtros secundários são aplicados client-side em cima dos
 * eventos do período. Para nosso volume (até ~1500 eventos em 30 dias),
 * isso é instantâneo e mais flexível.
 */

import { Timestamp } from "firebase-admin/firestore";

import { carregarChegadasHistoricas } from "./chegadasHistoricas";
import { dataYYYYMMDDBrasil } from "./configuracao";
import { obterFirestore } from "./firebase";
import type { EstagioPaciente } from "./tipos";

/**
 * Evento como o dashboard recebe. De propósito NÃO inclui nome nem código
 * do paciente: o dashboard só mostra números agregados, então dado
 * pessoal não precisa sair do servidor (e a resposta fica menor).
 */
export interface EventoBruto {
  id: string;
  agendamentoId: string;
  medicoCodigo: number | null;
  medicoNome: string;
  convenio: string | null;
  estagioAnterior: EstagioPaciente | null;
  estagioNovo: EstagioPaciente;
  /** Unix epoch em milissegundos. */
  momentoMs: number;
  /** "YYYY-MM-DD" no fuso de São Paulo. */
  data: string;
  /**
   * Instante real da chegada segundo o ProDoctor (epoch ms). null nos
   * eventos gravados antes de o painel passar a registrar a chegada.
   */
  chegadaMs: number | null;
  tipoConsulta: boolean;
  tipoRetorno: boolean;
  tipoExame: boolean;
}

/** Teto de eventos por consulta (cada evento lido conta na cota do Firestore). */
export const LIMITE_EVENTOS = 10_000;

export interface EventosPeriodo {
  eventos: EventoBruto[];
  /** true = o período tem mais eventos que o teto; o resultado está incompleto. */
  truncado: boolean;
}

function paraMs(valor: unknown): number | null {
  if (valor instanceof Timestamp) return valor.toMillis();
  if (typeof valor === "object" && valor !== null && "seconds" in valor) {
    const s = (valor as { seconds: unknown }).seconds;
    if (typeof s === "number" && Number.isFinite(s)) return s * 1000;
  }
  return null;
}

export async function buscarEventosPeriodo(
  dataInicio: string,
  dataFim: string,
): Promise<EventosPeriodo> {
  const fs = obterFirestore();
  if (!fs) {
    throw new Error(
      "Firestore não disponível. Configure FIREBASE_SERVICE_ACCOUNT no Vercel.",
    );
  }

  // Query enxuta: filtramos por data (range) e ordenamos por data. Não
  // adicionamos orderBy("momento") aqui de propósito — isso exigiria um
  // índice composto manual no Firestore Console, que dá trabalho pra
  // configurar. A ordenação fina por momento dentro de cada agendamento
  // acontece no cliente em reconstruirTrajetorias() (já estava lá),
  // então o resultado final dos agregadores fica idêntico.
  const snap = await fs
    .collection("eventosEstagio")
    .where("data", ">=", dataInicio)
    .where("data", "<=", dataFim)
    .orderBy("data", "asc")
    .limit(LIMITE_EVENTOS)
    .get();

  const eventos = snap.docs
    .map((doc) => {
      const dados = doc.data();
      const momentoMs = paraMs(dados.momento);
      if (momentoMs === null) return null;

      return {
        id: doc.id,
        agendamentoId: String(dados.agendamentoId ?? ""),
        medicoCodigo:
          typeof dados.medicoCodigo === "number" ? dados.medicoCodigo : null,
        medicoNome: String(dados.medicoNome ?? "—"),
        convenio:
          typeof dados.convenio === "string" && dados.convenio.length > 0
            ? dados.convenio
            : null,
        estagioAnterior:
          typeof dados.estagioAnterior === "string"
            ? (dados.estagioAnterior as EstagioPaciente)
            : null,
        estagioNovo: dados.estagioNovo as EstagioPaciente,
        momentoMs,
        data: String(dados.data ?? ""),
        chegadaMs: paraMs(dados.chegada),
        tipoConsulta: Boolean(dados.tipoConsulta),
        tipoRetorno: Boolean(dados.tipoRetorno),
        tipoExame: Boolean(dados.tipoExame),
      } satisfies EventoBruto;
    })
    .filter((e): e is EventoBruto => e !== null);

  // Eventos antigos não trazem a hora de chegada. Se ela já foi
  // recuperada do ProDoctor (lib/chegadasHistoricas), junta aqui. Só
  // consulta quando há evento sem chegada — período todo novo não lê nada.
  if (eventos.some((e) => e.chegadaMs === null)) {
    const chegadas = await carregarChegadasHistoricas(dataInicio, dataFim);
    if (chegadas.size > 0) {
      for (const e of eventos) {
        if (e.chegadaMs === null) {
          e.chegadaMs = chegadas.get(e.agendamentoId) ?? null;
        }
      }
    }
  }

  return { eventos, truncado: snap.size >= LIMITE_EVENTOS };
}

// ─── Cache em memória ────────────────────────────────────────────────────────
//
// Cada evento lido conta na cota diária do Firestore (a mesma que mantém
// os cronômetros das TVs), e uma consulta de 30 dias lê alguns milhares.
// Sem cache, trocar de filtro e voltar repetia a leitura inteira.
//
// - Período que inclui hoje: 1 minuto (os dados ainda estão mudando).
// - Período só de dias passados: 10 minutos.

const TTL_COM_HOJE_MS = 60_000;
const TTL_PASSADO_MS = 10 * 60_000;
const MAX_ENTRADAS = 12;

const cache = new Map<string, { expiraEm: number; dados: EventosPeriodo }>();
const emAndamento = new Map<string, Promise<EventosPeriodo>>();

export async function buscarEventosComCache(
  dataInicio: string,
  dataFim: string,
): Promise<EventosPeriodo> {
  const chave = `${dataInicio}|${dataFim}`;

  const guardado = cache.get(chave);
  if (guardado && guardado.expiraEm > Date.now()) return guardado.dados;

  // Duas abas pedindo o mesmo período ao mesmo tempo compartilham a leitura.
  const pendente = emAndamento.get(chave);
  if (pendente) return pendente;

  const promessa = buscarEventosPeriodo(dataInicio, dataFim)
    .then((dados) => {
      const incluiHoje = dataFim >= dataYYYYMMDDBrasil();
      cache.set(chave, {
        dados,
        expiraEm: Date.now() + (incluiHoje ? TTL_COM_HOJE_MS : TTL_PASSADO_MS),
      });
      if (cache.size > MAX_ENTRADAS) {
        const maisAntiga = cache.keys().next().value;
        if (maisAntiga !== undefined) cache.delete(maisAntiga);
      }
      return dados;
    })
    .finally(() => {
      emAndamento.delete(chave);
    });

  emAndamento.set(chave, promessa);
  return promessa;
}

/** Esvazia o cache (ex.: logo após recuperar chegadas do histórico). */
export function limparCacheEventos(): void {
  cache.clear();
}
