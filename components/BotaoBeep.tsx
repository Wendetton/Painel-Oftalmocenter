"use client";

/**
 * Botão de mudo/desmudo do beep, usado no header dos painéis.
 *
 * Aparece como um pequeno ícone de alto-falante. Ao alternar:
 * - Liga: toca um beep curto de teste imediatamente. Isso confirma para
 *   o usuário que o áudio está funcionando E destrava o AudioContext do
 *   navegador (que pode estar em "suspended" se ainda não houve gesto).
 * - Desliga: silencia.
 *
 * A preferência fica persistida via usePreferenciaBeep (localStorage).
 */

import { tocarBeep } from "@/lib/beep";

interface Props {
  ligado: boolean;
  onAlternar: () => void;
}

export default function BotaoBeep({ ligado, onAlternar }: Props) {
  const handleClick = () => {
    const proximoEstado = !ligado;
    onAlternar();
    if (proximoEstado) {
      // Beep de confirmação — também serve pra destravar o AudioContext.
      void tocarBeep({ duracaoMs: 120, freqHz: 880, volume: 0.3 });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={ligado ? "Beep ligado · clique para silenciar" : "Beep silenciado · clique para ligar"}
      aria-label={ligado ? "Silenciar beep" : "Ligar beep"}
      aria-pressed={ligado}
      className={`inline-flex items-center justify-center rounded-full border p-2 transition ${
        ligado
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-slate-300 bg-white text-slate-400 hover:bg-slate-50"
      }`}
    >
      {ligado ? <IconeAltoFalanteLigado /> : <IconeAltoFalanteMudo />}
    </button>
  );
}

function IconeAltoFalanteLigado() {
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
      <path d="M11 5 L6 9 H3 v6 h3 l5 4 V5 z" />
      <path d="M15.5 9 c1.5 1.5 1.5 4.5 0 6" />
      <path d="M18.5 6 c3 3 3 9 0 12" />
    </svg>
  );
}

function IconeAltoFalanteMudo() {
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
      <path d="M11 5 L6 9 H3 v6 h3 l5 4 V5 z" />
      <line x1="16" y1="9" x2="22" y2="15" />
      <line x1="22" y1="9" x2="16" y2="15" />
    </svg>
  );
}
