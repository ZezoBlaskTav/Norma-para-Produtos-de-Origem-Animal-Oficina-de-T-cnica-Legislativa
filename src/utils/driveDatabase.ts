import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  NormaDocument,
} from '../types/norma';
import { getSuggestedFileBaseName } from './exporters';
import {
  DriveFileItem,
  findOrCreateDriveFolder,
  listDriveFilesInFolder,
  overwriteDriveFile,
  readDriveFileAsText,
  uploadNewDriveFile,
} from './googleDrive';

export const DRIVE_DB_FOLDER_NAME = 'Norma — Banco de Dados Legislativo';
export const DRIVE_DB_FOLDER_ROLE = 'norma_database_root';

export type DatabaseRecordKind = 'pacote' | 'norma' | 'alteracao';

export interface NormaDatabaseRecord {
  schemaVersion: 1;
  recordId: string;
  kind: DatabaseRecordKind;
  titulo: string;
  resumo: string;
  savedAt: string;
  savedByEmail?: string;
  doc?: NormaDocument;
  altMeta?: AlteracaoMetadata;
  alteracoes?: AlteracaoDispositivo[];
  auditText?: string;
}

export interface DriveDbEntry {
  file: DriveFileItem;
  kind: DatabaseRecordKind;
  recordId: string;
  titulo: string;
  resumo: string;
  updatedAt: string;
}

export interface ActiveDriveDbLink {
  fileId: string;
  fileName: string;
  recordId: string;
  kind: DatabaseRecordKind;
  titulo: string;
  savedAt: string;
}

function truncateUtf8(input: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let result = '';
  let bytes = 0;
  for (const ch of input) {
    const len = encoder.encode(ch).length;
    if (bytes + len > maxBytes) break;
    result += ch;
    bytes += len;
  }
  return result;
}

function buildAppProperties(record: NormaDatabaseRecord): Record<string, string> {
  return {
    normaDbKind: record.kind,
    normaRecordId: truncateUtf8(record.recordId, 80),
    normaTitle: truncateUtf8(record.titulo, 90),
    normaSavedAt: truncateUtf8(record.savedAt, 40),
  };
}

function parseEntryFromFile(file: DriveFileItem): DriveDbEntry {
  const props = file.appProperties || {};
  const rawKind = props.normaDbKind;
  const kind: DatabaseRecordKind =
    rawKind === 'norma' || rawKind === 'alteracao' || rawKind === 'pacote'
      ? rawKind
      : 'norma';

  const cleanFileName = file.name
    .replace(/\.norma-db\.json$/i, '')
    .replace(/\.norma\.json$/i, '');

  return {
    file,
    kind,
    recordId: props.normaRecordId || file.id,
    titulo: props.normaTitle || cleanFileName,
    resumo: file.description || '',
    updatedAt: props.normaSavedAt || file.modifiedTime || '',
  };
}

export async function ensureDriveDatabaseFolder(
  accessToken: string
): Promise<DriveFileItem> {
  return findOrCreateDriveFolder(
    accessToken,
    DRIVE_DB_FOLDER_NAME,
    DRIVE_DB_FOLDER_ROLE
  );
}

export async function listDriveDatabaseEntries(accessToken: string): Promise<{
  folder: DriveFileItem;
  entries: DriveDbEntry[];
}> {
  const folder = await ensureDriveDatabaseFolder(accessToken);
  const files = await listDriveFilesInFolder(accessToken, folder.id);
  const dbFiles = files.filter(
    (f) =>
      f.name.endsWith('.norma-db.json') ||
      f.name.endsWith('.norma.json') ||
      Boolean(f.appProperties?.normaDbKind)
  );
  return {
    folder,
    entries: dbFiles.map(parseEntryFromFile),
  };
}

export function buildDatabaseFileName(
  titulo: string,
  isSnapshot = false
): string {
  const base = getSuggestedFileBaseName(titulo || 'registro-norma');
  if (!isSnapshot) {
    return `${base}.norma-db.json`;
  }
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}_${String(
    now.getHours()
  ).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
  return `${base}-backup-${stamp}.norma-db.json`;
}

export async function createDriveDatabaseRecord(
  accessToken: string,
  folderId: string,
  record: NormaDatabaseRecord,
  options?: { isSnapshot?: boolean }
): Promise<DriveFileItem> {
  const fileName = buildDatabaseFileName(record.titulo, options?.isSnapshot);
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: 'application/json',
  });

  return uploadNewDriveFile(accessToken, {
    name: fileName,
    blob,
    uploadMimeType: 'application/json',
    parents: [folderId],
    description: truncateUtf8(record.resumo, 220),
    appProperties: buildAppProperties(record),
  });
}

export async function updateDriveDatabaseRecord(
  accessToken: string,
  fileId: string,
  record: NormaDatabaseRecord,
  fileName?: string
): Promise<DriveFileItem> {
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: 'application/json',
  });

  return overwriteDriveFile(accessToken, fileId, {
    name: fileName,
    blob,
    uploadMimeType: 'application/json',
    description: truncateUtf8(record.resumo, 220),
    appProperties: buildAppProperties(record),
  });
}

export async function readDriveDatabaseRecord(
  accessToken: string,
  file: DriveFileItem
): Promise<NormaDatabaseRecord> {
  const raw = await readDriveFileAsText(accessToken, file);
  const parsed = JSON.parse(raw) as Partial<NormaDatabaseRecord> &
    Partial<NormaDocument>;

  if (parsed && parsed.schemaVersion === 1 && parsed.kind) {
    return parsed as NormaDatabaseRecord;
  }

  // Compatibilidade com projetos legados .norma.json
  if (parsed && Array.isArray(parsed.artigos) && parsed.tipo) {
    const legacyDoc = parsed as NormaDocument;
    return {
      schemaVersion: 1,
      recordId: legacyDoc.id || file.id,
      kind: 'norma',
      titulo: `${legacyDoc.tipo} nº ${legacyDoc.numero || '___'}`,
      resumo: legacyDoc.ementa || '',
      savedAt: legacyDoc.updatedAt || file.modifiedTime || '',
      doc: legacyDoc,
    };
  }

  throw new Error(
    'O arquivo selecionado não possui um formato válido do Banco de Dados Norma.'
  );
}
