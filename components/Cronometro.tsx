"use client";

/**
 * Cronômetro vivo do tempo no estágio atual.
 *
 * Recebe um timestamp ISO de quando o paciente entrou no estágio atual
 * (calculado pelo rastreador no servidor) e atualiza o display a cada 1s.
 *
 * O timestamp ZERA toda vez que o paciente troca de estágio — ou seja, o
 * cronômetro mostra "tempo nesse estágio", não "tempo na clínica".
 *
 * 4 níveis visuais conforme tempo (PLANEJAMENTO seção 4.3):
 *   < 15 min  → discreto
 *   15-25 min → negrito, cor mais forte
 *   25-40 min → preocupação (laranja)
 *   > 40 min  → alerta (vermelho + ícone)
 *
 * Limiares iniciais — calibrar na Fase 5 conforme uso real da equipe.
 */

import { useEffect, useState } from "react";

const LIMIAR_ATENCAO_MIN = 15;
const LIMIAR_ALERTA_MIN = 25;
const LIMIAR_CRITICO_MIN = 40;

export type NivelCronometro = "ok" | "atencao" | "alerta" | "critico";

interface Props {
  /** Timestamp ISO de quando o paciente entrou no estágio atual. */
  desdeEm: string | null;
  className?: string;
}

export function nivelDoCronometro(minutos: number | null): NivelCronometro {
  if (minutos === null) return "ok";
  if (minutos >= LIMIAR_CRITICO_MIN) return "critico";
  if (minutos >= LIMIAR_ALERTA_MIN) return "alerta";
  if (minutos >= LIMIAR_ATENCAO_MIN) return "atencao";
  return "ok";
}

const ESTILOS_POR_NIVEL: Record<NivelCronometro, string> = {
  ok: "text-slate-700",
  atencao: "text-slate-900 font-semibold",
  alerta: "text-orange-700 font-semibold",
  critico: "text-red-700 font-bold",
};

export default function Cronometro({ desdeEm, className = "" }: Props) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setAgora(Date.now());
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, []);

  const minutos = minutosDesdeIso(desdeEm, agora);
  const nivel = nivelDoCronometro(minutos);
  const texto = formatarTempo(minutos);

  return (
    <span
      className={`tabular-nums ${ESTILOS_POR_NIVEL[nivel]} ${className}`}
      title={
        minutos === null
          ? "Sem horário registrado"
          : `${Math.round(minutos)} minutos no estágio atual`
      }
    >
      {nivel === "critico" && (
        <span className="mr-1" aria-hidden="true">
          ⚠
        </span>
      )}
      {texto}
    </span>
  );
}

export function minutosDesdeIso(iso: string | null, agora: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diffMs = agora - t;
  return diffMs < 0 ? 0 : diffMs / (60 * 1000);
}

function formatarTempo(minutos: number | null): string {
  if (minutos === null) return "—";
  const totalSeg = Math.floor(minutos * 60);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  if (h > 0) {
    return `${h}h ${pad2(m)}m`;
  }
  return `${pad2(m)}:${pad2(s)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
