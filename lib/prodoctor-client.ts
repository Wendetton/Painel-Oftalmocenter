/**
 * Cliente HTTP para a API ProDoctor.
 *
 * Responsabilidades:
 * - Adicionar headers de autenticação e fuso horário em todas as chamadas.
 * - Aplicar timeout e retry mínimo em erros transitórios de rede.
 * - Respeitar o limite de 120 req/min da chave (compartilhada com o Hub e
 *   o Agendamento Online): freio automático após um 429, uma única
 *   consulta de agenda para todos os médicos e sem chamadas por paciente
 *   quando a agenda já traz o que precisamos.
 * - Manter caches em memória (agenda, médicos, idade de paciente).
 *
 * Tudo é executado SOMENTE no servidor — nunca importar este arquivo do
 * código que roda no navegador, senão a chave de API vaza.
 */

import {
  CONFIG,
  MEDICOS_PAINEL,
  dataDeHojeBrasil,
  lerConfigProDoctor,
} from "./configuracao";
import type {
  AgendamentoProDoctor,
  MedicoProDoctor,
} from "./tipos";

interface RespostaUsuariosProDoctor {
  payload?: {
    usuarios?: MedicoProDoctor[] | null;
  } | null;
  message?: unknown;
}

interface RespostaAgendamentosProDoctor {
  payload?: {
    agendamentos?: AgendamentoProDoctor[] | null;
  } | null;
  message?: unknown;
}

interface RespostaPacienteDetalhar {
  payload?: {
    paciente?: {
      codigo?: number | null;
      nome?: string | null;
      dataNascimento?: string | null;
      idade?: number | null;
    } | null;
  } | null;
}

class ErroProDoctor extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly detalhes?: unknown,
  ) {
    super(message);
    this.name = "ErroProDoctor";
  }
}

