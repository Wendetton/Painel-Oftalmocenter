import { NextResponse } from "next/server";

import { classificarEstagio } from "@/lib/classificador";
import {
  buscarAgendamentosDoDia,
  buscarIdadePaciente,
} from "@/lib/prodoctor-client";
import type { CardPaciente, RespostaPainel } from "@/lib/tipos";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseMedicos(req: Request): number[] {
  const url = new URL(req.url);
  const raw = url.searchParams.get("medicos") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function GET(req: Request): Promise<NextResponse<RespostaPainel>> {
  const codigosMedicos = parseMedicos(req);

  if (codigosMedicos.length === 0) {
    return NextResponse.json({
      cards: [],
      atualizadoEm: new Date().toISOString(),
      fonteOnline: true,
      ultimoErro: null,
    });
  }

  try {
    const agendamentos = await buscarAgendamentosDoDia(codigosMedicos);

    // Busca idade dos pacientes em paralelo, mas com cache: a maioria dos
    // pacientes do dia já estará no cache após o primeiro ciclo.
    const codigosPaciente = Array.from(
      new Set(
        agendamentos
          .map((a) => a.paciente?.codigo)
          .filter((c): c is number => typeof c === "number"),
      ),
    );

    const idades = new Map<number, number | null>();
    await Promise.all(
      codigosPaciente.map(async (codigo) => {
        const idade = await buscarIdadePaciente(codigo);
        idades.set(codigo, idade);
      }),
    );

    const cards: CardPaciente[] = agendamentos.map((ag) => {
      const estado = ag.estadoAgendaConsulta;
      const codigoPaciente = ag.paciente?.codigo ?? null;
      const idade =
        codigoPaciente !== null ? (idades.get(codigoPaciente) ?? null) : null;

      return {
        agendamentoId: `${ag.usuario?.codigo ?? "x"}-${ag.data ?? "x"}-${ag.hora ?? "x"}-${codigoPaciente ?? "x"}`,
        estagio: classificarEstagio(estado),
        paciente: {
          codigo: codigoPaciente,
          nome: ag.paciente?.nome ?? "(sem nome)",
          idade,
        },
        medico: {
          codigo: ag.usuario?.codigo ?? null,
          nome: ag.usuario?.nome ?? "—",
        },
        horarioAgendamento: ag.hora ?? null,
        convenio: ag.convenio?.nome ?? null,
        complemento: ag.complemento ?? null,
        flags: estado ?? {
          horaCompareceu: null,
          horaAtendimento: null,
          horaAtendido: null,
          compareceu: false,
          atendimento: false,
          atrasado: false,
          exameSituacao: false,
          atendido: false,
          faltou: false,
        },
        horaCompareceu: estado?.horaCompareceu ?? null,
        horaAtendimento: estado?.horaAtendimento ?? null,
        horaAtendido: estado?.horaAtendido ?? null,
      };
    });

    return NextResponse.json({
      cards,
      atualizadoEm: new Date().toISOString(),
      fonteOnline: true,
      ultimoErro: null,
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json(
      {
        cards: [],
        atualizadoEm: new Date().toISOString(),
        fonteOnline: false,
        ultimoErro: mensagem,
      },
      { status: 502 },
    );
  }
}
