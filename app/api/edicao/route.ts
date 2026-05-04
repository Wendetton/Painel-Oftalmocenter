/**
 * Verificação do PIN do modo edição.
 *
 * GET → diz se o modo edição está configurado neste ambiente
 *       (sem revelar o PIN, apenas se a env var existe).
 *
 * POST → recebe { pin } e devolve 200 se está correto, 401 se não.
 *        O cliente usa para validar antes de marcar como "destravado"
 *        no sessionStorage.
 */

import { NextResponse } from "next/server";

import { verificarPin } from "@/lib/pinEdicao";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(): NextResponse {
  const configurado = (process.env.EDIT_PIN ?? "").trim().length > 0;
  return NextResponse.json({ configurado });
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, mensagem: "Body inválido." }, { status: 400 });
  }

  const pin =
    typeof body === "object" && body !== null && "pin" in body
      ? (body as { pin: unknown }).pin
      : null;

  const r = verificarPin(pin);
  if (r.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { ok: false, mensagem: r.mensagem },
    { status: r.status },
  );
}