function montarHeaders(): Record<string, string> {
  const cfg = lerConfigProDoctor();
  return {
    "X-APIKEY": cfg.apiKey,
    "X-APIPASSWORD": cfg.apiPassword,
    "X-APITIMEZONE": cfg.timezone,
    "X-APITIMEZONENAME": cfg.timezoneName,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ─── Freio automático (circuit breaker) para 429 ─────────────────────────────
//
// Quando a ProDoctor responde 429, QUALQUER chamada nova nesta instância
// nos próximos COOLDOWN_429_MS falha na hora, sem sair para a rede. O
// limite é por minuto; insistir com retries curtos (como fazíamos antes)
// só gastava mais cota no pior momento. Durante a pausa, a agenda é
// servida da última cópia boa (ver buscarAgendamentosDoDia).
// ─────────────────────────────────────────────────────────────────────────────

let cooldown429Ate = 0;

function segundosDeCooldownRestantes(): number {
  return Math.max(0, Math.ceil((cooldown429Ate - Date.now()) / 1000));
}

/** Verdadeiro enquanto a pausa pós-429 estiver em vigor. */
export function emCooldown429(): boolean {
  return Date.now() < cooldown429Ate;
}

async function chamar<TResposta>(
  caminho: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<TResposta> {
  const cfg = lerConfigProDoctor();
  const url = `${cfg.apiUrl.replace(/\/$/, "")}${caminho}`;

  if (emCooldown429()) {
    throw new ErroProDoctor(
      `ProDoctor em pausa após 429 (limite de requisições) — ` +
        `novas chamadas liberadas em ${segundosDeCooldownRestantes()}s.`,
      429,
    );
  }

  let ultimoErro: unknown = null;

  for (let tentativa = 0; tentativa <= CONFIG.RETRY_TENTATIVAS; tentativa += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_API_MS);

    try {
      const resp = await fetch(url, {
        method: init.method,
        headers: montarHeaders(),
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: ctrl.signal,
        cache: "no-store",
      });

      clearTimeout(timer);

      if (!resp.ok) {
        const corpoErro = await resp.text().catch(() => "");

        if (resp.status === 429) {
          // Aciona o freio e NÃO tenta de novo: cada tentativa extra é
          // mais uma requisição contada contra o limite por minuto.
          cooldown429Ate = Date.now() + CONFIG.COOLDOWN_429_MS;
          // eslint-disable-next-line no-console
          console.warn(
            `[prodoctor] 429 em ${caminho}; pausando chamadas por ${CONFIG.COOLDOWN_429_MS / 1000}s.`,
          );
          throw new ErroProDoctor(
            `ProDoctor devolveu 429 Too Many Requests: ${corpoErro.slice(0, 500)}`,
            resp.status,
            corpoErro,
          );
        }

        // Demais 4xx são erro de cliente — não adianta retry.
        if (resp.status >= 400 && resp.status < 500) {
          throw new ErroProDoctor(
            `ProDoctor devolveu ${resp.status} ${resp.statusText}: ${corpoErro.slice(0, 500)}`,
            resp.status,
            corpoErro,
          );
        }

        ultimoErro = new ErroProDoctor(
          `ProDoctor devolveu ${resp.status} ${resp.statusText}: ${corpoErro.slice(0, 500)}`,
          resp.status,
          corpoErro,
        );
        await aguardar(CONFIG.RETRY_BACKOFF_MS * (tentativa + 1));
        continue;
      }

      const json = (await resp.json()) as TResposta;
      return json;
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof ErroProDoctor && err.status !== null && err.status < 500) {
        throw err;
      }

      ultimoErro = err;
      if (tentativa < CONFIG.RETRY_TENTATIVAS) {
        await aguardar(CONFIG.RETRY_BACKOFF_MS * (tentativa + 1));
      }
    }
  }

  // Reescreve o erro acumulado para sempre incluir a URL tentada e a causa
  // subjacente (DNS, conexão recusada, certificado, etc.). Isso é o que diz
  // a Fernando, sem precisar olhar logs do Vercel, se a `PRODOCTOR_API_URL`
  // está apontando para algum lugar inválido.
  const causaTexto = formatarCausaErro(ultimoErro);
  throw new ErroProDoctor(
    `Falha ao chamar ${url} — ${causaTexto}`,
    ultimoErro instanceof ErroProDoctor ? ultimoErro.status : null,
    ultimoErro,
  );
}

function formatarCausaErro(err: unknown): string {
  if (err instanceof ErroProDoctor) {
    return err.message;
  }
  if (err instanceof Error) {
    // node-fetch / undici aninham a causa real (ex: ENOTFOUND) em err.cause.
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeMsg =
      cause instanceof Error
        ? `${cause.name}: ${cause.message}`
        : cause !== undefined
          ? String(cause)
          : null;
    return causeMsg ? `${err.message} (causa: ${causeMsg})` : err.message;
  }
  return "erro desconhecido";
}

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Cache em memória ────────────────────────────────────────────────────────
//
// Em Next.js no Vercel cada invocação serverless pode iniciar um processo
// novo, então o cache não é garantido entre requisições. Mesmo assim, manter
// estes caches reduz drasticamente o consumo de rate limit em ambientes
// quentes (que é o caso da maioria das requisições de polling).
// ─────────────────────────────────────────────────────────────────────────────

interface EntradaCache<T> {
  valor: T;
  expiraEm: number;
}

const cachePainel = new Map<string, EntradaCache<AgendaDoDia>>();
const cachePaciente = new Map<number, EntradaCache<{ idade: number | null }>>();
let cacheMedicos: EntradaCache<MedicoProDoctor[]> | null = null;

/**
 * Última resposta BOA da agenda, sem prazo de validade (só troca quando
 * chega uma nova). Se a ProDoctor falhar (429, oscilação, etc.), servimos
 * esta cópia em vez de derrubar o painel — a TV continua mostrando os
 * pacientes e a resposta sinaliza `stale` para o rodapé avisar.
 */
const ultimaAgendaBoa = new Map<string, AgendaDoDia>();

/**
 * Chamadas à ProDoctor em andamento, por chave de cache ("single-flight").
 * Se várias TVs pedem a agenda no mesmo instante e o cache expirou, todas
 * esperam a MESMA requisição em vez de cada uma disparar a sua.
 */
const agendaEmVoo = new Map<string, Promise<AgendaDoDia>>();

function lerCache<T>(entrada: EntradaCache<T> | undefined | null): T | null {
  if (!entrada) return null;
  if (Date.now() > entrada.expiraEm) return null;
  return entrada.valor;
}

// ─── Funções públicas do cliente ─────────────────────────────────────────────

export async function buscarMedicos(): Promise<MedicoProDoctor[]> {
  const cached = lerCache(cacheMedicos);
  if (cached) return cached;

  const resposta = await chamar<RespostaUsuariosProDoctor>("/api/v1/Usuarios", {
    method: "POST",
    body: {
      pagina: 1,
      quantidade: 5000,
      somenteAtivos: true,
    },
  });

  const lista = resposta.payload?.usuarios ?? [];
  const medicos: MedicoProDoctor[] = lista
    .filter((m): m is MedicoProDoctor => typeof m?.codigo === "number" && typeof m?.nome === "string")
    .map((m) => ({ codigo: m.codigo, nome: m.nome }));

  cacheMedicos = {
    valor: medicos,
    expiraEm: Date.now() + CONFIG.CACHE_PACIENTE_MS,
  };

  return medicos;
}

/** Agenda do dia de um conjunto de médicos, com a origem dos dados. */
export interface AgendaDoDia {
  agendamentos: AgendamentoProDoctor[];
  /** Instante (ms epoch) em que a ProDoctor devolveu esta agenda. */
  obtidaEm: number;
  /** Verdadeiro quando é a última cópia boa, servida porque a ProDoctor falhou. */
  stale: boolean;
}

/**
 * Agenda do dia dos médicos pedidos.
 *
 * Estratégia anti-rate-limit: a consulta à ProDoctor é sempre feita para o
 * UNIVERSO de médicos do painel (MEDICOS_PAINEL ∪ pedidos), e o filtro por
 * TV acontece aqui, em memória. Assim, a TV da recepção com [Paulo, Lilian]
 * e o tablet dos exames com [Fernando] compartilham UMA chamada e UM cache,
 * em vez de cada combinação gerar a sua. Com 3 médicos isso corta de até 6
 * consultas distintas por ciclo para 1.
 */
export async function buscarAgendamentosDoDia(
  codigosMedicos: number[],
): Promise<AgendaDoDia> {
  if (codigosMedicos.length === 0) {
    return { agendamentos: [], obtidaEm: Date.now(), stale: false };
  }

  const dataHoje = dataDeHojeBrasil();
  const universo = Array.from(new Set([...MEDICOS_PAINEL, ...codigosMedicos])).sort(
    (a, b) => a - b,
  );
  const chaveCache = `${dataHoje}|${universo.join(",")}`;

  let agenda = lerCache(cachePainel.get(chaveCache));
  if (!agenda) {
    let emVoo = agendaEmVoo.get(chaveCache);
    if (!emVoo) {
      emVoo = buscarAgendaUpstream(chaveCache, dataHoje, universo).finally(() => {
        agendaEmVoo.delete(chaveCache);
      });
      agendaEmVoo.set(chaveCache, emVoo);
    }
    agenda = await emVoo;
  }

  return filtrarPorMedicos(agenda, codigosMedicos);
}

function filtrarPorMedicos(agenda: AgendaDoDia, codigosMedicos: number[]): AgendaDoDia {
  const pedidos = new Set(codigosMedicos);
  return {
    ...agenda,
    agendamentos: agenda.agendamentos.filter(
      (ag) => typeof ag.usuario?.codigo === "number" && pedidos.has(ag.usuario.codigo),
    ),
  };
}

async function buscarAgendaUpstream(
  chaveCache: string,
  dataHoje: string,
  universo: number[],
): Promise<AgendaDoDia> {
  let resposta: RespostaAgendamentosProDoctor;
  try {
    resposta = await chamar<RespostaAgendamentosProDoctor>(
      "/api/v1/Agenda/BuscarPorStatusTipo",
      {
        method: "POST",
        body: {
          pagina: 1,
          quantidade: 5000,
          periodo: { dataInicial: dataHoje, dataFinal: dataHoje },
          usuarios: universo.map((codigo) => ({ codigo })),
        },
      },
    );
  } catch (err) {
    // Degradação suave: melhor mostrar a agenda de alguns minutos atrás
    // do que uma tela vazia. Limitada a STALE_AGENDA_MS de idade — mais
    // velha que isso, o erro propaga (dados podem estar enganosos demais).
    const stale = ultimaAgendaBoa.get(chaveCache);
    if (stale && Date.now() - stale.obtidaEm < CONFIG.STALE_AGENDA_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        "[prodoctor] Agenda falhou; servindo última cópia boa.",
        err instanceof Error ? err.message : err,
      );
      const servida: AgendaDoDia = { ...stale, stale: true };
      // Guarda a cópia stale no cache curto também: durante a pausa
      // pós-429 as TVs continuam pedindo a cada 5s, e sem isso cada
      // pedido chegaria até aqui (barato, mas desnecessário).
      cachePainel.set(chaveCache, {
        valor: servida,
        expiraEm: Date.now() + CONFIG.CACHE_PAINEL_MS,
      });
      return servida;
    }
    throw err;
  }

  const agenda: AgendaDoDia = {
    agendamentos: resposta.payload?.agendamentos ?? [],
    obtidaEm: Date.now(),
    stale: false,
  };
  ultimaAgendaBoa.set(chaveCache, agenda);
  cachePainel.set(chaveCache, {
    valor: agenda,
    expiraEm: Date.now() + CONFIG.CACHE_PAINEL_MS,
  });

  // Limpa entradas velhas para não acumular em ambientes longos.
  if (cachePainel.size > 50) {
    const agora = Date.now();
    for (const [k, v] of cachePainel.entries()) {
      if (v.expiraEm < agora) cachePainel.delete(k);
    }
  }

  return agenda;
}

