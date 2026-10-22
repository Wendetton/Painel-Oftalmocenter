import { NextResponse } from "next/server";

import { MEDICOS_PAINEL } from "@/lib/configuracao";
import { obterFirestore, statusFirebase } from "@/lib/firebase";
import { buscarAgendamentosDoDia } from "@/lib/prodoctor-client";

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

  // Status do Firebase + sondagem real (try a write+delete on a temp doc).
  const firebase = await diagnosticoFirebase();

  // Amostra (sem dados pessoais) do que a agenda da ProDoctor devolve.
  const agendaAmostra = await diagnosticoAgenda();

  return NextResponse.json({
    config,
    sondagens,
    firebase,
    agendaAmostra,
    dicas: [
      "Se 'configurada' for false em qualquer variável crítica, adicione no Vercel → Settings → Environment Variables e refaça o deploy.",
      "Nas sondagens, qualquer URL que devolva 'ok: true' (mesmo com status 404) significa que o host existe e responde. Use essa como PRODOCTOR_API_URL.",
      "Erro 'getaddrinfo ENOTFOUND' significa que o domínio não existe — tente outra URL candidata.",
      "Erro 'fetch failed' sem causaErro pode indicar que o host bloqueia chamadas vindas dos servidores Vercel.",
      "Para Firebase: 'configurado: false' significa que falta a variável FIREBASE_SERVICE_ACCOUNT no Vercel. 'inicializado: false' com 'configurado: true' indica JSON inválido ou credencial revogada.",
    ],
  });
}

/**
 * Mostra, sem expor dados pessoais, quais campos o objeto `paciente` da
 * agenda realmente traz e em que formato vem `dataNascimento` (quando
 * vem). Serve para decidir se a idade pode sair direto da agenda ou se
 * precisa da coleção `pacientes` no Firestore + /Pacientes/Detalhar.
 *
 * Usa o mesmo cache de 5s do painel — abrir esta página não gera chamada
 * extra à ProDoctor se as TVs estiverem ligadas.
 */
async function diagnosticoAgenda(): Promise<{
  ok: boolean;
  erro: string | null;
  totalAgendamentos: number;
  camposDoPaciente: string[];
  comDataNascimento: number;
  formatosDataNascimento: Record<string, number>;
}> {
  const vazio = {
    totalAgendamentos: 0,
    camposDoPaciente: [] as string[],
    comDataNascimento: 0,
    formatosDataNascimento: {} as Record<string, number>,
  };
  try {
    const agenda = await buscarAgendamentosDoDia([...MEDICOS_PAINEL]);
    const campos = new Set<string>();
    let comData = 0;
    const formatos: Record<string, number> = {};
    for (const ag of agenda.agendamentos) {
      const paciente: unknown = ag.paciente;
      if (typeof paciente !== "object" || paciente === null) continue;
      for (const k of Object.keys(paciente)) campos.add(k);
      const dn = (paciente as { dataNascimento?: unknown }).dataNascimento;
      if (typeof dn === "string" && dn.trim() !== "") {
        comData += 1;
        // Padrão do valor com dígitos trocados por "9": revela o formato
        // sem revelar a data de ninguém.
        const padrao = dn.replace(/\d/g, "9");
        formatos[padrao] = (formatos[padrao] ?? 0) + 1;
      }
    }
    return {
      ok: true,
      erro: null,
      totalAgendamentos: agenda.agendamentos.length,
      camposDoPaciente: Array.from(campos).sort(),
      comDataNascimento: comData,
      formatosDataNascimento: formatos,
    };
  } catch (err) {
    return {
      ok: false,
      erro: err instanceof Error ? err.message : "Erro desconhecido",
      ...vazio,
    };
  }
}

async function diagnosticoFirebase(): Promise<{
  configurado: boolean;
  inicializado: boolean;
  erro: string | null;
  projectId: string | null;
  escritaTeste: { ok: boolean; erro: string | null; duracaoMs: number };
}> {
  // Importante: chama obterFirestore() ANTES de statusFirebase() para
  // que a tentativa de init aconteça e o status reporte o estado real.
  // (Caso contrário a primeira chamada sempre diria "Não inicializado
  // ainda" mesmo quando o init funciona logo em seguida.)
  const fs = obterFirestore();

  // Sondagem de escrita: cria um doc temporário e apaga em seguida.
  // Confirma que: (a) o init de fato funciona, (b) a regra de segurança
  // do Admin SDK aceita writes na coleção de testes.
  const escritaTeste: { ok: boolean; erro: string | null; duracaoMs: number } = {
    ok: false,
    erro: null,
    duracaoMs: 0,
  };
  if (fs) {
    const inicio = Date.now();
    try {
      const ref = await fs.collection("_diagnostico").add({
        timestamp: new Date(),
        origem: "/api/diagnostico",
      });
      await ref.delete();
      escritaTeste.ok = true;
    } catch (err) {
      escritaTeste.erro = err instanceof Error ? err.message : "Erro desconhecido";
    } finally {
      escritaTeste.duracaoMs = Date.now() - inicio;
    }
  } else {
    escritaTeste.erro = "Firestore não disponível";
  }

  // Status agora reflete o estado pós-init.
  const status = statusFirebase();

  return {
    configurado: status.configurado,
    inicializado: status.inicializado,
    erro: status.erro,
    projectId: status.projectId,
    escritaTeste,
  };
}
