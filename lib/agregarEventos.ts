/**
 * Agregações puras a partir dos eventos brutos do Firestore.
 *
 * Funções sem efeitos colaterais — recebem array de eventos, devolvem
 * estatísticas. Toda a lógica de "tempo no estágio", tempos por convênio,
 * etc., vive aqui. O componente do dashboard só decide qual número
 * mostrar.
 *
 * Conceito chave — "trajetória do paciente":
 *   Os eventos são "estado mudou de X para Y às H". Para calcular tempo
 *   por estágio, agrupamos eventos pelo agendamentoId, ordenamos por
 *   momento, e cada par consecutivo vira "ficou no estágio X por Δ minutos".
 *
 * Cuidados para os números refletirem a realidade:
 *
 * 1. Duplicatas. O histórico antigo tem o mesmo movimento gravado mais de
 *    uma vez (uma por instância do servidor). Dois eventos seguidos com o
 *    mesmo estágio de destino são a mesma mudança — fica só o primeiro.
 *
 * 2. Chegada. Quando o evento traz a hora real de chegada (ProDoctor),
 *    o tempo total e o tempo de recepção contam a partir dela. Eventos
 *    antigos não trazem; para eles o tempo de recepção fica desconhecido
 *    (não é inventado) e o total conta a partir do primeiro movimento.
 *
 * 3. Mediana. O valor principal é a mediana ("paciente típico"), que não
 *    se distorce quando alguém é esquecido num estágio por horas. A média
 *    e o percentil 90 vão junto como apoio.
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
  medicoCodigo: number | null;
  medicoNome: string;
  convenio: string | null;
  data: string;
  estadias: Estadia[];
  /** Hora real da chegada (ProDoctor), quando registrada. */
  chegadaMs: number | null;
  /** Início da contagem: a chegada, ou o primeiro movimento se não houver. */
  inicioMs: number;
  /**
   * Minutos do início até o atendimento concluído. null se o paciente não
   * terminou o dia como ATENDIDO.
   */
  tempoTotalMin: number | null;
  tipoConsulta: boolean;
  tipoRetorno: boolean;
  tipoExame: boolean;
}

/** Folga para a hora de chegada (minuto cheio) × detecção do painel. */
const FOLGA_CHEGADA_MS = 2 * 60_000;

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
  for (const [agendamentoId, bruta] of grupos) {
    bruta.sort((a, b) => a.momentoMs - b.momentoMs);

    // Remove duplicatas: mesmo estágio de destino em eventos seguidos é a
    // mesma mudança registrada mais de uma vez. Vale o primeiro registro.
    const lista: EventoBruto[] = [];
    for (const ev of bruta) {
      const ultimo = lista[lista.length - 1];
      if (ultimo && ultimo.estagioNovo === ev.estagioNovo) continue;
      lista.push(ev);
    }

    const primeiro = lista[0];
    if (!primeiro) continue;

    let chegadaMs: number | null = null;
    for (const ev of bruta) {
      if (ev.chegadaMs !== null) {
        chegadaMs = ev.chegadaMs;
        break;
      }
    }
    // Chegada depois do primeiro movimento é incoerente — descarta.
    if (chegadaMs !== null && chegadaMs > primeiro.momentoMs + FOLGA_CHEGADA_MS) {
      chegadaMs = null;
    }
    if (chegadaMs !== null) chegadaMs = Math.min(chegadaMs, primeiro.momentoMs);

    const estadias: Estadia[] = [];

    // Se o primeiro evento já é a SAÍDA da recepção (ou o paciente foi
    // visto direto num estágio adiante) e sabemos a hora da chegada, o
    // tempo de recepção é chegada → primeiro movimento.
    if (
      chegadaMs !== null &&
      chegadaMs < primeiro.momentoMs &&
      primeiro.estagioNovo !== "RECEPCAO" &&
      (primeiro.estagioAnterior === null ||
        primeiro.estagioAnterior === "RECEPCAO")
    ) {
      estadias.push({
        estagio: "RECEPCAO",
        entrouEm: chegadaMs,
        saiuEm: primeiro.momentoMs,
        durMin: (primeiro.momentoMs - chegadaMs) / 60_000,
      });
    }

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

    const inicioMs = chegadaMs ?? primeiro.momentoMs;
    const ultima = estadias[estadias.length - 1];
    const tempoTotalMin =
      ultima && ultima.estagio === "ATENDIDO" && ultima.entrouEm > inicioMs
        ? (ultima.entrouEm - inicioMs) / 60_000
        : null;

    trajetorias.push({
      agendamentoId,
      medicoCodigo: primeiro.medicoCodigo,
      medicoNome: primeiro.medicoNome,
      convenio: primeiro.convenio,
      data: primeiro.data,
      estadias,
      chegadaMs,
      inicioMs,
      tempoTotalMin,
      tipoConsulta: primeiro.tipoConsulta,
      tipoRetorno: primeiro.tipoRetorno,
      tipoExame: primeiro.tipoExame,
    });
  }

  return trajetorias;
}

