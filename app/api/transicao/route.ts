/**
 * Endpoint de mutação: move um agendamento para outro estágio.
 *
 * Fluxo:
 * 1. Body deve conter { pin, chave: ChaveAgendamento, destino: EstagioDestino }.
 * 2. Validamos o PIN (env EDIT_PIN no servidor).
 * 3. Mapeamos o destino para o conjunto de flags do ProDoctor (lib/transicaoFlags).
 * 4. Chamamos PATCH /api/v1/Agenda/AlterarStatus via lib/prodoctor-mutations.
 * 5. Devolvemos sucesso ou erro estruturado.
 *
 * Notas:
 * - O painel imediatamente após uma mutação bem-sucedida invalida o cache
 *   do servidor (próximo polling traz o estado novo). Aqui não bloqueamos
 *   nada — o ciclo de polling de 5s já vai refletir.
 * - Não chamamos o gravarEventoTransicao daqui: a transição vai virar um
 *   evento natural no /api/painel quando o rastreador detectar a mudança.
 */

import { NextResponse } from "next/server";

import { verificarPin } from "@/lib/pinEdicao";
import { alterarStatusAgendamento } from "@/lib/prodoctor-mutations";
import { flagsParaDestino, parseDestino } from "@/lib/transicaoFlags";
import type { ChaveAgendamento } from "@/lib/tipos";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CorpoTransicao {
  pin?: unknown;
  chave?: unknown;
  destino?: unknown;
}

function parseChave(input: unknown): ChaveAgendamento | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;
  if (
    typeof obj.localCodigo !== "number" ||
    typeof obj.usuarioCodigo !== "number" ||
    typeof obj.data !== "string" ||
    typeof obj.hora !== "string"
  ) {
    return null;
  }
  return {
    localCodigo: obj.localCodigo,
    usuarioCodigo: obj.usuarioCodigo,
    data: obj.data,
    hora: obj.hora,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: CorpoTransicao;
  try {
    body = (await req.json()) as CorpoTransicao;
  } catch {
    return NextResponse.json(
      { ok: false, mensagem: "Body JSON inválido." },
      { status: 400 },
    );
  }

  // 1. PIN
  const pinRes = verificarPin(body.pin);
  if (!pinRes.ok) {
    return NextResponse.json(
      { ok: false, mensagem: pinRes.mensagem },
      { status: pinRes.status },
    );
  }

  // 2. Chave do agendamento
  const chave = parseChave(body.chave);
  if (!chave) {
    return NextResponse.json(
      {
        ok: false,
        mensagem:
          "Campo 'chave' inválido. Esperado { localCodigo, usuarioCodigo, data, hora }.",
      },
      { status: 400 },
    );
  }

  // 3. Destino
  const destino = parseDestino(body.destino);
  if (!destino) {
    return NextResponse.json(
      {
        ok: false,
        mensagem:
          "Campo 'destino' inválido. Aceitos: RECEPCAO, SALA_EXAMES, PRONTO_MEDICO, DILATACAO, ATENDIDO, FALTOU.",
      },
      { status: 400 },
    );
  }

  // 4. Mutação no ProDoctor
  const flags = flagsParaDestino(destino);
  const resultado = await alterarStatusAgendamento(chave, flags);

  if (!resultado.ok) {
    return NextResponse.json(
      {
        ok: false,
        mensagem: resultado.mensagem,
        statusProDoctor: resultado.status,
      },
      { status: resultado.status === 401 ? 502 : 502 },
    );
  }

  return NextResponse.json({ ok: true, destino });
}
