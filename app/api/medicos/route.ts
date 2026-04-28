import { NextResponse } from "next/server";

import { buscarMedicos } from "@/lib/prodoctor-client";
import type { RespostaMedicos } from "@/lib/tipos";

// Sempre dinâmico: depende de env vars do servidor.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse<RespostaMedicos>> {
  try {
    const medicos = await buscarMedicos();
    return NextResponse.json({
      medicos,
      fonteOnline: true,
      ultimoErro: null,
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json(
      {
        medicos: [],
        fonteOnline: false,
        ultimoErro: mensagem,
      },
      { status: 502 },
    );
  }
}
