import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
];

const metaEnv =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const envApiKey = metaEnv.VITE_FIREBASE_API_KEY;
const envAuthDomain = metaEnv.VITE_FIREBASE_AUTH_DOMAIN;
const envProjectId = metaEnv.VITE_FIREBASE_PROJECT_ID;
const envAppId = metaEnv.VITE_FIREBASE_APP_ID;

const hasEnvFirebaseOverride =
  typeof envApiKey === 'string' &&
  envApiKey.length > 0 &&
  typeof envAuthDomain === 'string' &&
  envAuthDomain.length > 0 &&
  typeof envProjectId === 'string' &&
  envProjectId.length > 0 &&
  typeof envAppId === 'string' &&
  envAppId.length > 0;

export const activeFirebaseConfig = hasEnvFirebaseOverride
  ? {
      ...firebaseConfig,
      apiKey: envApiKey,
      authDomain: envAuthDomain,
      projectId: envProjectId,
      appId: envAppId,
      firestoreDatabaseId:
        metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
        firebaseConfig.firestoreDatabaseId,
      storageBucket:
        metaEnv.VITE_FIREBASE_STORAGE_BUCKET ||
        firebaseConfig.storageBucket,
      messagingSenderId:
        metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID ||
        firebaseConfig.messagingSenderId,
    }
  : firebaseConfig;

export interface AuthErrorInfo {
  code:
    | 'unauthorized-domain'
    | 'popup-blocked'
    | 'popup-closed'
    | 'operation-not-allowed'
    | 'email-already-in-use'
    | 'invalid-credential'
    | 'weak-password'
    | 'invalid-email'
    | 'too-many-requests'
    | 'network'
    | 'unknown';
  message: string;
  hostname?: string;
  projectId: string;
}

export function formatFirebaseAuthError(error: unknown): AuthErrorInfo {
  const errObj = error as { code?: string; message?: string } | null;
  const code = errObj?.code || '';
  const rawMsg = errObj?.message || '';
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '';
  const projectId = activeFirebaseConfig.projectId;

  if (
    code === 'auth/unauthorized-domain' ||
    rawMsg.includes('auth/unauthorized-domain')
  ) {
    return {
      code: 'unauthorized-domain',
      hostname,
      projectId,
      message: `O domínio "${hostname || 'atual'}" não está autorizado no Firebase Authentication do projeto "${projectId}".`,
    };
  }

  if (code === 'auth/operation-not-allowed') {
    return {
      code: 'operation-not-allowed',
      hostname,
      projectId,
      message:
        'O provedor de E-mail/Senha ainda não foi ativado no Firebase Console (Authentication → Sign-in method → Email/Password). Você pode entrar imediatamente usando sua conta Google ou habilitar E-mail/Senha no console.',
    };
  }

  if (code === 'auth/email-already-in-use') {
    return {
      code: 'email-already-in-use',
      hostname,
      projectId,
      message:
        'Este e-mail já possui cadastro. Acesse a aba "Entrar" para fazer login.',
    };
  }

  if (code === 'auth/weak-password') {
    return {
      code: 'weak-password',
      hostname,
      projectId,
      message: 'A senha deve conter pelo menos 6 caracteres.',
    };
  }

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return {
      code: 'invalid-credential',
      hostname,
      projectId,
      message: 'E-mail ou senha incorretos. Verifique os dados informados.',
    };
  }

  if (code === 'auth/invalid-email') {
    return {
      code: 'invalid-email',
      hostname,
      projectId,
      message: 'Informe um endereço de e-mail válido.',
    };
  }

  if (code === 'auth/too-many-requests') {
    return {
      code: 'too-many-requests',
      hostname,
      projectId,
      message:
        'Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar novamente.',
    };
  }

  if (code === 'auth/popup-blocked' || rawMsg.includes('auth/popup-blocked')) {
    return {
      code: 'popup-blocked',
      hostname,
      projectId,
      message:
        'O navegador bloqueou a janela de login do Google. Permita pop-ups para este endereço e tente novamente.',
    };
  }

  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    rawMsg.includes('popup-closed-by-user')
  ) {
    return {
      code: 'popup-closed',
      hostname,
      projectId,
      message:
        'A janela de autenticação do Google foi fechada antes da conclusão.',
    };
  }

  if (code === 'auth/network-request-failed') {
    return {
      code: 'network',
      hostname,
      projectId,
      message:
        'Falha de rede ao conectar com a autenticação do Google. Verifique sua conexão com a internet.',
    };
  }

  return {
    code: 'unknown',
    hostname,
    projectId,
    message:
      rawMsg || 'Não foi possível autenticar com sua conta.',
  };
}

export const app =
  getApps().length > 0 ? getApp() : initializeApp(activeFirebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(
  app,
  activeFirebaseConfig.firestoreDatabaseId
);

async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error(
        'Verifique a configuração do Firebase Firestore: o cliente está offline.'
      );
    }
  }
}

void testFirestoreConnection();

const driveGoogleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => driveGoogleProvider.addScope(scope));

const basicGoogleProvider = new GoogleAuthProvider();

let isSigningIn = false;
// Token de acesso OAuth do Drive mantido exclusivamente em memória (nunca em localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure(user);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure(null);
    }
  });
};

export const googleAppSignIn = async (): Promise<User> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, basicGoogleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken && !cachedAccessToken) {
      // Não assume escopos de Drive sem o fluxo completo de Drive
    }
    return result.user;
  } finally {
    isSigningIn = false;
  }
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, driveGoogleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Não foi possível obter o token de acesso do Google.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const registerWithEmail = async (params: {
  email: string;
  password: string;
  nomeCompleto: string;
}): Promise<User> => {
  const result = await createUserWithEmailAndPassword(
    auth,
    params.email.trim(),
    params.password
  );
  if (params.nomeCompleto.trim()) {
    await updateProfile(result.user, {
      displayName: params.nomeCompleto.trim(),
    });
  }
  await sendEmailVerification(result.user);
  return result.user;
};

export const loginWithEmail = async (
  email: string,
  password: string
): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
};

export const resendVerificationEmail = async (): Promise<void> => {
  if (!auth.currentUser) {
    throw new Error('Nenhum usuário autenticado para reenviar verificação.');
  }
  await sendEmailVerification(auth.currentUser);
};

export const reloadCurrentUser = async (): Promise<User | null> => {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(auth, email.trim());
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const clearAccessToken = (): void => {
  cachedAccessToken = null;
};

export const logout = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};
