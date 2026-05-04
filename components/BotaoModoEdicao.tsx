"use client";

/**
 * Botão de cadeado no header dos painéis. Abre/fecha o modo edição.
 *
 * - Sem PIN configurado no servidor: botão fica desabilitado, com tooltip
 *   explicando que falta a EDIT_PIN no Vercel.
 * - PIN configurado, modo desligado: cadeado fechado. Click → abre modal
 *   pedindo o PIN.
 * - Modo ligado: cadeado aberto, fundo amarelo. Click → trava de volta.
 *
 * O modal de PIN aceita Enter para confirmar e ESC para cancelar.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  ligado: boolean;
  configuradoNoServidor: boolean;
  onDestravar: (
    pin: string,
  ) => Promise<{ ok: true } | { ok: false; mensagem: string }>;
  onTravar: () => void;
}

export default function BotaoModoEdicao({
  ligado,
  configuradoNoServidor,
  onDestravar,
  onTravar,
}: Props) {
  const [modalAberto, setModalAberto] = useState(false);

  const handleClick = () => {
    if (!configuradoNoServidor) return;
    if (ligado) {
      onTravar();
      return;
    }
    setModalAberto(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={!configuradoNoServidor}
        title={
          !configuradoNoServidor
            ? "Modo edição não está habilitado neste ambiente (configure EDIT_PIN no Vercel)."
            : ligado
              ? "Modo edição LIGADO · clique para travar"
              : "Modo edição DESLIGADO · clique para destravar"
        }
        aria-label={ligado ? "Travar modo edição" : "Destravar modo edição"}
        aria-pressed={ligado}
        className={`inline-flex items-center justify-center rounded-full border p-2 transition ${
          !configuradoNoServidor
            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
            : ligado
              ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
        }`}
      >
        {ligado ? <CadeadoAberto /> : <CadeadoFechado />}
      </button>

      {modalAberto && (
        <ModalPin
          onCancelar={() => setModalAberto(false)}
          onConfirmar={async (pin) => {
            const r = await onDestravar(pin);
            if (r.ok) setModalAberto(false);
            return r;
          }}
        />
      )}
    </>
  );
}

function ModalPin({
  onCancelar,
  onConfirmar,
}: {
  onCancelar: () => void;
  onConfirmar: (
    pin: string,
  ) => Promise<{ ok: true } | { ok: false; mensagem: string }>;
}) {
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancelar]);

  const submeter = async () => {
    if (enviando || pin.length === 0) return;
    setEnviando(true);
    setErro(null);
    const r = await onConfirmar(pin);
    if (!r.ok) {
      setErro(r.mensagem);
      setPin("");
      inputRef.current?.focus();
    }
    setEnviando(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={onCancelar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-titulo"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submeter();
        }}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
      >
        <h2 id="pin-titulo" className="text-lg font-semibold text-slate-900">
          Destravar modo edição
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Digite o PIN para liberar a movimentação de pacientes pelo painel.
        </p>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={enviando}
          placeholder="••••"
          className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-2xl tracking-[0.4em] text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
        />

        {erro && (
          <p className="mt-3 text-sm text-red-600">{erro}</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={enviando}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando || pin.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {enviando ? "Validando…" : "Destravar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CadeadoFechado() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11 V7 a4 4 0 0 1 8 0 v4" />
    </svg>
  );
}

function CadeadoAberto() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11 V7 a4 4 0 0 1 8 0" />
    </svg>
  );
}
