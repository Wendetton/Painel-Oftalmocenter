/**
 * Agregações puras a partir dos eventos brutos do Firestore.
 *
 * Funções sem efeitos colaterais — recebem array de eventos, devolvem
 * estatísticas. Toda a lógica de "tempo no estágio", médias por convênio,
 * etc., vive aqui. O componente do dashboard só decide qual número
 * mostrar.
 *
 * Conceito chave — "trajetória do paciente":
 *   Os eventos são "estado mudou de X para Y às H". Para calcular tempo
 *   por estágio, agrupamos eventos pelo agendamentoId, ordenamos por
 *   momento, e cada par consecutivo vira "ficou no estágio X por Δ minutos".
 */

import type { EventoBruto } from "./lerEventos";
import type { EstagioPaciente } from "./tipos";

export interface Estadia {
  estagio: EstagioPaciente;
  entrouEm: number;
  /** null = ainda no estágio (ou último estado conhecido sem evento posterior). */
  saiuEm: number | null;
  durMin: number | null;
}

export interface TrajetoriaPaciente {
  agendamentoId: string;
  pacienteNome: string;
  medicoCodigo: number | null;
  medicoNome: string;
  convenio: string | null;
  data: string;
  estadias: Estadia[];
  tipoConsulta: boolean;
  tipoRetorno: boolean;
  tipoExame: boolean;
}

/**
 * Reconstrói a trajetória de cada paciente a partir dos eventos.
 * Eventos vazios ou sem agendamentoId são ignorados.
 */
export function reconstruirTrajetorias(
  eventos: EventoBruto[],
): TrajetoriaPaciente[] {
  const grupos = new Map<string, EventoBruto[]>();
  for (const ev of eventos) {
    if (!ev.agendamentoId) continue;
    const lista = grupos.get(ev.agendamentoId) ?? [];
    lista.push(ev);
    grupos.set(ev.agendamentoId, lista);
  }

  const trajetorias: TrajetoriaPaciente[] = [];
  for (const [agendamentoId, lista] of grupos) {
    lista.sort((a, b) => a.momentoMs - b.momentoMs);

    const primeiro = lista[0];
    if (!primeiro) continue;

    const estadias: Estadia[] = [];
    for (let i = 0; i < lista.length; i += 1) {
      const ev = lista[i];
      if (!ev) continue;
      const proximo = lista[i + 1] ?? null;
      const saiuEm = proximo?.momentoMs ?? null;
      const durMin = saiuEm !== null ? (saiuEm - ev.momentoMs) / 60_000 : null;
      estadias.push({
        estagio: ev.estagioNovo,
        entrouEm: ev.momentoMs,
        saiuEm,
        durMin,
      });
    }

    trajetorias.push({
      agendamentoId,
      pacienteNome: primeiro.pacienteNome,
      medicoCodigo: primeiro.medicoCodigo,
      medicoNome: primeiro.medicoNome,
      convenio: primeiro.convenio,
      data: primeiro.data,
      estadias,
      tipoConsulta: primeiro.tipoConsulta,
      tipoRetorno: primeiro.tipoRetorno,
      tipoExame: primeiro.tipoExame,
    });
  }

  return trajetorias;
}

// ─── Métricas globais ────────────────────────────────────────────────────────

export interface ResumoGeral {
  pacientesTotais: number;
  pacientesAtendidos: number;
  tempoMedioTotalMin: number | null;
  tempoMedioRecepcaoMin: number | null;
  tempoMedioExamesMin: number | null;
  tempoMedioConsultorioMin: number | null;
  tempoMedioDilatacaoMin: number | null;
}

export function calcularResumo(trajetorias: TrajetoriaPaciente[]): ResumoGeral {
  let totalEndToEndMin = 0;
  let countEndToEnd = 0;
  let pacientesAtendidos = 0;

  const estagiosSoma = new Map<EstagioPaciente, number>();
  const estagiosCont = new Map<EstagioPaciente, number>();

  for (const t of trajetorias) {
    if (t.estadias.some((e) => e.estagio === "ATENDIDO")) {
      pacientesAtendidos += 1;
    }

    // Tempo total na clínica: do primeiro evento ao último com saída ou
    // ATENDIDO. Só conta para pacientes que chegaram ao ATENDIDO.
    if (t.estadias.length > 0) {
      const ultimo = t.estadias[t.estadias.length - 1];
      const primeiro = t.estadias[0];
      if (
        ultimo &&
        primeiro &&
        ultimo.estagio === "ATENDIDO" &&
        primeiro.entrouEm !== ultimo.entrouEm
      ) {
        totalEndToEndMin += (ultimo.entrouEm - primeiro.entrouEm) / 60_000;
        countEndToEnd += 1;
      }
    }

    // Tempo por estágio: soma das estadias com duração conhecida.
    for (const e of t.estadias) {
      if (e.durMin === null || e.durMin <= 0) continue;
      estagiosSoma.set(e.estagio, (estagiosSoma.get(e.estagio) ?? 0) + e.durMin);
      estagiosCont.set(e.estagio, (estagiosCont.get(e.estagio) ?? 0) + 1);
    }
  }

  function media(estagio: EstagioPaciente): number | null {
    const soma = estagiosSoma.get(estagio);
    const n = estagiosCont.get(estagio);
    if (!soma || !n || n === 0) return null;
    return soma / n;
  }

  return {
    pacientesTotais: trajetorias.length,
    pacientesAtendidos,
    tempoMedioTotalMin: countEndToEnd > 0 ? totalEndToEndMin / countEndToEnd : null,
    tempoMedioRecepcaoMin: media("RECEPCAO"),
    tempoMedioExamesMin: media("SALA_EXAMES"),
    tempoMedioConsultorioMin: media("PRONTO_MEDICO"),
    tempoMedioDilatacaoMin: media("DILATACAO"),
  };
}

