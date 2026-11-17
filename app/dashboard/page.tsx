"use client";

/**
 * Dashboard de análise.
 *
 * Lê os eventos de mudança de estágio gravados pelo painel (coleção
 * `eventosEstagio` no Firestore), reconstrói a trajetória de cada paciente
 * no período e mostra:
 *
 * Cabeçalho
 *   - Filtros: período (presets + datas) e médico
 *   - 4 KPIs: Pacientes / Atendidos / Tempo total / Tempo de recepção
 *
 * Cartões de análise
 *   - Tempo por estágio (Recepção/Exames/Dilatação/Pronto p/ médico)
 *   - Pacientes por médico
 *   - Tempo total e tempo de recepção por convênio
 *   - Chegadas por hora do dia
 *   - Pacientes por dia
 *   - Distribuição por tipo de agendamento
 *
 * Os tempos são a MEDIANA (paciente típico), com média e "90% até" como
 * apoio — ver lib/agregarEventos.ts para as regras de cálculo.
 *
 * Esta página não consulta a API do ProDoctor: só o histórico já gravado.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import BarrasHorizontais from "@/components/dashboard/BarrasHorizontais";
import BarrasVerticais from "@/components/dashboard/BarrasVerticais";
import Filtros, { type PeriodoFiltro } from "@/components/dashboard/Filtros";
import KpiCard from "@/components/dashboard/KpiCard";

import {
  AMOSTRA_MINIMA,
  AMOSTRA_MINIMA_CONVENIO,
  calcularResumo,
  distribuicaoPorTipo,
  type Estatistica,
  medicosDoPeriodo,
  pacientesPorDia,
  pacientesPorHoraDoDia,
  pacientesPorMedico,
  reconstruirTrajetorias,
  tempoPorConvenio,
  tempoRecepcaoPorConvenio,
} from "@/lib/agregarEventos";
import { dataYYYYMMDDBrasil, nomeMedicoCurto } from "@/lib/configuracao";
import type { EventoBruto } from "@/lib/lerEventos";

interface RespostaEventosApi {
  eventos: EventoBruto[];
  totalRetornados: number;
  truncado?: boolean;
  fonteOnline: boolean;
  ultimoErro: string | null;
}

function periodoInicial(): PeriodoFiltro {
  const hoje = dataYYYYMMDDBrasil();
  // Default: últimos 7 dias.
  const d = new Date(Date.parse(`${hoje}T12:00:00-03:00`));
  d.setUTCDate(d.getUTCDate() - 6);
  return {
    dataInicio: dataYYYYMMDDBrasil(d),
    dataFim: hoje,
  };
}

export default function DashboardPage() {
  const [periodo, setPeriodo] = useState<PeriodoFiltro>(() => periodoInicial());
  const [medico, setMedico] = useState<number | null>(null);
  const [eventos, setEventos] = useState<EventoBruto[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** Incrementa para forçar nova leitura (ex.: após recuperar chegadas). */
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    async function buscar(): Promise<void> {
      try {
        const url = `/api/eventos?dataInicio=${periodo.dataInicio}&dataFim=${periodo.dataFim}`;
        const resp = await fetch(url, { cache: "no-store" });
        const dados = (await resp.json()) as RespostaEventosApi;
        if (cancelado) return;
        setEventos(Array.isArray(dados.eventos) ? dados.eventos : []);
        setTruncado(Boolean(dados.truncado));
        setErro(dados.ultimoErro ?? null);
      } catch {
        if (cancelado) return;
        setErro("Não foi possível falar com o servidor. Verifique a conexão.");
        setEventos([]);
        setTruncado(false);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void buscar();
    return () => {
      cancelado = true;
    };
  }, [periodo.dataInicio, periodo.dataFim, recarga]);

  const todas = useMemo(() => reconstruirTrajetorias(eventos), [eventos]);
  const medicos = useMemo(() => medicosDoPeriodo(todas), [todas]);

  // Se o médico escolhido não tem pacientes no período, o filtro volta
  // para "todos" em vez de mostrar uma tela vazia sem explicação.
  const medicoAtivo =
    medico !== null && medicos.some((m) => m.codigo === medico) ? medico : null;

  const trajetorias = useMemo(
    () =>
      medicoAtivo === null
        ? todas
        : todas.filter((t) => t.medicoCodigo === medicoAtivo),
    [todas, medicoAtivo],
  );
  const resumo = useMemo(() => calcularResumo(trajetorias), [trajetorias]);

  const tempoPorEstagio = useMemo(
    () =>
      [
        { rotulo: "Recepção", est: resumo.recepcao },
        { rotulo: "Sala de exames", est: resumo.exames },
        { rotulo: "Em dilatação", est: resumo.dilatacao },
        { rotulo: "Pronto p/ médico", est: resumo.prontoMedico },
      ].map(({ rotulo, est }) => {
        const ok = suficiente(est);
        return {
          rotulo,
          valor: ok ? ok.mediana : 0,
          valorFormatado: ok
            ? `${formatarMin(ok.mediana)} · ${ok.n} pac`
            : est
              ? `amostra pequena (${est.n} pac)`
              : "—",
        };
      }),
    [resumo],
  );

  const porConvenioTotal = useMemo(() => tempoPorConvenio(trajetorias), [trajetorias]);
  const porConvenioRecepcao = useMemo(
    () => tempoRecepcaoPorConvenio(trajetorias),
    [trajetorias],
  );
  const porMedico = useMemo(
    () =>
      pacientesPorMedico(todas).map((i) => ({
        ...i,
        valorFormatado: `${i.valor} pac`,
      })),
    [todas],
  );
  const porHora = useMemo(() => pacientesPorHoraDoDia(trajetorias), [trajetorias]);
  const porDia = useMemo(
    () => pacientesPorDia(trajetorias, periodo),
    [trajetorias, periodo],
  );
  const porTipo = useMemo(
    () =>
      distribuicaoPorTipo(trajetorias).map((i) => ({
        ...i,
        valorFormatado: `${i.valor} pac`,
      })),
    [trajetorias],
  );

  const semChegada = resumo.pacientesTotais - resumo.pacientesComChegada;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Painel Oftalmocenter
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Dashboard de análise
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Filtrar por médico"
              value={medicoAtivo ?? ""}
              onChange={(e) =>
                setMedico(e.target.value === "" ? null : Number(e.target.value))
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Todos os médicos</option>
              {medicos.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {nomeMedicoCurto(m.codigo, m.nome)}
                </option>
              ))}
            </select>
            <Filtros periodo={periodo} onChange={setPeriodo} />
          </div>
        </div>
      </header>

      <main
        className={`mx-auto max-w-7xl px-6 py-6 transition-opacity ${
          carregando ? "opacity-60" : ""
        }`}
        aria-busy={carregando}
      >
        {erro && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-medium">Não foi possível carregar os dados</p>
            <p className="mt-1 text-xs">{erro}</p>
            <p className="mt-2 text-xs text-red-600">
              Se o problema continuar, confira em{" "}
              <Link href="/api/diagnostico" className="underline">
                /api/diagnostico
              </Link>{" "}
              se o Firebase está inicializado.
            </p>
          </div>
        )}

        {truncado && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Período grande demais</p>
            <p className="mt-1 text-xs">
              O período tem mais eventos do que o dashboard carrega de uma
              vez, então os dias mais recentes ficaram de fora. Escolha um
              período menor para ver números completos.
            </p>
          </div>
        )}

        {!carregando && !erro && semChegada > 0 && (
          <AvisoSemChegada
            semChegada={semChegada}
            total={resumo.pacientesTotais}
            chegadaDesde={resumo.chegadaDesde}
            periodo={periodo}
            aoRecuperar={() => setRecarga((n) => n + 1)}
          />
        )}

        {/* KPIs */}
        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            rotulo="Pacientes do período"
            valor={resumo.pacientesTotais}
            descricao={carregando ? "Carregando…" : "Chegaram e passaram pelo painel"}
          />
          <KpiCard
            rotulo="Atendidos"
            valor={resumo.pacientesAtendidos}
            descricao={
              resumo.pacientesTotais > 0
                ? `${Math.round(
                    (resumo.pacientesAtendidos / resumo.pacientesTotais) * 100,
                  )}% do período`
                : null
            }
            destaque="verde"
          />
          <KpiCard
            rotulo="Tempo total típico"
            valor={formatarMin(suficiente(resumo.tempoTotal)?.mediana)}
            descricao={descreverTempo(
              resumo.tempoTotal,
              resumo.tempoTotalDesdeChegada
                ? "Da chegada ao atendimento"
                : "Da saída da recepção ao atendimento (sem hora de chegada)",
            )}
          />
          <KpiCard
            rotulo="Recepção típica"
            valor={formatarMin(suficiente(resumo.recepcao)?.mediana)}
            descricao={descreverTempo(
              resumo.recepcao,
              "Da chegada até sair da recepção",
            )}
          />
        </section>

        {/* Gráficos */}
        <section className="grid gap-4 lg:grid-cols-2">
          <BarrasHorizontais
            titulo="Tempo típico por estágio"
            itens={tempoPorEstagio}
            cor="#1F4FA8"
          />
          <BarrasHorizontais
            titulo="Pacientes por médico"
            itens={porMedico}
            cor="#0F766E"
            vazioMensagem="Nenhum paciente no período."
          />
          <BarrasHorizontais
            titulo="Tempo total na clínica · por convênio"
            itens={porConvenioTotal}
            cor="#7E22CE"
            vazioMensagem="Nenhum paciente concluiu o atendimento no período."
          />
          <BarrasHorizontais
            titulo="Tempo na recepção · por convênio"
            itens={porConvenioRecepcao}
            cor="#A32D2D"
            vazioMensagem="Sem tempo de recepção medido no período."
          />
          <BarrasVerticais
            titulo="Chegadas por hora do dia"
            itens={porHora}
            cor="#854F0B"
          />
          <BarrasVerticais
            titulo="Pacientes por dia"
            itens={porDia}
            cor="#1F4FA8"
            vazioMensagem="Nenhum paciente no período."
          />
          <BarrasHorizontais
            titulo="Por tipo de agendamento"
            itens={porTipo}
            cor="#22C55E"
          />
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Tempos mostram o paciente típico (mediana): metade ficou menos,
          metade ficou mais. Um tempo só aparece quando há pelo menos{" "}
          {AMOSTRA_MINIMA} pacientes medidos. “Pronto p/ médico” inclui a espera e a
          consulta. Nos rankings por convênio entram os 10 maiores tempos
          entre convênios com pelo menos {AMOSTRA_MINIMA_CONVENIO}{" "}
          pacientes.{" "}
          <Link href="/" className="underline">
            voltar ao início
          </Link>
        </footer>
      </main>
    </div>
  );
}

