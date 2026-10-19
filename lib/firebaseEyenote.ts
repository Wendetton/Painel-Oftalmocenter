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

import { dataYYYYMMDDBrasil } from "./configuracao";

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

// ─── Aceleradores do envio ───────────────────────────────────────────────────

/** Fotos de câmera de tablet vêm com 3–8 MB; no uplink do Starlink isso é o
 * grosso do tempo de "enviando…". Reduzimos para no máx. LADO_MAX_PX de lado
 * e JPEG QUALIDADE_JPEG — sobra resolução de sobra pra ler um impresso de
 * AR/Tono e o arquivo cai pra ~10% do tamanho. */
const LADO_MAX_PX = 1800;
const QUALIDADE_JPEG = 0.82;
const LIMIAR_COMPRESSAO_BYTES = 700 * 1024;

async function comprimirImagem(arquivo: File): Promise<Blob> {
  if (arquivo.size <= LIMIAR_COMPRESSAO_BYTES) return arquivo;
  try {
    // 'from-image' aplica a rotação EXIF (foto tirada de lado sai certa).
    const bitmap = await createImageBitmap(arquivo, {
      imageOrientation: "from-image",
    });
    const escala = Math.min(
      1,
      LADO_MAX_PX / Math.max(bitmap.width, bitmap.height),
    );
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALIDADE_JPEG),
    );
    // Se a compressão falhar ou (raro) não reduzir, manda o original.
    return blob && blob.size < arquivo.size ? blob : arquivo;
  } catch {
    return arquivo;
  }
}

/** Buscas de ficha em andamento, por chave de sessão — evita duplicar a
 * query quando o aquecimento e o envio real se sobrepõem. */
const buscasEmAndamento = new Map<
  string,
  Promise<PacienteEyenoteResumo | null>
>();

function buscarPacienteDeduplicado(
  medicoCodigo: string,
  nomePaciente: string,
): Promise<PacienteEyenoteResumo | null> {
  const k = chaveCacheSessao(medicoCodigo, nomePaciente);
  const emAndamento = buscasEmAndamento.get(k);
  if (emAndamento) return emAndamento;

  const p = acharPacienteRecente(medicoCodigo, nomePaciente).finally(() => {
    buscasEmAndamento.delete(k);
  });
  buscasEmAndamento.set(k, p);
  return p;
}

/**
 * Aquecimento: chamar no TOQUE do botão de exame, antes da câmera abrir.
 * Enquanto a pessoa enquadra a foto (vários segundos), já autenticamos e
 * procuramos a ficha do paciente. Quando a foto chega, normalmente só falta
 * o upload. Não cria ficha (se a pessoa cancelar a foto, nada muda no
 * Eyenote) e engole erros — o envio real refaz e reporta o que falhar.
 */
