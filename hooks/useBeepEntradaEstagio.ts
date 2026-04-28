"use client";

/**
 * Toca um beep sempre que um agendamento ENTRA num estágio que esta TV
 * monitora. Cada painel passa a sua lista de estágios alvo:
 *   /recepcao    → ["RECEPCAO", "DILATACAO"]
 *   /exames      → ["SALA_EXAMES", "DILATACAO"]
 *   /consultorio → ["PRONTO_MEDICO"]
 *
 * Detecção: comparamos o estágio anterior de cada agendamento (snapshot
 * do polling anterior) com o atual. Se passou para um dos estágios alvo
 * e ANTES não estava em nenhum dos alvos, conta como entrada.
 *
 * Importante:
 * - O primeiro polling NÃO toca beep. Só salva o snapshot. Senão a tela
 *   beepia 10x ao abrir só porque já tem gente nos estágios.
 * - Se múltiplas entradas em uma única atualização, toca um beep só
 *   (sem cacofonia).
 * - Quando a preferência está desligada, o snapshot continua sendo
 *   atualizado em silêncio para que ao reabilitar não dispare burst.
 */

import { useEffect, useMemo, useRef } from "react";

import { tocarBeep, type OpcoesBeep } from "@/lib/beep";
import type { CardPaciente, EstagioPaciente } from "@/lib/tipos";

interface Opcoes {
  cards: CardPaciente[];
  estagiosAlvo: ReadonlyArray<EstagioPaciente>;
  habilitado: boolean;
  /** Tom específico do beep, se quiser variar entre painéis. */
  beepOpcoes?: OpcoesBeep;
}

export function useBeepEntradaEstagio({
  cards,
  estagiosAlvo,
  habilitado,
  beepOpcoes,
}: Opcoes): void {
  // Set memoizado a partir do array para lookup O(1).
  const alvoSet = useMemo(
    () => new Set<EstagioPaciente>(estagiosAlvo),
    // O array é geralmente uma constante de módulo (referência estável).
    // Reconstruir o Set é barato; useMemo só evita recriar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [estagiosAlvo.join(",")],
  );

  const snapshot = useRef<Map<string, EstagioPaciente>>(new Map());
  const primeiraVez = useRef(true);

  useEffect(() => {
    const atual = new Map<string, EstagioPaciente>();
    for (const card of cards) {
      atual.set(card.agendamentoId, card.estagio);
    }

    if (primeiraVez.current) {
      // Primeiro ciclo: só guarda estado, não toca nada.
      snapshot.current = atual;
      primeiraVez.current = false;
      return;
    }

    if (habilitado) {
      let entradas = 0;
      for (const [id, estagio] of atual) {
        if (!alvoSet.has(estagio)) continue;
        const anterior = snapshot.current.get(id);
        const estavaNoAlvo = anterior !== undefined && alvoSet.has(anterior);
        if (!estavaNoAlvo) entradas += 1;
      }
      if (entradas > 0) {
        void tocarBeep(beepOpcoes);
      }
    }

    snapshot.current = atual;
  }, [cards, alvoSet, habilitado, beepOpcoes]);
}
