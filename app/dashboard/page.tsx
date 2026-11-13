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
  }, [periodo.dataInicio, periodo.dataFim]);

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
      ].map(({ rotulo, est }) => ({
        rotulo,
        valor: est?.mediana ?? 0,
        valorFormatado: est
          ? `${formatarMin(est.mediana)} · ${est.n} pac`
          : "—",
      })),
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
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
            {resumo.pacientesComChegada === 0 ? (
              <>
                Este período só tem registros antigos, sem a hora de chegada
                do paciente: o tempo de recepção não foi medido e o tempo
                total conta a partir da saída da recepção.
              </>
            ) : (
              <>
                {semChegada} de {resumo.pacientesTotais} pacientes são de
                registros antigos, sem hora de chegada. Eles contam nos
                volumes e nos tempos de exames/dilatação/médico, mas ficam
                fora do tempo total e do tempo de recepção.
              </>
            )}
          </div>
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
            valor={formatarMin(resumo.tempoTotal?.mediana)}
            descricao={descreverTempo(
              resumo.tempoTotal,
              resumo.tempoTotalDesdeChegada
                ? "Da chegada ao atendimento"
                : "Da saída da recepção ao atendimento",
            )}
          />
          <KpiCard
            rotulo="Recepção típica"
            valor={formatarMin(resumo.recepcao?.mediana)}
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
          metade ficou mais. “Pronto p/ médico” inclui a espera e a
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

function descreverTempo(est: Estatistica | null, oQueMede: string): string {
  if (!est) return oQueMede;
  return `${oQueMede} · média ${formatarMin(est.media)} · 90% até ${formatarMin(est.p90)}`;
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
