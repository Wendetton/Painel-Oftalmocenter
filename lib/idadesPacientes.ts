/**
 * Resolve a idade de cada paciente da agenda do dia gastando o MÍNIMO
 * possível de chamadas à ProDoctor. Ordem das fontes, da mais barata
 * para a mais cara:
 *
 *   1. Memória da instância (cache de 12h em lib/prodoctor-client).
 *   2. `paciente.dataNascimento` da própria agenda (grátis; hoje a
 *      ProDoctor não preenche, mas se passar a preencher, vira a fonte
 *      principal sem mudar nada).
 *   3. Firestore, coleção `pacientes` (uma leitura em lote por instância
 *      nova; persistente entre deploys).
 *   4. GET /Pacientes/Detalhar na ProDoctor, com orçamento por ciclo —
 *      e o resultado é gravado no Firestore para nunca mais precisar.
 *
 * A idade final é sempre recalculada da data de nascimento quando ela é
 * conhecida (lib/idade.ts), para não envelhecer errado com o tempo.
 */

import { idadeDeDataNascimento } from "./idade";
import {
  buscarPacientesComOrcamento,
  pacienteEmCache,
  registrarPacienteEmCache,
} from "./prodoctor-client";
import { carregarPacientes, salvarPaciente, type DadosPaciente } from "./pacientesPersistente";
import type { AgendamentoProDoctor } from "./tipos";

export interface OrigemIdades {
  memoria: number;
  agenda: number;
  firestore: number;
  detalhar: number;
  semIdade: number;
}

export interface ResultadoIdades {
  idades: Map<number, number | null>;
  origem: OrigemIdades;
}

function idadeDe(dados: DadosPaciente | null | undefined): number | null {
  if (!dados) return null;
  return idadeDeDataNascimento(dados.dataNascimento) ?? dados.idade;
}

export async function resolverIdades(
  agendamentos: AgendamentoProDoctor[],
  orcamentoDetalhar: number,
): Promise<ResultadoIdades> {
  const idades = new Map<number, number | null>();
  const origem: OrigemIdades = { memoria: 0, agenda: 0, firestore: 0, detalhar: 0, semIdade: 0 };

  // Código → dataNascimento vinda da agenda (quando vier).
  const daAgenda = new Map<number, string | null>();
  for (const ag of agendamentos) {
    const codigo = ag.paciente?.codigo;
    if (typeof codigo !== "number" || daAgenda.has(codigo)) continue;
    daAgenda.set(codigo, ag.paciente?.dataNascimento ?? null);
  }

  // 1. Memória; 2. Agenda.
  const pendentes: number[] = [];
  for (const [codigo, dataNascimento] of daAgenda) {
    const emCache = pacienteEmCache(codigo);
    if (emCache) {
      idades.set(codigo, idadeDe(emCache));
      origem.memoria += 1;
      continue;
    }
    const idadeAgenda = idadeDeDataNascimento(dataNascimento);
    if (idadeAgenda !== null) {
      idades.set(codigo, idadeAgenda);
      registrarPacienteEmCache(codigo, { dataNascimento, idade: idadeAgenda });
      origem.agenda += 1;
      continue;
    }
    pendentes.push(codigo);
  }

  // 3. Firestore (um lote só).
  const restantes: number[] = [];
  if (pendentes.length > 0) {
    const persistidos = await carregarPacientes(pendentes);
    for (const codigo of pendentes) {
      const dados = persistidos.get(codigo);
      if (dados && (dados.dataNascimento !== null || dados.idade !== null)) {
        idades.set(codigo, idadeDe(dados));
        registrarPacienteEmCache(codigo, dados);
        origem.firestore += 1;
      } else {
        restantes.push(codigo);
      }
    }
  }

  // 4. ProDoctor (reserva, com orçamento) + persiste o que aprendeu.
  if (restantes.length > 0) {
    const buscados = await buscarPacientesComOrcamento(restantes, orcamentoDetalhar);
    for (const codigo of restantes) {
      const dados = buscados.get(codigo) ?? null;
      const idade = idadeDe(dados);
      idades.set(codigo, idade);
      if (dados && (dados.dataNascimento !== null || dados.idade !== null)) {
        origem.detalhar += 1;
        void salvarPaciente(codigo, dados);
      } else {
        origem.semIdade += 1;
      }
    }
  }

  return { idades, origem };
}
