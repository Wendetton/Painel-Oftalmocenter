import { NextResponse } from "next/server";

import { dataYYYYMMDDBrasil } from "@/lib/configuracao";
import {
  buscarEventosPeriodo,
  type EventoBruto,
  type EventosPeriodo,
} from "@/lib/lerEventos";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RespostaEventos {
  eventos: EventoBruto[];
  totalRetornados: number;
  /** true = o período passou do teto de eventos; os números estão incompletos. */
  truncado: boolean;
  dataInicio: string;
  dataFim: string;
  fonteOnline: boolean;
  ultimoErro: string | null;
}

/**
 * Cache em memória das consultas ao Firestore.
 *
 * Cada evento lido conta na cota diária do Firestore (a mesma que mantém
 * os cronômetros das TVs), e uma consulta de 30 dias lê alguns milhares.
 * Sem cache, trocar de filtro e voltar repetia a leitura inteira.
 *
 * - Período que inclui hoje: 1 minuto (os dados ainda estão mudando).
 * - Período só de dias passados: 30 minutos (não muda mais).
 *
 * Este endpoint não faz nenhuma chamada à API do ProDoctor.
 */
const TTL_COM_HOJE_MS = 60_000;
const TTL_PASSADO_MS = 30 * 60_000;
const MAX_ENTRADAS = 12;

const cache = new Map<string, { expiraEm: number; dados: EventosPeriodo }>();
const emAndamento = new Map<string, Promise<EventosPeriodo>>();

async function buscarComCache(
  dataInicio: string,
  dataFim: string,
): Promise<EventosPeriodo> {
  const chave = `${dataInicio}|${dataFim}`;
  const agora = Date.now();

  const guardado = cache.get(chave);
  if (guardado && guardado.expiraEm > agora) return guardado.dados;

  // Duas abas pedindo o mesmo período ao mesmo tempo compartilham a leitura.
  const pendente = emAndamento.get(chave);
  if (pendente) return pendente;

  const promessa = buscarEventosPeriodo(dataInicio, dataFim)
    .then((dados) => {
      const incluiHoje = dataFim >= dataYYYYMMDDBrasil();
      cache.set(chave, {
        dados,
        expiraEm: Date.now() + (incluiHoje ? TTL_COM_HOJE_MS : TTL_PASSADO_MS),
      });
      if (cache.size > MAX_ENTRADAS) {
        const maisAntiga = cache.keys().next().value;
        if (maisAntiga !== undefined) cache.delete(maisAntiga);
      }
      return dados;
    })
    .finally(() => {
      emAndamento.delete(chave);
    });

  emAndamento.set(chave, promessa);
  return promessa;
}

/**
 * Aceita YYYY-MM-DD. Devolve null para inválidos.
 */
function parseData(s: string | null): string | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  // Validação extra: data parseável.
  const d = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(d)) return null;
  return s;
}

function erro(
  status: number,
  mensagem: string,
  dataInicio: string,
  dataFim: string,
): NextResponse<RespostaEventos> {
  return NextResponse.json(
    {
      eventos: [],
      totalRetornados: 0,
      truncado: false,
      dataInicio,
      dataFim,
      fonteOnline: false,
      ultimoErro: mensagem,
    },
    { status },
  );
}

export async function GET(req: Request): Promise<NextResponse<RespostaEventos>> {
  const url = new URL(req.url);
  const dataInicio = parseData(url.searchParams.get("dataInicio"));
  const dataFim = parseData(url.searchParams.get("dataFim"));

  if (!dataInicio || !dataFim) {
    return erro(
      400,
      "Parâmetros dataInicio e dataFim (YYYY-MM-DD) são obrigatórios.",
      dataInicio ?? "",
      dataFim ?? "",
    );
  }

  if (dataFim < dataInicio) {
    return erro(
      400,
      "dataFim deve ser maior ou igual a dataInicio.",
      dataInicio,
      dataFim,
    );
  }

  try {
    const { eventos, truncado } = await buscarComCache(dataInicio, dataFim);
    return NextResponse.json({
      eventos,
      totalRetornados: eventos.length,
      truncado,
      dataInicio,
      dataFim,
      fonteOnline: true,
      ultimoErro: null,
    });
  } catch (err) {
    return erro(
      502,
      err instanceof Error ? err.message : "Erro desconhecido",
      dataInicio,
      dataFim,
    );
  }
}
