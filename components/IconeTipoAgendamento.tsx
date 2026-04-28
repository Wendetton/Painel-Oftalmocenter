/**
 * Ícones de tipo de agendamento ao estilo ProDoctor.
 *
 * Bolinhas verdes com símbolo dentro:
 *   - Consulta → carinha sorridente
 *   - Retorno  → letra "R"
 *   - Exame    → frasco de Erlenmeyer
 *
 * Regra (acordada com Fernando):
 *   - retorno (com ou sem consulta)  → ícone R
 *   - exame   (com ou sem consulta)  → ícone frasco
 *   - consulta sozinha               → ícone carinha
 *   - múltiplos (ex.: retorno + exame ou consulta + exame) → todos os
 *     ícones aplicáveis aparecem lado a lado.
 *
 * Tipos cirurgia/compromisso/teleconsulta são ignorados — não fazem parte
 * do fluxo da clínica monitorado pelo painel (PLANEJAMENTO seção 1.5).
 */

import type { TipoAgendamento } from "@/lib/tipos";

const COR_FUNDO = "#22C55E"; // verde semelhante ao do ProDoctor
const COR_SIMBOLO = "#FFFFFF";

interface Props {
  tipo: TipoAgendamento | null;
  size?: number;
}

export default function IconeTipoAgendamento({ tipo, size = 24 }: Props) {
  if (!tipo) return null;

  const mostrarRetorno = tipo.retorno;
  const mostrarExame = tipo.exame;
  // "Consulta sozinha" significa que NÃO tem retorno nem exame marcados.
  const mostrarConsultaPura = tipo.consulta && !tipo.retorno && !tipo.exame;

  if (!mostrarRetorno && !mostrarExame && !mostrarConsultaPura) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1" aria-hidden="false">
      {mostrarConsultaPura && <Consulta size={size} />}
      {mostrarRetorno && <Retorno size={size} />}
      {mostrarExame && <Exame size={size} />}
    </span>
  );
}

function Consulta({ size }: { size: number }) {
  return (
    <svg
      role="img"
      aria-label="Consulta"
      width={size}
      height={size}
      viewBox="0 0 24 24"
    >
      <title>Consulta</title>
      <circle cx="12" cy="12" r="11" fill={COR_FUNDO} />
      <circle cx="9" cy="10.5" r="1" fill={COR_SIMBOLO} />
      <circle cx="15" cy="10.5" r="1" fill={COR_SIMBOLO} />
      <path
        d="M 8 14 Q 12 17 16 14"
        stroke={COR_SIMBOLO}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function Retorno({ size }: { size: number }) {
  return (
    <svg
      role="img"
      aria-label="Retorno"
      width={size}
      height={size}
      viewBox="0 0 24 24"
    >
      <title>Retorno</title>
      <circle cx="12" cy="12" r="11" fill={COR_FUNDO} />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fill={COR_SIMBOLO}
        fontSize="13"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
      >
        R
      </text>
    </svg>
  );
}

function Exame({ size }: { size: number }) {
  // Erlenmeyer estilizado, traço branco sobre círculo verde.
  return (
    <svg
      role="img"
      aria-label="Exame"
      width={size}
      height={size}
      viewBox="0 0 24 24"
    >
      <title>Exame</title>
      <circle cx="12" cy="12" r="11" fill={COR_FUNDO} />
      <path
        d="M 9 6.5 L 9 11 L 6.2 16.6 Q 5.7 17.7 6.9 17.7 L 17.1 17.7 Q 18.3 17.7 17.8 16.6 L 15 11 L 15 6.5"
        stroke={COR_SIMBOLO}
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="8"
        y1="6.5"
        x2="16"
        y2="6.5"
        stroke={COR_SIMBOLO}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="10.5" cy="15.5" r="0.8" fill={COR_SIMBOLO} />
      <circle cx="13.5" cy="14" r="0.6" fill={COR_SIMBOLO} />
    </svg>
  );
}
