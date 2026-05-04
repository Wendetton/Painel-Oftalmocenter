import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        estagio: {
          recepcaoBg: "#FCEBEB",
          recepcaoBorda: "#A32D2D",
          recepcaoTexto: "#501313",
          examesBg: "#FEF9C3",
          examesBorda: "#EAB308",
          examesTexto: "#713F12",
          consultorioBg: "#FAECE7",
          consultorioBorda: "#993C1D",
          consultorioTexto: "#4A1B0C",
          dilatacaoBg: "#EEEDFE",
          dilatacaoBorda: "#534AB7",
          dilatacaoTexto: "#26215C",
          atendidoBg: "#E5EEFB",
          atendidoBorda: "#1F4FA8",
          atendidoTexto: "#0E2A5A",
        },
      },
    },
  },
  plugins: [],
};

export default config;
