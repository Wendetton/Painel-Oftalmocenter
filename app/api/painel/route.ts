import { NextResponse } from "next/server";

import { classificarEstagio } from "@/lib/classificador";
import { CONFIG, dataYYYYMMDDBrasil } from "@/lib/configuracao";
import { idadeDeDataNascimento } from "@/lib/idade";
import {
  carregarEstadosDoDia,
  consultarEstadoAtual,
  salvarEstadoAtual,
} from "@/lib/estadoAtualPersistente";
import { gravarEventoTransicao } from "@/lib/eventoEstagio";
import {
  buscarAgendamentosDoDia,
  buscarIdadesComOrcamento,
} from "@/lib/prodoctor-client";
import {
  forcarEntrada,
  hidratarEstados,
  jaHidratadoPara,
  limparAusentes,
  registrarEstagio,
} from "@/lib/rastreadorEstagio";
import type {
  CardPaciente,
  MetaPainel,
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
    const agenda = await buscarAgendamentosDoDia(codigosMedicos);
    const agendamentos = agenda.agendamentos;

    // Idade: a própria resposta da agenda traz `paciente.dataNascimento`,
    // então calculamos aqui sem nenhuma chamada extra à ProDoctor. Só os
    // pacientes cujo cadastro veio sem data de nascimento caem na reserva
    // (/Pacientes/Detalhar), com orçamento pequeno por ciclo — quem ficar
    // de fora aparece sem idade por alguns segundos e entra nos próximos.
    const idades = new Map<number, number | null>();
    const semDataNascimento: number[] = [];
    for (const ag of agendamentos) {
      const codigo = ag.paciente?.codigo;
      if (typeof codigo !== "number" || idades.has(codigo)) continue;
      const idade = idadeDeDataNascimento(ag.paciente?.dataNascimento);
      if (idade !== null) {
        idades.set(codigo, idade);
      } else {
        semDataNascimento.push(codigo);
      }
    }
    const idadesDaAgenda = idades.size;

    const idadesReserva = await buscarIdadesComOrcamento(
      semDataNascimento,
      CONFIG.ORCAMENTO_IDADE_DETALHAR,
    );
    let idadesDetalhar = 0;
    for (const [codigo, idade] of idadesReserva) {
      idades.set(codigo, idade);
      if (idade !== null) idadesDetalhar += 1;
    }

    const meta: MetaPainel = {
      agendaStale: agenda.stale,
      agendaObtidaEm: new Date(agenda.obtidaEm).toISOString(),
      idadesDaAgenda,
      idadesDetalhar,
      semIdade: semDataNascimento.length - idadesDetalhar,
    };

    // Hidrata o rastreador com o estado salvo no Firestore na PRIMEIRA
    // chamada após cold start. Isso garante que o cronômetro de cada
    // card mostre o tempo real desde a transição, mesmo quando o
    // servidor acabou de subir e nunca tinha visto o paciente.
    //
    // Importante: só marcamos como hidratado se a leitura do Firestore
    // foi bem-sucedida. Se falhar (timeout, quota, etc.), tentamos de
    // novo na próxima chamada — não queremos um Map vazio sendo tratado
    // como "estado válido" (faria todo cronômetro zerar).
    const dataHoje = dataYYYYMMDDBrasil();
    if (!jaHidratadoPara(dataHoje)) {
      const r = await carregarEstadosDoDia(dataHoje);
      if (r.ok) {
        hidratarEstados(r.estados, dataHoje);
      }
      // Se r.ok=false, NÃO marca como hidratado. Próxima chamada de
      // /api/painel vai tentar carregar de novo. Enquanto isso o
      // rastreador funciona em memória pura — comportamento antigo.
    }

    const idsAtivos = new Set<string>();

    const cards: CardPaciente[] = await Promise.all(
      agendamentos.map(async (ag) => {
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
      // - Defesa em profundidade: se o rastreador disser "primeira
      //   aparição", consultamos o Firestore individualmente. Se já
      //   existe doc para esse agendamentoId no mesmo estágio, usamos o
      //   desdeEm de lá (Firestore = fonte de verdade entre instâncias).
      //   Isso fecha o gap quando uma instância "perde" o estado em
      //   memória mas o Firestore tem.
      // - Em primeira aparição (real) OU transição: persistimos no
      //   Firestore (lib/estadoAtualPersistente).
      // - Em transição real: gravamos evento na coleção `eventosEstagio`.
      let estagioDesdeEm: string | null = null;
      if (estagio !== "AGENDADO" && estagio !== "FALTOU") {
        let resultado = registrarEstagio(agendamentoId, estagio);

        if (resultado.primeiraAparicao) {
          // Defesa: confirma no Firestore antes de assumir que é mesmo
          // primeira aparição (= cronômetro do zero).
          const existente = await consultarEstadoAtual(agendamentoId);
          if (existente && existente.estagio === estagio) {
            // Já existe no Firestore com o mesmo estágio. Sincroniza a
            // memória e usa o desdeEm canônico.
            forcarEntrada(agendamentoId, estagio, existente.desdeEmMs);
            resultado = {
              desdeEm: existente.desdeEmMs,
              primeiraAparicao: false,
              transicaoObservada: false,
              estagioAnterior: estagio,
            };
          }
        }

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
    }),
    );

    // GC: remove do rastreador agendamentos que sumiram da agenda do dia
    // (cancelados, próximo dia já chegou, etc.).
    limparAusentes(idsAtivos);

    // Agenda stale (ProDoctor falhou ou está em pausa pós-429): a TV
    // continua com os cards, mas `atualizadoEm` reflete quando os dados
    // foram realmente obtidos e o rodapé mostra o aviso.
    return NextResponse.json({
      cards,
      atualizadoEm: new Date(agenda.obtidaEm).toISOString(),
      fonteOnline: true,
      ultimoErro: agenda.stale
        ? "ProDoctor indisponível no momento (limite de requisições ou oscilação); mostrando a última agenda recebida."
        : null,
      meta,
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
