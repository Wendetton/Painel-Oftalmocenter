"use client";

/**
 * Hook que mantém a lista de médicos selecionados nesta TV/navegador,
 * persistida em localStorage. Aplica a regra de no máximo MAX_MEDICOS
 * simultâneos (definida no PLANEJAMENTO seção 2.5).
 *
 * Importante: como localStorage só existe no navegador, o estado começa
 * vazio no SSR e só é hidratado depois do primeiro useEffect — por isso
 * exportamos `hidratado` para que a UI não mostre "selecione médicos"
 * antes de saber se há seleção salva.
 */

import { useCallback, useEffect, useState } from "react";

import { CONFIG } from "@/lib/configuracao";

const CHAVE_STORAGE = "painel-oftalmocenter:medicos-selecionados-v1";

export interface UsoMedicosSelecionados {
  codigos: number[];
  hidratado: boolean;
  alternar: (codigo: number) => void;
  noLimite: (codigo: number) => boolean;
  limpar: () => void;
}

export function useMedicosSelecionados(): UsoMedicosSelecionados {
  const [codigos, setCodigos] = useState<number[]>([]);
  const [hidratado, setHidratado] = useState(false);

  // Hidrata uma vez no mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAVE_STORAGE);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const validos = parsed
            .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
            .slice(0, CONFIG.MAX_MEDICOS_SIMULTANEOS);
          setCodigos(validos);
        }
      }
    } catch {
      // localStorage pode lançar em modo privativo ou com cota cheia — ignora.
    }
    setHidratado(true);
  }, []);

  // Persiste mudanças, mas só depois de hidratar (senão sobrescreveríamos
  // a seleção antiga com [] no primeiro render).
  useEffect(() => {
    if (!hidratado) return;
    try {
      window.localStorage.setItem(CHAVE_STORAGE, JSON.stringify(codigos));
    } catch {
      // ignora falhas de quota / modo privativo
    }
  }, [codigos, hidratado]);

  const alternar = useCallback((codigo: number) => {
    setCodigos((atual) => {
      if (atual.includes(codigo)) {
        return atual.filter((c) => c !== codigo);
      }
      if (atual.length >= CONFIG.MAX_MEDICOS_SIMULTANEOS) {
        // Fase 2: bloqueia silenciosamente. Modal "qual substituir?" vem na Fase 3.
        return atual;
      }
      return [...atual, codigo];
    });
  }, []);

  const noLimite = useCallback(
    (codigo: number) =>
      codigos.length >= CONFIG.MAX_MEDICOS_SIMULTANEOS && !codigos.includes(codigo),
    [codigos],
  );

  const limpar = useCallback(() => setCodigos([]), []);

  return { codigos, hidratado, alternar, noLimite, limpar };
}
