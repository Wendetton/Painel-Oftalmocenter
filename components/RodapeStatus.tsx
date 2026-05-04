"use client";

/**
 * Rodapé fixo (PLANEJAMENTO seção 4.8):
 *   Esquerda: status da conexão com a API ProDoctor (verde/vermelho).
 *   Direita: contagem regressiva para a próxima atualização (em segundos).
 *
 * Aplicação direta do Princípio 4 (falhar de forma honesta): se a fonte
 * cair, a equipe vê na hora — em vez do painel mentir que está atualizado.
 */

import { useEffect, useState } from "react";

import { CONFIG } from "@/lib/configuracao";

interface Props {
  fonteOnline: boolean;
  ultimoErro: string | null;
  atualizadoEm: string | null;
}

export default function RodapeStatus({
  fonteOnline,
  ultimoErro,
  atualizadoEm,
}: Props) {
  // Contagem regressiva visual baseada no atualizadoEm. Quando muda, reseta.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const segundosRestantes = calcularSegundosRestantes(atualizadoEm, agora);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-6 py-2 text-xs text-slate-600 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between">
        <span className="flex items-center gap-3">
          {fonteOnline ? (
            <span className="flex items-center gap-1.5 text-emerald-700">
              <Bolinha cor="bg-emerald-500" />
              ProDoctor · conectado
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-red-700">
              <Bolinha cor="bg-red-500" />
              ProDoctor · {ultimoErro ? "erro" : "desconectado"}
            </span>
          )}
          {atualizadoEm && (
            <span className="text-slate-500">
              última atualização às {formatarHora(atualizadoEm)}
            </span>
          )}
          {ultimoErro && fonteOnline === false && (
            <span className="hidden max-w-md truncate text-red-600 md:inline">
              {ultimoErro}
            </span>
          )}
        </span>

        <span className="tabular-nums text-slate-500">
          próxima atualização em {segundosRestantes}s
        </span>
      </div>
    </div>
  );
}

function Bolinha({ cor }: { cor: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${cor} ring-2 ring-white`}
    />
  );
}

function calcularSegundosRestantes(
  atualizadoEm: string | null,
  agora: number,
): number {
  if (!atualizadoEm) return Math.round(CONFIG.POLLING_MS / 1000);
  const t = Date.parse(atualizadoEm);
  if (!Number.isFinite(t)) return Math.round(CONFIG.POLLING_MS / 1000);
  const decorrido = agora - t;
  const restante = CONFIG.POLLING_MS - decorrido;
  if (restante < 0) return 0;
  return Math.ceil(restante / 1000);
}

function formatarHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso;
  }
}
