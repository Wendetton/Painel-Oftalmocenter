"use client";

/**
 * Cliente Firebase do Eyenote (projeto eyenotev2).
 *
 * O Eyenote tem seu próprio Firebase, SEPARADO do nosso (painel-oftalmocenter).
 * Para gravar exames lá, inicializamos uma segunda instância nomeada do
 * Firebase Web SDK — não conflita com o nosso firebase-admin server-side.
 *
 * Fluxo do enviarExame(opts):
 *   1. Autenticação anônima (igual ao /legacy original).
 *   2. Procura paciente já criado nas últimas 6h pelo MESMO médico com
 *      o MESMO nome — se achar, reutiliza (caso AR e Tono cheguem em
 *      momentos separados, ficam no mesmo doc).
 *   3. Senão, cria doc novo na coleção `patients` com:
 *        name, documentId, status: "active", createdAt, exams.
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
  collection,
  doc,
  getDocsFromServer,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
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

export type TipoExameEyenote = "ar" | "tonometry";

export const ROTULOS_EXAMES_EYENOTE: Record<TipoExameEyenote, string> = {
  ar: "AR",
  tonometry: "Tono",
};

interface ContextoEyenote {
  app: FirebaseApp;
  db: Firestore;
  storage: FirebaseStorage;
  auth: Auth;
}

function obterContexto(): ContextoEyenote {
  const existente = getApps().find((a) => a.name === NOME_APP);
  const app =
    existente ?? initializeApp(firebaseConfigEyenote, NOME_APP);
  return {
    app,
    db: getFirestore(app),
    storage: getStorage(app),
    auth: getAuth(app),
  };
}

async function garantirAutenticado(): Promise<void> {
  const { auth } = obterContexto();
  if (auth.currentUser) return;
  await signInAnonymously(auth);
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

async function acharPacienteRecente(
  medicoCodigo: string,
  nomePaciente: string,
): Promise<PacienteEyenoteResumo | null> {
  const { db } = obterContexto();

  // Query simples por documentId — evita exigir índice composto.
  // Filtramos `name` + `status active` + `createdAt nas últimas 6h` no cliente.
  // `getDocsFromServer` força ida à rede e evita servir cache local stale
  // (era o caminho mais provável de gerar duplicata pós-criação).
  const q = query(
    collection(db, "patients"),
    where("documentId", "==", medicoCodigo),
    limit(100),
  );
  const snap = await getDocsFromServer(q);

  const limiteMs = Date.now() - JANELA_REUSO_PACIENTE_MS;
  let melhor: PacienteEyenoteResumo | null = null;

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.status !== "active") continue;
    if (typeof data.name !== "string") continue;
    if (data.name.trim().toLowerCase() !== nomePaciente.trim().toLowerCase()) {
      continue;
    }
    const createdAt = data.createdAt;
    const ms =
      createdAt instanceof Timestamp
        ? createdAt.toMillis()
        : typeof createdAt === "object" &&
            createdAt !== null &&
            "seconds" in createdAt
          ? (createdAt as { seconds: number }).seconds * 1000
          : null;

    // serverTimestamp() pendente pode chegar como null no read-back
    // imediatamente após o setDoc — antes a gente descartava, agora
    // tratamos como "acabou de ser criado" e seguimos comparando.
    const msEfetivo = ms ?? Date.now();
    if (msEfetivo < limiteMs) continue;

    if (!melhor || msEfetivo > (melhor.createdAtMs ?? 0)) {
      melhor = {
        id: d.id,
        name: data.name,
        documentId: String(data.documentId ?? ""),
        createdAtMs: msEfetivo,
      };
    }
  }

  return melhor;
}

async function criarPacienteNovo(
  medicoCodigo: string,
  nomePaciente: string,
): Promise<string> {
  const { db } = obterContexto();
  const ref = doc(collection(db, "patients"));
  await setDoc(ref, {
    name: nomePaciente,
    documentId: medicoCodigo,
    status: "active",
    createdAt: serverTimestamp(),
    exams: {
      ar: { uploaded: false },
      tonometry: { uploaded: false },
    },
  });
  return ref.id;
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
    await garantirAutenticado();
    const { db, storage } = obterContexto();

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
      // 2ª linha: query no servidor (já força rede, ignora cache local).
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

    // Upload da imagem.
    const ext = extensaoDe(opts.arquivo);
    const path = `exams/${patientId}/${opts.tipoExame}_${Date.now()}.${ext}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, opts.arquivo, {
      contentType: opts.arquivo.type || "image/jpeg",
    });
    const url = await getDownloadURL(ref);

    // Atualiza o doc do paciente marcando o exame.
    const patientRef = doc(db, "patients", patientId);
    await updateDoc(patientRef, {
      [`exams.${opts.tipoExame}`]: {
        uploaded: true,
        url,
        uploadedAt: new Date().toISOString(),
        uploadedBy: "painel-oftalmocenter",
      },
    });

    return { ok: true, patientId, reusado };
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
    // eslint-disable-next-line no-console
    console.error("[eyenote] Falha ao enviar exame:", err);
    return { ok: false, mensagem };
  }
}
