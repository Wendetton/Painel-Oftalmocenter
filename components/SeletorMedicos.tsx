"use client";

/**
 * Seletor de médicos do dia.
 *
 * Fase 2: visual mínimo (botões alternantes), sem modal de substituição.
 * Quando o usuário tenta marcar um terceiro, aparece uma mensagem inline
 * ("Limite de N médicos atingido") em vez de modal — o modal "qual
 * substituir?" da seção 4.7 do PLANEJAMENTO entra na Fase 3.
 */

import { useEffect, useState } from "react";

import { CONFIG } from "@/lib/configuracao";
import type { MedicoProDoctor } from "@/lib/tipos";

interface RespostaMedicosApi {
  medicos: MedicoProDoctor[];
  fonteOnline: boolean;
  ultimoErro: string | null;
}

interface Props {
  selecionados: number[];
  onAlternar: (codigo: number) => void;
  noLimite: (codigo: number) => boolean;
}

export default function SeletorMedicos({
  selecionados,
  onAlternar,
  noLimite,
}: Props) {
  const [medicos, setMedicos] = useState<MedicoProDoctor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function buscar(): Promise<void> {
      try {
        const resp = await fetch("/api/medicos", { cache: "no-store" });
        const dados = (await resp.json()) as RespostaMedicosApi;
        if (cancelado) return;
        setMedicos(dados.medicos);
        setErro(dados.ultimoErro);
      } catch (err) {
        if (cancelado) return;
        setErro(err instanceof Error ? err.message : "Erro ao buscar médicos");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void buscar();
    return () => {
      cancelado = true;
    };
  }, []);

  if (carregando) {
    return <p className="text-sm text-slate-500">Carregando médicos…</p>;
  }

  if (erro && medicos.length === 0) {
    return (
      <p className="text-sm text-red-600">
        Erro ao carregar médicos: {erro}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {medicos.map((medico) => {
        const ativo = selecionados.includes(medico.codigo);
        const bloqueado = noLimite(medico.codigo);
        return (
          <button
            key={medico.codigo}
            type="button"
            onClick={() => onAlternar(medico.codigo)}
            disabled={bloqueado}
            className={[
              "rounded-full border px-3 py-1 text-sm transition",
              ativo
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
              bloqueado ? "cursor-not-allowed opacity-40" : "",
            ].join(" ")}
            title={
              bloqueado
                ? `Limite de ${CONFIG.MAX_MEDICOS_SIMULTANEOS} médicos por painel`
                : ativo
                  ? "Clique para remover"
                  : "Clique para selecionar"
            }
          >
            {ativo ? "✓ " : ""}
            {medico.nome}
          </button>
        );
      })}
      {selecionados.length >= CONFIG.MAX_MEDICOS_SIMULTANEOS && (
        <span className="text-xs text-slate-500">
          (limite de {CONFIG.MAX_MEDICOS_SIMULTANEOS} médicos atingido — desmarque um para trocar)
        </span>
      )}
    </div>
  );
}
