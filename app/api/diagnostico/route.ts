import { NextResponse } from "next/server";

/**
 * Endpoint de diagnóstico — só serve para depurar problemas de configuração
 * sem precisar abrir os logs do Vercel.
 *
 * NUNCA devolve valores de chave/senha — apenas se foram configurados, e o
 * comprimento (para detectar quando alguém colou com espaço sobrando).
 *
 * Mostra também o resultado de uma sondagem simples ao host do ProDoctor:
 * tenta resolver o DNS e fazer uma chamada GET na raiz, sem auth, e reporta
 * o erro exato (incluindo `cause`) se algo der errado.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ResultadoSondagem {
  ok: boolean;
  status: number | null;
  duracaoMs: number;
  erro: string | null;
  causaErro: string | null;
}

async function sondarUrl(url: string): Promise<ResultadoSondagem> {
  const inicio = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);

  try {
    const resp = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return {
      ok: true,
      status: resp.status,
      duracaoMs: Date.now() - inicio,
      erro: null,
      causaErro: null,
    };
  } catch (err) {
    clearTimeout(timer);
    const erro = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
    const causaErro =
      cause instanceof Error
        ? `${cause.name}: ${cause.message}`
        : cause !== undefined
          ? String(cause)
          : null;
    return {
      ok: false,
      status: null,
      duracaoMs: Date.now() - inicio,
      erro,
      causaErro,
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const apiUrlConfigurada = process.env.PRODOCTOR_API_URL ?? "(não configurada — usando padrão)";
  const apiUrlEfetiva = (process.env.PRODOCTOR_API_URL ?? "https://api.prodoctor.net.br").replace(/\/$/, "");
  const chave = process.env.PRODOCTOR_API_KEY ?? "";
  const senha = process.env.PRODOCTOR_API_PASSWORD ?? "";

  const config = {
    PRODOCTOR_API_URL: {
      configurada: Boolean(process.env.PRODOCTOR_API_URL),
      valor: apiUrlConfigurada,
      valorEfetivo: apiUrlEfetiva,
    },
    PRODOCTOR_API_KEY: {
      configurada: chave.length > 0,
      tamanho: chave.length,
      preview: chave.length > 0 ? `${chave.slice(0, 3)}…${chave.slice(-3)}` : null,
    },
    PRODOCTOR_API_PASSWORD: {
      configurada: senha.length > 0,
      tamanho: senha.length,
    },
    PRODOCTOR_API_TIMEZONE: process.env.PRODOCTOR_API_TIMEZONE ?? "(não configurada — usando -03:00)",
    PRODOCTOR_API_TIMEZONE_NAME:
      process.env.PRODOCTOR_API_TIMEZONE_NAME ?? "(não configurada — usando America/Sao_Paulo)",
  };

  // Sondas paralelas: a URL configurada + 3 candidatas comuns para o caso
  // de a URL configurada estar errada e queremos ajudar Fernando a achar a
  // certa sem precisar de várias rodadas de tentativa-e-erro.
  const candidatas = Array.from(
    new Set([
      apiUrlEfetiva,
      "https://api.prodoctor.net.br",
      "https://api.prodoctor.com.br",
      "https://api.prodoctor.cloud",
    ]),
  );

  const sondagens: Record<string, ResultadoSondagem> = {};
  await Promise.all(
    candidatas.map(async (url) => {
      sondagens[url] = await sondarUrl(`${url}/swagger/index.html`);
    }),
  );

  return NextResponse.json({
    config,
    sondagens,
    dicas: [
      "Se a 'configurada' for false em qualquer variável crítica, adicione no Vercel → Settings → Environment Variables e refaça o deploy.",
      "Nas sondagens, qualquer URL que devolva 'ok: true' (mesmo com status 404) significa que o host existe e responde. Use essa como PRODOCTOR_API_URL.",
      "Erro 'getaddrinfo ENOTFOUND' significa que o domínio não existe — tente outra URL candidata.",
      "Erro 'fetch failed' sem causaErro pode indicar que o host bloqueia chamadas vindas dos servidores Vercel.",
    ],
  });
}
