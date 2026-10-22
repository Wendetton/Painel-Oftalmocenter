/**
 * Memória persistente de pacientes (data de nascimento / idade) no
 * Firestore, coleção `pacientes`. Chave do doc = código do paciente.
 *
 * Por quê: a agenda da ProDoctor não vem trazendo `dataNascimento` na
 * prática (conferido em produção em 22/10/2026), então a idade de cada
 * paciente exige uma chamada GET /Pacientes/Detalhar. Antes, essa chamada
 * se repetia a cada deploy / instância nova do Vercel (cache só em
 * memória), disputando o limite de 120 req/min com a agenda. Com o
 * Firestore, cada paciente é consultado na ProDoctor UMA vez na vida:
 * daí em diante a data de nascimento vem daqui e a idade é recalculada
 * todo dia (nunca envelhece errado).
 *
 * Custo (free tier: 50k reads/dia): uma leitura em lote (`getAll`) por
 * instância nova, só dos pacientes do dia que ainda não estão na memória
 * — dezenas, não milhares. Writes: 1 por paciente novo na clínica.
 */

import { comTimeout } from "./comTimeout";
import { obterFirestore } from "./firebase";

export interface DadosPaciente {
  /** "DD/MM/YYYY" quando conhecida; null se o cadastro não tem. */
  dataNascimento: string | null;
  /** Idade informada pela ProDoctor no momento da consulta (reserva). */
  idade: number | null;
}

const COLECAO = "pacientes";

/** Máximo de docs por `getAll`: a agenda de um dia tem dezenas de pacientes. */
const MAX_POR_LOTE = 300;

/**
 * Lê em UM lote os pacientes pedidos. Devolve só os encontrados.
 * Falhas (Firestore ausente, timeout) devolvem Map vazio — o chamador
 * segue para a reserva (Detalhar) normalmente.
 */
export async function carregarPacientes(
  codigos: number[],
): Promise<Map<number, DadosPaciente>> {
  const resultado = new Map<number, DadosPaciente>();
  const fs = obterFirestore();
  if (!fs || codigos.length === 0) return resultado;

  try {
    const refs = codigos
      .slice(0, MAX_POR_LOTE)
      .map((codigo) => fs.collection(COLECAO).doc(String(codigo)));
    const snaps = await comTimeout(fs.getAll(...refs), 6000, "carregarPacientes");

    for (const snap of snaps) {
      if (!snap.exists) continue;
      const d = snap.data();
      if (!d) continue;
      const codigo = Number(snap.id);
      if (!Number.isFinite(codigo)) continue;
      resultado.set(codigo, {
        dataNascimento:
          typeof d.dataNascimento === "string" && d.dataNascimento.trim() !== ""
            ? d.dataNascimento
            : null,
        idade: typeof d.idade === "number" ? d.idade : null,
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[firebase] erro ao carregar pacientes:", err);
  }

  return resultado;
}

/**
 * Grava (ou atualiza) os dados de um paciente. Fire-and-forget: falhas
 * são logadas; o paciente será buscado de novo na ProDoctor numa
 * próxima instância, sem prejuízo para a TV.
 */
export async function salvarPaciente(
  codigo: number,
  dados: DadosPaciente,
): Promise<void> {
  const fs = obterFirestore();
  if (!fs) return;

  try {
    await comTimeout(
      fs.collection(COLECAO).doc(String(codigo)).set(
        {
          dataNascimento: dados.dataNascimento,
          idade: dados.idade,
          atualizadoEm: new Date(),
        },
        { merge: true },
      ),
      6000,
      "salvarPaciente",
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[firebase] erro ao salvar paciente ${codigo}:`, err);
  }
}
