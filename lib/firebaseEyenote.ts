"use client";

/**
 * Cliente do Eyenote (projeto eyenotev2).
 *
 * O Eyenote tem seu próprio Firebase, SEPARADO do nosso (painel-oftalmocenter).
 *
 * IMPORTANTE — por que Firestore via REST e não via SDK:
 * O SDK web do Firestore conversa por WebChannel (conexão longa/streaming).
 * Na rede da clínica (Starlink) esse canal morre e getDocsFromServer falhava
 * com "Failed to get documents from server" mesmo com a internet funcionando —
 * a autenticação (HTTPS simples) e o upload pro Storage (HTTPS simples)
 * passavam, só o Firestore caía. Então aqui TODAS as operações de Firestore
 * usam a API REST (fetch puro, requisição curta), que se comporta como
 * qualquer outra chamada de rede do painel. Auth e Storage continuam no SDK.
 *
 * Fluxo do enviarExame(opts):
 *   1. Autenticação anônima (igual ao /legacy original).
 *   2. Procura paciente já criado nas últimas 6h pelo MESMO médico com
 *      o MESMO nome — se achar, reutiliza (caso AR e Tono cheguem em
 *      momentos separados, ficam no mesmo doc).
 *   3. Senão, cria doc novo na coleção `patients` com:
 *        name, documentId, status: "active", createdAt (server), exams.
 *   4. Faz upload da imagem para `exams/{patientId}/{tipoExame}_{ts}.{ext}`.
 *   5. Atualiza `exams.{tipoExame}` do doc paciente marcando uploaded:true
 *      com URL e timestamp.
 *
 * Tudo no cliente — as credenciais do Eyenote são PÚBLICAS (apiKey de
 * cliente, é o que o /legacy original também usa) e a autenticação
 * anônima do Firebase basta.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";

/** Configuração pública do Firebase do projeto eyenotev2. */
const firebaseConfigEyenote = {
  apiKey: "AIzaSyDB_pQbN52rfNR2QMEztkplc86GaBPy6Zw",
  authDomain: "eyenotev2.firebaseapp.com",
  projectId: "eyenotev2",
  storageBucket: "eyenotev2.firebasestorage.app",
  messagingSenderId: "532714325632",
  appId: "1:532714325632:web:631ca9e64771a38e140865",
} as const;

const NOME_APP = "eyenote";

const BASE_FIRESTORE = `https://firestore.googleapis.com/v1/projects/${firebaseConfigEyenote.projectId}/databases/(default)/documents`;

export type TipoExameEyenote = "ar" | "tonometry";

export const ROTULOS_EXAMES_EYENOTE: Record<TipoExameEyenote, string> = {
  ar: "AR",
  tonometry: "Tono",
};

interface ContextoEyenote {
  app: FirebaseApp;
  storage: FirebaseStorage;
  auth: Auth;
}

function obterContexto(): ContextoEyenote {
  const existente = getApps().find((a) => a.name === NOME_APP);
  const app =
    existente ?? initializeApp(firebaseConfigEyenote, NOME_APP);
  return {
    app,
    storage: getStorage(app),
    auth: getAuth(app),
  };
}

async function tokenAutenticado(): Promise<string> {
  const { auth } = obterContexto();
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Autenticação anônima no Eyenote falhou.");
  }
  return user.getIdToken();
}

// ─── Firestore por REST ──────────────────────────────────────────────────────

/** Erro de rede/servidor nas chamadas REST — vira mensagem amigável na tela. */
class ErroRedeEyenote extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroRedeEyenote";
  }
}

const TIMEOUT_REST_MS = 10_000;
const PAUSA_RETRY_REST_MS = 700;

/**
 * fetch com timeout + 1 retry para falha de rede, timeout ou 5xx.
 * Requisições curtas e independentes — nada de canal persistente.
 */
async function fetchFirestore(
  url: string,
  body: unknown,
  rotulo: string,
): Promise<unknown> {
  const token = await tokenAutenticado();
  let ultimaCausa = "";

  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    if (tentativa > 0) {
      await new Promise((r) => setTimeout(r, PAUSA_RETRY_REST_MS));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_REST_MS);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        return (await resp.json()) as unknown;
      }
      const texto = await resp.text().catch(() => "");
      // 4xx é definitivo (regra, permissão, request inválido) — sem retry.
      if (resp.status < 500) {
        throw new Error(
          `Eyenote/${rotulo}: HTTP ${resp.status} — ${texto.slice(0, 300)}`,
        );
      }
      ultimaCausa = `HTTP ${resp.status}`;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        ultimaCausa = `timeout de ${TIMEOUT_REST_MS}ms`;
      } else if (err instanceof Error && err.name !== "TypeError") {
        // Erros que nós mesmos lançamos acima (4xx) propagam direto.
        throw err;
      } else {
        ultimaCausa = err instanceof Error ? err.message : String(err);
      }
    }
  }

  throw new ErroRedeEyenote(`Eyenote/${rotulo} falhou: ${ultimaCausa}`);
}

