"use client";

/**
 * Hook que executa a mutação "mover paciente para X".
 *
 * Combina:
 * - PIN do useModoEdicao (precisa estar destravado).
 * - chaveAgendamento do card (identifica o agendamento no ProDoctor).
 * - destino escolhido (RECEPCAO, SALA_EXAMES, etc.).
 *
 * Faz POST para /api/transicao. Se sucesso, devolve { ok: true }; se
 * falha, devolve { ok: false, mensagem }. O parent decide o que fazer
 * (fechar o modal, mostrar erro inline, etc.).
 *
 * Não muda o estado local do painel — confiamos no próximo polling
 * (≤5s) para refletir a nova realidade. Atualização otimista poderia
 * ser adicionada depois se a equipe sentir lentidão.
 */

import { useCallback } from "react";

import type { ChaveAgendamento } from "@/lib/tipos";
import type { EstagioDestino } from "@/lib/transicaoFlags";

export interface UsoMoverPaciente {
  mover: (
    chave: ChaveAgendamento,
    destino: EstagioDestino,
  ) => Promise<{ ok: true } | { ok: false; mensagem: string }>;
}

export function useMoverPaciente(pin: string | null): UsoMoverPaciente {
  const mover = useCallback(
    async (
      chave: ChaveAgendamento,
      destino: EstagioDestino,
    ): Promise<{ ok: true } | { ok: false; mensagem: string }> => {
      if (!pin) {
        return {
          ok: false,
          mensagem:
            "Modo edição não está ativo. Destrave o cadeado no header com o PIN.",
        };
      }
      try {
        const resp = await fetch("/api/transicao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, chave, destino }),
        });
        const dados = (await resp.json()) as {
          ok?: boolean;
          mensagem?: string;
        };
        if (resp.ok && dados.ok) {
          return { ok: true };
        }
        return {
          ok: false,
          mensagem: dados.mensagem ?? `Falha (${resp.status}).`,
        };
      } catch (err) {
        return {
          ok: false,
          mensagem: err instanceof Error ? err.message : "Erro de rede.",
        };
      }
    },
    [pin],
  );

  return { mover };
}
