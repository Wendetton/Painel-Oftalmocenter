/**
 * Cliente HTTP para a API ProDoctor.
 *
 * Responsabilidades:
 * - Adicionar headers de autenticação e fuso horário em todas as chamadas.
 * - Aplicar timeout e retry mínimo em erros transitórios de rede.
 * - Manter um cache em memória para os dados detalhados de paciente
 *   (idade não muda no dia, então 1 chamada por paciente por dia basta).
 *
 * Tudo é executado SOMENTE no servidor — nunca importar este arquivo do
 * código que roda no navegador, senão a chave de API vaza.
 */

import { CONFIG, lerConfigProDoctor, dataDeHojeBrasil } from "./configuracao";
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

async function chamar<TResposta>(
  caminho: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<TResposta> {
  const cfg = lerConfigProDoctor();
  const url = `${cfg.apiUrl.replace(/\/$/, "")}${caminho}`;

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
        // 4xx é erro de cliente — não adianta retry. 5xx vale tentar novamente.
        const corpoErro = await resp.text().catch(() => "");
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

const cachePainel = new Map<string, EntradaCache<AgendamentoProDoctor[]>>();
const cachePaciente = new Map<number, EntradaCache<{ idade: number | null }>>();
let cacheMedicos: EntradaCache<MedicoProDoctor[]> | null = null;

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

export async function buscarAgendamentosDoDia(
  codigosMedicos: number[],
): Promise<AgendamentoProDoctor[]> {
  if (codigosMedicos.length === 0) {
    return [];
  }

  const dataHoje = dataDeHojeBrasil();
  const chaveCache = `${dataHoje}|${[...codigosMedicos].sort((a, b) => a - b).join(",")}`;
  const cached = lerCache(cachePainel.get(chaveCache));
  if (cached) return cached;

  const resposta = await chamar<RespostaAgendamentosProDoctor>(
    "/api/v1/Agenda/BuscarPorStatusTipo",
    {
      method: "POST",
      body: {
        pagina: 1,
        quantidade: 5000,
        periodo: { dataInicial: dataHoje, dataFinal: dataHoje },
        usuarios: codigosMedicos.map((codigo) => ({ codigo })),
      },
    },
  );

  const agendamentos = resposta.payload?.agendamentos ?? [];

  cachePainel.set(chaveCache, {
    valor: agendamentos,
    expiraEm: Date.now() + CONFIG.CACHE_PAINEL_MS,
  });

  // Limpa entradas velhas para não acumular em ambientes longos.
  if (cachePainel.size > 50) {
    const agora = Date.now();
    for (const [k, v] of cachePainel.entries()) {
      if (v.expiraEm < agora) cachePainel.delete(k);
    }
  }

  return agendamentos;
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

export { ErroProDoctor };