// ─── Estatística ──────────────────────────────────────────────────────────────

export interface Estatistica {
  /** Quantidade de pacientes na amostra. */
  n: number;
  media: number;
  /** Valor do "paciente típico": metade ficou menos, metade ficou mais. */
  mediana: number;
  /** 90% dos pacientes ficaram até este valor. */
  p90: number;
}

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 1) return ordenados[0] ?? 0;
  const pos = (ordenados.length - 1) * p;
  const base = Math.floor(pos);
  const a = ordenados[base] ?? 0;
  const b = ordenados[Math.min(base + 1, ordenados.length - 1)] ?? a;
  return a + (b - a) * (pos - base);
}

export function estatistica(valores: number[]): Estatistica | null {
  const v = valores.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const soma = v.reduce((s, x) => s + x, 0);
  return {
    n: v.length,
    media: soma / v.length,
    mediana: percentil(v, 0.5),
    p90: percentil(v, 0.9),
  };
}

/**
 * Minutos que o paciente passou num estágio, somando todas as passagens
 * concluídas (ex.: exames → dilatação → exames conta as duas idas a
 * exames). null se não houve passagem concluída.
 */
export function minutosNoEstagio(
  t: TrajetoriaPaciente,
  estagio: EstagioPaciente,
): number | null {
  let soma = 0;
  for (const e of t.estadias) {
    if (e.estagio === estagio && e.durMin !== null && e.durMin > 0) {
      soma += e.durMin;
    }
  }
  return soma > 0 ? soma : null;
}

function estatisticaDoEstagio(
  trajetorias: TrajetoriaPaciente[],
  estagio: EstagioPaciente,
): Estatistica | null {
  const valores: number[] = [];
  for (const t of trajetorias) {
    // Recepção só é mensurável quando sabemos a hora da chegada. Sem ela,
    // as únicas passagens registradas seriam de pacientes DEVOLVIDOS à
    // recepção — casos atípicos que não representam a espera real.
    if (estagio === "RECEPCAO" && t.chegadaMs === null) continue;
    const m = minutosNoEstagio(t, estagio);
    if (m !== null) valores.push(m);
  }
  return estatistica(valores);
}

// ─── Métricas globais ────────────────────────────────────────────────────────

export interface ResumoGeral {
  pacientesTotais: number;
  pacientesAtendidos: number;
  /** Pacientes com a hora real de chegada registrada. */
  pacientesComChegada: number;
  /** Primeiro dia ("YYYY-MM-DD") do período com chegada registrada. */
  chegadaDesde: string | null;
  /** Tempo do início ao atendimento concluído. */
  tempoTotal: Estatistica | null;
  /**
   * true = o tempo total conta desde a chegada real. false = o período só
   * tem dados antigos, sem chegada; conta desde o primeiro movimento
   * (saída da recepção), então fica menor que o real.
   */
  tempoTotalDesdeChegada: boolean;
  recepcao: Estatistica | null;
  exames: Estatistica | null;
  dilatacao: Estatistica | null;
  prontoMedico: Estatistica | null;
}

