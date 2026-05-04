/**
 * Mapa de cores por estágio, derivado das cores do ProDoctor.
 * Usado pelos cards e headers de coluna. Inclui também uma cor de
 * "sombra" (rgba derivado da borda, com baixa opacidade) que vai no
 * box-shadow do card — efeito sutil de "aura" na cor do estágio,
 * sofisticado sem ficar berrante.
 */

import type { EstagioPaciente } from "./tipos";

export interface CoresEstagio {
  bg: string;
  borda: string;
  texto: string;
  /** rgba para o glow/aura do card. */
  sombra: string;
  rotulo: string;
}

export const CORES_POR_ESTAGIO: Record<EstagioPaciente, CoresEstagio> = {
  RECEPCAO: {
    bg: "#FCEBEB",
    borda: "#A32D2D",
    texto: "#501313",
    sombra: "rgba(163, 45, 45, 0.18)",
    rotulo: "Recepção",
  },
  SALA_EXAMES: {
    // Amarelo vivo definido em conversa com Fernando.
    bg: "#FEF9C3",
    borda: "#EAB308",
    texto: "#713F12",
    sombra: "rgba(234, 179, 8, 0.22)",
    rotulo: "Sala de exames",
  },
  PRONTO_MEDICO: {
    bg: "#FAECE7",
    borda: "#993C1D",
    texto: "#4A1B0C",
    sombra: "rgba(153, 60, 29, 0.20)",
    rotulo: "Pronto para médico",
  },
  DILATACAO: {
    bg: "#EEEDFE",
    borda: "#534AB7",
    texto: "#26215C",
    sombra: "rgba(83, 74, 183, 0.20)",
    rotulo: "Dilatação",
  },
  ATENDIDO: {
    bg: "#E5EEFB",
    borda: "#1F4FA8",
    texto: "#0E2A5A",
    sombra: "rgba(31, 79, 168, 0.18)",
    rotulo: "Atendido",
  },
  AGENDADO: {
    bg: "#F1F2F4",
    borda: "#A0A4AB",
    texto: "#3A3D44",
    sombra: "rgba(160, 164, 171, 0.18)",
    rotulo: "Agendado",
  },
  FALTOU: {
    bg: "#EDEDED",
    borda: "#6B7280",
    texto: "#374151",
    sombra: "rgba(107, 114, 128, 0.18)",
    rotulo: "Faltou",
  },
};
