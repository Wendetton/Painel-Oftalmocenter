/**
 * Registro de mudanças de estágio no Firestore: estado atual do
 * agendamento (cronômetro das TVs) + evento de histórico (dashboard).
 *
 * As duas gravações acontecem numa ÚNICA transação, e é o Firestore — não
 * a memória de cada instância do servidor — que decide se houve mudança:
 *
 *   - doc `estadoAtual/{agendamentoId}` já está no estágio informado
 *     → nada é gravado (outra instância já registrou esta mudança).
 *   - doc não existe ou está em outro estágio
 *     → atualiza o estado atual E cria UM evento em `eventosEstagio`.
 *
 * Por que assim: o Vercel roda várias instâncias, cada uma com a sua
 * memória. Antes, cada instância que notava a mudança gravava o seu
 * próprio evento — 1 em cada 5 eventos era duplicata, e as "passagens" de
 * poucos segundos entre duplicatas puxavam para baixo os tempos médios do
 * dashboard. Com a transação, cada mudança real vira exatamente um evento.
 *
 * O que entra no evento além do que já existia:
 *   - Chegada: a primeira vez que o agendamento aparece gera um evento
 *     com `estagioAnterior: null`. Antes a chegada não era gravada e o
 *     tempo de recepção simplesmente não existia no histórico.
 *   - `chegada`: instante real em que a recepção marcou o comparecimento
 *     no ProDoctor (vem da agenda; não custa chamada extra).
 *   - `horaAgendada`: horário marcado, para medir pontualidade no futuro.
 *   - `anteriorDesdeEm`: quando o paciente entrou no estágio que está
 *     deixando — a duração do estágio fica auto-contida no evento.
 *
 * Custo no Firestore: 1 leitura + até 2 gravações por mudança real de
 * estágio (igual a antes). Nenhuma chamada à API do ProDoctor.
 *
 * Fail-safe: falhas são logadas e devolvem null — o painel nunca quebra
 * por causa do histórico.
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { comTimeout } from "./comTimeout";
import { obterFirestore } from "./firebase";
import type { EstagioPaciente } from "./tipos";

export interface MudancaEstagio {
  agendamentoId: string;
  estagio: EstagioPaciente;
  /** Instante em que o painel detectou o paciente neste estágio. */
  detectadoEm: Date;
  /**
   * Estágio anterior segundo a memória da instância. Só é usado quando o
   * Firestore não tem registro do agendamento (ex.: gravação anterior
   * falhou); havendo registro, vale o do Firestore.
   */
  estagioAnteriorMemoria: EstagioPaciente | null;
  /** "YYYY-MM-DD" no fuso de São Paulo, para consultas por período. */
  data: string;
  /** Instante real da chegada segundo o ProDoctor; null se desconhecido. */
  chegada: Date | null;
  /** Horário marcado do agendamento ("HH:mm"). */
  horaAgendada: string | null;
  pacienteCodigo: number | null;
  pacienteNome: string;
  medicoCodigo: number | null;
  medicoNome: string;
  convenio: string | null;
  tipoConsulta: boolean;
  tipoRetorno: boolean;
  tipoExame: boolean;
}

export interface ResultadoMudanca {
  /** false = o Firestore já estava neste estágio; nada foi gravado. */
  gravou: boolean;
  /** Instante canônico de entrada no estágio (para o cronômetro). */
  desdeEmMs: number;
}

function paraMs(valor: unknown): number | null {
  if (valor instanceof Timestamp) return valor.toMillis();
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === "object" && valor !== null && "seconds" in valor) {
    const s = (valor as { seconds: unknown }).seconds;
    if (typeof s === "number" && Number.isFinite(s)) return s * 1000;
  }
  return null;
}

export async function registrarMudancaEstagio(
  m: MudancaEstagio,
): Promise<ResultadoMudanca | null> {
  const fs = obterFirestore();
  if (!fs) return null;

  const refEstado = fs.collection("estadoAtual").doc(m.agendamentoId);
  const detectadoMs = m.detectadoEm.getTime();

  const tentar = (): Promise<ResultadoMudanca> =>
    comTimeout(
      fs.runTransaction(async (tx): Promise<ResultadoMudanca> => {
        const snap = await tx.get(refEstado);

        let anterior: EstagioPaciente | null = m.estagioAnteriorMemoria;
        let anteriorDesdeMs: number | null = null;

        if (snap.exists) {
          const d = snap.data();
          if (d?.estagio === m.estagio) {
            // Outra instância já registrou esta mudança. Não grava nada;
            // devolve o instante canônico para o cronômetro.
            return {
              gravou: false,
              desdeEmMs: paraMs(d.desdeEm) ?? detectadoMs,
            };
          }
          if (typeof d?.estagio === "string") {
            anterior = d.estagio as EstagioPaciente;
            anteriorDesdeMs = paraMs(d.desdeEm);
          }
        }

        // Chegada na recepção: o momento do evento é a hora real marcada
        // no ProDoctor, não a hora em que o painel percebeu. Nos demais
        // casos, vale o instante da detecção.
        const momento =
          anterior === null && m.estagio === "RECEPCAO" && m.chegada
            ? m.chegada
            : m.detectadoEm;

        tx.set(refEstado, {
          estagio: m.estagio,
          desdeEm: m.detectadoEm,
          data: m.data,
          atualizadoEm: new Date(),
        });

        tx.create(fs.collection("eventosEstagio").doc(), {
          agendamentoId: m.agendamentoId,
          pacienteCodigo: m.pacienteCodigo,
          pacienteNome: m.pacienteNome,
          medicoCodigo: m.medicoCodigo,
          medicoNome: m.medicoNome,
          convenio: m.convenio,
          estagioAnterior: anterior,
          estagioNovo: m.estagio,
          momento,
          data: m.data,
          chegada: m.chegada,
          horaAgendada: m.horaAgendada,
          anteriorDesdeEm:
            anteriorDesdeMs !== null ? new Date(anteriorDesdeMs) : null,
          tipoConsulta: m.tipoConsulta,
          tipoRetorno: m.tipoRetorno,
          tipoExame: m.tipoExame,
          criadoEm: FieldValue.serverTimestamp(),
        });

        return { gravou: true, desdeEmMs: detectadoMs };
      }),
      8000,
      "registrarMudancaEstagio",
    );

  // A transação é idempotente (se a 1ª tentativa gravou e só a resposta se
  // perdeu, a 2ª encontra o estágio já registrado e não duplica), então
  // repetir uma vez é seguro e evita perder o evento numa oscilação.
  try {
    return await tentar();
  } catch {
    try {
      return await tentar();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[firebase] Falha ao registrar mudança de estágio de ${m.agendamentoId}:`,
        err,
      );
      return null;
    }
  }
}
