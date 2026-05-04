/**
 * Mutações no ProDoctor — somente para o modo edição do painel.
 *
 * Hoje só temos uma mutação: alterar o estado (checkboxes) de um
 * agendamento. Isso vira PATCH /api/v1/Agenda/AlterarStatus na API
 * ProDoctor (ver swagger seção AlterarStatus).
 *
 * A chave da API precisa ter a permissão "Alterar na Agenda" — sem isso
 * o ProDoctor responde 401 e devolvemos erro claro.
 */

import { CONFIG, lerConfigProDoctor } from "./configuracao";
import type { ChaveAgendamento } from "./tipos";
import type { FlagsParaEnviar } from "./transicaoFlags";

class ErroMutacaoProDoctor extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ErroMutacaoProDoctor";
  }
}

/**
 * Chama PATCH /api/v1/Agenda/AlterarStatus no ProDoctor com os campos
 * informados. Os flags com valor `null` ou `undefined` são omitidos
 * (significam "não tocar"). O ProDoctor preserva os timestamps que já
 * tinham sido carimbados.
 */
export async function alterarStatusAgendamento(
  chave: ChaveAgendamento,
  flags: FlagsParaEnviar,
): Promise<{ ok: true } | { ok: false; status: number | null; mensagem: string }> {
  const cfg = lerConfigProDoctor();
  const url = `${cfg.apiUrl.replace(/\/$/, "")}/api/v1/Agenda/AlterarStatus`;

  // Monta o objeto enxuto: só campos com valor true/false.
  const estado: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(flags)) {
    if (typeof v === "boolean") estado[k] = v;
  }

  const body = {
    estadoAgendaConsulta: estado,
    agendamentoID: {
      localProDoctor: { codigo: chave.localCodigo },
      usuario: { codigo: chave.usuarioCodigo },
      data: chave.data,
      hora: chave.hora,
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_API_MS);

  try {
    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        "X-APIKEY": cfg.apiKey,
        "X-APIPASSWORD": cfg.apiPassword,
        "X-APITIMEZONE": cfg.timezone,
        "X-APITIMEZONENAME": cfg.timezoneName,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (resp.ok) return { ok: true };

    const corpo = await resp.text().catch(() => "");
    return {
      ok: false,
      status: resp.status,
      mensagem:
        resp.status === 401
          ? "ProDoctor recusou a chamada (401). A chave da API tem a permissão 'Alterar na Agenda'?"
          : resp.status === 400
            ? `ProDoctor recusou os dados (400): ${corpo.slice(0, 300)}`
            : `ProDoctor devolveu ${resp.status} ${resp.statusText}: ${corpo.slice(0, 300)}`,
    };
  } catch (err) {
    clearTimeout(timer);
    const causa =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : "erro desconhecido";
    return {
      ok: false,
      status: null,
      mensagem: `Falha ao chamar ProDoctor: ${causa}`,
    };
  }
}

export { ErroMutacaoProDoctor };
