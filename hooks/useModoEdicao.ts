"use client";

/**
 * Modo edição da TV — gate por PIN.
 *
 * Comportamento:
 * - Default: desligado.
 * - Para ligar, o usuário fornece um PIN. Validamos via POST /api/edicao.
 *   Se ok, guardamos o PIN em sessionStorage (vive até a aba fechar).
 * - Para desligar, basta limpar o sessionStorage.
 * - O PIN é necessário em todas as chamadas a /api/transicao — o hook
 *   expõe `pin` para os consumidores incluírem no body.
 *
 * sessionStorage (e não localStorage): segurança simples — fechar a aba
 * já bloqueia. Não persiste entre dias.
 */

import { useCallback, useEffect, useState } from "react";

const CHAVE_STORAGE = "painel-oftalmocenter:edicao-pin-v1";

export interface UsoModoEdicao {
  /** Modo edição ligado nesta sessão. */
  ligado: boolean;
  /** Componentes podem renderizar undefined até hidratar (evita flash). */
  hidratado: boolean;
  /** PIN guardado para ser enviado nas mutações. null se não destravado. */
  pin: string | null;
  /** Configurado no servidor? false = botão de cadeado deve estar inativo. */
  configuradoNoServidor: boolean;
  /** Tenta destravar com o PIN dado. Devolve true se ok. */
  destravar: (pin: string) => Promise<{ ok: true } | { ok: false; mensagem: string }>;
  /** Trava de novo (limpa sessionStorage). */
  travar: () => void;
}

interface RespostaConfigEdicao {
  configurado: boolean;
}

interface RespostaPostEdicao {
  ok: boolean;
  mensagem?: string;
}

export function useModoEdicao(): UsoModoEdicao {
  const [pin, setPin] = useState<string | null>(null);
  const [hidratado, setHidratado] = useState(false);
  const [configuradoNoServidor, setConfigurado] = useState(false);

  // Hidratação inicial: lê PIN do sessionStorage e checa config no servidor.
  useEffect(() => {
    let cancelado = false;

    try {
      const raw = window.sessionStorage.getItem(CHAVE_STORAGE);
      if (raw && raw.length > 0) setPin(raw);
    } catch {
      // ignora
    }

    void (async () => {
      try {
        const resp = await fetch("/api/edicao", { cache: "no-store" });
        const dados = (await resp.json()) as RespostaConfigEdicao;
        if (!cancelado) setConfigurado(Boolean(dados.configurado));
      } catch {
        if (!cancelado) setConfigurado(false);
      } finally {
        if (!cancelado) setHidratado(true);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  const destravar = useCallback(
    async (
      pinTentativa: string,
    ): Promise<{ ok: true } | { ok: false; mensagem: string }> => {
      try {
        const resp = await fetch("/api/edicao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: pinTentativa }),
        });
        const dados = (await resp.json()) as RespostaPostEdicao;
        if (resp.ok && dados.ok) {
          setPin(pinTentativa);
          try {
            window.sessionStorage.setItem(CHAVE_STORAGE, pinTentativa);
          } catch {
            // ignora
          }
          return { ok: true };
        }
        return {
          ok: false,
          mensagem: dados.mensagem ?? "PIN incorreto.",
        };
      } catch (err) {
        return {
          ok: false,
          mensagem: err instanceof Error ? err.message : "Erro de rede.",
        };
      }
    },
    [],
  );

  const travar = useCallback(() => {
    setPin(null);
    try {
      window.sessionStorage.removeItem(CHAVE_STORAGE);
    } catch {
      // ignora
    }
  }, []);

  return {
    ligado: pin !== null,
    hidratado,
    pin,
    configuradoNoServidor,
    destravar,
    travar,
  };
}