export function aquecerEnvioExame(
  medicoCodigo: string,
  nomePaciente: string,
): void {
  const codigo = medicoCodigo.trim();
  if (codigo === "" || nomePaciente.trim() === "") return;
  if (lerCacheSessao(codigo, nomePaciente)) return;

  void buscarPacienteDeduplicado(codigo, nomePaciente)
    .then((existente) => {
      if (existente) gravarCacheSessao(codigo, nomePaciente, existente.id);
    })
    .catch(() => {
      /* silencioso — envio real trata */
    });
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

    // Comprime a foto em paralelo com a resolução da ficha — as duas
    // etapas são independentes.
    const imagemPromise = comprimirImagem(opts.arquivo);

    // 1ª linha de defesa: cache em memória da sessão (inclusive o que o
    // aquecimento do toque no botão já resolveu). Resolve o caso recepção
    // tira AR e Tono em seguida sem depender de consistência eventual.
    const idEmCache = lerCacheSessao(medicoCodigo, opts.nomePaciente);

    let patientId: string;
    let reusado: boolean;

    if (idEmCache) {
      patientId = idEmCache;
      reusado = true;
    } else {
      // 2ª linha: query no servidor (REST sempre vai à rede). Se o
      // aquecimento ainda estiver no ar, reaproveita a mesma busca.
      const existente = await buscarPacienteDeduplicado(
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
    const imagem = await imagemPromise;
    const comprimida = imagem !== opts.arquivo;
    const ext = comprimida ? "jpg" : extensaoDe(opts.arquivo);
    const path = `exams/${patientId}/${opts.tipoExame}_${Date.now()}.${ext}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, imagem, {
      contentType: comprimida ? "image/jpeg" : opts.arquivo.type || "image/jpeg",
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

// ─── Exames já enviados / troca de médico ────────────────────────────────────

/** Caminho do doc no formato que o REST espera em `name` (sem o host). */
function caminhoDocPaciente(patientId: string): string {
  return `${BASE_FIRESTORE.replace("https://firestore.googleapis.com/v1/", "")}/patients/${patientId}`;
}

function exameEnviado(
  exams: ValorFirestore | undefined,
  tipo: TipoExameEyenote,
): boolean {
  return (
    exams?.mapValue?.fields?.[tipo]?.mapValue?.fields?.uploaded
      ?.booleanValue === true
  );
}

export interface PacienteEnviadoEyenote {
  id: string;
  nome: string;
  /** Código Eyenote do médico ao qual a ficha está vinculada hoje. */
  medicoCodigo: string;
  criadoEmMs: number | null;
  exames: Record<TipoExameEyenote, boolean>;
}

/**
 * Fichas ATIVAS criadas hoje (fuso de São Paulo) no Eyenote de cada um dos
 * códigos informados. Fichas que o médico já arquivou não aparecem — o
 * paciente já foi atendido e não faz sentido trocá-lo de médico.
 */
export async function listarPacientesEnviadosHoje(
  codigosMedicos: string[],
): Promise<PacienteEnviadoEyenote[]> {
  const hoje = dataYYYYMMDDBrasil();
  const filtro = (campo: string, valor: string) => ({
    fieldFilter: {
      field: { fieldPath: campo },
      op: "EQUAL",
      value: { stringValue: valor },
    },
  });

  const respostas = await Promise.all(
    codigosMedicos.map(
      (codigo) =>
        fetchFirestore(
          `${BASE_FIRESTORE}:runQuery`,
          {
            structuredQuery: {
              from: [{ collectionId: "patients" }],
              where: {
                compositeFilter: {
                  op: "AND",
                  filters: [
                    filtro("documentId", codigo),
                    filtro("status", "active"),
                  ],
                },
              },
              limit: 200,
            },
          },
          "listarEnviados",
        ) as Promise<Array<{ document?: DocFirestore }>>,
    ),
  );

  const lista: PacienteEnviadoEyenote[] = [];
  for (const resposta of respostas) {
    for (const linha of Array.isArray(resposta) ? resposta : []) {
      const doc = linha.document;
      const fields = doc?.fields;
      if (!doc?.name || !fields) continue;
      const nome = fields.name?.stringValue;
      if (typeof nome !== "string") continue;

      const criadoEm = fields.createdAt?.timestampValue;
      const ms = criadoEm ? Date.parse(criadoEm) : NaN;
      if (!Number.isFinite(ms)) continue;
      if (dataYYYYMMDDBrasil(new Date(ms)) !== hoje) continue;

      lista.push({
        id: doc.name.split("/").pop() ?? "",
        nome,
        medicoCodigo: fields.documentId?.stringValue ?? "",
        criadoEmMs: ms,
        exames: {
          ar: exameEnviado(fields.exams, "ar"),
          tonometry: exameEnviado(fields.exams, "tonometry"),
        },
      });
    }
  }

  // Mais recentes primeiro.
  return lista
    .filter((p) => p.id !== "")
    .sort((a, b) => (b.criadoEmMs ?? 0) - (a.criadoEmMs ?? 0));
}

async function lerDocPaciente(patientId: string): Promise<DocFirestore | null> {
  const resposta = (await fetchFirestore(
    `${BASE_FIRESTORE}:batchGet`,
    { documents: [caminhoDocPaciente(patientId)] },
    "lerPaciente",
  )) as Array<{ found?: DocFirestore }>;
  const primeiro = Array.isArray(resposta) ? resposta[0] : undefined;
  return primeiro?.found ?? null;
}

export interface OpcoesTrocaMedico {
  patientId: string;
  nomePaciente: string;
  /** Código Eyenote atual da ficha. */
  de: string;
  /** Código Eyenote do novo médico. */
  para: string;
}

export type ResultadoTrocaMedico =
  | { ok: true; mesclado: boolean }
  | { ok: false; mensagem: string };

/**
 * Passa a ficha (com os exames já anexados) para o Eyenote de outro médico.
 *
 * Caso normal: só troca o `documentId` da ficha. As fotos ficam onde estão
 * no Storage (o caminho usa o id da ficha, que não muda) e o Eyenote do
 * novo médico passa a mostrar a ficha na hora.
 *
 * Se o novo médico JÁ tem uma ficha ativa do mesmo paciente (ex.: alguém
 * tirou o Tono depois da troca), não criamos duplicata: copiamos para ela
 * os exames que ela ainda não tem e ARQUIVAMOS a ficha antiga (o mesmo que
 * o botão "Arquivar" do Eyenote faz — fica na lista de arquivados, nada é
 * apagado). Tudo num único commit: ou aplica tudo, ou nada.
 */
export async function trocarMedicoNoEyenote(
  opts: OpcoesTrocaMedico,
): Promise<ResultadoTrocaMedico> {
  const de = opts.de.trim();
  const para = opts.para.trim();
  if (para === "" || para === de) {
    return { ok: false, mensagem: "Escolha um médico diferente do atual." };
  }

  try {
    const destino = await acharPacienteRecente(para, opts.nomePaciente);
    let mesclado = false;

    if (destino && destino.id !== opts.patientId) {
      const [origemDoc, destinoDoc] = await Promise.all([
        lerDocPaciente(opts.patientId),
        lerDocPaciente(destino.id),
      ]);
      if (!origemDoc?.fields || !destinoDoc?.fields) {
        return {
          ok: false,
          mensagem: "Não encontrei a ficha no Eyenote. Atualize a lista.",
        };
      }

      const writes: unknown[] = [];
      for (const tipo of ["ar", "tonometry"] as const) {
        const valorOrigem = origemDoc.fields.exams?.mapValue?.fields?.[tipo];
        if (
          exameEnviado(origemDoc.fields.exams, tipo) &&
          !exameEnviado(destinoDoc.fields.exams, tipo) &&
          valorOrigem
        ) {
          writes.push({
            update: {
              name: caminhoDocPaciente(destino.id),
              fields: {
                exams: { mapValue: { fields: { [tipo]: valorOrigem } } },
              },
            },
            updateMask: { fieldPaths: [`exams.${tipo}`] },
            currentDocument: { exists: true },
          });
        }
      }
      writes.push({
        update: {
          name: caminhoDocPaciente(opts.patientId),
          fields: { status: { stringValue: "archived" } },
        },
        updateMask: { fieldPaths: ["status"] },
        updateTransforms: [
          { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
        ],
        currentDocument: { exists: true },
      });

      await fetchFirestore(
        `${BASE_FIRESTORE}:commit`,
        { writes },
        "mesclarFicha",
      );
      mesclado = true;
      gravarCacheSessao(para, opts.nomePaciente, destino.id);
    } else {
      await fetchFirestore(
        `${BASE_FIRESTORE}:commit`,
        {
          writes: [
            {
              update: {
                name: caminhoDocPaciente(opts.patientId),
                fields: { documentId: { stringValue: para } },
              },
              updateMask: { fieldPaths: ["documentId"] },
              updateTransforms: [
                { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
              ],
              currentDocument: { exists: true },
            },
          ],
        },
        "trocarMedico",
      );
      gravarCacheSessao(para, opts.nomePaciente, opts.patientId);
    }

    // A ficha não pertence mais ao médico antigo: próximos exames tirados
    // pelo card com o médico antigo devem procurar/criar ficha de novo.
    cachePacienteSessao.delete(chaveCacheSessao(de, opts.nomePaciente));

    return { ok: true, mesclado };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[eyenote] Falha ao trocar médico:", err);
    if (err instanceof ErroRedeEyenote) {
      return {
        ok: false,
        mensagem:
          "A internet está lenta e o Eyenote não respondeu a tempo. " +
          "Aguarde alguns segundos e tente de novo.",
      };
    }
    const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
    return { ok: false, mensagem };
  }
}