interface PacienteEyenoteResumo {
  id: string;
  name: string;
  documentId: string;
  createdAtMs: number | null;
}

const JANELA_REUSO_PACIENTE_MS = 6 * 60 * 60 * 1000;

/**
 * Cache em memória de pacientes criados/encontrados nesta sessão da TV.
 *
 * Resolve o caso mais comum de duplicata: a recepção tira AR, em seguida
 * Tono, mas a segunda query do Firestore ainda vê o índice frio e não
 * encontra o paciente que acabou de ser criado, gerando uma 2ª ficha.
 *
 * Chave: `${medicoCodigo}|${nomeNormalizado}`. Sobrevive a abrir/fechar
 * o modal; só zera com reload da página.
 */
const cachePacienteSessao = new Map<
  string,
  { id: string; criadoEmMs: number }
>();

function chaveCacheSessao(medicoCodigo: string, nomePaciente: string): string {
  return `${medicoCodigo}|${nomePaciente.trim().toLowerCase()}`;
}

function lerCacheSessao(
  medicoCodigo: string,
  nomePaciente: string,
): string | null {
  const k = chaveCacheSessao(medicoCodigo, nomePaciente);
  const v = cachePacienteSessao.get(k);
  if (!v) return null;
  if (Date.now() - v.criadoEmMs > JANELA_REUSO_PACIENTE_MS) {
    cachePacienteSessao.delete(k);
    return null;
  }
  return v.id;
}

function gravarCacheSessao(
  medicoCodigo: string,
  nomePaciente: string,
  id: string,
): void {
  cachePacienteSessao.set(chaveCacheSessao(medicoCodigo, nomePaciente), {
    id,
    criadoEmMs: Date.now(),
  });
}

// Formatos da API REST do Firestore (só os campos que usamos).
interface ValorFirestore {
  stringValue?: string;
  timestampValue?: string;
  booleanValue?: boolean;
  mapValue?: { fields?: Record<string, ValorFirestore> };
}

interface DocFirestore {
  name?: string;
  fields?: Record<string, ValorFirestore>;
}

async function acharPacienteRecente(
  medicoCodigo: string,
  nomePaciente: string,
): Promise<PacienteEyenoteResumo | null> {
  // Só filtros de igualdade — o Firestore resolve com merge de índices
  // single-field, sem exigir índice composto. `status == "active"`
  // descarta no servidor as fichas antigas já atendidas.
  // Filtramos `name` + `createdAt nas últimas 6h` no cliente.
  // A leitura é sempre no servidor (REST não tem cache local) — sem risco
  // de reabrir o bug de ficha duplicada por cache stale.
  const filtro = (campo: string, valor: string) => ({
    fieldFilter: {
      field: { fieldPath: campo },
      op: "EQUAL",
      value: { stringValue: valor },
    },
  });

  const resposta = (await fetchFirestore(
    `${BASE_FIRESTORE}:runQuery`,
    {
      structuredQuery: {
        from: [{ collectionId: "patients" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              filtro("documentId", medicoCodigo),
              filtro("status", "active"),
            ],
          },
        },
        limit: 100,
      },
    },
    "acharPaciente",
  )) as Array<{ document?: DocFirestore }>;

  const limiteMs = Date.now() - JANELA_REUSO_PACIENTE_MS;
  let melhor: PacienteEyenoteResumo | null = null;

  for (const linha of Array.isArray(resposta) ? resposta : []) {
    const doc = linha.document;
    const fields = doc?.fields;
    if (!doc?.name || !fields) continue;

    const nome = fields.name?.stringValue;
    if (typeof nome !== "string") continue;
    if (nome.trim().toLowerCase() !== nomePaciente.trim().toLowerCase()) {
      continue;
    }

    // createdAt recém-gravado com serverTimestamp está sempre presente via
    // REST; se faltar (doc antigo/malformado), tratamos como "agora".
    const criadoEm = fields.createdAt?.timestampValue;
    const ms = criadoEm ? Date.parse(criadoEm) : NaN;
    const msEfetivo = Number.isFinite(ms) ? ms : Date.now();
    if (msEfetivo < limiteMs) continue;

    if (!melhor || msEfetivo > (melhor.createdAtMs ?? 0)) {
      melhor = {
        id: doc.name.split("/").pop() ?? "",
        name: nome,
        documentId: fields.documentId?.stringValue ?? "",
        createdAtMs: msEfetivo,
      };
    }
  }

  return melhor && melhor.id !== "" ? melhor : null;
}

/** Gera um ID de documento no mesmo formato do SDK (20 chars alfanuméricos). */
function gerarIdDocumento(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}

