// Testes do cálculo do dashboard. Rodar com: npm test
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calcularResumo,
  estatistica,
  pacientesPorDia,
  reconstruirTrajetorias,
  tempoPorConvenio,
} from "../lib/agregarEventos.ts";
import { instanteDaChegada } from "../lib/horaChegada.ts";

const T0 = Date.parse("2026-11-09T09:00:00-03:00");
const min = (n) => T0 + n * 60_000;

let seq = 0;
function ev(agendamentoId, anterior, novo, momentoMs, extra = {}) {
  seq += 1;
  return {
    id: `e${seq}`,
    agendamentoId,
    medicoCodigo: 2,
    medicoNome: "Médico A",
    convenio: "Unimed",
    estagioAnterior: anterior,
    estagioNovo: novo,
    momentoMs,
    data: "2026-11-09",
    chegadaMs: null,
    tipoConsulta: true,
    tipoRetorno: false,
    tipoExame: false,
    ...extra,
  };
}

test("duplicatas seguidas do mesmo estágio contam como uma mudança só", () => {
  const eventos = [
    ev("a", "RECEPCAO", "SALA_EXAMES", min(0)),
    ev("a", "RECEPCAO", "SALA_EXAMES", min(0) + 3000), // duplicata de outra instância
    ev("a", "SALA_EXAMES", "PRONTO_MEDICO", min(10)),
    ev("a", "SALA_EXAMES", "PRONTO_MEDICO", min(12)), // duplicata atrasada
    ev("a", "PRONTO_MEDICO", "ATENDIDO", min(30)),
  ];
  const [t] = reconstruirTrajetorias(eventos);
  assert.deepEqual(
    t.estadias.map((e) => e.estagio),
    ["SALA_EXAMES", "PRONTO_MEDICO", "ATENDIDO"],
  );
  const r = calcularResumo([t]);
  assert.equal(r.exames.mediana, 10);
  assert.equal(r.prontoMedico.mediana, 20);
});

test("formato novo: chegada na recepção gera tempo de recepção e total desde a chegada", () => {
  const chegada = min(0);
  const eventos = [
    ev("b", null, "RECEPCAO", chegada, { chegadaMs: chegada }),
    ev("b", "RECEPCAO", "SALA_EXAMES", min(15), { chegadaMs: chegada }),
    ev("b", "SALA_EXAMES", "PRONTO_MEDICO", min(25), { chegadaMs: chegada }),
    ev("b", "PRONTO_MEDICO", "ATENDIDO", min(45), { chegadaMs: chegada }),
  ];
  const r = calcularResumo(reconstruirTrajetorias(eventos));
  assert.equal(r.recepcao.mediana, 15);
  assert.equal(r.tempoTotal.mediana, 45);
  assert.equal(r.tempoTotalDesdeChegada, true);
  assert.equal(r.pacientesComChegada, 1);
});

test("paciente visto direto em exames: recepção = chegada até o primeiro movimento", () => {
  const chegada = min(0);
  const eventos = [
    ev("c", null, "SALA_EXAMES", min(8), { chegadaMs: chegada }),
    ev("c", "SALA_EXAMES", "ATENDIDO", min(20), { chegadaMs: chegada }),
  ];
  const [t] = reconstruirTrajetorias(eventos);
  assert.equal(t.estadias[0].estagio, "RECEPCAO");
  assert.equal(t.estadias[0].durMin, 8);
  assert.equal(t.tempoTotalMin, 20);
});

test("histórico antigo (sem chegada): recepção não é inventada", () => {
  const eventos = [
    ev("d", "RECEPCAO", "SALA_EXAMES", min(0)),
    ev("d", "SALA_EXAMES", "ATENDIDO", min(10)),
  ];
  const r = calcularResumo(reconstruirTrajetorias(eventos));
  assert.equal(r.recepcao, null);
  assert.equal(r.tempoTotal.mediana, 10);
  assert.equal(r.tempoTotalDesdeChegada, false);
});

