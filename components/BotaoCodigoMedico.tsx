"use client";

/**
 * Botão no header pra cadastrar/trocar o código do médico do Eyenote
 * naquela TV. Posicionado ao lado do cadeado do modo edição.
 *
 * Comportamento:
 * - Sem código cadastrado: ícone cinza neutro.
 * - Com código cadastrado: ícone verde com badge mostrando o código.
 * - Click → modal pra digitar, salvar ou apagar.
 *
 * Sem código, o painel funciona normal — só não aparecem os botões de
 * "Adicionar AR / Tono" no action sheet do card. Configurar é trivial.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  codigoAtual: string | null;
  hidratado: boolean;
  onDefinir: (codigo: string) => void;
  onLimpar: () => void;
}

export default function BotaoCodigoMedico({
  codigoAtual,
  hidratado,
  onDefinir,
  onLimpar,
}: Props) {
  const [modalAberto, setModalAberto] = useState(false);
  const cadastrado = codigoAtual !== null && codigoAtual.trim() !== "";

  if (!hidratado) {
    // Placeholder enquanto lemos o localStorage — evita flash visual.
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50" />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalAberto(true)}
        title={
          cadastrado
            ? `Código do médico no Eyenote: ${codigoAtual}`
            : "Cadastrar código do médico para envio de exames ao Eyenote"
        }
        aria-label={
          cadastrado
            ? `Código Eyenote ${codigoAtual} (clique para alterar)`
            : "Configurar código do médico do Eyenote"
        }
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition ${
          cadastrado
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
        }`}
      >
        <IconeEstetoscopio />
        {cadastrado && (
          <span className="max-w-[6rem] truncate text-xs font-bold tabular-nums">
            {codigoAtual}
          </span>
        )}
      </button>

      {modalAberto && (
        <ModalCodigoMedico
          codigoAtual={codigoAtual}
          onSalvar={(novo) => {
            onDefinir(novo);
            setModalAberto(false);
          }}
          onLimpar={() => {
            onLimpar();
            setModalAberto(false);
          }}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </>
  );
}

function ModalCodigoMedico({
  codigoAtual,
  onSalvar,
  onLimpar,
  onFechar,
}: {
  codigoAtual: string | null;
  onSalvar: (codigo: string) => void;
  onLimpar: () => void;
  onFechar: () => void;
}) {
  const [valor, setValor] = useState(codigoAtual ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onFechar]);

  const podeSalvar = valor.trim().length > 0 && valor.trim() !== codigoAtual;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="codigo-medico-titulo"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (podeSalvar) onSalvar(valor.trim());
        }}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
      >
        <h2
          id="codigo-medico-titulo"
          className="text-lg font-semibold text-slate-900"
        >
          Código do médico no Eyenote
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Esse é o mesmo código que vocês usam ao entrar no Eyenote (
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
            eyenotev3.vercel.app/legacy
          </code>
          ). Os exames que tirarmos por aqui vão direto pra ele.
        </p>

        <label
          htmlFor="codigo-medico-input"
          className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500"
        >
          Código
        </label>
        <input
          id="codigo-medico-input"
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="ex.: ABC123"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
        />

        <div className="mt-5 flex items-center justify-between gap-2">
          {codigoAtual ? (
            <button
              type="button"
              onClick={onLimpar}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              Remover código
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!podeSalvar}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function IconeEstetoscopio() {
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
      <path d="M4 4 v6 a4 4 0 0 0 8 0 V4" />
      <path d="M12 14 v3 a3 3 0 0 0 6 0 v-2" />
      <circle cx="18" cy="10" r="2" />
    </svg>
  );
}
