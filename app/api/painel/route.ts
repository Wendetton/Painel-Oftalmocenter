import { NextResponse } from "next/server";

import { classificarEstagio } from "@/lib/classificador";
import { dataYYYYMMDDBrasil } from "@/lib/configuracao";
import {
  carregarEstadosDoDia,
  salvarEstadoAtual,
} from "@/lib/estadoAtualPersistente";
import { gravarEventoTransicao } from "@/lib/eventoEstagio";
import {
  buscarAgendamentosDoDia,
  buscarIdadePaciente,
} from "@/lib/prodoctor-client";
import {
  hidratarEstados,
  jaHidratadoPara,
  limparAusentes,
  registrarEstagio,
} from "@/lib/rastreadorEstagio";
import type { CardPaciente, RespostaPainel, TipoAgendamento } from "@/lib/tipos";

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

    // Hidrata o rastreador com o estado salvo no Firestore na PRIMEIRA
    // chamada após cold start. Isso garante que o cronômetro de cada
    // card mostre o tempo real desde a transição, mesmo quando o
    // servidor acabou de subir e nunca tinha visto o paciente.
    // Chamadas subsequentes na mesma instância pulam direto (já
    // hidratado).
    const dataHoje = dataYYYYMMDDBrasil();
    if (!jaHidratadoPara(dataHoje)) {
      const estadosSalvos = await carregarEstadosDoDia(dataHoje);
      hidratarEstados(estadosSalvos, dataHoje);
    }

    const idsAtivos = new Set<string>();

    const cards: CardPaciente[] = agendamentos.map((ag) => {
      const estado = ag.estadoAgendaConsulta;
      const codigoPaciente = ag.paciente?.codigo ?? null;
      const idade =
        codigoPaciente !== null ? (idades.get(codigoPaciente) ?? null) : null;
      const estagio = classificarEstagio(estado);
      const agendamentoId = `${ag.usuario?.codigo ?? "x"}-${ag.data ?? "x"}-${ag.hora ?? "x"}-${codigoPaciente ?? "x"}`;
      idsAtivos.add(agendamentoId);

      // AGENDADO e FALTOU não têm cronômetro — não passam pelo rastreador.
      // Para os demais estágios:
      // - Pedimos ao rastreador o instante em que o servidor primeiro viu
      //   o card naquele estágio (ou hidratado do Firestore na primeira
      //   chamada após cold start).
      // - Em primeira aparição OU transição: persistimos o estado no
      //   Firestore (lib/estadoAtualPersistente) → próxima instância /
      //   próxima TV consegue ler o mesmo cronômetro.
      // - Em transição real (mudou de estágio): além de persistir,
      //   gravamos um evento na coleção `eventosEstagio` (Fase A do
      //   dashboard de análise).
      let estagioDesdeEm: string | null = null;
      if (estagio !== "AGENDADO" && estagio !== "FALTOU") {
        const resultado = registrarEstagio(agendamentoId, estagio);
        estagioDesdeEm = new Date(resultado.desdeEm).toISOString();

        if (resultado.primeiraAparicao || resultado.transicaoObservada) {
          // Persiste o instante de entrada no estágio. Fire-and-forget.
          void salvarEstadoAtual(
            agendamentoId,
            estagio,
            new Date(resultado.desdeEm),
            dataHoje,
          );
        }

        if (resultado.transicaoObservada) {
          // Evento de analytics. Fire-and-forget.
          void gravarEventoTransicao({
            agendamentoId,
            pacienteCodigo: codigoPaciente,
            pacienteNome: ag.paciente?.nome ?? "(sem nome)",
            medicoCodigo: ag.usuario?.codigo ?? null,
            medicoNome: ag.usuario?.nome ?? "—",
            convenio: ag.convenio?.nome ?? null,
            estagioAnterior: resultado.estagioAnterior,
            estagioNovo: estagio,
            momento: new Date(resultado.desdeEm),
            data: dataHoje,
            tipoConsulta: ag.tipoAgendamento?.consulta ?? false,
            tipoRetorno: ag.tipoAgendamento?.retorno ?? false,
            tipoExame: ag.tipoAgendamento?.exame ?? false,
          });
        }
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
        chaveAgendamento:
          typeof ag.localProDoctor?.codigo === "number" &&
          typeof ag.usuario?.codigo === "number" &&
          ag.data &&
          ag.hora
            ? {
                localCodigo: ag.localProDoctor.codigo,
                usuarioCodigo: ag.usuario.codigo,
                data: ag.data,
                hora: ag.hora,
              }
            : null,
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
