import { NextResponse } from "next/server";

import { classificarEstagio } from "@/lib/classificador";
import {
  buscarAgendamentosDoDia,
  buscarIdadePaciente,
} from "@/lib/prodoctor-client";
import {
  horaSPParaTimestampMs,
  limparAusentes,
  registrarEstagio,
} from "@/lib/rastreadorEstagio";
import type {
  CardPaciente,
  EstagioPaciente,
  RespostaPainel,
  TipoAgendamento,
} from "@/lib/tipos";

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

const TIPO_VAZIO: TipoAgendamento = {
  consulta: false,
  retorno: false,
  exame: false,
  cirurgia: false,
  compromisso: false,
  teleconsulta: false,
};

const FLAGS_VAZIAS = {
  horaCompareceu: null,
  horaAtendimento: null,
  horaAtendido: null,
  compareceu: false,
  atendimento: false,
  atrasado: false,
  exameSituacao: false,
  atendido: false,
  faltou: false,
} as const;

/**
 * Para cada estágio, devolve o timestamp "real" mais preciso que a API
 * ProDoctor entrega (ou null quando ela não tem essa informação). Esse
 * timestamp é usado como fallback inicial pelo rastreador quando vê o
 * agendamento pela primeira vez (cold start de instância serverless).
 */
function fallbackInicialDoEstagio(
  estagio: EstagioPaciente,
  horaCompareceu: string | null,
  horaAtendimento: string | null,
): number | null {
  switch (estagio) {
    case "RECEPCAO":
      return horaSPParaTimestampMs(horaCompareceu);
    case "PRONTO_MEDICO":
      return (
        horaSPParaTimestampMs(horaAtendimento) ??
        horaSPParaTimestampMs(horaCompareceu)
      );
    case "SALA_EXAMES":
    case "DILATACAO":
      // Sem timestamp específico na API. O rastreador usa "agora" como
      // fallback e se autocorrige na próxima transição.
      return null;
    case "ATENDIDO":
    case "AGENDADO":
    case "FALTOU":
      return null;
  }
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

    const idsAtivos = new Set<string>();

    const cards: CardPaciente[] = agendamentos.map((ag) => {
      const estado = ag.estadoAgendaConsulta;
      const codigoPaciente = ag.paciente?.codigo ?? null;
      const idade =
        codigoPaciente !== null ? (idades.get(codigoPaciente) ?? null) : null;
      const estagio = classificarEstagio(estado);
      const agendamentoId = `${ag.usuario?.codigo ?? "x"}-${ag.data ?? "x"}-${ag.hora ?? "x"}-${codigoPaciente ?? "x"}`;
      idsAtivos.add(agendamentoId);

      // Calcula a hora de entrada no estágio atual. AGENDADO e FALTOU não
      // têm cronômetro, então não passa pelo rastreador.
      let estagioDesdeEm: string | null = null;
      if (estagio !== "AGENDADO" && estagio !== "FALTOU") {
        const fallback = fallbackInicialDoEstagio(
          estagio,
          estado?.horaCompareceu ?? null,
          estado?.horaAtendimento ?? null,
        );
        const ts = registrarEstagio(agendamentoId, estagio, fallback);
        estagioDesdeEm = new Date(ts).toISOString();
      }

      return {
        agendamentoId,
        estagio,
        estagioDesdeEm,
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
        flags: estado ?? FLAGS_VAZIAS,
        horaCompareceu: estado?.horaCompareceu ?? null,
        horaAtendimento: estado?.horaAtendimento ?? null,
        horaAtendido: estado?.horaAtendido ?? null,
        tipoAgendamento: ag.tipoAgendamento ?? TIPO_VAZIO,
      };
    });

    // GC: remove do rastreador agendamentos que sumiram da agenda do dia
    // (cancelados, próximo dia já chegou, etc.).
    limparAusentes(idsAtivos);

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
