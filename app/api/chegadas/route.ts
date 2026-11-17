/**
 * Recupera do ProDoctor a hora de chegada dos pacientes em dias antigos,
 * para que o dashboard consiga calcular tempo de recepção e tempo total
 * do histórico gravado antes de o painel registrar a chegada.
 *
 * - Protegido pelo mesmo PIN do modo edição (EDIT_PIN).
 * - Consome a API do ProDoctor: 1 chamada por bloco de até 7 dias ainda
 *   não recuperados (30 dias = 5 chamadas). Dias já recuperados não geram
 *   chamada, então repetir o pedido é barato.
 *
 * Body: { pin, dataInicio: "YYYY-MM-DD", dataFim: "YYYY-MM-DD" }
 */

import { NextResponse } from "next/server";

import { recuperarChegadas } from "@/lib/chegadasHistoricas";
import { limparCacheEventos } from "@/lib/lerEventos";
import { verificarPin } from "@/lib/pinEdicao";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function dataValida(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(`${v}T00:00:00Z`))
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: { pin?: unknown; dataInicio?: unknown; dataFim?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, mensagem: "Body JSON inválido." },
      { status: 400 },
    );
  }

  const pin = verificarPin(body.pin);
  if (!pin.ok) {
    return NextResponse.json(
      { ok: false, mensagem: pin.mensagem },
      { status: pin.status },
    );
  }

  const { dataInicio, dataFim } = body;
  if (!dataValida(dataInicio) || !dataValida(dataFim) || dataFim < dataInicio) {
    return NextResponse.json(
      { ok: false, mensagem: "Período inválido." },
      { status: 400 },
    );
  }

  try {
    const resultado = await recuperarChegadas(dataInicio, dataFim);
    limparCacheEventos();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        mensagem: err instanceof Error ? err.message : "Erro desconhecido",
      },
      { status: 502 },
    );
  }
}
