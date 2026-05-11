"use client";

/**
 * Action sheet modal: aparece ao clicar num card no modo edição.
 *
 * Mostra:
 * - Nome do paciente + estágio atual.
 * - Lista de TODOS os destinos possíveis (exceto o atual), cada um com a
 *   bolinha colorida do estágio.
 * - Botão separado, vermelho, para "marcar como faltou" (destrutivo).
 * - Quando há código do médico no Eyenote configurado, dois botões pra
 *   tirar foto de exame (AR / Tono) — abrem a câmera do tablet e fazem
 *   upload direto pro projeto eyenotev2.
 * - Cancelar / ESC fecha.
 *
 * O parent envia o evento "mover" + escolha do destino. Esta componente
 * cuida só de UX. Estados de loading/erro são exibidos inline.
 */

import { useEffect, useRef, useState } from "react";

import { CORES_POR_ESTAGIO } from "@/lib/cores";
import {
  enviarExameParaEyenote,
  ROTULOS_EXAMES_EYENOTE,
  type TipoExameEyenote,
} from "@/lib/firebaseEyenote";
import {
  destinosDisponiveisDe,
  type EstagioDestino,
} from "@/lib/transicaoFlags";
import type { CardPaciente } from "@/lib/tipos";

interface Props {
  card: CardPaciente;
  onFechar: () => void;
  onMover: (destino: EstagioDestino) => Promise<{ ok: boolean; mensagem?: string }>;
  /** Código do médico configurado no Eyenote. Se null, seção de exames some. */
  codigoMedicoEyenote?: string | null;
}

interface EstadoExame {
  tipo: TipoExameEyenote;
  fase: "enviando" | "ok" | "erro";
  mensagem?: string;
}