/**
 * Um "tempo típico" só é mostrado com pelo menos esta quantidade de
 * pacientes. Mediana de 1 ou 2 pacientes não representa a clínica — é só
 * o tempo daquele paciente — e mostrá-la como se fosse o resultado do
 * período engana.
 */
export const AMOSTRA_MINIMA = 5;

/**
 * Tempos totais do período, sem misturar réguas:
 * - se há pacientes suficientes com chegada registrada, usa SÓ esses
 *   (tempo real, da chegada ao atendimento);
 * - senão, usa os que não têm chegada, contando do primeiro movimento
 *   (saída da recepção) — e o dashboard diz isso na tela.
 */
function temposTotais(trajetorias: TrajetoriaPaciente[]): {
  itens: { t: TrajetoriaPaciente; min: number }[];
  desdeChegada: boolean;
} {
  const concluidas = trajetorias.filter((t) => t.tempoTotalMin !== null);
  const comChegada = concluidas.filter((t) => t.chegadaMs !== null);
  const semChegada = concluidas.filter((t) => t.chegadaMs === null);
  const usarChegada =
    comChegada.length >= AMOSTRA_MINIMA || semChegada.length === 0;
  const base = usarChegada ? comChegada : semChegada;
  return {
    itens: base.map((t) => ({ t, min: t.tempoTotalMin ?? 0 })),
    desdeChegada: usarChegada,
  };
}

export function calcularResumo(trajetorias: TrajetoriaPaciente[]): ResumoGeral {
  const totais = temposTotais(trajetorias);
  return {
    pacientesTotais: trajetorias.length,
    pacientesAtendidos: trajetorias.filter((t) =>
      t.estadias.some((e) => e.estagio === "ATENDIDO"),
    ).length,
    pacientesComChegada: trajetorias.filter((t) => t.chegadaMs !== null).length,
    chegadaDesde: trajetorias
      .filter((t) => t.chegadaMs !== null)
      .reduce<string | null>(
        (menor, t) => (menor === null || t.data < menor ? t.data : menor),
        null,
      ),
    tempoTotal: estatistica(totais.itens.map((i) => i.min)),
    tempoTotalDesdeChegada: totais.desdeChegada,
    recepcao: estatisticaDoEstagio(trajetorias, "RECEPCAO"),
    exames: estatisticaDoEstagio(trajetorias, "SALA_EXAMES"),
    dilatacao: estatisticaDoEstagio(trajetorias, "DILATACAO"),
    prontoMedico: estatisticaDoEstagio(trajetorias, "PRONTO_MEDICO"),
  };
}

// ─── Distribuições ────────────────────────────────────────────────────────────

export interface ItemBarras {
  rotulo: string;
  valor: number;
  /** Pré-formato opcional para exibição (ex.: "32 min"). */
  valorFormatado?: string;
}

