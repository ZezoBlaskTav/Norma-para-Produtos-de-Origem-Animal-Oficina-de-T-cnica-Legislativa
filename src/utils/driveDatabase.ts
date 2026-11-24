import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  NormaDocument,
} from '../types/norma';
import {
  buildNormaDocxBlob,
  buildNormaPdfBlob,
  getSuggestedFileBaseName,
} from './exporters';
import { dataUrlToUint8Array } from './imageProcessing';
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

function sanitizeDriveFolderTitle(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildNormaFolderName(doc: NormaDocument): string {
  const numeroLimpo = (doc.numero || '').trim() || 'minuta';
  const ementaTrecho = (doc.ementa || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 42);
  const raw = `${doc.tipo} nº ${numeroLimpo}${
    ementaTrecho ? ` — ${ementaTrecho}` : ''
  }`;
  return sanitizeDriveFolderTitle(raw).slice(0, 110) || 'Minuta Legislativa';
}

export function buildNormaImagesFolderName(doc: NormaDocument): string {
  const numeroLimpo = (doc.numero || '').trim() || 'minuta';
  return (
    sanitizeDriveFolderTitle(`Imagens — ${doc.tipo} nº ${numeroLimpo}`).slice(
      0,
      110
    ) || 'Imagens da Minuta'
  );
}

function buildDateTimeStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}_${String(
    now.getHours()
  ).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
}

export interface SyncNormaImagesResult {
  minutaFolder: DriveFileItem;
  imagesFolder: DriveFileItem | null;
  uploadedImagesCount: number;
  skippedImagesCount: number;
  totalImagesCount: number;
}

export async function ensureNormaMinutaFolder(
  accessToken: string,
  params: {
    normaId: string;
    doc: NormaDocument;
    rootFolderId?: string;
  }
): Promise<{
  rootFolderId: string;
  minutaFolder: DriveFileItem;
  safeNormaKey: string;
}> {
  const rootFolderId =
    params.rootFolderId || (await ensureDriveDatabaseFolder(accessToken)).id;
  const safeNormaKey = truncateUtf8(
    (params.normaId || params.doc.id || 'minuta_principal').replace(
      /[^a-zA-Z0-9_\-]/g,
      '_'
    ),
    80
  );

  const minutaFolder = await findOrCreateDriveFolder(
    accessToken,
    buildNormaFolderName(params.doc),
    'norma_minuta_folder',
    {
      parentId: rootFolderId,
      matchProperty: { key: 'normaMinutaId', value: safeNormaKey },
      description: `Cópias e anexos da minuta ${params.doc.tipo} nº ${params.doc.numero || '___'}.`,
    }
  );

  return { rootFolderId, minutaFolder, safeNormaKey };
}

export async function syncNormaImagesToDriveFolder(
  accessToken: string,
  params: {
    normaId: string;
    doc: NormaDocument;
    rootFolderId?: string;
    minutaFolder?: DriveFileItem;
  }
): Promise<SyncNormaImagesResult> {
  const ensured = params.minutaFolder
    ? {
        rootFolderId:
          params.rootFolderId || (await ensureDriveDatabaseFolder(accessToken)).id,
        minutaFolder: params.minutaFolder,
        safeNormaKey: truncateUtf8(
          (params.normaId || params.doc.id || 'minuta_principal').replace(
            /[^a-zA-Z0-9_\-]/g,
            '_'
          ),
          80
        ),
      }
    : await ensureNormaMinutaFolder(accessToken, {
        normaId: params.normaId,
        doc: params.doc,
        rootFolderId: params.rootFolderId,
      });

  const { minutaFolder, safeNormaKey } = ensured;

  const validImages = (params.doc.imagens || []).filter(
    (img) => typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/')
  );

  if (validImages.length === 0) {
    return {
      minutaFolder,
      imagesFolder: null,
      uploadedImagesCount: 0,
      skippedImagesCount: 0,
      totalImagesCount: 0,
    };
  }

  const imagesFolder = await findOrCreateDriveFolder(
    accessToken,
    buildNormaImagesFolderName(params.doc),
    'norma_images_folder',
    {
      parentId: minutaFolder.id,
      matchProperty: { key: 'normaMinutaId', value: safeNormaKey },
      description: `Imagens, carimbos e anexos gráficos vinculados à minuta ${params.doc.tipo} nº ${params.doc.numero || '___'}.`,
    }
  );

  const existingFiles = await listDriveFilesInFolder(accessToken, imagesFolder.id);
  let uploadedImagesCount = 0;
  let skippedImagesCount = 0;

  for (let i = 0; i < validImages.length; i++) {
    const img = validImages[i];
    const imgSig = `${img.dataUrl.length}_${img.widthPx}x${img.heightPx}`;
    const alreadyExists = existingFiles.some(
      (f) =>
        f.appProperties?.normaImageId === truncateUtf8(img.id, 60) &&
        f.appProperties?.normaImageSig === imgSig
    );

    if (alreadyExists) {
      skippedImagesCount++;
      continue;
    }

    const bytes = dataUrlToUint8Array(img.dataUrl);
    const blob = new Blob([new Uint8Array(bytes).buffer], {
      type: img.mimeType,
    });
    const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const rawLabel = (img.titulo || `imagem-${i + 1}`).trim();
    const labelSlug = getSuggestedFileBaseName(rawLabel).slice(0, 60);
    const fileName = `${String(i + 1).padStart(2, '0')}-${labelSlug}.${ext}`;

    await uploadNewDriveFile(accessToken, {
      name: fileName,
      blob,
      uploadMimeType: img.mimeType,
      parents: [imagesFolder.id],
      description: truncateUtf8(
        img.legenda || img.titulo || `Imagem ${i + 1} da minuta`,
        220
      ),
      appProperties: {
        normaMinutaId: safeNormaKey,
        normaImageId: truncateUtf8(img.id, 60),
        normaImageSig: imgSig,
      },
    });
    uploadedImagesCount++;
  }

  return {
    minutaFolder,
    imagesFolder,
    uploadedImagesCount,
    skippedImagesCount,
    totalImagesCount: validImages.length,
  };
}

