/**
 * Configuração central do painel.
 * Tudo que é "constante operacional" da Oftalmocenter vive aqui.
 */

export const CONFIG = {
  /** Quantos médicos podem ser selecionados simultaneamente em uma TV. */
  MAX_MEDICOS_SIMULTANEOS: 2,

  /** Intervalo de polling do frontend para /api/painel (ms). */
  POLLING_MS: 5_000,

  /** TTL do cache do servidor para a chamada à ProDoctor (ms). */
  CACHE_PAINEL_MS: 5_000,

  /**
   * TTL do cache de dados detalhados do paciente (idade).
   * Idade não muda no dia, então 12h é seguro.
   */
  CACHE_PACIENTE_MS: 12 * 60 * 60 * 1000,

  /** Timeout para chamadas à API ProDoctor (ms). */
  TIMEOUT_API_MS: 10_000,

  /** Tentativas de retry em caso de erro de rede transitório. */
  RETRY_TENTATIVAS: 2,

  /** Backoff entre retries (ms). */
  RETRY_BACKOFF_MS: 500,
} as const;

/**
 * Lê uma variável de ambiente obrigatória. Lança erro se ausente.
 * Em rotas Next.js, falha cedo é melhor do que enviar request com chave undefined.
 */
function envObrigatorio(nome: string): string {
  const valor = process.env[nome];
  if (!valor || valor.trim() === "") {
    throw new Error(
      `Variável de ambiente ${nome} não está definida. ` +
        `Configure no arquivo .env.local (desenvolvimento) ou no painel do Vercel (produção).`,
    );
  }
  return valor.trim();
}

function envOpcional(nome: string, padrao: string): string {
  const valor = process.env[nome];
  return valor && valor.trim() !== "" ? valor.trim() : padrao;
}

/**
 * Configuração do cliente ProDoctor (lida do ambiente).
 * Só deve ser chamada do servidor — nunca expõe a chave para o navegador.
 */
export function lerConfigProDoctor(): {
  apiUrl: string;
  apiKey: string;
  apiPassword: string;
  timezone: string;
  timezoneName: string;
} {
  return {
    apiUrl: envOpcional("PRODOCTOR_API_URL", "https://api.prodoctor.net.br"),
    apiKey: envObrigatorio("PRODOCTOR_API_KEY"),
    apiPassword: envObrigatorio("PRODOCTOR_API_PASSWORD"),
    timezone: envOpcional("PRODOCTOR_API_TIMEZONE", "-03:00"),
    timezoneName: envOpcional("PRODOCTOR_API_TIMEZONE_NAME", "America/Sao_Paulo"),
  };
}

/**
 * Devolve a data de hoje no formato DD/MM/YYYY usando o fuso de São Paulo.
 * O ProDoctor exige esse formato literal nas requisições.
 */
export function dataDeHojeBrasil(): string {
  // Intl.DateTimeFormat com pt-BR já produz DD/MM/YYYY no fuso correto.
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return fmt.format(new Date());
}
