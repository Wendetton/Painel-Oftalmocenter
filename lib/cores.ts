/**
 * Mapa de cores por estágio, derivado das cores do ProDoctor.
 * Usado tanto pelo backend (para enviar metadata útil ao frontend) quanto
 * diretamente nas classes Tailwind dos componentes (em fases seguintes).
 *
 * Os valores hex aqui são iniciais e podem ser ajustados na Fase 5 com
 * screenshots reais do ProDoctor (seção 6.5 do PLANEJAMENTO.md).
 */

import type { EstagioPaciente } from "./tipos";

export interface CoresEstagio {
  bg: string;
  borda: string;
  texto: string;
  rotulo: string;
}

export const CORES_POR_ESTAGIO: Record<EstagioPaciente, CoresEstagio> = {
  RECEPCAO: {
    bg: "#FCEBEB",
    borda: "#A32D2D",
    texto: "#501313",
    rotulo: "Recepção",
  },
  SALA_EXAMES: {
    // Amarelo vivo (Fernando, pós-validação): a barra lateral fica visível
    // de longe na TV. O texto principal da etiqueta usa um tom escuro pra
    // manter contraste e legibilidade.
    bg: "#FEF9C3",
    borda: "#EAB308",
    texto: "#713F12",
    rotulo: "Sala de exames",
  },
  PRONTO_MEDICO: {
    bg: "#FAECE7",
    borda: "#993C1D",
    texto: "#4A1B0C",
    rotulo: "Pronto para médico",
  },
  DILATACAO: {
    bg: "#EEEDFE",
    borda: "#534AB7",
    texto: "#26215C",
    rotulo: "Dilatação",
  },
  ATENDIDO: {
    bg: "#E5EEFB",
    borda: "#1F4FA8",
    texto: "#0E2A5A",
    rotulo: "Atendido",
  },
  AGENDADO: {
    bg: "#F1F2F4",
    borda: "#A0A4AB",
    texto: "#3A3D44",
    rotulo: "Agendado",
  },
  FALTOU: {
    bg: "#EDEDED",
    borda: "#6B7280",
    texto: "#374151",
    rotulo: "Faltou",
  },
};
