"use client";

/**
 * Modal "qual médico substituir?" — PLANEJAMENTO seção 4.7.
 *
 * Aparece quando o usuário clica num terceiro médico já com 2 selecionados.
 * Mostra os 2 ativos e pergunta qual remover para dar lugar ao novo.
 */

import { useEffect } from "react";

import type { MedicoProDoctor } from "@/lib/tipos";

interface Props {
  novoMedico: MedicoProDoctor;
  ativos: MedicoProDoctor[];
  onTrocar: (codigoRemover: number) => void;
  onCancelar: () => void;
}

export default function ModalTrocarMedico({
  novoMedico,
  ativos,
  onTrocar,
  onCancelar,
}: Props) {
  // Fecha com ESC para acessibilidade.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancelar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={onCancelar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-titulo" className="text-lg font-semibold text-slate-900">
          Trocar médico do painel
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Você quer adicionar{" "}
          <strong className="text-slate-900">{novoMedico.nome}</strong>, mas o
          painel já está com 2 médicos. Qual deles substituir?
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {ativos.map((medico) => (
            <button
              key={medico.codigo}
              type="button"
              onClick={() => onTrocar(medico.codigo)}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-400 hover:bg-white"
            >
              <span className="font-medium text-slate-900">{medico.nome}</span>
              <span className="text-xs uppercase tracking-wider text-slate-500">
                substituir →
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