async function criarPacienteNovo(
  medicoCodigo: string,
  nomePaciente: string,
): Promise<string> {
  const id = gerarIdDocumento();
  await fetchFirestore(
    `${BASE_FIRESTORE}:commit`,
    {
      writes: [
        {
          update: {
            name: `${BASE_FIRESTORE.replace("https://firestore.googleapis.com/v1/", "")}/patients/${id}`,
            fields: {
              name: { stringValue: nomePaciente },
              documentId: { stringValue: medicoCodigo },
              status: { stringValue: "active" },
              exams: {
                mapValue: {
                  fields: {
                    ar: {
                      mapValue: {
                        fields: { uploaded: { booleanValue: false } },
                      },
                    },
                    tonometry: {
                      mapValue: {
                        fields: { uploaded: { booleanValue: false } },
                      },
                    },
                  },
                },
              },
            },
          },
          // serverTimestamp igual ao SDK: quem carimba é o servidor.
          updateTransforms: [
            { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
          ],
        },
      ],
    },
    "criarPaciente",
  );
  return id;
}

async function marcarExameEnviado(
  patientId: string,
  tipoExame: TipoExameEyenote,
  url: string,
): Promise<void> {
  await fetchFirestore(
    `${BASE_FIRESTORE}:commit`,
    {
      writes: [
        {
          update: {
            name: `${BASE_FIRESTORE.replace("https://firestore.googleapis.com/v1/", "")}/patients/${patientId}`,
            fields: {
              exams: {
                mapValue: {
                  fields: {
                    [tipoExame]: {
                      mapValue: {
                        fields: {
                          uploaded: { booleanValue: true },
                          url: { stringValue: url },
                          uploadedAt: {
                            stringValue: new Date().toISOString(),
                          },
                          uploadedBy: {
                            stringValue: "painel-oftalmocenter",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          // Atualiza SÓ exams.{tipo} — não toca no outro exame nem no resto.
          updateMask: { fieldPaths: [`exams.${tipoExame}`] },
        },
      ],
    },
    "marcarExame",
  );
}

function extensaoDe(arquivo: File): string {
  const mime = arquivo.type;
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  const pelaPista = arquivo.name.split(".").pop();
  return pelaPista && pelaPista.length <= 4 ? pelaPista.toLowerCase() : "jpg";
}

export interface OpcoesEnvioExame {
  medicoCodigo: string;
  nomePaciente: string;
  tipoExame: TipoExameEyenote;
  arquivo: File;
}

export type ResultadoEnvioExame =
  | { ok: true; patientId: string; reusado: boolean }
  | { ok: false; mensagem: string };

export async function enviarExameParaEyenote(
  opts: OpcoesEnvioExame,
): Promise<ResultadoEnvioExame> {
  if (!opts.medicoCodigo || opts.medicoCodigo.trim() === "") {
    return { ok: false, mensagem: "Código do médico não configurado." };
  }
  if (!opts.nomePaciente || opts.nomePaciente.trim() === "") {
    return { ok: false, mensagem: "Paciente sem nome — não dá pra criar entrada." };
  }
  if (!opts.arquivo || opts.arquivo.size === 0) {
    return { ok: false, mensagem: "Arquivo de imagem inválido." };
  }
  if (opts.arquivo.size > 12 * 1024 * 1024) {
    return { ok: false, mensagem: "Imagem maior que 12 MB. Tente novamente." };
  }

  try {
    const { storage } = obterContexto();

    const medicoCodigo = opts.medicoCodigo.trim();

    // 1ª linha de defesa: cache em memória da sessão. Resolve o caso
    // recepção tira AR e Tono em seguida sem depender de consistência
    // eventual do Firestore.
    const idEmCache = lerCacheSessao(medicoCodigo, opts.nomePaciente);

    let patientId: string;
    let reusado: boolean;

    if (idEmCache) {
      patientId = idEmCache;
      reusado = true;
    } else {
      // 2ª linha: query no servidor (REST sempre vai à rede).
      const existente = await acharPacienteRecente(
        medicoCodigo,
        opts.nomePaciente,
      );
      if (existente) {
        patientId = existente.id;
        reusado = true;
      } else {
        patientId = await criarPacienteNovo(medicoCodigo, opts.nomePaciente);
        reusado = false;
      }
      gravarCacheSessao(medicoCodigo, opts.nomePaciente, patientId);
    }

    // Upload da imagem (SDK do Storage — HTTPS simples, funciona bem).
    const ext = extensaoDe(opts.arquivo);
    const path = `exams/${patientId}/${opts.tipoExame}_${Date.now()}.${ext}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, opts.arquivo, {
      contentType: opts.arquivo.type || "image/jpeg",
    });
    const url = await getDownloadURL(ref);

    // Atualiza o doc do paciente marcando o exame.
    await marcarExameEnviado(patientId, opts.tipoExame, url);

    return { ok: true, patientId, reusado };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[eyenote] Falha ao enviar exame:", err);
    if (err instanceof ErroRedeEyenote) {
      return {
        ok: false,
        mensagem:
          "A internet está lenta e o Eyenote não respondeu a tempo. " +
          "Aguarde alguns segundos e toque no botão de novo.",
      };
    }
    const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
    return { ok: false, mensagem };
  }
}