// ─── Distribuições ────────────────────────────────────────────────────────────

export interface ItemBarras {
  rotulo: string;
  valor: number;
  /** Pré-formato opcional para exibição (ex.: "32 min"). */
  valorFormatado?: string;
}

/**
 * Pacientes por médico (top 20 por volume).
 */
export function pacientesPorMedico(
  trajetorias: TrajetoriaPaciente[],
): ItemBarras[] {
  const cont = new Map<string, number>();
  for (const t of trajetorias) {
    cont.set(t.medicoNome, (cont.get(t.medicoNome) ?? 0) + 1);
  }
  return Array.from(cont.entries())
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 20);
}

/**
 * Tempo médio total na clínica por convênio (top 10).
 */
export function tempoMedioPorConvenio(
  trajetorias: TrajetoriaPaciente[],
): ItemBarras[] {
  const soma = new Map<string, number>();
  const cont = new Map<string, number>();

  for (const t of trajetorias) {
    if (t.estadias.length < 2) continue;
    const ultimo = t.estadias[t.estadias.length - 1];
    const primeiro = t.estadias[0];
    if (!primeiro || !ultimo || ultimo.estagio !== "ATENDIDO") continue;
    const dur = (ultimo.entrouEm - primeiro.entrouEm) / 60_000;
    if (dur <= 0) continue;
    const conv = t.convenio ?? "(sem convênio)";
    soma.set(conv, (soma.get(conv) ?? 0) + dur);
    cont.set(conv, (cont.get(conv) ?? 0) + 1);
  }

  return Array.from(soma.entries())
    .map(([rotulo, total]) => {
      const n = cont.get(rotulo) ?? 0;
      const media = n > 0 ? total / n : 0;
      return {
        rotulo,
        valor: media,
        valorFormatado: `${Math.round(media)} min · ${n} pac`,
      };
    })
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
}

/**
 * Tempo médio de recepção por convênio (top 10).
 */
export function tempoMedioRecepcaoPorConvenio(
  trajetorias: TrajetoriaPaciente[],
): ItemBarras[] {
  const soma = new Map<string, number>();
  const cont = new Map<string, number>();

  for (const t of trajetorias) {
    for (const e of t.estadias) {
      if (e.estagio !== "RECEPCAO" || e.durMin === null || e.durMin <= 0) continue;
      const conv = t.convenio ?? "(sem convênio)";
      soma.set(conv, (soma.get(conv) ?? 0) + e.durMin);
      cont.set(conv, (cont.get(conv) ?? 0) + 1);
      break; // só primeira passagem na recepção (a mais comum)
    }
  }

  return Array.from(soma.entries())
    .map(([rotulo, total]) => {
      const n = cont.get(rotulo) ?? 0;
      const media = n > 0 ? total / n : 0;
      return {
        rotulo,
        valor: media,
        valorFormatado: `${Math.round(media)} min · ${n} pac`,
      };
    })
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
}

/**
 * Distribuição de pacientes por hora do dia (0-23).
 * Usa a hora da PRIMEIRA aparição de cada paciente (chegada no fluxo).
 */
export function pacientesPorHoraDoDia(
  trajetorias: TrajetoriaPaciente[],
): ItemBarras[] {
  const horas: number[] = new Array(24).fill(0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  });

  for (const t of trajetorias) {
    const primeiro = t.estadias[0];
    if (!primeiro) continue;
    const hh = parseInt(fmt.format(new Date(primeiro.entrouEm)), 10);
    if (Number.isFinite(hh) && hh >= 0 && hh < 24) {
      horas[hh] = (horas[hh] ?? 0) + 1;
    }
  }

  return horas.map((valor, i) => ({
    rotulo: `${i.toString().padStart(2, "0")}h`,
    valor,
  }));
}

/**
 * Pacientes por dia (linha temporal).
 */
export function pacientesPorDia(
  trajetorias: TrajetoriaPaciente[],
): ItemBarras[] {
  const cont = new Map<string, number>();
  for (const t of trajetorias) {
    cont.set(t.data, (cont.get(t.data) ?? 0) + 1);
  }
  return Array.from(cont.entries())
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}

/**
 * Distribuição por tipo de agendamento (consulta / retorno / exame).
 * Como os tipos são combináveis, contamos múltiplos.
 */
export function distribuicaoPorTipo(
  trajetorias: TrajetoriaPaciente[],
): ItemBarras[] {
  let consulta = 0;
  let retorno = 0;
  let exame = 0;
  for (const t of trajetorias) {
    if (t.tipoConsulta) consulta += 1;
    if (t.tipoRetorno) retorno += 1;
    if (t.tipoExame) exame += 1;
  }
  return [
    { rotulo: "Consulta", valor: consulta },
    { rotulo: "Retorno", valor: retorno },
    { rotulo: "Exame", valor: exame },
  ];
}
