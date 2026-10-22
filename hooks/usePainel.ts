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
    // Marca que pelo menos um ciclo foi pulado por a aba estar escondida —
    // ao voltar ao primeiro plano, buscamos na hora em vez de esperar o
    // próximo tick (até 5s mostrando dados velhos).
    let pulouPorOculta = false;

    async function buscar(): Promise<void> {
      // Aba/tablet em segundo plano: não gasta cota da ProDoctor. As TVs
      // da clínica ficam sempre visíveis, então não são afetadas.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        pulouPorOculta = true;
        return;
      }
      pulouPorOculta = false;
      try {
        const resp = await fetch(`/api/painel?medicos=${chave}`, {
          cache: "no-store",
        });
        const dados = (await resp.json()) as RespostaPainelApi;
        if (cancelado) return;
        setEstado((s) => ({
          // Se a API falhou (fonteOnline false), ela devolve cards: [] —
          // mas apagar a lista da TV no meio do expediente é pior que
          // mostrar dados de alguns segundos atrás. Mantém a última lista
          // boa e deixa o erro visível no rodapé.
          cards: dados.fonteOnline ? dados.cards : s.cards,
          atualizadoEm: dados.fonteOnline ? dados.atualizadoEm : s.atualizadoEm,
          fonteOnline: dados.fonteOnline,
          ultimoErro: dados.ultimoErro,
          carregandoInicial: false,
        }));
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

    const aoMudarVisibilidade = (): void => {
      if (document.visibilityState === "visible" && pulouPorOculta) {
        void buscar();
      }
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      cancelado = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [chave]);

  return estado;
}
