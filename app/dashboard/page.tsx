"use client";

/**
 * Dashboard de análise — Fase B.
 *
 * Lê os eventos de transição gravados pela Fase A (coleção `eventosEstagio`
 * no Firestore), reconstrói as trajetórias dos pacientes no período
 * selecionado e mostra:
 *
 * Cabeçalho
 *   - Filtros de período (presets + datas custom)
 *   - 4 KPIs: Pacientes / Atendidos / Tempo médio total / Tempo médio recepção
 *
 * Cartões de análise
 *   - Tempo médio por estágio (Recepção/Exames/Dilatação/Consultório)
 *   - Tempo médio total na clínica por convênio (top 10)
 *   - Tempo médio na recepção por convênio (top 10)
 *   - Pacientes por médico
 *   - Distribuição por hora do dia
 *   - Pacientes por dia (linha temporal do período)
 *   - Distribuição por tipo de agendamento (Consulta/Retorno/Exame)
 *
 * Os filtros secundários (médico, convênio, tipo) podem entrar no futuro;
 * para v1, as agregações já dão visão completa.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import BarrasHorizontais from "@/components/dashboard/BarrasHorizontais";
import BarrasVerticais from "@/components/dashboard/BarrasVerticais";
import Filtros, { type PeriodoFiltro } from "@/components/dashboard/Filtros";
import KpiCard from "@/components/dashboard/KpiCard";

import {
  calcularResumo,
  distribuicaoPorTipo,
  pacientesPorDia,
  pacientesPorHoraDoDia,
  pacientesPorMedico,
  reconstruirTrajetorias,
  tempoMedioPorConvenio,
  tempoMedioRecepcaoPorConvenio,
} from "@/lib/agregarEventos";
import { dataYYYYMMDDBrasil } from "@/lib/configuracao";
import type { EventoBruto } from "@/lib/lerEventos";

interface RespostaEventosApi {
  eventos: EventoBruto[];
  totalRetornados: number;
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
  const [eventos, setEventos] = useState<EventoBruto[]>([]);
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
        setEventos(dados.eventos);
        setErro(dados.ultimoErro);
      } catch (err) {
        if (cancelado) return;
        setErro(err instanceof Error ? err.message : "Erro ao buscar eventos");
        setEventos([]);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void buscar();
    return () => {
      cancelado = true;
    };
  }, [periodo.dataInicio, periodo.dataFim]);

  const trajetorias = useMemo(() => reconstruirTrajetorias(eventos), [eventos]);
  const resumo = useMemo(() => calcularResumo(trajetorias), [trajetorias]);

  const tempoPorEstagio = useMemo(
    () =>
      [
        { rotulo: "Recepção", valor: resumo.tempoMedioRecepcaoMin ?? 0 },
        { rotulo: "Sala de exames", valor: resumo.tempoMedioExamesMin ?? 0 },
        { rotulo: "Em dilatação", valor: resumo.tempoMedioDilatacaoMin ?? 0 },
        { rotulo: "Pronto p/ médico", valor: resumo.tempoMedioConsultorioMin ?? 0 },
      ].map((i) => ({
        ...i,
        valorFormatado: `${formatarMin(i.valor)}`,
      })),
    [resumo],
  );

  const porConvenioTotal = useMemo(
    () => tempoMedioPorConvenio(trajetorias),
    [trajetorias],
  );
  const porConvenioRecepcao = useMemo(
    () => tempoMedioRecepcaoPorConvenio(trajetorias),
    [trajetorias],
  );
  const porMedico = useMemo(() => pacientesPorMedico(trajetorias), [trajetorias]);
  const porHora = useMemo(() => pacientesPorHoraDoDia(trajetorias), [trajetorias]);
  const porDia = useMemo(() => pacientesPorDia(trajetorias), [trajetorias]);
  const porTipo = useMemo(() => distribuicaoPorTipo(trajetorias), [trajetorias]);

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
          <Filtros periodo={periodo} onChange={setPeriodo} />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {erro && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-medium">Erro ao carregar dados:</p>
            <p className="mt-1 text-xs">{erro}</p>
            <p className="mt-2 text-xs text-red-600">
              Confirme em{" "}
              <Link href="/api/diagnostico" className="underline">
                /api/diagnostico
              </Link>{" "}
              que o Firebase está inicializado e que as credenciais estão
              corretas no Vercel.
            </p>
          </div>
        )}

        {/* KPIs */}
        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            rotulo="Pacientes do período"
            valor={resumo.pacientesTotais}
            descricao={
              carregando ? "Carregando…" : `${eventos.length} eventos lidos`
            }
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
            rotulo="Tempo médio total"
            valor={formatarMin(resumo.tempoMedioTotalMin)}
            descricao="Da chegada ao atendimento"
          />
          <KpiCard
            rotulo="Tempo médio recepção"
            valor={formatarMin(resumo.tempoMedioRecepcaoMin)}
            descricao="Espera até liberação para exames"
          />
        </section>

        {/* Gráficos */}
        <section className="grid gap-4 lg:grid-cols-2">
          <BarrasHorizontais
            titulo="Tempo médio por estágio"
            itens={tempoPorEstagio}
            unidade="min"
            cor="#1F4FA8"
          />
          <BarrasHorizontais
            titulo="Pacientes por médico"
            itens={porMedico}
            unidade="pac"
            cor="#0F766E"
            vazioMensagem="Nenhum paciente atendido no período."
          />
          <BarrasHorizontais
            titulo="Tempo total na clínica · por convênio (top 10)"
            itens={porConvenioTotal}
            cor="#7E22CE"
            vazioMensagem="Nenhum paciente concluiu o atendimento no período."
          />
          <BarrasHorizontais
            titulo="Tempo na recepção · por convênio (top 10)"
            itens={porConvenioRecepcao}
            cor="#A32D2D"
            vazioMensagem="Nenhuma passagem pela recepção no período."
          />
          <BarrasVerticais
            titulo="Distribuição por hora do dia (chegadas)"
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
            unidade="pac"
            cor="#22C55E"
          />
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Dados gerados a partir das transições de estágio capturadas pelo
          painel desde a integração com o Firebase. Eventos antes da
          configuração não estão na base.{" "}
          <Link href="/" className="underline">
            voltar ao início
          </Link>
        </footer>
      </main>
    </div>
  );
}

function formatarMin(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor) || valor <= 0) {
    return "—";
  }
  if (valor < 60) return `${Math.round(valor)} min`;
  const h = Math.floor(valor / 60);
  const m = Math.round(valor % 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
