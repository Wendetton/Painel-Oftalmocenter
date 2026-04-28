"use client";

/**
 * Seletor de médicos do dia (PLANEJAMENTO seção 4.7).
 *
 * Comportamento:
 * - Pílulas alternantes, fundo azul + ✓ quando ativo.
 * - Click alterna estado.
 * - Se já há MAX_MEDICOS ativos e o usuário tenta ativar um terceiro:
 *   abre ModalTrocarMedico perguntando qual dos 2 ativos substituir.
 * - Persistência ocorre no hook useMedicosSelecionados (localStorage).
 */

import { useEffect, useState } from "react";

import ModalTrocarMedico from "./ModalTrocarMedico";

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
  const [pendenteTroca, setPendenteTroca] = useState<MedicoProDoctor | null>(null);

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
    return <p className="text-sm text-red-600">Erro ao carregar médicos: {erro}</p>;
  }

  const handleClick = (medico: MedicoProDoctor) => {
    const jaAtivo = selecionados.includes(medico.codigo);
    if (jaAtivo) {
      // Sempre permite remover um ativo.
      onAlternar(medico.codigo);
      return;
    }
    if (noLimite(medico.codigo)) {
      // Em vez de bloquear (Fase 2), abre modal pedindo qual substituir.
      setPendenteTroca(medico);
      return;
    }
    onAlternar(medico.codigo);
  };

  const handleTrocar = (codigoRemover: number) => {
    if (!pendenteTroca) return;
    onAlternar(codigoRemover); // remove o antigo
    onAlternar(pendenteTroca.codigo); // adiciona o novo
    setPendenteTroca(null);
  };

  const ativos = medicos.filter((m) => selecionados.includes(m.codigo));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {medicos.map((medico) => {
          const ativo = selecionados.includes(medico.codigo);
          return (
            <button
              key={medico.codigo}
              type="button"
              onClick={() => handleClick(medico)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                ativo
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              {ativo ? "✓ " : ""}
              {medico.nome}
            </button>
          );
        })}
        <span className="text-xs text-slate-500">
          {selecionados.length}/{CONFIG.MAX_MEDICOS_SIMULTANEOS} médicos
        </span>
      </div>

      {pendenteTroca && (
        <ModalTrocarMedico
          novoMedico={pendenteTroca}
          ativos={ativos}
          onTrocar={handleTrocar}
          onCancelar={() => setPendenteTroca(null)}
        />
      )}
    </>
  );
}
