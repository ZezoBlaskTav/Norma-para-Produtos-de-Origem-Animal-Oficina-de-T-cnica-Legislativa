import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  NormaDocument,
  NormaRevision,
} from '../types/norma';

const DB_NAME = 'norma_oficina_local_db';
const DB_VERSION = 1;
const STORE_WORKSPACE = 'workspace';
const STORE_SNAPSHOTS = 'snapshots';
const RECOVERY_FALLBACK_KEY = 'norma_studio_recovery_v1';
const REVISIONS_STORAGE_PREFIX = 'norma_revisions_v1_';
const MAX_LOCAL_SNAPSHOTS = 15;
const MAX_LOCAL_REVISIONS = 40;

export interface LocalWorkspaceState {
  doc: NormaDocument;
  altMeta: AlteracaoMetadata;
  alteracoes: AlteracaoDispositivo[];
  auditText: string;
  updatedAt: string;
}

export interface LocalRecoveryPoint {
  id: string;
  savedAt: string;
  signature: string;
  label: string;
  subLabel: string;
  doc: NormaDocument;
  altMeta: AlteracaoMetadata;
  alteracoes: AlteracaoDispositivo[];
  auditText: string;
}

export function computeWorkspaceSignature(
  doc: NormaDocument,
  altMeta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): string {
  const payload = JSON.stringify({
    doc: { ...doc, imagens: doc.imagens || [], updatedAt: '' },
    altMeta,
    alteracoes,
  });

  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function computeNormaSignature(doc: NormaDocument): string {
  const compactImages = (doc.imagens || []).map((img) => ({
    ...img,
    dataUrl: img.dataUrl ? `len:${img.dataUrl.length}` : '',
  }));
  const payload = JSON.stringify({
    ...doc,
    imagens: compactImages,
    updatedAt: '',
  });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function openLocalDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_WORKSPACE)) {
          db.createObjectStore(STORE_WORKSPACE);
        }
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveWorkspaceToIndexedDB(
  state: LocalWorkspaceState
): Promise<void> {
  const db = await openLocalDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_WORKSPACE, 'readwrite');
      tx.objectStore(STORE_WORKSPACE).put(state, 'current');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadWorkspaceFromIndexedDB(): Promise<LocalWorkspaceState | null> {
  const db = await openLocalDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_WORKSPACE, 'readonly');
      const req = tx.objectStore(STORE_WORKSPACE).get('current');
      req.onsuccess = () => {
        db.close();
        resolve((req.result as LocalWorkspaceState | undefined) || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

function readFallbackSnapshots(): LocalRecoveryPoint[] {
  try {
    const raw = localStorage.getItem(RECOVERY_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalRecoveryPoint[]) : [];
  } catch {
    return [];
  }
}

function writeFallbackSnapshots(items: LocalRecoveryPoint[]): void {
  try {
    localStorage.setItem(
      RECOVERY_FALLBACK_KEY,
      JSON.stringify(items.slice(0, MAX_LOCAL_SNAPSHOTS))
    );
  } catch {
    // Ignorar cota excedida
  }
}

export async function listLocalRecoverySnapshots(): Promise<
  LocalRecoveryPoint[]
> {
  const db = await openLocalDb();
  if (!db) {
    return readFallbackSnapshots();
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
      const req = tx.objectStore(STORE_SNAPSHOTS).getAll();
      req.onsuccess = () => {
        db.close();
        const list = Array.isArray(req.result)
          ? (req.result as LocalRecoveryPoint[])
          : [];
        if (list.length === 0) {
          resolve(readFallbackSnapshots());
          return;
        }
        resolve(
          list
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
            .slice(0, MAX_LOCAL_SNAPSHOTS)
        );
      };
      req.onerror = () => {
        db.close();
        resolve(readFallbackSnapshots());
      };
    } catch {
      db.close();
      resolve(readFallbackSnapshots());
    }
  });
}

export async function pushLocalRecoverySnapshot(
  point: Omit<LocalRecoveryPoint, 'id'>
): Promise<LocalRecoveryPoint[]> {
  const existing = await listLocalRecoverySnapshots();
  if (existing.length > 0 && existing[0].signature === point.signature) {
    return existing;
  }

  const nextPoint: LocalRecoveryPoint = {
    ...point,
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };

  const merged = [nextPoint, ...existing].slice(0, MAX_LOCAL_SNAPSHOTS);
  writeFallbackSnapshots(merged);

  const db = await openLocalDb();
  if (!db) {
    return merged;
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
      const store = tx.objectStore(STORE_SNAPSHOTS);
      store.clear();
      for (const item of merged) {
        store.put(item);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });

  return merged;
}

