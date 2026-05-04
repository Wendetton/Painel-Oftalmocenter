/**
 * Gravação de eventos de transição de estágio no Firestore (Fase A do
 * planejamento de analytics — espelho de eventos).
 *
 * Cada vez que o servidor observa um paciente saindo do estágio X e
 * entrando no estágio Y, gravamos um documento na coleção `eventosEstagio`.
 * A partir desses eventos podemos calcular tempos por estágio, médias por
 * convênio/médico/dia, etc., sem depender da memória do servidor.
 *
 * Decisões importantes:
 *
 * 1. Fail-safe: se o Firestore estiver fora ou as credenciais ausentes,
 *    apenas logamos o erro — o painel não quebra. Continuamos polando o
 *    ProDoctor normalmente; só perdemos o registro daquela transição.
 *
 * 2. Fire and forget: o handler do /api/painel não espera o write
 *    terminar. Se o Firestore estiver lento, não atrasa a resposta da
 *    API (que tem deadline implícito do polling de 5s).
 *
 * 3. Sem evento na "primeira aparição": quando o servidor reinicia (cold
 *    start no Vercel) o rastreador esquece o estado anterior e veria todos
 *    os pacientes "pela primeira vez". Para evitar duplicatas, só
 *    gravamos eventos quando o rastreador detecta TRANSIÇÃO real (o
 *    estágio anterior é diferente). Trade-off: perdemos a entrada
 *    inicial no estágio em que o paciente já estava no momento do cold
 *    start. Aceitável — cold start de manhã (clínica vazia) é o cenário
 *    comum, com perda zero.
 *
 * 4. Schema desnormalizado: gravamos nome do médico, nome do convênio,
 *    etc. junto de cada evento. Dashboards futuros não precisam fazer
 *    "join" — query simples já entrega tudo. Custa mais espaço mas é
 *    irrelevante no nosso volume (~30-50 eventos/dia × 365 dias = ~15k
 *    eventos/ano, muito abaixo dos 1 GB do plano grátis).
 */

import { FieldValue } from "firebase-admin/firestore";

import { obterFirestore } from "./firebase";
import type { EstagioPaciente } from "./tipos";

export interface EventoTransicaoEstagio {
  agendamentoId: string;
  pacienteCodigo: number | null;
  pacienteNome: string;
  medicoCodigo: number | null;
  medicoNome: string;
  convenio: string | null;
  estagioAnterior: EstagioPaciente | null;
  estagioNovo: EstagioPaciente;
  /** Momento da transição (server time). */
  momento: Date;
  /** "YYYY-MM-DD" no fuso de São Paulo, para queries por dia. */
  data: string;
  tipoConsulta: boolean;
  tipoRetorno: boolean;
  tipoExame: boolean;
}

/**
 * Grava o evento no Firestore. Não joga erro — falhas são logadas e
 * a função simplesmente não retorna nada útil. Chamar com `void` para
 * não esperar.
 */
export async function gravarEventoTransicao(
  evento: EventoTransicaoEstagio,
): Promise<void> {
  const fs = obterFirestore();
  if (!fs) return;

  try {
    // O Firestore aceita Date diretamente — converte para Timestamp internamente.
    // Adicionamos `criadoEm` (server timestamp) para auditar exatamente quando
    // o write chegou, separado do `momento` lógico da transição.
    await fs.collection("eventosEstagio").add({
      ...evento,
      criadoEm: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[firebase] Falha ao gravar evento de transição:", err);
  }
}
