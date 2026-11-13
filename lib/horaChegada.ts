/**
 * Converte a `horaCompareceu` do ProDoctor ("HH:mm" ou "HH:mm:ss") no
 * instante real da chegada do paciente.
 *
 * Por quê: o painel só "vê" o paciente quando alguma TV consulta a agenda,
 * mas a recepção marca a chegada no ProDoctor na hora em que ela acontece.
 * Usar a hora do ProDoctor deixa o tempo de recepção e o tempo total
 * corretos mesmo que o painel tenha visto o paciente com atraso — e não
 * custa nenhuma chamada extra: o campo já vem na agenda do dia.
 *
 * Função pura. Devolve null quando a hora está ausente, ilegível ou
 * incoerente (no futuro, ou mais de 16h atrás) — o chamador usa então o
 * instante em que o painel detectou o paciente.
 */

/** A clínica opera no fuso de São Paulo, sem horário de verão. */
const FUSO_CLINICA = "-03:00";

/** Tolerância para relógios levemente desalinhados (ProDoctor × servidor). */
const TOLERANCIA_FUTURO_MS = 2 * 60_000;

/** Chegada mais antiga que isso não é do expediente de hoje. */
const IDADE_MAXIMA_MS = 16 * 60 * 60_000;

export function instanteDaChegada(
  dataYYYYMMDD: string,
  horaCompareceu: string | null | undefined,
  agoraMs: number,
): number | null {
  if (!horaCompareceu) return null;
  const m = horaCompareceu.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] ? Number(m[3]) : 0;
  if (hh > 23 || mm > 59 || ss > 59) return null;

  const pad = (n: number): string => n.toString().padStart(2, "0");
  const ms = Date.parse(
    `${dataYYYYMMDD}T${pad(hh)}:${pad(mm)}:${pad(ss)}${FUSO_CLINICA}`,
  );
  if (!Number.isFinite(ms)) return null;
  if (ms > agoraMs + TOLERANCIA_FUTURO_MS) return null;
  if (agoraMs - ms > IDADE_MAXIMA_MS) return null;

  // Hora "do futuro" dentro da tolerância: encosta no agora, para nunca
  // gerar permanência negativa.
  return Math.min(ms, agoraMs);
}
