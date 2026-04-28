"use client";

/**
 * Seletor de médicos do dia, versão compacta.
 *
 * Aparece como um único botão no header (ícone de pessoas + apelidos dos
 * selecionados + chevron). Click abre um popover com a lista completa de
 * médicos da clínica, onde o usuário marca/desmarca.
 *
 * Por que compacto: a equipe quer aproveitar o máximo da tela para os
 * cards (PLANEJAMENTO seção 4.1). A linha inteira que era ocupada pelas
 * pílulas vira espaço para os pacientes.
 *
 * Comportamento:
 * - Click no botão → abre popover.
 * - Click fora ou ESC → fecha popover.
 * - Click num médico já ativo → remove (sem fechar o popover).
 * - Click num médico inativo (com vagas) → adiciona (sem fechar).
 * - Click num terceiro médico (com 2 já ativos) → fecha popover e abre
 *   ModalTrocarMedico perguntando qual substituir (PLANEJAMENTO seção 4.7).
 */

import { useEffect, useRef, useState } from "react";

import ModalTrocarMedico from "./ModalTrocarMedico";

import { CONFIG, nomeMedicoCurto } from "@/lib/configuracao";
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
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Busca lista de médicos uma vez no mount.
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

  // Fecha popover ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  // Fecha popover com ESC.
  useEffect(() => {
    if (!aberto) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [aberto]);

  const handleClick = (medico: MedicoProDoctor) => {
    const jaAtivo = selecionados.includes(medico.codigo);
    if (jaAtivo) {
      onAlternar(medico.codigo);
      return;
    }
    if (noLimite(medico.codigo)) {
      setAberto(false);
      setPendenteTroca(medico);
      return;
    }
    onAlternar(medico.codigo);
  };

  const handleTrocar = (codigoRemover: number) => {
    if (!pendenteTroca) return;
    onAlternar(codigoRemover);
    onAlternar(pendenteTroca.codigo);
    setPendenteTroca(null);
  };

  const ativos = medicos.filter((m) => selecionados.includes(m.codigo));
  const labelAtivos =
    ativos.length === 0
      ? "Selecionar médicos"
      : ativos
          .map((m) => nomeMedicoCurto(m.codigo, m.nome))
          .join(" · ");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={carregando || (medicos.length === 0 && !!erro)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="true"
        aria-expanded={aberto}
        title="Trocar médicos do painel"
      >
        <IconePessoas />
        <span className="max-w-[14rem] truncate">
          {carregando ? "Carregando…" : labelAtivos}
        </span>
        <Chevron aberto={aberto} />
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-72 origin-top-right rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Médicos do dia · {selecionados.length}/
            {CONFIG.MAX_MEDICOS_SIMULTANEOS}
          </p>
          {erro && medicos.length === 0 ? (
            <p className="px-2 py-2 text-xs text-red-600">{erro}</p>
          ) : (
            <ul className="flex flex-col gap-1 py-1">
              {medicos.map((medico) => {
                const ativo = selecionados.includes(medico.codigo);
                return (
                  <li key={medico.codigo}>
                    <button
                      type="button"
                      onClick={() => handleClick(medico)}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition ${
                        ativo
                          ? "bg-blue-50 text-blue-900 hover:bg-blue-100"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>
                        <span className="font-medium">
                          {nomeMedicoCurto(medico.codigo, medico.nome)}
                        </span>
                        <span className="ml-2 text-[11px] text-slate-500">
                          {medico.nome}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`text-base ${
                          ativo ? "text-blue-600" : "text-slate-300"
                        }`}
                      >
                        {ativo ? "✓" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {pendenteTroca && (
        <ModalTrocarMedico
          novoMedico={pendenteTroca}
          ativos={ativos}
          onTrocar={handleTrocar}
          onCancelar={() => setPendenteTroca(null)}
        />
      )}
    </div>
  );
}

function IconePessoas() {
  // Duas figuras (médico/paciente) — sugere "selecionar médicos do dia"
  // sem entrar no jargão. Stroke com currentColor para herdar a cor do botão.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M14.5 17c0-2.5 1.7-4.5 4-4.5" />
    </svg>
  );
}

function Chevron({ aberto }: { aberto: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: aberto ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 120ms ease",
      }}
    >
      <path d="M3 4.5 L6 7.5 L9 4.5" />
    </svg>
  );
}
