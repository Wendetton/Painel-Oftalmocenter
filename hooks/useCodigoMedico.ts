"use client";

/**
 * Código do médico no Eyenote, salvo por TV/navegador.
 *
 * O Eyenote associa cada exame ao `documentId` do médico — esse é o
 * "código" que o usuário digita uma vez por TV ao começar o dia.
 * Fica em localStorage (igual aos apelidos de médicos e à seleção
 * de médicos do dia).
 */

import { useCallback, useEffect, useState } from "react";

const CHAVE_STORAGE = "painel-oftalmocenter:eyenote-codigo-medico-v1";

export interface UsoCodigoMedico {
  codigo: string | null;
  hidratado: boolean;
  definir: (codigo: string) => void;
  limpar: () => void;
}

export function useCodigoMedico(): UsoCodigoMedico {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAVE_STORAGE);
      if (raw && raw.trim() !== "") setCodigo(raw.trim());
    } catch {
      // ignora (modo privativo / quota)
    }
    setHidratado(true);
  }, []);

  const definir = useCallback((novo: string) => {
    const limpo = novo.trim();
    setCodigo(limpo || null);
    try {
      if (limpo) {
        window.localStorage.setItem(CHAVE_STORAGE, limpo);
      } else {
        window.localStorage.removeItem(CHAVE_STORAGE);
      }
    } catch {
      // ignora
    }
  }, []);

  const limpar = useCallback(() => {
    setCodigo(null);
    try {
      window.localStorage.removeItem(CHAVE_STORAGE);
    } catch {
      // ignora
    }
  }, []);

  return { codigo, hidratado, definir, limpar };
}
