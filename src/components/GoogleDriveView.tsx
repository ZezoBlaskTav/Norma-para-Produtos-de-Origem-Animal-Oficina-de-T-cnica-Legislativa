import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  FileText,
  FolderOpen,
  HardDrive,
  History,
  LogOut,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  NormaDocument,
} from '../types/norma';
import {
  buildAlteracaoDocxBlob,
  buildAlteracaoPdfBlob,
  buildNormaDocxBlob,
  buildNormaPdfBlob,
  getSuggestedFileBaseName,
} from '../utils/exporters';
import { AuthErrorInfo, getAccessToken } from '../utils/googleAuth';
import {
  DriveAuthError,
  DriveFileItem,
  listDriveFiles,
  overwriteDriveFile,
  readDriveFileAsText,
  trashDriveFile,
  uploadNewDriveFile,
} from '../utils/googleDrive';
import {
  ActiveDriveDbLink,
  DRIVE_DB_FOLDER_NAME,
  DatabaseRecordKind,
  DriveDbEntry,
  NormaDatabaseRecord,
  buildNormaFolderName,
  buildNormaImagesFolderName,
  createDriveDatabaseRecord,
  ensureNormaMinutaFolder,
  listDriveDatabaseEntries,
  readDriveDatabaseRecord,
  syncNormaImagesToDriveFolder,
  updateDriveDatabaseRecord,
} from '../utils/driveDatabase';
import { LocalRecoveryPoint } from '../utils/localPersistence';
import { GoogleSignInButton } from './GoogleSignInButton';

type SaveFormat = 'gdoc' | 'docx' | 'pdf' | 'json';
type SaveSource = 'editor' | 'ajuste';
type FileFilter = 'all' | 'normas' | 'docs';

type PendingAction =
  | { type: 'trash_general'; file: DriveFileItem }
  | { type: 'overwrite_general'; file: DriveFileItem }
  | { type: 'trash_db'; entry: DriveDbEntry }
  | { type: 'update_db'; entry: DriveDbEntry }
  | { type: 'restore_db'; entry: DriveDbEntry; record: NormaDatabaseRecord }
  | { type: 'restore_local'; snapshot: LocalRecoveryPoint };

interface GoogleDriveViewProps {
  user: User | null;
  needsAuth: boolean;
  isLoggingIn: boolean;
  authErrorInfo: AuthErrorInfo | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onTokenExpired: () => void;
  doc: NormaDocument;
  activeCloudNormaId?: string;
  altMeta: AlteracaoMetadata;
  alteracoes: AlteracaoDispositivo[];
  auditText: string;
  localSnapshots: LocalRecoveryPoint[];
  lastLocalSavedAt: string | null;
  activeDbLink: ActiveDriveDbLink | null;
  hasUnsyncedDriveChanges: boolean;
  onRestoreDatabaseRecord: (
    record: NormaDatabaseRecord,
    link?: ActiveDriveDbLink
  ) => void;
  onRestoreLocalSnapshot: (snap: LocalRecoveryPoint) => void;
  onMarkDriveSynced: (link: ActiveDriveDbLink) => void;
  onClearDbLink: (removedFileId: string) => void;
  onLoadDocFromDrive: (loaded: NormaDocument) => void;
  onAuditTextFromDrive: (text: string) => void;
}

function formatBytes(sizeStr?: string): string {
  if (!sizeStr) return '—';
  const bytes = Number(sizeStr);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateBr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMimeLabel(mimeType: string, name: string): string {
  if (name.endsWith('.norma-db.json')) return 'Registro de Banco (.json)';
  if (name.endsWith('.norma.json')) return 'Projeto Norma (.json)';
  if (mimeType === 'application/vnd.google-apps.document') return 'Google Docs';
  if (mimeType === 'application/pdf') return 'PDF';
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'Word (DOCX)';
  }
  if (mimeType === 'application/vnd.google-apps.folder') return 'Pasta';
  if (mimeType === 'text/plain') return 'Texto (.txt)';
  return 'Arquivo';
}

function formatDbKindLabel(kind: DatabaseRecordKind): string {
  if (kind === 'pacote') return 'Pacote Completo';
  if (kind === 'alteracao') return 'Ajuste (NR)';
  return 'Norma (Editor)';
}

