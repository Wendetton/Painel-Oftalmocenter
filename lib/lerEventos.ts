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

  return { eventos, truncado: snap.size >= LIMITE_EVENTOS };
}
