import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  NormaDocument,
  NormaImagemAlinhamento,
  NormaImagemItem,
  NormaImagemPosicao,
  NormaRevision,
  NormaRevisionOrigin,
  NormaTipo,
  VigenciaTipo,
} from '../types/norma';
import { auth, db } from './googleAuth';

export const ADMIN_EMAIL = 'joseluisblaskowskitavares@gmail.com';

const EMAIL_KEY_REGEX = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isFirestoreQuotaError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error ?? '');
  return (
    raw.includes('resource-exhausted') ||
    raw.includes('Quota limit exceeded') ||
    raw.includes('Quota exceeded') ||
    raw.includes('Free daily write units') ||
    raw.includes('Free daily read units')
  );
}

export function formatCloudSyncErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (isFirestoreQuotaError(error)) {
    return 'Cota diária gratuita de gravações na nuvem (Firestore) atingida hoje. Suas edições continuam sendo salvas localmente neste navegador e a nuvem será liberada automaticamente amanhã.';
  }
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { error?: string };
      if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error;
      }
    } catch {
      // Mensagem já legível
    }
    return error.message || fallback;
  }
  return fallback;
}

export type EsferaPreferida = 'Municipal' | 'Estadual' | 'Federal' | 'Distrital';
export type UserRole = 'user' | 'admin';
export type UserAccessStatus = 'pendente' | 'aprovado' | 'bloqueado';

export interface UserProfileData {
  uid: string;
  nomeCompleto: string;
  email: string;
  orgao: string;
  cargo: string;
  esferaPreferida: EsferaPreferida;
  role: UserRole;
  status: UserAccessStatus;
  observacaoAcesso: string;
  needsAdminRepair?: boolean;
  createdAtIso?: string;
  updatedAtIso?: string;
}

export interface AllowlistEntry {
  emailKey: string;
  email: string;
  orgaoSugerido: string;
  observacao: string;
  addedByUid: string;
  createdAtIso?: string;
}

export interface CloudNormaItem {
  id: string;
  titulo: string;
  updatedAtIso: string;
  doc: NormaDocument;
}

export interface CloudAlteracaoItem {
  id: string;
  titulo: string;
  updatedAtIso: string;
  meta: AlteracaoMetadata;
  dispositivos: AlteracaoDispositivo[];
}

export function sanitizeFirestoreId(raw: string, fallbackPrefix = 'doc'): string {
  const cleaned = (raw || '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
  return cleaned.length > 0
    ? cleaned
    : `${fallbackPrefix}_${Date.now()}`;
}

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase().slice(0, 180);
}

