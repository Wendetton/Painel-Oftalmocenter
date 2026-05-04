"use client";

/**
 * Barra de filtros do dashboard. Datas + presets rápidos.
 *
 * Os presets cobrem o que a equipe normalmente quer ver:
 *   - Hoje, ontem, últimos 7 dias, últimos 30 dias, mês atual.
 *
 * Datas customizadas via 2 inputs do tipo date. O parent recebe
 * `dataInicio` e `dataFim` em formato YYYY-MM-DD.
 */

import { useMemo } from "react";

import { dataYYYYMMDDBrasil } from "@/lib/configuracao";

export interface PeriodoFiltro {
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
}

interface Props {
  periodo: PeriodoFiltro;
  onChange: (novo: PeriodoFiltro) => void;
}

interface Preset {
  rotulo: string;
  calcular: () => PeriodoFiltro;
}

function adicionarDias(dataYYYYMMDD: string, dias: number): string {
  const t = Date.parse(`${dataYYYYMMDD}T12:00:00-03:00`);
  if (!Number.isFinite(t)) return dataYYYYMMDD;
  return dataYYYYMMDDBrasil(new Date(t + dias * 86_400_000));
}

function inicioDoMes(dataYYYYMMDD: string): string {
  const m = dataYYYYMMDD.slice(0, 7); // "YYYY-MM"
  return `${m}-01`;
}

const PRESETS: Preset[] = [
  {
    rotulo: "Hoje",
    calcular: () => {
      const hoje = dataYYYYMMDDBrasil();
      return { dataInicio: hoje, dataFim: hoje };
    },
  },
  {
    rotulo: "Ontem",
    calcular: () => {
      const ontem = adicionarDias(dataYYYYMMDDBrasil(), -1);
      return { dataInicio: ontem, dataFim: ontem };
    },
  },
  {
    rotulo: "7 dias",
    calcular: () => {
      const hoje = dataYYYYMMDDBrasil();
      return { dataInicio: adicionarDias(hoje, -6), dataFim: hoje };
    },
  },
  {
    rotulo: "30 dias",
    calcular: () => {
      const hoje = dataYYYYMMDDBrasil();
      return { dataInicio: adicionarDias(hoje, -29), dataFim: hoje };
    },
  },
  {
    rotulo: "Mês atual",
    calcular: () => {
      const hoje = dataYYYYMMDDBrasil();
      return { dataInicio: inicioDoMes(hoje), dataFim: hoje };
    },
  },
];

export default function Filtros({ periodo, onChange }: Props) {
  const presetAtivo = useMemo(() => {
    return PRESETS.find((p) => {
      const calc = p.calcular();
      return calc.dataInicio === periodo.dataInicio && calc.dataFim === periodo.dataFim;
    })?.rotulo ?? null;
  }, [periodo]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        {PRESETS.map((p) => {
          const ativo = presetAtivo === p.rotulo;
          return (
            <button
              key={p.rotulo}
              type="button"
              onClick={() => onChange(p.calcular())}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                ativo
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p.rotulo}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="date"
          value={periodo.dataInicio}
          onChange={(e) => onChange({ ...periodo, dataInicio: e.target.value })}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums focus:border-blue-500 focus:outline-none"
        />
        <span className="text-slate-400">até</span>
        <input
          type="date"
          value={periodo.dataFim}
          onChange={(e) => onChange({ ...periodo, dataFim: e.target.value })}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums focus:border-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
