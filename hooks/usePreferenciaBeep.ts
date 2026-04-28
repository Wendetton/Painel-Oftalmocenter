"use client";

/**
 * Persiste em localStorage a preferência "beep ligado/desligado" daquela
 * TV/navegador. Cada TV pode ter sua própria preferência (algumas estão
 * em ambientes silenciosos, outras em recepções barulhentas onde o beep
 * só atrapalha).
 *
 * Default: ligado. A primeira interação do usuário (clicar no seletor
 * de médicos) já destrava o áudio do navegador, então o beep funciona
 * desde a primeira mudança que ele percebe.
 */

import { useCallback, useEffect, useState } from "react";

const CHAVE_STORAGE = "painel-oftalmocenter:beep-ligado-v1";

export interface UsoPreferenciaBeep {
  ligado: boolean;
  hidratado: boolean;
  alternar: () => void;
  definir: (valor: boolean) => void;
}

export function usePreferenciaBeep(): UsoPreferenciaBeep {
  const [ligado, setLigado] = useState(true);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAVE_STORAGE);
      if (raw !== null) setLigado(raw === "true");
    } catch {
      // localStorage pode falhar em modo privativo — segue com default.
    }
    setHidratado(true);
  }, []);

  const definir = useCallback((valor: boolean) => {
    setLigado(valor);
    try {
      window.localStorage.setItem(CHAVE_STORAGE, String(valor));
    } catch {
      // ignora falha de quota
    }
  }, []);

  const alternar = useCallback(() => {
    setLigado((atual) => {
      const novo = !atual;
      try {
        window.localStorage.setItem(CHAVE_STORAGE, String(novo));
      } catch {
        // ignora
      }
      return novo;
    });
  }, []);

  return { ligado, hidratado, alternar, definir };
}