export interface SaveNormaCopyToDriveOptions {
  normaId: string;
  doc: NormaDocument;
  altMeta?: AlteracaoMetadata;
  alteracoes?: AlteracaoDispositivo[];
  auditText?: string;
  savedByEmail?: string;
  includeEditableRecord?: boolean;
  includeDocx?: boolean;
  includePdf?: boolean;
  includeImagesFolder?: boolean;
}

export interface SaveNormaCopyToDriveResult {
  rootFolder: DriveFileItem;
  minutaFolder: DriveFileItem;
  imagesFolder: DriveFileItem | null;
  recordFile: DriveFileItem | null;
  recordMetadata: NormaDatabaseRecord | null;
  docxFile: DriveFileItem | null;
  pdfFile: DriveFileItem | null;
  uploadedImagesCount: number;
  skippedImagesCount: number;
  totalImagesCount: number;
}

export async function saveNormaCopyWithImagesToDrive(
  accessToken: string,
  options: SaveNormaCopyToDriveOptions
): Promise<SaveNormaCopyToDriveResult> {
  const rootFolder = await ensureDriveDatabaseFolder(accessToken);
  const safeNormaKey = truncateUtf8(
    (options.normaId || options.doc.id || 'minuta_principal').replace(
      /[^a-zA-Z0-9_\-]/g,
      '_'
    ),
    80
  );

  const minutaFolder = await findOrCreateDriveFolder(
    accessToken,
    buildNormaFolderName(options.doc),
    'norma_minuta_folder',
    {
      parentId: rootFolder.id,
      matchProperty: { key: 'normaMinutaId', value: safeNormaKey },
      description: `Cópias e anexos da minuta ${options.doc.tipo} nº ${options.doc.numero || '___'}.`,
    }
  );

  const numeroLimpo = (options.doc.numero || '').trim() || 'minuta';
  const baseName = getSuggestedFileBaseName(`${options.doc.tipo}-${numeroLimpo}`);
  const stamp = buildDateTimeStamp();

  let recordFile: DriveFileItem | null = null;
  let recordMetadata: NormaDatabaseRecord | null = null;

  if (options.includeEditableRecord !== false) {
    const nowIso = new Date().toISOString();
    recordMetadata = {
      schemaVersion: 1,
      recordId: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: 'norma',
      titulo: `${options.doc.tipo} nº ${options.doc.numero || '___'}`,
      resumo:
        options.doc.ementa ||
        `${options.doc.artigos.length} artigos · ${(options.doc.imagens || []).length} imagens`,
      savedAt: nowIso,
      savedByEmail: options.savedByEmail,
      doc: options.doc,
    };
    recordFile = await createDriveDatabaseRecord(
      accessToken,
      rootFolder.id,
      recordMetadata,
      { isSnapshot: true }
    );
  }

  let docxFile: DriveFileItem | null = null;
  if (options.includeDocx !== false) {
    const docxBlob = await buildNormaDocxBlob(options.doc);
    docxFile = await uploadNewDriveFile(accessToken, {
      name: `${baseName}-copia-${stamp}.docx`,
      blob: docxBlob,
      uploadMimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      parents: [minutaFolder.id],
      description: `Cópia em Word da minuta ${options.doc.tipo} nº ${numeroLimpo}.`,
      appProperties: {
        normaMinutaId: safeNormaKey,
        normaCopyKind: 'docx',
      },
    });
  }

  let pdfFile: DriveFileItem | null = null;
  if (options.includePdf) {
    const pdfBlob = buildNormaPdfBlob(options.doc);
    pdfFile = await uploadNewDriveFile(accessToken, {
      name: `${baseName}-copia-${stamp}.pdf`,
      blob: pdfBlob,
      uploadMimeType: 'application/pdf',
      parents: [minutaFolder.id],
      description: `Cópia em PDF da minuta ${options.doc.tipo} nº ${numeroLimpo}.`,
      appProperties: {
        normaMinutaId: safeNormaKey,
        normaCopyKind: 'pdf',
      },
    });
  }

  let imagesFolder: DriveFileItem | null = null;
  let uploadedImagesCount = 0;
  let skippedImagesCount = 0;
  const totalImagesCount = (options.doc.imagens || []).filter(
    (img) => typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/')
  ).length;

  if (options.includeImagesFolder !== false && totalImagesCount > 0) {
    const imgSync = await syncNormaImagesToDriveFolder(accessToken, {
      normaId: options.normaId,
      doc: options.doc,
      rootFolderId: rootFolder.id,
      minutaFolder,
    });
    imagesFolder = imgSync.imagesFolder;
    uploadedImagesCount = imgSync.uploadedImagesCount;
    skippedImagesCount = imgSync.skippedImagesCount;
  }

  return {
    rootFolder,
    minutaFolder,
    imagesFolder,
    recordFile,
    recordMetadata,
    docxFile,
    pdfFile,
    uploadedImagesCount,
    skippedImagesCount,
    totalImagesCount,
  };
}
