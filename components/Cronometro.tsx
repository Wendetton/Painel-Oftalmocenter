"use client";

/**
 * Cronômetro vivo do tempo no estágio atual.
 *
 * Recebe a hora de início (HH:mm) e atualiza o display a cada 1s, mudando
 * o estilo conforme atinge as faixas de tempo definidas no PLANEJAMENTO
 * seção 4.3:
 *
 *   < 15 min  → discreto
 *   15-25 min → negrito, cor mais forte
 *   25-40 min → indica preocupação (cor laranja)
 *   > 40 min  → alerta (vermelho + ícone)
 *
 * Os limiares são iniciais e devem ser calibrados na Fase 5 conforme o
 * uso real da equipe.
 */

import { useEffect, useState } from "react";

import { minutosDesde } from "@/lib/calcularMetricas";

const LIMIAR_ATENCAO_MIN = 15;
const LIMIAR_ALERTA_MIN = 25;
const LIMIAR_CRITICO_MIN = 40;

export type NivelCronometro = "ok" | "atencao" | "alerta" | "critico";

interface Props {
  horaInicio: string | null;
  /** Cor base do estágio (para calcular intensidade visual do nível "ok"). */
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

export default function Cronometro({ horaInicio, className = "" }: Props) {
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setAgora(new Date());
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, []);

  const minutos = minutosDesde(horaInicio, agora);
  const nivel = nivelDoCronometro(minutos);
  const texto = formatarTempo(minutos);

  return (
    <span
      className={`tabular-nums ${ESTILOS_POR_NIVEL[nivel]} ${className}`}
      title={
        minutos === null
          ? "Sem horário registrado"
          : `${Math.round(minutos)} minutos no estágio`
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