/** A estatística só vale como "tempo típico" com amostra mínima. */
function suficiente(est: Estatistica | null): Estatistica | null {
  return est && est.n >= AMOSTRA_MINIMA ? est : null;
}

function descreverTempo(est: Estatistica | null, oQueMede: string): string {
  if (!est) return `${oQueMede} · nenhum paciente medido no período`;
  if (est.n < AMOSTRA_MINIMA) {
    return `${oQueMede} · só ${est.n} paciente${est.n > 1 ? "s" : ""} medido${est.n > 1 ? "s" : ""} — pouco para um tempo confiável`;
  }
  return `${oQueMede} · ${est.n} pacientes · média ${formatarMin(est.media)} · 90% até ${formatarMin(est.p90)}`;
}

function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

interface RespostaRecuperacao {
  ok: boolean;
  mensagem?: string;
  diasProcessados?: number;
  chegadasEncontradas?: number;
  chamadasProDoctor?: number;
}

/**
 * Aviso de que parte do período não tem hora de chegada, com o botão que
 * busca essa hora no ProDoctor (uma vez por dia antigo; pede o PIN).
 */
function AvisoSemChegada({
  semChegada,
  total,
  chegadaDesde,
  periodo,
  aoRecuperar,
}: {
  semChegada: number;
  total: number;
  chegadaDesde: string | null;
  periodo: PeriodoFiltro;
  aoRecuperar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pin, setPin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);

  async function recuperar(): Promise<void> {
    setEnviando(true);
    setRetorno(null);
    try {
      const resp = await fetch("/api/chegadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...periodo }),
      });
      const dados = (await resp.json()) as RespostaRecuperacao;
      if (!dados.ok) {
        setRetorno({ ok: false, texto: dados.mensagem ?? "Não foi possível recuperar." });
        return;
      }
      const encontradas = dados.chegadasEncontradas ?? 0;
      setRetorno({
        ok: true,
        texto:
          (dados.diasProcessados ?? 0) === 0
            ? "Este período já tinha sido recuperado. Os pacientes que continuam sem chegada não têm essa hora no ProDoctor."
            : `${encontradas} chegadas encontradas no ProDoctor em ${dados.diasProcessados} dias (${dados.chamadasProDoctor} consulta${dados.chamadasProDoctor === 1 ? "" : "s"} à API).`,
      });
      setAberto(false);
      setPin("");
      aoRecuperar();
    } catch {
      setRetorno({ ok: false, texto: "Falha de conexão. Tente de novo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">
        {semChegada} de {total} pacientes deste período não têm a hora de
        chegada registrada
      </p>
      <p className="mt-1 text-xs">
        São registros de antes de o painel gravar a chegada
        {chegadaDesde ? ` (ela é gravada desde ${dataBR(chegadaDesde)})` : ""}.
        Eles contam nos volumes e nos tempos de exames, dilatação e médico,
        mas não têm tempo de recepção, e o tempo total deles só conta a
        partir da saída da recepção.{" "}
        A hora de chegada desses dias pode ser buscada no ProDoctor.
      </p>

      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-2 rounded border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          Buscar chegadas no ProDoctor
        </button>
      ) : (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void recuperar();
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="PIN do modo edição"
            aria-label="PIN do modo edição"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-44 rounded border border-amber-300 bg-white px-2 py-1 text-xs focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={enviando || pin === ""}
            className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {enviando ? "Buscando…" : "Buscar"}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="text-xs underline"
          >
            cancelar
          </button>
          <span className="text-[11px] text-amber-800">
            Usa 1 consulta à API do ProDoctor a cada 7 dias do período, uma
            única vez.
          </span>
        </form>
      )}

      {retorno && (
        <p
          className={`mt-2 text-xs ${retorno.ok ? "text-emerald-800" : "text-red-700"}`}
          role="status"
        >
          {retorno.texto}
        </p>
      )}
    </div>
  );
}

function formatarMin(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor) || valor <= 0) {
    return "—";
  }
  const total = Math.max(1, Math.round(valor));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