export function isValidEmailKeyFormat(emailKey: string): boolean {
  return (
    emailKey.length >= 3 &&
    emailKey.length <= 180 &&
    EMAIL_KEY_REGEX.test(emailKey)
  );
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function clampString(val: unknown, max: number): string {
  return typeof val === 'string' ? val.slice(0, max) : '';
}

function toIsoFromTimestamp(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (val && typeof val === 'object' && 'toDate' in val) {
    try {
      return (val as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return '';
    }
  }
  return typeof val === 'string' ? val : '';
}

const VALID_NORM_TYPES: NormaTipo[] = [
  'Decreto',
  'Portaria',
  'Instrução Normativa',
  'Resolução',
  'Norma Interna',
];

const VALID_VIGENCIA: VigenciaTipo[] = ['imediata', 'dias', 'data_certa'];
const VALID_ROLES: UserRole[] = ['user', 'admin'];
const VALID_STATUSES: UserAccessStatus[] = ['pendente', 'aprovado', 'bloqueado'];
const VALID_IMAGE_POS: NormaImagemPosicao[] = ['cabecalho', 'pos_artigo', 'anexo'];
const VALID_IMAGE_ALIGN: NormaImagemAlinhamento[] = ['left', 'center', 'right'];

function sanitizeNormaImagens(raw: unknown): NormaImagemItem[] {
  if (!Array.isArray(raw)) return [];
  const result: NormaImagemItem[] = [];
  for (const item of raw.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const dataUrl = typeof obj.dataUrl === 'string' ? obj.dataUrl : '';
    if (
      !dataUrl.startsWith('data:image/png;base64,') &&
      !dataUrl.startsWith('data:image/jpeg;base64,')
    ) {
      continue;
    }
    if (dataUrl.length > 260_000) continue;
    const mimeType =
      obj.mimeType === 'image/jpeg' || dataUrl.startsWith('data:image/jpeg')
        ? 'image/jpeg'
        : 'image/png';
    const posicao: NormaImagemPosicao = VALID_IMAGE_POS.includes(
      obj.posicao as NormaImagemPosicao
    )
      ? (obj.posicao as NormaImagemPosicao)
      : 'anexo';
    const alinhamento: NormaImagemAlinhamento = VALID_IMAGE_ALIGN.includes(
      obj.alinhamento as NormaImagemAlinhamento
    )
      ? (obj.alinhamento as NormaImagemAlinhamento)
      : 'center';
    const artigoId =
      posicao === 'pos_artigo' && typeof obj.artigoId === 'string' && obj.artigoId
        ? clampString(obj.artigoId, 80)
        : undefined;
    const cleaned: NormaImagemItem = {
      id: clampString(obj.id, 80) || `img_${result.length + 1}`,
      titulo: clampString(obj.titulo, 240),
      legenda: clampString(obj.legenda, 400),
      dataUrl,
      mimeType,
      widthPx: Math.max(1, Math.min(2400, Number(obj.widthPx) || 400)),
      heightPx: Math.max(1, Math.min(2400, Number(obj.heightPx) || 300)),
      larguraMm: Math.max(20, Math.min(160, Number(obj.larguraMm) || 55)),
      alinhamento,
      posicao,
      ...(artigoId ? { artigoId } : {}),
    };
    result.push(cleaned);
  }
  return result;
}

function parseUserProfileDoc(
  uid: string,
  d: Record<string, unknown>
): UserProfileData {
  const email = clampString(d.email, 180);
  const isMainAdmin = email.trim().toLowerCase() === ADMIN_EMAIL;

  const rawRole = typeof d.role === 'string' ? d.role : '';
  const role: UserRole = VALID_ROLES.includes(rawRole as UserRole)
    ? (rawRole as UserRole)
    : isMainAdmin
      ? 'admin'
      : 'user';

  const rawStatus = typeof d.status === 'string' ? d.status : '';
  const status: UserAccessStatus = VALID_STATUSES.includes(
    rawStatus as UserAccessStatus
  )
    ? (rawStatus as UserAccessStatus)
    : isMainAdmin
      ? 'aprovado'
      : 'pendente';

  const hasObservacaoField = typeof d.observacaoAcesso === 'string';
  const needsAdminRepair = Boolean(
    isMainAdmin &&
      (d.role !== 'admin' || d.status !== 'aprovado' || !hasObservacaoField)
  );

  return {
    uid: clampString(d.uid, 128) || uid,
    nomeCompleto: clampString(d.nomeCompleto, 120),
    email,
    orgao: clampString(d.orgao, 160),
    cargo: clampString(d.cargo, 120),
    esferaPreferida: (['Municipal', 'Estadual', 'Federal', 'Distrital'].includes(
      String(d.esferaPreferida)
    )
      ? d.esferaPreferida
      : 'Municipal') as EsferaPreferida,
    role,
    status,
    observacaoAcesso: clampString(d.observacaoAcesso, 300),
    needsAdminRepair,
    createdAtIso: toIsoFromTimestamp(d.createdAt),
    updatedAtIso: toIsoFromTimestamp(d.updatedAt),
  };
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfileData | null) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(parseUserProfileDoc(uid, snap.data() as Record<string, unknown>));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function saveUserProfile(
  uid: string,
  input: {
    nomeCompleto: string;
    email: string;
    orgao: string;
    cargo: string;
    esferaPreferida: EsferaPreferida;
  },
  isNew: boolean
): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const nome = clampString(input.nomeCompleto.trim(), 120);
  const email = clampString(input.email.trim(), 180);

  if (nome.length < 2) {
    throw new Error('Informe seu nome completo (mínimo de 2 caracteres).');
  }
  if (email.length < 3) {
    throw new Error('Informe um e-mail válido para concluir o cadastro.');
  }

  if (isNew) {
    const emailKey = normalizeEmailKey(email);
    const isBootstrappedAdmin = emailKey === ADMIN_EMAIL;
    let isPreAuthorized = false;

    if (!isBootstrappedAdmin && isValidEmailKeyFormat(emailKey)) {
      const allowPath = `allowlist/${emailKey}`;
      try {
        const allowSnap = await getDoc(doc(db, 'allowlist', emailKey));
        isPreAuthorized = allowSnap.exists();
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, allowPath);
      }
    }

    const role: UserRole = isBootstrappedAdmin ? 'admin' : 'user';
    const status: UserAccessStatus =
      isBootstrappedAdmin || isPreAuthorized ? 'aprovado' : 'pendente';

    try {
      await setDoc(ref, {
        uid,
        nomeCompleto: nome,
        email,
        orgao: clampString(input.orgao.trim(), 160),
        cargo: clampString(input.cargo.trim(), 120),
        esferaPreferida: input.esferaPreferida,
        role,
        status,
        observacaoAcesso: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  try {
    await updateDoc(ref, {
      nomeCompleto: nome,
      email,
      orgao: clampString(input.orgao.trim(), 160),
      cargo: clampString(input.cargo.trim(), 120),
      esferaPreferida: input.esferaPreferida,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminRepairOwnProfile(uid: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      role: 'admin',
      status: 'aprovado',
      observacaoAcesso: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeAllUsers(
  onData: (users: UserProfileData[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'users';
  const q = query(collection(db, path));

  const statusOrder: Record<UserAccessStatus, number> = {
    pendente: 0,
    aprovado: 1,
    bloqueado: 2,
  };

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((snap) =>
        parseUserProfileDoc(snap.id, snap.data() as Record<string, unknown>)
      );
      list.sort((a, b) => {
        const diff = statusOrder[a.status] - statusOrder[b.status];
        if (diff !== 0) return diff;
        return (b.updatedAtIso || '').localeCompare(a.updatedAtIso || '');
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function updateUserAccess(
  targetUid: string,
  payload: {
    status: UserAccessStatus;
    role?: UserRole;
    observacaoAcesso: string;
  }
): Promise<void> {
  const path = `users/${targetUid}`;
  const updateBody: Record<string, unknown> = {
    status: payload.status,
    observacaoAcesso: clampString(payload.observacaoAcesso.trim(), 300),
    updatedAt: serverTimestamp(),
  };
  if (payload.role) {
    updateBody.role = payload.role;
  }

  try {
    await updateDoc(doc(db, 'users', targetUid), updateBody);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeAllowlist(
  onData: (entries: AllowlistEntry[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'allowlist';
  const q = query(collection(db, path));

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: AllowlistEntry[] = snapshot.docs.map((snap) => {
        const d = snap.data() as Record<string, unknown>;
        return {
          emailKey: snap.id,
          email: clampString(d.email, 180) || snap.id,
          orgaoSugerido: clampString(d.orgaoSugerido, 160),
          observacao: clampString(d.observacao, 240),
          addedByUid: clampString(d.addedByUid, 128),
          createdAtIso: toIsoFromTimestamp(d.createdAt),
        };
      });
      entries.sort((a, b) => a.email.localeCompare(b.email));
      onData(entries);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function addAllowlistEmail(input: {
  email: string;
  orgaoSugerido: string;
  observacao: string;
  addedByUid: string;
}): Promise<void> {
  const emailKey = normalizeEmailKey(input.email);
  if (!isValidEmailKeyFormat(emailKey)) {
    throw new Error(
      'Informe um e-mail institucional válido (ex.: servidor@orgao.gov.br).'
    );
  }

  const path = `allowlist/${emailKey}`;
  try {
    await setDoc(doc(db, 'allowlist', emailKey), {
      email: emailKey,
      orgaoSugerido: clampString(input.orgaoSugerido.trim(), 160),
      observacao: clampString(input.observacao.trim(), 240),
      addedByUid: clampString(input.addedByUid, 128),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeAllowlistEmail(emailKey: string): Promise<void> {
  const normalized = normalizeEmailKey(emailKey);
  const path = `allowlist/${normalized}`;
  try {
    await deleteDoc(doc(db, 'allowlist', normalized));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserNormas(
  uid: string,
  onData: (items: CloudNormaItem[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${uid}/normas`;
  const q = query(collection(db, path), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: CloudNormaItem[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        const updatedAtIso = toIsoFromTimestamp(d.updatedAt);
        const tipo = VALID_NORM_TYPES.includes(d.tipo) ? d.tipo : 'Decreto';
        const vigenciaTipo = VALID_VIGENCIA.includes(d.vigenciaTipo)
          ? d.vigenciaTipo
          : 'imediata';

        const normaDoc: NormaDocument = {
          id: snap.id,
          tipo,
          numero: clampString(d.numero, 40),
          data: clampString(d.data, 80),
          esfera: clampString(d.esfera, 80),
          autoridade: clampString(d.autoridade, 180),
          fundamentoLegal: clampString(d.fundamentoLegal, 4000),
          ementa: clampString(d.ementa, 2000),
          ordemExecucao: clampString(d.ordemExecucao, 120),
          artigos: Array.isArray(d.artigos) ? d.artigos : [],
          vigenciaTipo,
          vigenciaDias: typeof d.vigenciaDias === 'number' ? d.vigenciaDias : 0,
          vigenciaData: clampString(d.vigenciaData, 80),
          revogacoes: Array.isArray(d.revogacoes) ? d.revogacoes : [],
          localAssinatura: clampString(d.localAssinatura, 160),
          assinante: clampString(d.assinante, 120),
          cargoAssinante: clampString(d.cargoAssinante, 120),
          imagens: sanitizeNormaImagens(d.imagens),
          observacoes: clampString(d.observacoes, 4000),
          updatedAt: updatedAtIso || new Date().toISOString(),
        };

        return {
          id: snap.id,
          titulo:
            clampString(d.titulo, 180) ||
            `${normaDoc.tipo} nº ${normaDoc.numero || '___'}`,
          updatedAtIso,
          doc: normaDoc,
        };
      });

      items.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function upsertCloudNorma(
  uid: string,
  normaId: string,
  normaDoc: NormaDocument,
  existsInCloud: boolean
): Promise<string> {
  const safeId = sanitizeFirestoreId(normaId, 'norma');
  const path = `users/${uid}/normas/${safeId}`;
  const ref = doc(db, 'users', uid, 'normas', safeId);

  const tipo: NormaTipo = VALID_NORM_TYPES.includes(normaDoc.tipo)
    ? normaDoc.tipo
    : 'Decreto';
  const vigenciaTipo: VigenciaTipo = VALID_VIGENCIA.includes(
    normaDoc.vigenciaTipo
  )
    ? normaDoc.vigenciaTipo
    : 'imediata';

  const titulo = clampString(
    `${tipo} nº ${normaDoc.numero || '___'}${
      normaDoc.ementa ? ` — ${normaDoc.ementa}` : ''
    }`,
    180
  );

  const safeArtigos = stripUndefined(
    Array.isArray(normaDoc.artigos)
      ? normaDoc.artigos
          .filter((a) => Boolean(a && typeof a === 'object' && !Array.isArray(a)))
          .slice(0, 200)
      : []
  );
  const safeRevogacoes = (
    Array.isArray(normaDoc.revogacoes) ? normaDoc.revogacoes.slice(0, 100) : []
  ).map((r) => String(r));

  const safeImagens = stripUndefined(sanitizeNormaImagens(normaDoc.imagens));

  const sharedFields = {
    titulo: titulo || 'Minuta Legislativa',
    tipo,
    numero: clampString(normaDoc.numero, 40),
    data: clampString(normaDoc.data, 80),
    esfera: clampString(normaDoc.esfera, 80),
    autoridade: clampString(normaDoc.autoridade, 180),
    fundamentoLegal: clampString(normaDoc.fundamentoLegal, 4000),
    ementa: clampString(normaDoc.ementa, 2000),
    ordemExecucao: clampString(normaDoc.ordemExecucao, 120),
    artigos: safeArtigos,
    vigenciaTipo,
    vigenciaDias: Math.min(
      36500,
      Math.max(0, Number(normaDoc.vigenciaDias) || 0)
    ),
    vigenciaData: clampString(normaDoc.vigenciaData, 80),
    revogacoes: safeRevogacoes,
    localAssinatura: clampString(normaDoc.localAssinatura, 160),
    assinante: clampString(normaDoc.assinante, 120),
    cargoAssinante: clampString(normaDoc.cargoAssinante, 120),
    imagens: safeImagens,
    observacoes: clampString(normaDoc.observacoes || '', 4000),
    updatedAt: serverTimestamp(),
  };

  let shouldUpdate = existsInCloud;
  if (!shouldUpdate) {
    try {
      const snap = await getDoc(ref);
      shouldUpdate = snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  try {
    if (shouldUpdate) {
      await updateDoc(ref, sharedFields);
    } else {
      await setDoc(ref, {
        ownerId: uid,
        ...sharedFields,
        createdAt: serverTimestamp(),
      });
    }
    return safeId;
  } catch (error) {
    handleFirestoreError(
      error,
      shouldUpdate ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export async function deleteCloudNorma(
  uid: string,
  normaId: string
): Promise<void> {
  const safeId = sanitizeFirestoreId(normaId, 'norma');
  const path = `users/${uid}/normas/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'normas', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserAlteracoes(
  uid: string,
  onData: (items: CloudAlteracaoItem[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${uid}/alteracoes`;
  const q = query(collection(db, path), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: CloudAlteracaoItem[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        const updatedAtIso = toIsoFromTimestamp(d.updatedAt);
        const meta = (d.meta || {}) as AlteracaoMetadata;
        const dispositivos = Array.isArray(d.dispositivos)
          ? (d.dispositivos as AlteracaoDispositivo[])
          : [];
        return {
          id: snap.id,
          titulo:
            clampString(d.titulo, 180) ||
            `${meta.atoAlteradorTipo || 'Decreto'} nº ${
              meta.atoAlteradorNumero || '___'
            } (Alterador)`,
          updatedAtIso,
          meta,
          dispositivos,
        };
      });

      items.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function upsertCloudAlteracao(
  uid: string,
  altId: string,
  meta: AlteracaoMetadata,
  dispositivos: AlteracaoDispositivo[],
  existsInCloud: boolean
): Promise<string> {
  const safeId = sanitizeFirestoreId(altId, 'alt');
  const path = `users/${uid}/alteracoes/${safeId}`;
  const ref = doc(db, 'users', uid, 'alteracoes', safeId);

  const titulo = clampString(
    `${meta.atoAlteradorTipo} nº ${meta.atoAlteradorNumero || '___'} — Altera ${
      meta.normaAlvoNome || 'Norma Vigente'
    }`,
    180
  );

  const payload = {
    titulo: titulo || 'Ato Alterador (NR)',
    meta: stripUndefined(meta),
    dispositivos: stripUndefined(
      Array.isArray(dispositivos) ? dispositivos.slice(0, 200) : []
    ),
    updatedAt: serverTimestamp(),
  };

  let shouldUpdate = existsInCloud;
  if (!shouldUpdate) {
    try {
      const snap = await getDoc(ref);
      shouldUpdate = snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  try {
    if (shouldUpdate) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, {
        ownerId: uid,
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
    return safeId;
  } catch (error) {
    handleFirestoreError(
      error,
      shouldUpdate ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export async function deleteCloudAlteracao(
  uid: string,
  altId: string
): Promise<void> {
  const safeId = sanitizeFirestoreId(altId, 'alt');
  const path = `users/${uid}/alteracoes/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'alteracoes', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function sanitizeDocForRevisionSnapshot(
  normaDoc: NormaDocument
): NormaDocument {
  const safeArtigos = stripUndefined(
    Array.isArray(normaDoc.artigos)
      ? normaDoc.artigos
          .filter((a) => Boolean(a && typeof a === 'object' && !Array.isArray(a)))
          .slice(0, 200)
      : []
  );
  const safeImagens: NormaImagemItem[] = (normaDoc.imagens || [])
    .slice(0, 10)
    .map((img) => ({
      id: clampString(img.id, 80),
      titulo: clampString(img.titulo, 240),
      legenda: clampString(img.legenda, 400),
      // Evita ultrapassar o limite de 1 MB por documento no Firestore ao armazenar histórico
      dataUrl: '',
      mimeType: img.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png',
      widthPx: Math.max(1, Math.min(2400, Number(img.widthPx) || 400)),
      heightPx: Math.max(1, Math.min(2400, Number(img.heightPx) || 300)),
      larguraMm: Math.max(20, Math.min(160, Number(img.larguraMm) || 55)),
      alinhamento: VALID_IMAGE_ALIGN.includes(img.alinhamento)
        ? img.alinhamento
        : 'center',
      posicao: VALID_IMAGE_POS.includes(img.posicao) ? img.posicao : 'anexo',
      ...(img.posicao === 'pos_artigo' && img.artigoId
        ? { artigoId: clampString(img.artigoId, 80) }
        : {}),
    }));

  return stripUndefined({
    ...normaDoc,
    tipo: VALID_NORM_TYPES.includes(normaDoc.tipo) ? normaDoc.tipo : 'Decreto',
    numero: clampString(normaDoc.numero, 40),
    data: clampString(normaDoc.data, 80),
    esfera: clampString(normaDoc.esfera, 80),
    autoridade: clampString(normaDoc.autoridade, 180),
    fundamentoLegal: clampString(normaDoc.fundamentoLegal, 4000),
    ementa: clampString(normaDoc.ementa, 2000),
    ordemExecucao: clampString(normaDoc.ordemExecucao, 120),
    artigos: safeArtigos,
    vigenciaTipo: VALID_VIGENCIA.includes(normaDoc.vigenciaTipo)
      ? normaDoc.vigenciaTipo
      : 'imediata',
    vigenciaDias: Math.min(
      36500,
      Math.max(0, Number(normaDoc.vigenciaDias) || 0)
    ),
    vigenciaData: clampString(normaDoc.vigenciaData, 80),
    revogacoes: (Array.isArray(normaDoc.revogacoes)
      ? normaDoc.revogacoes.slice(0, 100)
      : []
    ).map((r) => String(r)),
    localAssinatura: clampString(normaDoc.localAssinatura, 160),
    assinante: clampString(normaDoc.assinante, 120),
    cargoAssinante: clampString(normaDoc.cargoAssinante, 120),
    imagens: safeImagens,
    observacoes: clampString(normaDoc.observacoes || '', 4000),
    updatedAt: normaDoc.updatedAt || new Date().toISOString(),
  });
}

const VALID_ORIGINS: NormaRevisionOrigin[] = [
  'manual',
  'salvamento',
  'restauracao',
];

export function subscribeNormaRevisions(
  uid: string,
  normaId: string,
  onData: (items: NormaRevision[]) => void,
  onError?: (err: Error) => void
): () => void {
  const safeNormaId = sanitizeFirestoreId(normaId, 'norma');
  const path = `users/${uid}/normas/${safeNormaId}/revisoes`;
  const q = query(
    collection(db, path),
    where('ownerId', '==', uid),
    where('normaId', '==', safeNormaId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: NormaRevision[] = snapshot.docs.map((snap) => {
        const d = snap.data() as Record<string, unknown>;
        const rawSnap = (d.docSnapshot || {}) as Record<string, unknown>;
        const tipo = VALID_NORM_TYPES.includes(rawSnap.tipo as NormaTipo)
          ? (rawSnap.tipo as NormaTipo)
          : 'Decreto';
        const vigenciaTipo = VALID_VIGENCIA.includes(
          rawSnap.vigenciaTipo as VigenciaTipo
        )
          ? (rawSnap.vigenciaTipo as VigenciaTipo)
          : 'imediata';

        const createdAtIso =
          toIsoFromTimestamp(d.createdAt) || new Date().toISOString();
        const updatedAtIso = toIsoFromTimestamp(d.updatedAt) || createdAtIso;

        const docSnapshot: NormaDocument = {
          id: clampString(rawSnap.id, 80) || safeNormaId,
          tipo,
          numero: clampString(rawSnap.numero, 40),
          data: clampString(rawSnap.data, 80),
          esfera: clampString(rawSnap.esfera, 80),
          autoridade: clampString(rawSnap.autoridade, 180),
          fundamentoLegal: clampString(rawSnap.fundamentoLegal, 4000),
          ementa: clampString(rawSnap.ementa, 2000),
          ordemExecucao: clampString(rawSnap.ordemExecucao, 120),
          artigos: Array.isArray(rawSnap.artigos) ? rawSnap.artigos : [],
          vigenciaTipo,
          vigenciaDias:
            typeof rawSnap.vigenciaDias === 'number'
              ? rawSnap.vigenciaDias
              : 0,
          vigenciaData: clampString(rawSnap.vigenciaData, 80),
          revogacoes: Array.isArray(rawSnap.revogacoes)
            ? rawSnap.revogacoes
            : [],
          localAssinatura: clampString(rawSnap.localAssinatura, 160),
          assinante: clampString(rawSnap.assinante, 120),
          cargoAssinante: clampString(rawSnap.cargoAssinante, 120),
          imagens: Array.isArray(rawSnap.imagens)
            ? (rawSnap.imagens as NormaImagemItem[])
            : [],
          observacoes: clampString(rawSnap.observacoes, 4000),
          updatedAt: clampString(rawSnap.updatedAt, 60) || createdAtIso,
        };

        const rawOrigem = String(d.origem || 'manual') as NormaRevisionOrigin;
        return {
          id: snap.id,
          normaId: safeNormaId,
          numeroRevisao: Math.max(1, Number(d.numeroRevisao) || 1),
          titulo:
            clampString(d.titulo, 140) ||
            `Revisão #${Math.max(1, Number(d.numeroRevisao) || 1)}`,
          observacao: clampString(d.observacao, 2000),
          autorNome: clampString(d.autorNome, 120),
          autorEmail: clampString(d.autorEmail, 180),
          origem: VALID_ORIGINS.includes(rawOrigem) ? rawOrigem : 'manual',
          signature: clampString(d.signature, 64),
          resumoAlteracoes: clampString(d.resumoAlteracoes, 240),
          docSnapshot,
          createdAtIso,
          updatedAtIso,
        };
      });

      items.sort((a, b) => {
        if (b.numeroRevisao !== a.numeroRevisao) {
          return b.numeroRevisao - a.numeroRevisao;
        }
        return b.createdAtIso.localeCompare(a.createdAtIso);
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function createCloudNormaRevision(
  uid: string,
  normaId: string,
  input: {
    revisaoId: string;
    numeroRevisao: number;
    titulo: string;
    observacao: string;
    autorNome: string;
    autorEmail: string;
    origem: NormaRevisionOrigin;
    signature: string;
    resumoAlteracoes: string;
    docSnapshot: NormaDocument;
  },
  parentNormaDoc: NormaDocument,
  parentExistsInCloud: boolean
): Promise<string> {
  const safeNormaId = sanitizeFirestoreId(normaId, 'norma');
  const safeRevId = sanitizeFirestoreId(input.revisaoId, 'rev');

  // Garante existência do documento pai para cumprir o Master Gate das regras
  if (!parentExistsInCloud) {
    await upsertCloudNorma(uid, safeNormaId, parentNormaDoc, false);
  }

  const path = `users/${uid}/normas/${safeNormaId}/revisoes/${safeRevId}`;
  const ref = doc(db, 'users', uid, 'normas', safeNormaId, 'revisoes', safeRevId);
  const safeNum = Math.min(100000, Math.max(1, Math.floor(input.numeroRevisao)));
  const cleanTitulo =
    clampString(input.titulo.trim(), 140) || `Revisão #${safeNum}`;

  try {
    await setDoc(ref, {
      ownerId: uid,
      normaId: safeNormaId,
      numeroRevisao: safeNum,
      titulo: cleanTitulo,
      observacao: clampString(input.observacao.trim(), 2000),
      autorNome: clampString(input.autorNome.trim(), 120),
      autorEmail: clampString(input.autorEmail.trim(), 180),
      origem: VALID_ORIGINS.includes(input.origem) ? input.origem : 'manual',
      signature: clampString(input.signature, 64),
      resumoAlteracoes: clampString(input.resumoAlteracoes.trim(), 240),
      docSnapshot: sanitizeDocForRevisionSnapshot(input.docSnapshot),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return safeRevId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCloudNormaRevisionNote(
  uid: string,
  normaId: string,
  revisaoId: string,
  titulo: string,
  observacao: string
): Promise<void> {
  const safeNormaId = sanitizeFirestoreId(normaId, 'norma');
  const safeRevId = sanitizeFirestoreId(revisaoId, 'rev');
  const path = `users/${uid}/normas/${safeNormaId}/revisoes/${safeRevId}`;
  const cleanTitulo = clampString(titulo.trim(), 140) || 'Revisão salva';

  try {
    await updateDoc(
      doc(db, 'users', uid, 'normas', safeNormaId, 'revisoes', safeRevId),
      {
        titulo: cleanTitulo,
        observacao: clampString(observacao.trim(), 2000),
        updatedAt: serverTimestamp(),
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCloudNormaRevision(
  uid: string,
  normaId: string,
  revisaoId: string
): Promise<void> {
  const safeNormaId = sanitizeFirestoreId(normaId, 'norma');
  const safeRevId = sanitizeFirestoreId(revisaoId, 'rev');
  const path = `users/${uid}/normas/${safeNormaId}/revisoes/${safeRevId}`;
  try {
    await deleteDoc(
      doc(db, 'users', uid, 'normas', safeNormaId, 'revisoes', safeRevId)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
