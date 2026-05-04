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

export interface EventoBruto {
  id: string;
  agendamentoId: string;
  pacienteCodigo: number | null;
  pacienteNome: string;
  medicoCodigo: number | null;
  medicoNome: string;
  convenio: string | null;
  estagioAnterior: EstagioPaciente | null;
  estagioNovo: EstagioPaciente;
  /** Unix epoch em milissegundos. */
  momentoMs: number;
  /** "YYYY-MM-DD" no fuso de São Paulo. */
  data: string;
  tipoConsulta: boolean;
  tipoRetorno: boolean;
  tipoExame: boolean;
}

export async function buscarEventosPeriodo(
  dataInicio: string,
  dataFim: string,
): Promise<EventoBruto[]> {
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
    .limit(10_000)
    .get();

  return snap.docs
    .map((doc) => {
      const dados = doc.data();
      const momento = dados.momento;
      const momentoMs =
        momento instanceof Timestamp
          ? momento.toMillis()
          : typeof momento === "object" && momento !== null && "seconds" in momento
            ? (momento as { seconds: number }).seconds * 1000
            : Number.NaN;

      if (!Number.isFinite(momentoMs)) return null;

      return {
        id: doc.id,
        agendamentoId: String(dados.agendamentoId ?? ""),
        pacienteCodigo:
          typeof dados.pacienteCodigo === "number" ? dados.pacienteCodigo : null,
        pacienteNome: String(dados.pacienteNome ?? "(sem nome)"),
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
        tipoConsulta: Boolean(dados.tipoConsulta),
        tipoRetorno: Boolean(dados.tipoRetorno),
        tipoExame: Boolean(dados.tipoExame),
      } satisfies EventoBruto;
    })
    .filter((e): e is EventoBruto => e !== null);
}