test("período misto: tempo total usa só quem tem chegada registrada", () => {
  const chegada = min(0);
  const eventos = [
    ev("antigo", "RECEPCAO", "SALA_EXAMES", min(0)),
    ev("antigo", "SALA_EXAMES", "ATENDIDO", min(10)),
    ev("novo", null, "RECEPCAO", chegada, { chegadaMs: chegada }),
    ev("novo", "RECEPCAO", "ATENDIDO", min(50), { chegadaMs: chegada }),
  ];
  const r = calcularResumo(reconstruirTrajetorias(eventos));
  assert.equal(r.tempoTotal.n, 1);
  assert.equal(r.tempoTotal.mediana, 50);
});

test("primeiro evento no meio do fluxo não vira tempo de recepção", () => {
  const eventos = [
    ev("e", "SALA_EXAMES", "PRONTO_MEDICO", min(30), { chegadaMs: min(0) }),
    ev("e", "PRONTO_MEDICO", "ATENDIDO", min(40), { chegadaMs: min(0) }),
  ];
  const r = calcularResumo(reconstruirTrajetorias(eventos));
  assert.equal(r.recepcao, null);
  assert.equal(r.tempoTotal.mediana, 40);
});

test("mediana não se distorce com paciente esquecido no estágio", () => {
  const e = estatistica([10, 12, 14, 16, 400]);
  assert.equal(e.mediana, 14);
  assert.ok(e.media > 90);
});

test("ranking por convênio ignora convênio com menos de 3 pacientes", () => {
  const eventos = [];
  for (const [id, conv, dur] of [
    ["u1", "Unimed", 30], ["u2", "Unimed", 40], ["u3", "Unimed", 50],
    ["x1", "Raro", 300],
  ]) {
    eventos.push(ev(id, "RECEPCAO", "SALA_EXAMES", min(0), { convenio: conv }));
    eventos.push(ev(id, "SALA_EXAMES", "ATENDIDO", min(dur), { convenio: conv }));
  }
  const itens = tempoPorConvenio(reconstruirTrajetorias(eventos));
  assert.deepEqual(itens.map((i) => i.rotulo), ["Unimed"]);
  assert.equal(itens[0].valor, 40);
});

test("pacientes por dia preenche dias sem movimento", () => {
  const ts = reconstruirTrajetorias([ev("f", "RECEPCAO", "ATENDIDO", min(0))]);
  const itens = pacientesPorDia(ts, { dataInicio: "2026-11-08", dataFim: "2026-11-10" });
  assert.deepEqual(itens, [
    { rotulo: "08/11", valor: 0 },
    { rotulo: "09/11", valor: 1 },
    { rotulo: "10/11", valor: 0 },
  ]);
});

test("hora de chegada do ProDoctor vira instante no fuso da clínica", () => {
  const agora = Date.parse("2026-11-09T09:30:00-03:00");
  assert.equal(
    instanteDaChegada("2026-11-09", "09:05", agora),
    Date.parse("2026-11-09T09:05:00-03:00"),
  );
  assert.equal(instanteDaChegada("2026-11-09", "9:05:30", agora), Date.parse("2026-11-09T09:05:30-03:00"));
  assert.equal(instanteDaChegada("2026-11-09", null, agora), null);
  assert.equal(instanteDaChegada("2026-11-09", "abc", agora), null);
  assert.equal(instanteDaChegada("2026-11-09", "15:00", agora), null); // no futuro
  assert.equal(instanteDaChegada("2026-11-09", "09:31", agora), agora); // tolerância
});

test("sem chegada, paciente devolvido à recepção não vira 'tempo de recepção'", () => {
  const eventos = [
    ev("g", "RECEPCAO", "SALA_EXAMES", min(0)),
    ev("g", "SALA_EXAMES", "RECEPCAO", min(5)),
    ev("g", "RECEPCAO", "ATENDIDO", min(400)),
  ];
  const r = calcularResumo(reconstruirTrajetorias(eventos));
  assert.equal(r.recepcao, null);
});
