"use client";

/**
 * Hook que mantém o estado do painel sincronizado com /api/painel,
 * fazendo polling automático a cada CONFIG.POLLING_MS.
 *
 * Critério de pronto da Fase 2: a lista atualiza sozinha sem refresh manual.
 */

import { useEffect, useState } from "react";

import { CONFIG } from "@/lib/configuracao";
import type { CardPaciente } from "@/lib/tipos";

interface RespostaPainelApi {
  cards: CardPaciente[];
  atualizadoEm: string;
  fonteOnline: boolean;
  ultimoErro: string | null;
}

export interface EstadoPainel {
  cards: CardPaciente[];
  atualizadoEm: string | null;
  fonteOnline: boolean;
  ultimoErro: string | null;
  carregandoInicial: boolean;
}

const ESTADO_INICIAL: EstadoPainel = {
  cards: [],
  atualizadoEm: null,
  fonteOnline: true,
  ultimoErro: null,
  carregandoInicial: true,
};

export function usePainel(codigosMedicos: number[]): EstadoPainel {
  // Chave estável: ordena para que [2,3] e [3,2] gerem a mesma chave de
  // efeito e não derrubem o intervalo desnecessariamente.
  const chave = [...codigosMedicos].sort((a, b) => a - b).join(",");

  const [estado, setEstado] = useState<EstadoPainel>(ESTADO_INICIAL);

  useEffect(() => {
    if (chave === "") {
      setEstado({ ...ESTADO_INICIAL, carregandoInicial: false });
      return;
    }

    let cancelado = false;

    async function buscar(): Promise<void> {
      try {
        const resp = await fetch(`/api/painel?medicos=${chave}`, {
          cache: "no-store",
        });
        const dados = (await resp.json()) as RespostaPainelApi;
        if (cancelado) return;
        setEstado({
          cards: dados.cards,
          atualizadoEm: dados.atualizadoEm,
          fonteOnline: dados.fonteOnline,
          ultimoErro: dados.ultimoErro,
          carregandoInicial: false,
        });
      } catch (err) {
        if (cancelado) return;
        // Mantém a última lista boa: se a API caiu, o usuário ainda vê
        // os pacientes anteriores e o erro fica visível no rodapé.
        setEstado((s) => ({
          ...s,
          fonteOnline: false,
          ultimoErro: err instanceof Error ? err.message : "Erro de rede",
          carregandoInicial: false,
        }));
      }
    }

    void buscar();
    const timer = setInterval(() => {
      void buscar();
    }, CONFIG.POLLING_MS);

    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [chave]);

  return estado;
}