function getRevisionsStorageKey(normaId: string): string {
  const clean = (normaId || 'minuta_principal').replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `${REVISIONS_STORAGE_PREFIX}${clean}`;
}

export function listLocalNormaRevisions(normaId: string): NormaRevision[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getRevisionsStorageKey(normaId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as NormaRevision[]).sort((a, b) => {
      if (b.numeroRevisao !== a.numeroRevisao) {
        return b.numeroRevisao - a.numeroRevisao;
      }
      return b.createdAtIso.localeCompare(a.createdAtIso);
    });
  } catch {
    return [];
  }
}

export function writeLocalNormaRevisions(
  normaId: string,
  revisions: NormaRevision[]
): NormaRevision[] {
  const sorted = [...revisions]
    .sort((a, b) => {
      if (b.numeroRevisao !== a.numeroRevisao) {
        return b.numeroRevisao - a.numeroRevisao;
      }
      return b.createdAtIso.localeCompare(a.createdAtIso);
    })
    .slice(0, MAX_LOCAL_REVISIONS);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        getRevisionsStorageKey(normaId),
        JSON.stringify(sorted)
      );
    } catch {
      // Ignora cota excedida
    }
  }
  return sorted;
}

export function saveLocalNormaRevision(
  revision: NormaRevision
): NormaRevision[] {
  const existing = listLocalNormaRevisions(revision.normaId).filter(
    (r) => r.id !== revision.id
  );
  return writeLocalNormaRevisions(revision.normaId, [revision, ...existing]);
}

export function updateLocalNormaRevisionNote(
  normaId: string,
  revisaoId: string,
  titulo: string,
  observacao: string
): NormaRevision[] {
  const now = new Date().toISOString();
  const next = listLocalNormaRevisions(normaId).map((r) =>
    r.id === revisaoId
      ? {
          ...r,
          titulo: titulo.trim() || r.titulo,
          observacao: observacao.trim(),
          updatedAtIso: now,
        }
      : r
  );
  return writeLocalNormaRevisions(normaId, next);
}

export function deleteLocalNormaRevision(
  normaId: string,
  revisaoId: string
): NormaRevision[] {
  const next = listLocalNormaRevisions(normaId).filter(
    (r) => r.id !== revisaoId
  );
  return writeLocalNormaRevisions(normaId, next);
}

const EDITOR_MARKS_STORAGE_PREFIX = 'norma_editor_marks_v1_';

export interface StoredEditorMark {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  start: number;
  end: number;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'dark';
  createdAt: string;
}

function getEditorMarksStorageKey(normaId: string): string {
  const clean = (normaId || 'minuta_principal').replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `${EDITOR_MARKS_STORAGE_PREFIX}${clean}`;
}

export function loadLocalEditorMarks(normaId: string): StoredEditorMark[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getEditorMarksStorageKey(normaId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is StoredEditorMark =>
        Boolean(m) &&
        typeof m.id === 'string' &&
        typeof m.fieldKey === 'string' &&
        typeof m.start === 'number' &&
        typeof m.end === 'number' &&
        typeof m.text === 'string' &&
        m.end > m.start
    );
  } catch {
    return [];
  }
}

export function saveLocalEditorMarks(
  normaId: string,
  marks: StoredEditorMark[]
): void {
  if (typeof window === 'undefined') return;
  try {
    if (marks.length === 0) {
      window.localStorage.removeItem(getEditorMarksStorageKey(normaId));
    } else {
      window.localStorage.setItem(
        getEditorMarksStorageKey(normaId),
        JSON.stringify(marks)
      );
    }
  } catch {
    // Ignora cota excedida
  }
}

export function reconcileMarkOffset(
  fieldText: string,
  mark: StoredEditorMark
): StoredEditorMark | null {
  if (!fieldText || !mark.text) return null;
  if (
    mark.start >= 0 &&
    mark.end <= fieldText.length &&
    fieldText.slice(mark.start, mark.end) === mark.text
  ) {
    return mark;
  }

  let bestIdx = -1;
  let bestDist = Infinity;
  let searchFrom = 0;
  while (searchFrom <= fieldText.length - mark.text.length) {
    const idx = fieldText.indexOf(mark.text, searchFrom);
    if (idx === -1) break;
    const dist = Math.abs(idx - mark.start);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
    searchFrom = idx + 1;
  }

  if (bestIdx === -1) return null;
  return {
    ...mark,
    start: bestIdx,
    end: bestIdx + mark.text.length,
  };
}

