import { NextResponse } from "next/server";

import { buscarEventosComCache, type EventoBruto } from "@/lib/lerEventos";

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

/**
 * Eventos do período para o dashboard. Lê só o Firestore (com cache em
 * memória — ver lib/lerEventos); não faz nenhuma chamada à API do ProDoctor.
 */
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
    const { eventos, truncado } = await buscarEventosComCache(dataInicio, dataFim);
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
