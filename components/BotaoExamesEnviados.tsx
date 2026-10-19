"use client";

/**
 * Botão no header que abre a lista de fichas enviadas hoje ao Eyenote
 * (de todos os médicos com código cadastrado) e permite passar uma ficha,
 * com os exames já anexados, para outro médico.
 *
 * Caso de uso: o paciente faz AR/Tono, as fotos vão pro Eyenote do médico
 * agendado, e depois a clínica decide que outro médico vai atendê-lo.
 *
 * Ver a lista é livre; trocar de médico exige o modo edição (cadeado
 * aberto), igual a mover paciente — é uma alteração em dado real.
 */

import { useCallback, useEffect, useState } from "react";

import { corMedico, medicosComEyenote } from "@/lib/configuracao";
import {
  listarPacientesEnviadosHoje,
  ROTULOS_EXAMES_EYENOTE,
  trocarMedicoNoEyenote,
  type PacienteEnviadoEyenote,
} from "@/lib/firebaseEyenote";

interface Props {
  edicaoLigada: boolean;
}

export default function BotaoExamesEnviados({ edicaoLigada }: Props) {
  const [aberto, setAberto] = useState(false);

  // Sem nenhum médico com Eyenote cadastrado, não há o que mostrar.
  if (medicosComEyenote().length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Exames enviados hoje ao Eyenote"
        aria-label="Ver exames enviados hoje ao Eyenote"
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-slate-600 transition hover:bg-slate-50"
      >
        <IconeLista />
        <span className="text-xs font-semibold">Enviados</span>
      </button>
      {aberto && (
        <ModalExamesEnviados
          edicaoLigada={edicaoLigada}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

type EstadoLista =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; pacientes: PacienteEnviadoEyenote[] };

interface Troca {
  patientId: string;
  para: string;
  fase: "confirmar" | "enviando";
}

function ModalExamesEnviados({
  edicaoLigada,
  onFechar,
}: {
  edicaoLigada: boolean;
  onFechar: () => void;
}) {
  const medicos = medicosComEyenote();
  const [lista, setLista] = useState<EstadoLista>({ fase: "carregando" });
  const [troca, setTroca] = useState<Troca | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  const ocupado = troca?.fase === "enviando";

  const carregar = useCallback(async () => {
    setLista({ fase: "carregando" });
    try {
      const pacientes = await listarPacientesEnviadosHoje(
        medicosComEyenote().map((m) => m.eyenote),
      );
      setLista({ fase: "ok", pacientes });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[eyenote] Falha ao listar enviados:", err);
      setLista({
        fase: "erro",
        mensagem:
          "Não consegui carregar a lista do Eyenote. Verifique a internet e tente de novo.",
      });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocupado) onFechar();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [ocupado, onFechar]);

  const nomeDoMedico = (eyenote: string) =>
    medicos.find((m) => m.eyenote === eyenote)?.nome ?? "Outro médico";

  const confirmarTroca = async (p: PacienteEnviadoEyenote, para: string) => {
    setTroca({ patientId: p.id, para, fase: "enviando" });
    setAviso(null);
    const r = await trocarMedicoNoEyenote({
      patientId: p.id,
      nomePaciente: p.nome,
      de: p.medicoCodigo,
      para,
    });
    setTroca(null);
    if (r.ok) {
      setAviso({
        ok: true,
        texto: r.mesclado
          ? `${p.nome}: exames juntados à ficha que ${nomeDoMedico(para)} já tinha.`
          : `${p.nome}: exames passados para ${nomeDoMedico(para)}.`,
      });
      void carregar();
    } else {
      setAviso({ ok: false, texto: r.mensagem });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 sm:items-center"
      onClick={!ocupado ? onFechar : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="enviados-titulo"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Eyenote · hoje
            </p>
            <h2
              id="enviados-titulo"
              className="mt-1 text-lg font-medium text-slate-900"
            >
              Exames enviados
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={ocupado || lista.fase === "carregando"}
            className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
          >
            Atualizar
          </button>
        </header>

        {!edicaoLigada && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">
            Para trocar o médico, abra o cadeado (modo edição) primeiro.
          </div>
        )}

        {aviso && (
          <div
            className={`border-b px-5 py-2 text-xs ${
              aviso.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {aviso.ok ? "✓ " : "⚠ "}
            {aviso.texto}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {lista.fase === "carregando" && (
            <p className="px-5 py-6 text-sm text-slate-500">Carregando…</p>
          )}
          {lista.fase === "erro" && (
            <p className="px-5 py-6 text-sm text-red-700">{lista.mensagem}</p>
          )}
          {lista.fase === "ok" && lista.pacientes.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-500">
              Nenhum exame enviado hoje (ou o médico já arquivou as fichas).
            </p>
          )}
          {lista.fase === "ok" && lista.pacientes.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {lista.pacientes.map((p) => {
                const medicoAtual = medicos.find(
                  (m) => m.eyenote === p.medicoCodigo,
                );
                const cor = corMedico(medicoAtual?.codigo ?? null);
                const outros = medicos.filter(
                  (m) => m.eyenote !== p.medicoCodigo,
                );
                const trocaDaLinha =
                  troca?.patientId === p.id ? troca : null;
                return (
                  <li key={p.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {p.nome}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: cor.bg, color: cor.texto }}
                      >
                        {nomeDoMedico(p.medicoCodigo)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {p.criadoEmMs !== null && `${formatarHora(p.criadoEmMs)} · `}
                      {(["ar", "tonometry"] as const).map((tipo, i) => (
                        <span key={tipo}>
                          {i > 0 && " · "}
                          {ROTULOS_EXAMES_EYENOTE[tipo]}{" "}
                          {p.exames[tipo] ? "✓" : "—"}
                        </span>
                      ))}
                    </p>

                    {outros.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">
                          Passar para:
                        </span>
                        {outros.map((m) => {
                          const escolhido = trocaDaLinha?.para === m.eyenote;
                          return (
                            <button
                              key={m.codigo}
                              type="button"
                              disabled={!edicaoLigada || ocupado}
                              onClick={() =>
                                setTroca({
                                  patientId: p.id,
                                  para: m.eyenote,
                                  fase: "confirmar",
                                })
                              }
                              aria-pressed={escolhido}
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                escolhido
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {m.nome}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {trocaDaLinha && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
                        <span className="flex-1">
                          {trocaDaLinha.fase === "enviando"
                            ? "Passando os exames…"
                            : `Passar os exames de ${p.nome} para ${nomeDoMedico(trocaDaLinha.para)}?`}
                        </span>
                        {trocaDaLinha.fase === "confirmar" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setTroca(null)}
                              className="rounded-md px-2 py-1 font-medium text-slate-600 hover:bg-white"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void confirmarTroca(p, trocaDaLinha.para)
                              }
                              className="rounded-md bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-700"
                            >
                              Confirmar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onFechar}
            disabled={ocupado}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}

function formatarHora(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function IconeLista() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}
