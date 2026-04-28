/**
 * Gerador de beeps via Web Audio API.
 *
 * Por que Web Audio em vez de <audio src="...">:
 * - Sem download (latência zero, primeiro beep dispara na hora).
 * - Sem precisar versionar arquivo de mídia no repositório.
 * - Volume e duração ajustáveis com 1 linha.
 *
 * Restrição de autoplay: navegadores modernos exigem interação do usuário
 * antes de permitir áudio. O AudioContext começa em estado "suspended"
 * até alguém clicar em algo na página. Como a equipe sempre clica no
 * seletor de médicos ao abrir uma TV, isso destrava sozinho. Se ainda
 * não houve gesto e tentamos tocar, ignoramos silenciosamente — sem
 * derrubar o painel com erro.
 */

let contexto: AudioContext | null = null;

interface ContextoCompativel extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function obterContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (contexto) return contexto;

  const Construtor =
    window.AudioContext ?? (window as ContextoCompativel).webkitAudioContext;
  if (!Construtor) return null;

  try {
    contexto = new Construtor();
    return contexto;
  } catch {
    return null;
  }
}

export interface OpcoesBeep {
  /** Frequência em Hz (default 880, A5 — agudo audível). */
  freqHz?: number;
  /** Duração em ms (default 180). */
  duracaoMs?: number;
  /** Volume entre 0 e 1 (default 0.35). */
  volume?: number;
}

/**
 * Toca um beep curto. Não retorna erro — se o navegador bloquear o áudio,
 * apenas não toca (esperado antes do primeiro gesto do usuário).
 */
export async function tocarBeep(opcoes: OpcoesBeep = {}): Promise<void> {
  const ctx = obterContexto();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  const { freqHz = 880, duracaoMs = 180, volume = 0.35 } = opcoes;
  const agora = ctx.currentTime;
  const duracaoSeg = duracaoMs / 1000;

  const oscilador = ctx.createOscillator();
  const ganho = ctx.createGain();

  oscilador.type = "sine";
  oscilador.frequency.value = freqHz;

  // Envelope ADSR simples para evitar "click" no início e no fim.
  const ataque = Math.min(0.012, duracaoSeg * 0.1);
  const decay = Math.min(0.04, duracaoSeg * 0.2);
  ganho.gain.setValueAtTime(0, agora);
  ganho.gain.linearRampToValueAtTime(volume, agora + ataque);
  ganho.gain.linearRampToValueAtTime(volume * 0.85, agora + ataque + decay);
  ganho.gain.linearRampToValueAtTime(0, agora + duracaoSeg);

  oscilador.connect(ganho);
  ganho.connect(ctx.destination);

  oscilador.start(agora);
  oscilador.stop(agora + duracaoSeg);
}