export const GoogleDriveView: React.FC<GoogleDriveViewProps> = ({
  user,
  needsAuth,
  isLoggingIn,
  authErrorInfo,
  onSignIn,
  onSignOut,
  onTokenExpired,
  doc,
  activeCloudNormaId,
  altMeta,
  alteracoes,
  auditText,
  localSnapshots,
  lastLocalSavedAt,
  activeDbLink,
  hasUnsyncedDriveChanges,
  onRestoreDatabaseRecord,
  onRestoreLocalSnapshot,
  onMarkDriveSynced,
  onClearDbLink,
  onLoadDocFromDrive,
  onAuditTextFromDrive,
}) => {
  // Banco de Dados no Drive
  const [dbFolder, setDbFolder] = useState<DriveFileItem | null>(null);
  const [dbEntries, setDbEntries] = useState<DriveDbEntry[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [dbSearch, setDbSearch] = useState('');
  const [dbKind, setDbKind] = useState<DatabaseRecordKind>('pacote');
  const [dbTitleInput, setDbTitleInput] = useState(() =>
    `${doc.tipo} ${doc.numero || 'minuta'} - Banco`.trim()
  );

  // Arquivos gerais / exportação
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FileFilter>('all');

  const [saveSource, setSaveSource] = useState<SaveSource>('editor');
  const [saveFormat, setSaveFormat] = useState<SaveFormat>('gdoc');
  const [fileNameInput, setFileNameInput] = useState(() =>
    getSuggestedFileBaseName(`${doc.tipo}-${doc.numero || 'minuta'}`)
  );

  const [syncImagesOnSave, setSyncImagesOnSave] = useState(true);
  const [exportIntoMinutaFolder, setExportIntoMinutaFolder] = useState(true);

  const [busyAction, setBusyAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  );
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [showLocalHistory, setShowLocalHistory] = useState(false);

  const validDocImagesCount = useMemo(
    () =>
      (doc.imagens || []).filter(
        (img) =>
          typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/')
      ).length,
    [doc.imagens]
  );

  const minutaFolderLabel = useMemo(() => buildNormaFolderName(doc), [doc]);
  const imagesFolderLabel = useMemo(
    () => buildNormaImagesFolderName(doc),
    [doc]
  );

  useEffect(() => {
    const base =
      saveSource === 'editor'
        ? `${doc.tipo}-${doc.numero || 'minuta'}`
        : `${altMeta.atoAlteradorTipo}-alterador-${altMeta.atoAlteradorNumero || 'minuta'}`;
    setFileNameInput(getSuggestedFileBaseName(base));
  }, [
    saveSource,
    doc.tipo,
    doc.numero,
    altMeta.atoAlteradorTipo,
    altMeta.atoAlteradorNumero,
  ]);

  useEffect(() => {
    if (activeDbLink?.titulo) {
      setDbTitleInput(activeDbLink.titulo);
      return;
    }
    if (dbKind === 'alteracao') {
      setDbTitleInput(
        `${altMeta.atoAlteradorTipo} nº ${altMeta.atoAlteradorNumero || '___'} (Alterador)`
      );
    } else if (dbKind === 'norma') {
      setDbTitleInput(`${doc.tipo} nº ${doc.numero || '___'}`);
    } else {
      setDbTitleInput(
        `${doc.tipo} nº ${doc.numero || '___'} + Ajuste (${alteracoes.length} disp.)`
      );
    }
  }, [
    activeDbLink?.titulo,
    dbKind,
    doc.tipo,
    doc.numero,
    altMeta.atoAlteradorTipo,
    altMeta.atoAlteradorNumero,
    alteracoes.length,
  ]);

  const fetchDatabase = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      onTokenExpired();
      return;
    }
    setLoadingDb(true);
    try {
      const result = await listDriveDatabaseEntries(token);
      setDbFolder(result.folder);
      setDbEntries(result.entries);
    } catch (err) {
      if (err instanceof DriveAuthError) {
        onTokenExpired();
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Falha ao consultar o Banco de Dados no Google Drive.'
        );
      }
    } finally {
      setLoadingDb(false);
    }
  }, [onTokenExpired]);

  const fetchFiles = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      onTokenExpired();
      return;
    }

    setLoadingFiles(true);
    setErrorMessage(null);
    try {
      const list = await listDriveFiles(token, {
        query: searchQuery,
        filter,
      });
      setFiles(list);
    } catch (err) {
      if (err instanceof DriveAuthError) {
        onTokenExpired();
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Falha ao carregar arquivos do Google Drive.'
        );
      }
    } finally {
      setLoadingFiles(false);
    }
  }, [searchQuery, filter, onTokenExpired]);

  useEffect(() => {
    if (!needsAuth) {
      fetchDatabase();
      fetchFiles();
    }
  }, [needsAuth, fetchDatabase, fetchFiles]);

  const buildDatabaseRecord = (
    kind: DatabaseRecordKind,
    existingRecordId?: string
  ): NormaDatabaseRecord => {
    const now = new Date().toISOString();
    const cleanTitle =
      dbTitleInput.trim() || `${doc.tipo} nº ${doc.numero || 'minuta'}`;
    const resumo =
      kind === 'alteracao'
        ? `Altera ${altMeta.normaAlvoNome} (${alteracoes.length} dispositivos)`
        : doc.ementa || `${doc.artigos.length} artigos estruturados`;

    return {
      schemaVersion: 1,
      recordId:
        existingRecordId ||
        `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind,
      titulo: cleanTitle,
      resumo,
      savedAt: now,
      savedByEmail: user?.email || undefined,
      doc: kind === 'alteracao' ? undefined : doc,
      altMeta: kind === 'norma' ? undefined : altMeta,
      alteracoes: kind === 'norma' ? undefined : alteracoes,
      auditText: kind === 'pacote' ? auditText : undefined,
    };
  };

  const handleCreateDatabaseRecord = async (isSnapshot = false) => {
    const token = await getAccessToken();
    if (!token) {
      onTokenExpired();
      return;
    }

    setBusyAction(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const folder = dbFolder || (await listDriveDatabaseEntries(token)).folder;
      setDbFolder(folder);
      const record = buildDatabaseRecord(dbKind);
      const created = await createDriveDatabaseRecord(token, folder.id, record, {
        isSnapshot,
      });

      onMarkDriveSynced({
        fileId: created.id,
        fileName: created.name,
        recordId: record.recordId,
        kind: record.kind,
        titulo: record.titulo,
        savedAt: record.savedAt,
      });

      let imageSummary = '';
      if (syncImagesOnSave && dbKind !== 'alteracao' && validDocImagesCount > 0) {
        const imgSync = await syncNormaImagesToDriveFolder(token, {
          normaId: activeCloudNormaId || doc.id,
          doc,
          rootFolderId: folder.id,
        });
        imageSummary = ` Imagens salvas na pasta "${imgSync.minutaFolder.name} / ${imgSync.imagesFolder?.name || imagesFolderLabel}" (${imgSync.uploadedImagesCount} nova(s), ${imgSync.skippedImagesCount} já existente(s)).`;
      }

      setStatusMessage(
        (isSnapshot
          ? `Ponto de restauração "${created.name}" salvo na pasta "${DRIVE_DB_FOLDER_NAME}".`
          : `Registro "${record.titulo}" salvo no Banco de Dados do Google Drive.`) +
          imageSummary
      );
      await fetchDatabase();
      await fetchFiles();
    } catch (err) {
      if (err instanceof DriveAuthError) {
        onTokenExpired();
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Não foi possível salvar o registro no Banco de Dados.'
        );
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleRequestRestoreDbEntry = async (entry: DriveDbEntry) => {
    const token = await getAccessToken();
    if (!token) {
      onTokenExpired();
      return;
    }

    setBusyAction(true);
    setErrorMessage(null);
    try {
      const record = await readDriveDatabaseRecord(token, entry.file);
      setPendingAction({ type: 'restore_db', entry, record });
    } catch (err) {
      if (err instanceof DriveAuthError) {
        onTokenExpired();
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Falha ao ler o registro do Banco de Dados.'
        );
      }
    } finally {
      setBusyAction(false);
    }
  };

  const buildPayloadForUpload = async (
    format: SaveFormat
  ): Promise<{
    fileName: string;
    blob: Blob;
    uploadMimeType: string;
    targetDriveMimeType?: string;
  }> => {
    const cleanBase =
      fileNameInput.trim().replace(/\.(pdf|docx|json|norma\.json)$/i, '') ||
      'minuta-normativa';

    if (format === 'json') {
      const jsonBlob = new Blob([JSON.stringify(doc, null, 2)], {
        type: 'application/json',
      });
      return {
        fileName: `${cleanBase}.norma.json`,
        blob: jsonBlob,
        uploadMimeType: 'application/json',
      };
    }

    if (format === 'pdf') {
      const pdfBlob =
        saveSource === 'editor'
          ? buildNormaPdfBlob(doc)
          : buildAlteracaoPdfBlob(altMeta, alteracoes);
      return {
        fileName: `${cleanBase}.pdf`,
        blob: pdfBlob,
        uploadMimeType: 'application/pdf',
      };
    }

    const docxBlob =
      saveSource === 'editor'
        ? await buildNormaDocxBlob(doc)
        : await buildAlteracaoDocxBlob(altMeta, alteracoes);

    if (format === 'gdoc') {
      return {
        fileName: cleanBase,
        blob: docxBlob,
        uploadMimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        targetDriveMimeType: 'application/vnd.google-apps.document',
      };
    }

    return {
      fileName: `${cleanBase}.docx`,
      blob: docxBlob,
      uploadMimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  };

  const handleSaveNewToDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getAccessToken();
    if (!token) {
      onTokenExpired();
      return;
    }

    setBusyAction(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const payload = await buildPayloadForUpload(saveFormat);
      let targetParents: string[] | undefined;
      let folderMessage = '';

      if (saveSource === 'editor' && (exportIntoMinutaFolder || (syncImagesOnSave && validDocImagesCount > 0))) {
        const rootId = dbFolder?.id;
        const ensured = await ensureNormaMinutaFolder(token, {
          normaId: activeCloudNormaId || doc.id,
          doc,
          rootFolderId: rootId,
        });
        if (exportIntoMinutaFolder) {
          targetParents = [ensured.minutaFolder.id];
          folderMessage = ` dentro da pasta "${ensured.minutaFolder.name}"`;
        }
        if (syncImagesOnSave && validDocImagesCount > 0) {
          const imgSync = await syncNormaImagesToDriveFolder(token, {
            normaId: activeCloudNormaId || doc.id,
            doc,
            rootFolderId: ensured.rootFolderId,
            minutaFolder: ensured.minutaFolder,
          });
          folderMessage += ` e ${imgSync.totalImagesCount} imagem(ns) organizada(s) na subpasta "${imgSync.imagesFolder?.name || imagesFolderLabel}" (${imgSync.uploadedImagesCount} nova(s))`;
        }
      }

      const created = await uploadNewDriveFile(token, {
        name: payload.fileName,
        blob: payload.blob,
        uploadMimeType: payload.uploadMimeType,
        targetDriveMimeType: payload.targetDriveMimeType,
        parents: targetParents,
        description:
          'Ato normativo elaborado na Oficina de Técnica Legislativa Norma.',
      });
      setStatusMessage(
        `Arquivo "${created.name}" salvo com sucesso no Google Drive${folderMessage}.`
      );
      await fetchFiles();
    } catch (err) {
      if (err instanceof DriveAuthError) {
        onTokenExpired();
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Erro ao salvar o arquivo no Google Drive.'
        );
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmPendingAction = async () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'restore_local') {
      onRestoreLocalSnapshot(pendingAction.snapshot);
      setStatusMessage(
        `Ponto local de ${formatDateBr(pendingAction.snapshot.savedAt)} restaurado com sucesso.`
      );
      setPendingAction(null);
      return;
    }

    if (pendingAction.type === 'restore_db') {
      const { entry, record } = pendingAction;
      onRestoreDatabaseRecord(record, {
        fileId: entry.file.id,
        fileName: entry.file.name,
        recordId: record.recordId,
        kind: record.kind,
        titulo: record.titulo,
        savedAt: record.savedAt || entry.updatedAt,
      });
      setStatusMessage(
        `Registro "${record.titulo}" restaurado do Banco de Dados no Google Drive.`
      );
      setPendingAction(null);
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setPendingAction(null);
      onTokenExpired();
      return;
    }

    setBusyAction(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      if (pendingAction.type === 'trash_general') {
        await trashDriveFile(token, pendingAction.file.id);
        setStatusMessage(
          `Arquivo "${pendingAction.file.name}" movido para a lixeira do Google Drive.`
        );
      } else if (pendingAction.type === 'overwrite_general') {
        const target = pendingAction.file;
        const targetFormat: SaveFormat = target.name.endsWith('.norma.json')
          ? 'json'
          : target.mimeType === 'application/pdf'
            ? 'pdf'
            : 'docx';
        const payload = await buildPayloadForUpload(targetFormat);
        const updated = await overwriteDriveFile(token, target.id, {
          blob: payload.blob,
          uploadMimeType: payload.uploadMimeType,
        });
        setStatusMessage(
          `Conteúdo de "${updated.name}" atualizado no Google Drive.`
        );
      } else if (pendingAction.type === 'trash_db') {
        await trashDriveFile(token, pendingAction.entry.file.id);
        onClearDbLink(pendingAction.entry.file.id);
        setStatusMessage(
          `Registro "${pendingAction.entry.titulo}" movido para a lixeira do Google Drive.`
        );
      } else if (pendingAction.type === 'update_db') {
        const target = pendingAction.entry;
        const record = buildDatabaseRecord(dbKind, target.recordId);
        const updated = await updateDriveDatabaseRecord(
          token,
          target.file.id,
          record
        );
        onMarkDriveSynced({
          fileId: updated.id,
          fileName: updated.name,
          recordId: record.recordId,
          kind: record.kind,
          titulo: record.titulo,
          savedAt: record.savedAt,
        });
        let imgMsg = '';
        if (syncImagesOnSave && dbKind !== 'alteracao' && validDocImagesCount > 0) {
          const imgSync = await syncNormaImagesToDriveFolder(token, {
            normaId: activeCloudNormaId || doc.id,
            doc,
            rootFolderId: dbFolder?.id,
          });
          imgMsg = ` Imagens sincronizadas em "${imgSync.minutaFolder.name} / ${imgSync.imagesFolder?.name || imagesFolderLabel}" (${imgSync.uploadedImagesCount} nova(s), ${imgSync.skippedImagesCount} já existente(s)).`;
        }
        setStatusMessage(
          `Registro "${record.titulo}" atualizado no Banco de Dados do Google Drive.${imgMsg}`
        );
      }
      setPendingAction(null);
      await fetchDatabase();
      await fetchFiles();
    } catch (err) {
      setPendingAction(null);
      if (err instanceof DriveAuthError) {
        onTokenExpired();
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Não foi possível concluir a alteração no Google Drive.'
        );
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleOpenProjectInEditor = async (file: DriveFileItem) => {
    const token = await getAccessToken();
    if (!token) {
      onTokenExpired();
      return;
    }

    setBusyAction(true);
    setErrorMessage(null);
    try {
      const record = await readDriveDatabaseRecord(token, file);
      if (record.doc) {
        onLoadDocFromDrive(record.doc);
      } else {
        onRestoreDatabaseRecord(record, {
          fileId: file.id,
          fileName: file.name,
          recordId: record.recordId,
          kind: record.kind,
          titulo: record.titulo,
          savedAt: record.savedAt,
        });
      }
    } catch (err) {
      if (err instanceof DriveAuthError) {
        onTokenExpired();
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Erro ao importar o projeto do Google Drive.'
        );
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleAuditDriveFile = async (file: DriveFileItem) => {
    const token = await getAccessToken();
    if (!token) {
      onTokenExpired();
      return;
    }

    setBusyAction(true);
    setErrorMessage(null);
    try {
      const text = await readDriveFileAsText(token, file);
      onAuditTextFromDrive(text);
    } catch (err) {
      if (err instanceof DriveAuthError) {
        onTokenExpired();
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Não foi possível ler este arquivo como texto para auditoria.'
        );
      }
    } finally {
      setBusyAction(false);
    }
  };

  const filteredDbEntries = useMemo(() => {
    const q = dbSearch.trim().toLowerCase();
    if (!q) return dbEntries;
    return dbEntries.filter(
      (entry) =>
        entry.titulo.toLowerCase().includes(q) ||
        entry.resumo.toLowerCase().includes(q) ||
        entry.file.name.toLowerCase().includes(q)
    );
  }, [dbEntries, dbSearch]);

  const linkedDbEntry = useMemo(
    () => dbEntries.find((e) => e.file.id === activeDbLink?.fileId) || null,
    [dbEntries, activeDbLink?.fileId]
  );

  const handleCopyHostname = async (hostname: string) => {
    try {
      await navigator.clipboard.writeText(hostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    } catch {
      // Fallback silencioso
    }
  };

  const renderLocalProtectionCard = () => (
    <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Proteção Local Instantânea Ativa (Falta de Luz / Queda)</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Cada alteração no Editor, em Ajuste e Redação (NR) e no Auditor é gravada
            automaticamente no armazenamento local do navegador (IndexedDB + localStorage).
            {lastLocalSavedAt ? ` Última gravação: ${formatDateBr(lastLocalSavedAt)}.` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowLocalHistory((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <History className="w-3.5 h-3.5" />
          <span>
            {showLocalHistory
              ? 'Ocultar pontos locais'
              : `Pontos locais (${localSnapshots.length})`}
          </span>
        </button>
      </div>

      {showLocalHistory && (
        <div className="border-t border-slate-200 pt-3">
          {localSnapshots.length === 0 ? (
            <p className="text-xs text-slate-500">
              Os pontos de restauração locais são gerados automaticamente a cada
              alteração relevante.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
              {localSnapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {snap.label}
                    </div>
                    <div className="text-slate-500 truncate">
                      {formatDateBr(snap.savedAt)} · {snap.subLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAction({ type: 'restore_local', snapshot: snap })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap shrink-0 self-start sm:self-auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );

  if (needsAuth) {
    return (
      <div className="max-w-3xl mx-auto py-4 space-y-6">
        <section className="bg-white border border-slate-200 rounded-lg p-8 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-700 text-xs font-medium">
              <HardDrive className="w-4 h-4" />
              <span>Integração Google Workspace</span>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">
              Conecte sua conta do Google Drive
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Entre com sua conta Google para manter seu{' '}
              <strong>Banco de Dados Legislativo no Google Drive</strong> (pasta{' '}
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                {DRIVE_DB_FOLDER_NAME}
              </span>
              ), salvar minutas e atos alteradores (NR) com histórico de versões,
              além de exportar em <strong>Google Docs</strong>, <strong>PDF</strong> e{' '}
              <strong>DOCX</strong>.
            </p>
          </div>

          {authErrorInfo && authErrorInfo.code === 'unauthorized-domain' ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md space-y-3 text-xs text-red-900">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-sm text-red-900">
                    Domínio externo ainda não autorizado no Firebase Auth
                  </div>
                  <p className="leading-relaxed text-red-800">
                    {authErrorInfo.message} O endereço do AI Studio já vem
                    autorizado por padrão, mas domínios externos (como Netlify ou
                    domínio próprio) precisam ser incluídos na lista de segurança do
                    projeto Firebase.
                  </p>
                </div>
              </div>

              {authErrorInfo.hostname && (
                <div className="flex flex-wrap items-center gap-2 bg-white border border-red-200 rounded px-3 py-2">
                  <span className="text-slate-600">Domínio para autorizar:</span>
                  <code className="font-mono font-semibold text-slate-900">
                    {authErrorInfo.hostname}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyHostname(authErrorInfo.hostname!)}
                    className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap"
                  >
                    {copiedDomain ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedDomain ? 'Copiado' : 'Copiar domínio'}</span>
                  </button>
                </div>
              )}

              <ol className="list-decimal pl-5 space-y-1.5 text-red-900 leading-relaxed">
                <li>
                  Abra o Console do Firebase no projeto{' '}
                  <code className="font-mono font-semibold">
                    {authErrorInfo.projectId}
                  </code>{' '}
                  em{' '}
                  <strong>
                    Authentication → Settings → Authorized domains
                  </strong>
                  .
                </li>
                <li>
                  Clique em <strong>Add domain</strong>, cole{' '}
                  <code className="font-mono font-semibold">
                    {authErrorInfo.hostname || 'seu-dominio.netlify.app'}
                  </code>{' '}
                  e salve.
                </li>
                <li>
                  Após salvar, clique novamente em <strong>Sign in with Google</strong>{' '}
                  abaixo. (Se precisar de suporte no OAuth do Google Cloud, adicione{' '}
                  <code className="font-mono">
                    https://{authErrorInfo.hostname || 'seu-dominio.netlify.app'}
                  </code>{' '}
                  em <em>Origens JavaScript autorizadas</em> do cliente OAuth).
                </li>
              </ol>

              <div className="pt-1">
                <a
                  href={`https://console.firebase.google.com/project/${encodeURIComponent(
                    authErrorInfo.projectId
                  )}/authentication/settings`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Firebase Auth Settings</span>
                </a>
              </div>
            </div>
          ) : authErrorInfo ? (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
              {authErrorInfo.message}
            </div>
          ) : null}

          <div className="pt-1 space-y-2.5">
            <GoogleSignInButton
              onClick={onSignIn}
              disabled={isLoggingIn}
              label={
                isLoggingIn ? 'Conectando ao Google...' : 'Sign in with Google'
              }
            />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Observação: se o Google exibir <em>Erro 403: access_denied (em fase
              de testes)</em> ao conectar o Drive, o administrador do projeto{' '}
              <span className="font-mono">gen-lang-client-0710544814</span> precisa
              incluir seu Gmail na lista de <strong>Usuários de teste</strong> da
              Tela de permissão OAuth no Google Cloud Console (ou publicar o app).
            </p>
          </div>
        </section>

        {renderLocalProtectionCard()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Conta Conectada */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Banco de Dados e Arquivos no Google Drive
            </h2>
            {activeDbLink && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${
                  hasUnsyncedDriveChanges
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>
                  {hasUnsyncedDriveChanges
                    ? 'Alterações locais não enviadas ao Drive'
                    : 'Banco Drive sincronizado'}
                </span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600">
            Conectado como{' '}
            <strong className="text-slate-900">
              {user?.displayName || user?.email || 'Conta Google'}
            </strong>
            {user?.email ? ` · ${user.email}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Desconectar conta</span>
        </button>
      </section>

      {statusMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs font-medium text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Card Banco de Dados Legislativo no Google Drive */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-800 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-900">
                Banco de Dados Legislativo no Google Drive
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Pasta dedicada{' '}
              <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                {DRIVE_DB_FOLDER_NAME}
              </span>{' '}
              para armazenar minutas do Editor e atos alteradores (NR) com histórico de
              restauração.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {dbFolder?.webViewLink && (
              <a
                href={dbFolder.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir pasta no Drive</span>
              </a>
            )}
            <button
              type="button"
              onClick={fetchDatabase}
              disabled={loadingDb}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingDb ? 'animate-spin' : ''}`}
              />
              <span>Atualizar Banco</span>
            </button>
          </div>
        </div>

        {/* Formulário de Gravação no Banco */}
        <div className="p-5 bg-slate-50/70 border-b border-slate-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Conteúdo do registro
              </label>
              <select
                value={dbKind}
                onChange={(e) => setDbKind(e.target.value as DatabaseRecordKind)}
                className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
              >
                <option value="pacote">
                  Pacote Completo (Editor + Ajuste NR)
                </option>
                <option value="norma">
                  Apenas Norma do Editor ({doc.tipo} nº {doc.numero || '___'})
                </option>
                <option value="alteracao">
                  Apenas Ato Alterador NR ({altMeta.atoAlteradorTipo} nº{' '}
                  {altMeta.atoAlteradorNumero || '___'})
                </option>
              </select>
            </div>

            <div className="md:col-span-8">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Título no Banco de Dados
              </label>
              <input
                type="text"
                value={dbTitleInput}
                onChange={(e) => setDbTitleInput(e.target.value)}
                placeholder="Ex.: Decreto nº 100 — Governança de Dados"
                className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
              />
            </div>
          </div>

          {dbKind !== 'alteracao' && validDocImagesCount > 0 && (
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncImagesOnSave}
                onChange={(e) => setSyncImagesOnSave(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>
                Enviar também as <strong>{validDocImagesCount}</strong>{' '}
                {validDocImagesCount === 1
                  ? 'imagem anexada'
                  : 'imagens anexadas'}{' '}
                para a pasta da minuta (
                <span className="font-mono text-[11px]">
                  {minutaFolderLabel} / {imagesFolderLabel}
                </span>
                )
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleCreateDatabaseRecord(false)}
              disabled={busyAction}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {busyAction ? 'Gravando...' : 'Salvar novo registro no Banco'}
              </span>
            </button>

            {linkedDbEntry && (
              <button
                type="button"
                onClick={() =>
                  setPendingAction({ type: 'update_db', entry: linkedDbEntry })
                }
                disabled={busyAction}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-60 rounded-md whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar "{linkedDbEntry.titulo}"</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleCreateDatabaseRecord(true)}
              disabled={busyAction}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-60 rounded-md whitespace-nowrap"
            >
              <History className="w-3.5 h-3.5" />
              <span>Criar ponto de restauração (cópia)</span>
            </button>
          </div>
        </div>

        {/* Lista de Registros no Banco */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={dbSearch}
              onChange={(e) => setDbSearch(e.target.value)}
              placeholder="Filtrar registros salvos no Banco..."
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md pl-9 pr-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
            {filteredDbEntries.length}{' '}
            {filteredDbEntries.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        <div className="overflow-x-auto">
          {loadingDb ? (
            <div className="p-6 text-xs text-slate-500">
              Consultando registros na pasta {DRIVE_DB_FOLDER_NAME}...
            </div>
          ) : filteredDbEntries.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-900">
                Nenhum registro encontrado no Banco de Dados do Drive
              </p>
              <p className="text-xs text-slate-500">
                Clique em "Salvar novo registro no Banco" acima para gravar sua
                norma e suas alterações (NR) na nuvem.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-5">Registro</th>
                  <th className="py-2.5 px-4">Escopo</th>
                  <th className="py-2.5 px-4">Salvo em</th>
                  <th className="py-2.5 px-4 text-right">Tamanho</th>
                  <th className="py-2.5 px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredDbEntries.map((entry) => {
                  const isLinked = entry.file.id === activeDbLink?.fileId;
                  return (
                    <tr
                      key={entry.file.id}
                      className={
                        isLinked ? 'bg-slate-50/90' : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-3 px-5 max-w-sm">
                        <div className="font-medium text-slate-900 truncate flex items-center gap-2">
                          <span className="truncate">{entry.titulo}</span>
                          {isLinked && (
                            <span className="px-1.5 py-0.5 text-[11px] font-medium bg-slate-900 text-white rounded shrink-0">
                              Vinculado
                            </span>
                          )}
                        </div>
                        {entry.resumo && (
                          <div className="text-xs text-slate-500 truncate mt-0.5">
                            {entry.resumo}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {formatDbKindLabel(entry.kind)}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatDateBr(entry.updatedAt || entry.file.modifiedTime)}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-600 text-right whitespace-nowrap">
                        {formatBytes(entry.file.size)}
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleRequestRestoreDbEntry(entry)}
                            disabled={busyAction}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded whitespace-nowrap"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Restaurar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setPendingAction({ type: 'update_db', entry })
                            }
                            disabled={busyAction}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded whitespace-nowrap"
                          >
                            Atualizar
                          </button>

                          {entry.file.webViewLink && (
                            <a
                              href={entry.file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Abrir ${entry.titulo} no Google Drive`}
                              className="p-1.5 text-slate-500 hover:text-slate-900"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setPendingAction({ type: 'trash_db', entry })
                            }
                            disabled={busyAction}
                            aria-label={`Mover ${entry.titulo} para a lixeira`}
                            className="p-1.5 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Proteção Local (IndexedDB + localStorage) */}
      {renderLocalProtectionCard()}

      {/* Card: Exportar Minuta Atual como Google Docs / PDF / DOCX */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Exportar documento oficial para o Google Drive
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Gera e envia versão formatada em Google Docs, PDF, DOCX ou arquivo
            editável avulso
          </p>
        </div>

        <form
          onSubmit={handleSaveNewToDrive}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Origem
            </label>
            <select
              value={saveSource}
              onChange={(e) => setSaveSource(e.target.value as SaveSource)}
              className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
            >
              <option value="editor">
                Editor ({doc.tipo} nº {doc.numero || '___'})
              </option>
              <option value="ajuste">
                Ato Alterador ({altMeta.atoAlteradorTipo} nº{' '}
                {altMeta.atoAlteradorNumero || '___'})
              </option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Formato no Drive
            </label>
            <select
              value={saveFormat}
              onChange={(e) => setSaveFormat(e.target.value as SaveFormat)}
              className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
            >
              <option value="gdoc">Google Docs (editável)</option>
              <option value="pdf">PDF Oficial (.pdf)</option>
              <option value="docx">Word Oficial (.docx)</option>
              {saveSource === 'editor' && (
                <option value="json">Projeto Norma (.norma.json)</option>
              )}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nome do arquivo
            </label>
            <input
              type="text"
              value={fileNameInput}
              onChange={(e) => setFileNameInput(e.target.value)}
              required
              className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={busyAction}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
            >
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span>{busyAction ? 'Enviando...' : 'Enviar'}</span>
            </button>
          </div>

          {saveSource === 'editor' && (
            <div className="md:col-span-12 pt-1 space-y-1.5">
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={exportIntoMinutaFolder}
                  onChange={(e) => setExportIntoMinutaFolder(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span>
                  Organizar dentro da pasta da minuta (
                  <span className="font-mono text-[11px]">
                    {DRIVE_DB_FOLDER_NAME} / {minutaFolderLabel}
                  </span>
                  )
                </span>
              </label>

              {validDocImagesCount > 0 && (
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={syncImagesOnSave}
                    onChange={(e) => setSyncImagesOnSave(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>
                    Salvar também as <strong>{validDocImagesCount}</strong>{' '}
                    {validDocImagesCount === 1
                      ? 'imagem anexada'
                      : 'imagens anexadas'}{' '}
                    na subpasta{' '}
                    <span className="font-mono text-[11px]">
                      {imagesFolderLabel}
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
        </form>
      </section>

      {/* Card: Lista Geral de Arquivos no Google Drive */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar arquivos no Google Drive..."
              className="w-full text-sm bg-slate-50 border border-slate-300 rounded-md pl-9 pr-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
              {(
                [
                  ['all', 'Todos'],
                  ['normas', 'Projetos (.json)'],
                  ['docs', 'Docs & PDFs'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    filter === key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={fetchFiles}
              disabled={loadingFiles}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`}
              />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loadingFiles ? (
            <div className="divide-y divide-slate-200">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 animate-pulse"
                >
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-4 bg-slate-100 rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">
                Nenhum arquivo encontrado no Google Drive
              </p>
              <p className="text-xs text-slate-500">
                Salve um documento acima ou ajuste o filtro de busca.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-5">Arquivo</th>
                  <th className="py-2.5 px-4">Tipo</th>
                  <th className="py-2.5 px-4">Atualizado em</th>
                  <th className="py-2.5 px-4 text-right">Tamanho</th>
                  <th className="py-2.5 px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {files.map((file) => {
                  const isNormaJson =
                    file.name.endsWith('.norma.json') ||
                    file.name.endsWith('.norma-db.json');
                  const isReadableText =
                    isNormaJson ||
                    file.mimeType === 'application/vnd.google-apps.document' ||
                    file.mimeType === 'text/plain';
                  const isOverwritable =
                    isNormaJson ||
                    file.mimeType === 'application/pdf' ||
                    file.mimeType ===
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

                  return (
                    <tr key={file.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-5 font-medium text-slate-900 max-w-xs truncate">
                        <div className="flex items-center gap-2 min-w-0">
                          {isNormaJson ? (
                            <FileCode2 className="w-4 h-4 text-slate-600 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <span className="truncate">{file.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatMimeLabel(file.mimeType, file.name)}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatDateBr(file.modifiedTime)}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-600 text-right whitespace-nowrap">
                        {formatBytes(file.size)}
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex items-center justify-end gap-2">
                          {isNormaJson && (
                            <button
                              type="button"
                              onClick={() => handleOpenProjectInEditor(file)}
                              disabled={busyAction}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded whitespace-nowrap"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              <span>Abrir</span>
                            </button>
                          )}

                          {isReadableText && !isNormaJson && (
                            <button
                              type="button"
                              onClick={() => handleAuditDriveFile(file)}
                              disabled={busyAction}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Auditar</span>
                            </button>
                          )}

                          {isOverwritable && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingAction({
                                  type: 'overwrite_general',
                                  file,
                                })
                              }
                              disabled={busyAction}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded whitespace-nowrap"
                            >
                              Substituir
                            </button>
                          )}

                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Abrir ${file.name} no Google Drive`}
                              className="p-1.5 text-slate-500 hover:text-slate-900"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setPendingAction({ type: 'trash_general', file })
                            }
                            disabled={busyAction}
                            aria-label={`Mover ${file.name} para a lixeira`}
                            className="p-1.5 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Modal de Confirmação Obrigatória */}
      {pendingAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="drive-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h3
                  id="drive-confirm-title"
                  className="text-base font-semibold text-slate-900"
                >
                  {pendingAction.type === 'trash_general' ||
                  pendingAction.type === 'trash_db'
                    ? 'Mover registro para a lixeira do Google Drive?'
                    : pendingAction.type === 'overwrite_general'
                      ? 'Sobrescrever arquivo existente no Google Drive?'
                      : pendingAction.type === 'update_db'
                        ? 'Atualizar registro existente no Banco do Drive?'
                        : pendingAction.type === 'restore_db'
                          ? 'Restaurar registro do Banco de Dados?'
                          : 'Restaurar ponto de recuperação local?'}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {pendingAction.type === 'trash_general'
                    ? `O arquivo "${pendingAction.file.name}" será enviado para a lixeira da sua conta do Google Drive.`
                    : pendingAction.type === 'trash_db'
                      ? `O registro "${pendingAction.entry.titulo}" (${pendingAction.entry.file.name}) será enviado para a lixeira da pasta ${DRIVE_DB_FOLDER_NAME}.`
                      : pendingAction.type === 'overwrite_general'
                        ? `O conteúdo atual do arquivo "${pendingAction.file.name}" será substituído pela versão em edição neste aplicativo.`
                        : pendingAction.type === 'update_db'
                          ? `O registro "${pendingAction.entry.titulo}" no Google Drive será atualizado com os dados atuais da sua área de trabalho.`
                          : pendingAction.type === 'restore_db'
                            ? `Os dados de "${pendingAction.record.titulo}" serão carregados na sua área de trabalho atual.`
                            : `O ponto local de ${formatDateBr(
                                pendingAction.snapshot.savedAt
                              )} será carregado na sua área de trabalho atual.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={busyAction}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPendingAction}
                disabled={busyAction}
                className={`px-4 py-2 text-xs font-medium text-white rounded-md whitespace-nowrap ${
                  pendingAction.type === 'trash_general' ||
                  pendingAction.type === 'trash_db'
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {busyAction
                  ? 'Processando...'
                  : pendingAction.type === 'trash_general' ||
                      pendingAction.type === 'trash_db'
                    ? 'Confirmar exclusão'
                    : pendingAction.type === 'restore_db' ||
                        pendingAction.type === 'restore_local'
                      ? 'Confirmar restauração'
                      : 'Confirmar atualização'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
