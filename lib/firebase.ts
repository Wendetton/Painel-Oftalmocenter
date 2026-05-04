/**
 * Inicialização do Firebase Admin SDK (server-side).
 *
 * Usado para gravar eventos de transição de estágio no Firestore. NUNCA
 * importar do código que roda no navegador — o Admin SDK contém credenciais
 * e capacidade de bypass de regras.
 *
 * Configuração:
 * - Variável de ambiente `FIREBASE_SERVICE_ACCOUNT` deve conter o JSON
 *   completo da conta de serviço gerada no Firebase Console
 *   (Project Settings → Service Accounts → Generate new private key).
 *
 * Comportamento se a credencial não existir ou estiver inválida:
 * - `obterFirestore()` devolve null.
 * - O painel continua funcionando normalmente — apenas não grava eventos.
 * - O endpoint /api/diagnostico mostra o motivo exato.
 *
 * Uso típico:
 *   const fs = obterFirestore();
 *   if (fs) await fs.collection("...").add({...});
 */

import { type App, cert, getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";

let appCached: App | null = null;
let firestoreCached: Firestore | null = null;
let ultimoErroInit: string | null = null;

interface CredenciaisFirebase {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function lerCredenciais(): CredenciaisFirebase | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || raw.trim() === "") return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    const project_id = obj.project_id;
    const client_email = obj.client_email;
    const private_key = obj.private_key;

    if (
      typeof project_id !== "string" ||
      typeof client_email !== "string" ||
      typeof private_key !== "string"
    ) {
      return null;
    }

    return {
      projectId: project_id,
      clientEmail: client_email,
      // Tolera quem escapou os \n manualmente ao colar no Vercel.
      privateKey: private_key.includes("\\n")
        ? private_key.replace(/\\n/g, "\n")
        : private_key,
    };
  } catch {
    return null;
  }
}

/**
 * Devolve uma instância do Firestore pronta para uso, ou null se a
 * configuração não estiver disponível. Cacheia a primeira instância
 * bem-sucedida para evitar reconexão a cada chamada.
 */
export function obterFirestore(): Firestore | null {
  if (firestoreCached) return firestoreCached;

  const creds = lerCredenciais();
  if (!creds) {
    ultimoErroInit =
      "Variável FIREBASE_SERVICE_ACCOUNT ausente ou JSON inválido";
    return null;
  }

  try {
    const apps = getApps();
    if (apps.length > 0) {
      const primeiroApp = apps[0];
      if (primeiroApp) appCached = primeiroApp;
    }
    if (!appCached) {
      appCached = initializeApp({
        credential: cert({
          projectId: creds.projectId,
          clientEmail: creds.clientEmail,
          privateKey: creds.privateKey,
        }),
      });
    }
    firestoreCached = getFirestore(appCached);
    ultimoErroInit = null;
    return firestoreCached;
  } catch (err) {
    ultimoErroInit = err instanceof Error ? err.message : "Erro desconhecido";
    return null;
  }
}

/**
 * Status legível do Firebase para a página /api/diagnostico.
 * Não expõe credenciais — só diz se a configuração existe e se o init OK.
 */
export function statusFirebase(): {
  configurado: boolean;
  inicializado: boolean;
  erro: string | null;
  projectId: string | null;
} {
  const configurado = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (firestoreCached && appCached) {
    return {
      configurado: true,
      inicializado: true,
      erro: null,
      projectId: appCached.options.projectId ?? null,
    };
  }
  if (!configurado) {
    return {
      configurado: false,
      inicializado: false,
      erro: "FIREBASE_SERVICE_ACCOUNT não configurada",
      projectId: null,
    };
  }
  return {
    configurado: true,
    inicializado: false,
    erro: ultimoErroInit ?? "Não inicializado ainda",
    projectId: null,
  };
}