export default function AcaoMoverCard({
  card,
  onFechar,
  onMover,
  codigoMedicoEyenote = null,
}: Props) {
  const [enviando, setEnviando] = useState<EstagioDestino | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [estadoExame, setEstadoExame] = useState<EstadoExame | null>(null);
  const inputArRef = useRef<HTMLInputElement | null>(null);
  const inputTonoRef = useRef<HTMLInputElement | null>(null);

  const ocupado = enviando !== null || estadoExame?.fase === "enviando";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocupado) onFechar();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [ocupado, onFechar]);

  const destinos = destinosDisponiveisDe(card.estagio);
  const podeEditar = card.chaveAgendamento !== null;

  const handleClick = async (destino: EstagioDestino) => {
    if (ocupado) return;
    setEnviando(destino);
    setErro(null);
    const r = await onMover(destino);
    if (r.ok) {
      onFechar();
    } else {
      setErro(r.mensagem ?? "Falha ao mover paciente.");
    }
    setEnviando(null);
  };

  const handleArquivoExame = async (
    tipo: TipoExameEyenote,
    arquivo: File | null,
  ) => {
    if (!arquivo) return;
    if (!codigoMedicoEyenote) {
      setEstadoExame({
        tipo,
        fase: "erro",
        mensagem: "Configure o código do médico no Eyenote antes.",
      });
      return;
    }
    setEstadoExame({ tipo, fase: "enviando" });
    const r = await enviarExameParaEyenote({
      medicoCodigo: codigoMedicoEyenote,
      nomePaciente: card.paciente.nome,
      tipoExame: tipo,
      arquivo,
    });
    if (r.ok) {
      setEstadoExame({
        tipo,
        fase: "ok",
        mensagem: r.reusado
          ? `${ROTULOS_EXAMES_EYENOTE[tipo]} enviado (paciente já existia no Eyenote).`
          : `${ROTULOS_EXAMES_EYENOTE[tipo]} enviado e paciente criado no Eyenote.`,
      });
    } else {
      setEstadoExame({ tipo, fase: "erro", mensagem: r.mensagem });
    }
  };

  // Separa destinos "operacionais" (mover entre setores) do "Faltou" (destrutivo).
  const movePrimario = destinos.filter((d) => d !== "FALTOU");
  const podeMarcarFaltou = destinos.includes("FALTOU");
  const mostrarSecaoExame = codigoMedicoEyenote !== null && podeEditar;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 sm:items-center"
      onClick={!ocupado ? onFechar : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mover-titulo"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="border-b border-slate-200 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Mover paciente
          </p>
          <h2 id="mover-titulo" className="mt-1 text-lg font-medium text-slate-900">
            {card.paciente.nome}
            {card.paciente.idade !== null && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                · {card.paciente.idade} anos
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Atualmente em{" "}
            <BolinhaInline estagio={card.estagio} />
            <strong className="font-semibold text-slate-700">
              {CORES_POR_ESTAGIO[card.estagio].rotulo}
            </strong>
          </p>
        </header>

        {!podeEditar && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
            Este card não pode ser movido pelo painel — faltam dados do
            agendamento (local ou horário). Edite pelo ProDoctor.
          </div>
        )}

        <ul className="flex flex-col gap-1 p-2">
          {movePrimario.map((destino) => {
            const cor = CORES_POR_ESTAGIO[destino];
            const ativo = enviando === destino;
            return (
              <li key={destino}>
                <button
                  type="button"
                  onClick={() => handleClick(destino)}
                  disabled={!podeEditar || ocupado}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: cor.borda }}
                  />
                  <span className="flex-1">→ {cor.rotulo}</span>
                  {ativo && (
                    <span className="text-xs text-slate-400">enviando…</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {podeMarcarFaltou && (
          <div className="border-t border-slate-200 p-2">
            <button
              type="button"
              onClick={() => handleClick("FALTOU")}
              disabled={!podeEditar || ocupado}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">⚠</span>
              <span className="flex-1">Marcar como faltou</span>
              {enviando === "FALTOU" && (
                <span className="text-xs text-red-400">enviando…</span>
              )}
            </button>
          </div>
        )}

        {mostrarSecaoExame && (
          <div className="border-t border-slate-200 bg-slate-50 px-3 py-3">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Adicionar exame no Eyenote
            </p>
            <div className="grid grid-cols-2 gap-2">
              <BotaoCapturaExame
                rotulo={`📷 Adicionar ${ROTULOS_EXAMES_EYENOTE.ar}`}
                ativo={
                  estadoExame?.tipo === "ar" && estadoExame.fase === "enviando"
                }
                disabled={ocupado}
                onClick={() => inputArRef.current?.click()}
              />
              <BotaoCapturaExame
                rotulo={`📷 Adicionar ${ROTULOS_EXAMES_EYENOTE.tonometry}`}
                ativo={
                  estadoExame?.tipo === "tonometry" &&
                  estadoExame.fase === "enviando"
                }
                disabled={ocupado}
                onClick={() => inputTonoRef.current?.click()}
              />
            </div>
            <input
              ref={inputArRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void handleArquivoExame("ar", f);
              }}
            />
            <input
              ref={inputTonoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void handleArquivoExame("tonometry", f);
              }}
            />
            {estadoExame && estadoExame.fase !== "enviando" && (
              <p
                className={`mt-2 px-2 text-xs ${
                  estadoExame.fase === "ok"
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {estadoExame.fase === "ok" ? "✓ " : "⚠ "}
                {estadoExame.mensagem}
              </p>
            )}
          </div>
        )}

        {erro && (
          <div className="border-t border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700">
            {erro}
          </div>
        )}

        <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onFechar}
            disabled={ocupado}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}

function BotaoCapturaExame({
  rotulo,
  ativo,
  disabled,
  onClick,
}: {
  rotulo: string;
  ativo: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>{rotulo}</span>
      {ativo && (
        <span className="text-[11px] font-normal text-slate-500">enviando…</span>
      )}
    </button>
  );
}

function BolinhaInline({ estagio }: { estagio: CardPaciente["estagio"] }) {
  const cor = CORES_POR_ESTAGIO[estagio];
  return (
    <span
      aria-hidden="true"
      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
      style={{ backgroundColor: cor.borda }}
    />
  );
}