export async function buscarIdadePaciente(
  codigoPaciente: number,
): Promise<number | null> {
  const cached = lerCache(cachePaciente.get(codigoPaciente));
  if (cached) return cached.idade;

  try {
    const resposta = await chamar<RespostaPacienteDetalhar>(
      `/api/v1/Pacientes/Detalhar/${codigoPaciente}`,
      { method: "GET" },
    );

    const idade = resposta.payload?.paciente?.idade ?? null;
    cachePaciente.set(codigoPaciente, {
      valor: { idade },
      expiraEm: Date.now() + CONFIG.CACHE_PACIENTE_MS,
    });
    return idade;
  } catch {
    // Se um paciente individual falhar, registra no cache curto para não
    // martelar a API durante o ciclo, mas não propaga o erro — idade é
    // informação acessória, não pode derrubar o painel inteiro.
    cachePaciente.set(codigoPaciente, {
      valor: { idade: null },
      expiraEm: Date.now() + 60_000,
    });
    return null;
  }
}

/**
 * Busca as idades de vários pacientes respeitando um orçamento de chamadas
 * novas por ciclo.
 *
 * Hoje é só a RESERVA para pacientes cuja agenda veio sem dataNascimento
 * (a idade normalmente é calculada direto da agenda, ver lib/idade.ts).
 * Quem não couber no orçamento fica sem idade NESTE ciclo e é buscado nos
 * próximos. Durante a pausa pós-429 não sai nenhuma chamada.
 */
export async function buscarIdadesComOrcamento(
  codigos: number[],
  maxConsultasNovas: number,
): Promise<Map<number, number | null>> {
  const idades = new Map<number, number | null>();
  const semCache: number[] = [];

  for (const codigo of codigos) {
    const cached = lerCache(cachePaciente.get(codigo));
    if (cached) {
      idades.set(codigo, cached.idade);
    } else {
      idades.set(codigo, null);
      semCache.push(codigo);
    }
  }

  if (emCooldown429()) return idades;

  await Promise.all(
    semCache.slice(0, maxConsultasNovas).map(async (codigo) => {
      idades.set(codigo, await buscarIdadePaciente(codigo));
    }),
  );

  return idades;
}

export { ErroProDoctor };
