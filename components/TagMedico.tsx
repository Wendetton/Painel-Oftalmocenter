"use client";

/**
 * Tag colorida que identifica o médico do paciente no card. Cada médico
 * tem uma cor única definida em lib/configuracao.ts (CORES_MEDICOS).
 *
 * Visual: pílula com bolinha branca à esquerda + nome curto. Pensada
 * para ser identificada de longe na TV — combina cor + texto pra
 * funcionar mesmo se a equipe não decorar a paleta.
 */

import { corMedico, nomeMedicoCurto } from "@/lib/configuracao";

interface Props {
  codigo: number | null;
  nomeCompleto: string;
  /** Tamanho compacto para slots apertados (linha de contexto). */
  tamanho?: "padrao" | "compacto";
}

export default function TagMedico({
  codigo,
  nomeCompleto,
  tamanho = "padrao",
}: Props) {
  const cor = corMedico(codigo);
  const nome = nomeMedicoCurto(codigo, nomeCompleto);
  const compacto = tamanho === "compacto";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-bold uppercase tracking-wider ${
        compacto ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
      style={{ backgroundColor: cor.bg, color: cor.texto }}
    >
      <span
        aria-hidden="true"
        className={`inline-block rounded-full bg-white/85 ${
          compacto ? "h-1 w-1" : "h-1.5 w-1.5"
        }`}
      />
      {nome}
    </span>
  );
}
