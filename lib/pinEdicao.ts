/**
 * Validação do PIN do modo edição.
 *
 * O PIN vive em `process.env.EDIT_PIN` (configurado no Vercel). Se a env
 * var não existir, o modo edição fica bloqueado para todo mundo — devolve
 * uma resposta clara explicando o motivo.
 *
 * Comparação em tempo constante para não vazar comprimento/conteúdo via
 * timing attack (não que esse painel seja alvo, mas é o jeito certo).
 */

export type ResultadoPin =
  | { ok: true }
  | { ok: false; status: 401 | 503; mensagem: string };

export function verificarPin(pinRecebido: unknown): ResultadoPin {
  const esperado = (process.env.EDIT_PIN ?? "").trim();

  if (esperado === "") {
    return {
      ok: false,
      status: 503,
      mensagem:
        "Modo edição não está configurado neste ambiente (variável EDIT_PIN ausente).",
    };
  }

  if (typeof pinRecebido !== "string" || pinRecebido.length === 0) {
    return { ok: false, status: 401, mensagem: "PIN ausente." };
  }

  if (!iguaisTempoConstante(pinRecebido, esperado)) {
    return { ok: false, status: 401, mensagem: "PIN incorreto." };
  }

  return { ok: true };
}

function iguaisTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Mesmo no caso de comprimento diferente, percorremos algo para
    // não vazar tamanho via early return rápido demais. O ataque por
    // timing aqui seria difícil mesmo, mas custa nada.
    let acc = 0;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      acc |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return acc === 0 && a.length === b.length;
  }

  let acc = 0;
  for (let i = 0; i < a.length; i += 1) {
    acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return acc === 0;
}
