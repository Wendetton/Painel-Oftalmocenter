import { NextResponse } from "next/server";

import { buscarEventosPeriodo, type EventoBruto } from "@/lib/lerEventos";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RespostaEventos {
  eventos: EventoBruto[];
  totalRetornados: number;
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

export async function GET(req: Request): Promise<NextResponse<RespostaEventos>> {
  const url = new URL(req.url);
  const dataInicio = parseData(url.searchParams.get("dataInicio"));
  const dataFim = parseData(url.searchParams.get("dataFim"));

  if (!dataInicio || !dataFim) {
    return NextResponse.json(
      {
        eventos: [],
        totalRetornados: 0,
        dataInicio: dataInicio ?? "",
        dataFim: dataFim ?? "",
        fonteOnline: false,
        ultimoErro:
          "Parâmetros dataInicio e dataFim (YYYY-MM-DD) são obrigatórios.",
      },
      { status: 400 },
    );
  }

  if (dataFim < dataInicio) {
    return NextResponse.json(
      {
        eventos: [],
        totalRetornados: 0,
        dataInicio,
        dataFim,
        fonteOnline: false,
        ultimoErro: "dataFim deve ser maior ou igual a dataInicio.",
      },
      { status: 400 },
    );
  }

  try {
    const eventos = await buscarEventosPeriodo(dataInicio, dataFim);
    return NextResponse.json({
      eventos,
      totalRetornados: eventos.length,
      dataInicio,
      dataFim,
      fonteOnline: true,
      ultimoErro: null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        eventos: [],
        totalRetornados: 0,
        dataInicio,
        dataFim,
        fonteOnline: false,
        ultimoErro: err instanceof Error ? err.message : "Erro desconhecido",
      },
      { status: 502 },
    );
  }
}