/** Médicos presentes no período, para o filtro. */
export function medicosDoPeriodo(
  trajetorias: TrajetoriaPaciente[],
): { codigo: number; nome: string }[] {
  const mapa = new Map<number, string>();
  for (const t of trajetorias) {
    if (t.medicoCodigo !== null && !mapa.has(t.medicoCodigo)) {
      mapa.set(t.medicoCodigo, t.medicoNome);
    }
  }
  return Array.from(mapa.entries())
    .map(([codigo, nome]) => ({ codigo, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
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
 * Convênio com poucos pacientes não entra no ranking: 1 ou 2 atendimentos
 * não dizem nada sobre o convênio e acabavam liderando a lista.
 */
export const AMOSTRA_MINIMA_CONVENIO = 3;

function rankingPorConvenio(
  amostras: { convenio: string | null; min: number }[],
): ItemBarras[] {
  const porConvenio = new Map<string, number[]>();
  for (const a of amostras) {
    const conv = a.convenio ?? "(sem convênio)";
    const lista = porConvenio.get(conv) ?? [];
    lista.push(a.min);
    porConvenio.set(conv, lista);
  }

  const todos = Array.from(porConvenio.entries())
    .map(([rotulo, valores]) => ({ rotulo, est: estatistica(valores) }))
    .filter(
      (i): i is { rotulo: string; est: Estatistica } => i.est !== null,
    );

  const base = todos.filter((i) => i.est.n >= AMOSTRA_MINIMA_CONVENIO);

  return base
    .map(({ rotulo, est }) => ({
      rotulo,
      valor: est.mediana,
      valorFormatado: `${Math.round(est.mediana)} min · ${est.n} pac`,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
}

/**
 * Tempo total na clínica por convênio (mediana; 10 maiores).
 */
export function tempoPorConvenio(
  trajetorias: TrajetoriaPaciente[],
): ItemBarras[] {
  return rankingPorConvenio(
    temposTotais(trajetorias).itens.map((i) => ({
      convenio: i.t.convenio,
      min: i.min,
    })),
  );
}

/**
 * Tempo de recepção por convênio (mediana; 10 maiores).
 */
export function tempoRecepcaoPorConvenio(
  trajetorias: TrajetoriaPaciente[],
): ItemBarras[] {
  const amostras: { convenio: string | null; min: number }[] = [];
  for (const t of trajetorias) {
    if (t.chegadaMs === null) continue; // ver estatisticaDoEstagio
    const min = minutosNoEstagio(t, "RECEPCAO");
    if (min !== null) amostras.push({ convenio: t.convenio, min });
  }
  return rankingPorConvenio(amostras);
}

/**
 * Distribuição de pacientes por hora do dia (0-23).
 * Usa a hora de chegada de cada paciente (ou, nos dados antigos sem
 * chegada, a do primeiro movimento).
 */
export function pacientesPorHoraDoDia(
  trajetorias: TrajetoriaPaciente[],
): ItemBarras[] {
  const horas: number[] = new Array(24).fill(0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  });

  for (const t of trajetorias) {
    const hh = parseInt(fmt.format(new Date(t.inicioMs)), 10);
    if (Number.isFinite(hh) && hh >= 0 && hh < 24) {
      horas[hh] = (horas[hh] ?? 0) + 1;
    }
  }

  // Mostra só a faixa com movimento (com 1h de margem), em vez de 24
  // colunas quase todas vazias.
  const comMovimento = horas
    .map((v, i) => (v > 0 ? i : -1))
    .filter((i) => i >= 0);
  if (comMovimento.length === 0) return [];
  const de = Math.max(0, (comMovimento[0] ?? 0) - 1);
  const ate = Math.min(23, (comMovimento[comMovimento.length - 1] ?? 23) + 1);

  const itens: ItemBarras[] = [];
  for (let h = de; h <= ate; h += 1) {
    itens.push({ rotulo: `${h.toString().padStart(2, "0")}h`, valor: horas[h] ?? 0 });
  }
  return itens;
}

/** Acima disso, não preenche os dias vazios (o gráfico ficaria ilegível). */
const MAX_DIAS_PREENCHIDOS = 62;

/**
 * Pacientes por dia. Informando o período, os dias sem movimento aparecem
 * com zero (fim de semana, feriado) em vez de sumirem do gráfico.
 */
export function pacientesPorDia(
  trajetorias: TrajetoriaPaciente[],
  periodo?: { dataInicio: string; dataFim: string },
): ItemBarras[] {
  const cont = new Map<string, number>();
  for (const t of trajetorias) {
    cont.set(t.data, (cont.get(t.data) ?? 0) + 1);
  }

  if (periodo && cont.size > 0) {
    const inicio = Date.parse(`${periodo.dataInicio}T12:00:00Z`);
    const fim = Date.parse(`${periodo.dataFim}T12:00:00Z`);
    const dias = Math.round((fim - inicio) / 86_400_000) + 1;
    if (Number.isFinite(dias) && dias > 0 && dias <= MAX_DIAS_PREENCHIDOS) {
      for (let i = 0; i < dias; i += 1) {
        const dia = new Date(inicio + i * 86_400_000).toISOString().slice(0, 10);
        if (!cont.has(dia)) cont.set(dia, 0);
      }
    }
  }

  return Array.from(cont.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, valor]) => ({
      // "2026-11-09" → "09/11"
      rotulo: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
      valor,
    }));
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
