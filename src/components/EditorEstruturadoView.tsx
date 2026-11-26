import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCheck,
  Cloud,
  Columns2,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Eye,
  FileEdit,
  FolderOpen,
  HardDrive,
  Highlighter,
  History,
  ImagePlus,
  Loader2,
  LocateFixed,
  MessageSquareText,
  Plus,
  Printer,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  SpellCheck,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  ArtigoItem,
  LinguisticFinding,
  NormaDocument,
  NormaImagemItem,
  NormaRevision,
  NormaTipo,
  VigenciaTipo,
} from '../types/norma';
import { CloudNormaItem } from '../utils/cloudStorage';
import {
  LocalRecoveryPoint,
  StoredEditorMark,
  loadLocalEditorMarks,
  reconcileMarkOffset,
  saveLocalEditorMarks,
} from '../utils/localPersistence';
import {
  auditNormaText,
  formatArtigoNumero,
  formatParagrafoNumero,
  renderNormaPlainText,
  renderVigenciaClause,
  toLetter,
  toRoman,
} from '../utils/legistica';
import {
  ALL_NORMA_TIPOS,
  computeProgressiveStructure,
  formatNormaEpigrafe,
  formatPreambuloParts,
  getNormaSpec,
  isRegimentalWideEmenta,
  isTechnicalOperationalProfile,
} from '../utils/normaProfiles';
import {
  analyzeNormaLinguistics,
  applyAllAutoFixesToDoc,
  applyLinguisticFixToDoc,
  isPortugueseErrorFinding,
} from '../utils/revisorLinguistico';
import {
  FieldRequirementLevel,
  ValidatableDocFieldKey,
  validateNormaDocument,
} from '../utils/normaValidation';
import { buildComplianceChecklist } from '../utils/normaChecklist';
import { ChecklistConformidadePanel } from './ChecklistConformidadePanel';
import { generateIndiceRemissivo } from '../utils/indiceRemissivo';
import { IndiceRemissivoPanel } from './IndiceRemissivoPanel';
import { ArtigoDiffItem, FieldDiffItem } from '../utils/normaDiff';
import { NORMA_TEMPLATES } from '../data/templates';
import { useSpellcheck } from '../hooks/useSpellcheck';
import {
  processUploadedImageFile,
  snapLarguraMm,
} from '../utils/imageProcessing';
import {
  NormaImagemPreviewBlock,
  NormaImagensSection,
} from './NormaImagensSection';
import { NormaTipoSelect } from './NormaTipoSelect';
import {
  ReviewedInput,
  ReviewedTextarea,
  TextSelectionRange,
} from './ReviewedTextFields';
import {
  EmentaSuggestionResult,
  hasEmentaAnalysisContent,
  requestEmentaSuggestion,
} from '../utils/ementaAssistant';
import {
  DEFAULT_AI_MODEL_EMENTA,
  SelectableAiModelPresetId,
  getAiModelSpec,
} from '../utils/aiModels';
import { MotionConfig } from 'motion/react';
import {
  SortableDragHandleButton,
  SortableNormaGroup,
  SortableNormaItem,
} from './SortableNormaLists';
import {
  DivisionKind,
  ReorderDirection,
  buildDivisionGroupSlices,
  getSubdivisionMoveCapabilities,
  moveAlineaInArtigos,
  moveArrayItem,
  moveArtigoInList,
  moveDivisionGroupInArtigos,
  moveIncisoInArtigos,
  moveParagrafoAlineaInArtigos,
  moveParagrafoInArtigos,
  moveParagrafoIncisoInArtigos,
  moveSubdivisionBlockInArtigos,
  reorderAlineasInArtigos,
  reorderArtigosSubsetInList,
  reorderExplicitDivisionGroupsInArtigos,
  reorderIncisosInArtigos,
  reorderParagrafoAlineasInArtigos,
  reorderParagrafoIncisosInArtigos,
  reorderParagrafosInArtigos,
} from '../utils/normaReorder';
import {
  FieldReviewHints,
  HIGHLIGHT_MARK_COLORS,
  HIGHLIGHT_MARK_COLOR_ORDER,
  HighlightMarkColor,
  HighlightedLegalText,
  RevisorLinguisticoPanel,
} from './RevisorLinguisticoPanel';
import { HistoricoRevisoesPanel } from './HistoricoRevisoesPanel';
import { AuthErrorInfo, getAccessToken } from '../utils/googleAuth';
import {
  DRIVE_DB_FOLDER_NAME,
  SaveNormaCopyToDriveOptions,
  SaveNormaCopyToDriveResult,
  buildNormaFolderName,
  buildNormaImagesFolderName,
} from '../utils/driveDatabase';

interface EditorEstruturadoViewProps {
  doc: NormaDocument;
  onChange: (next: NormaDocument) => void;
  onAuditDraft: (plainText: string) => void;
  activeCloudNormaId: string;
  cloudNormas: CloudNormaItem[];
  localSnapshots: LocalRecoveryPoint[];
  cloudSyncStatus: 'idle' | 'saving' | 'synced' | 'error' | 'offline';
  cloudSyncError: string | null;
  onSaveNormaNow: () => Promise<void>;
  onSaveAsNewNorma: () => Promise<void>;
  onPrepareNewDraftSlot: () => Promise<void>;
  onSelectCloudNorma: (item: CloudNormaItem) => void;
  onDeleteCloudNorma: (normaId: string) => Promise<void>;
  onRestoreLocalSnapshot: (snap: LocalRecoveryPoint) => void;
  revisions: NormaRevision[];
  revisionsLoading: boolean;
  revisionsError: string | null;
  onCreateRevision: (titulo: string, observacao: string) => Promise<void>;
  onUpdateRevisionNote: (
    revisaoId: string,
    titulo: string,
    observacao: string
  ) => Promise<void>;
  onDeleteRevision: (revisaoId: string) => Promise<void>;
  onRestoreWholeRevision: (
    snapshotDoc: NormaDocument,
    sourceLabel: string
  ) => Promise<void>;
  needsDriveAuth: boolean;
  driveLoggingIn: boolean;
  driveAuthError: AuthErrorInfo | null;
  onConnectGoogleDrive: () => Promise<void>;
  onSaveNormaCopyToDrive: (
    options: Omit<SaveNormaCopyToDriveOptions, 'normaId' | 'doc' | 'savedByEmail'>
  ) => Promise<SaveNormaCopyToDriveResult>;
  aiModelEmenta?: SelectableAiModelPresetId;
  onOpenAccountAiSettings?: () => void;
}

type EditorLayoutMode = 'dividido' | 'editor' | 'previa';

const DIVISION_KIND_PLURAL: Record<DivisionKind, string> = {
  titulo: 'títulos',
  capitulo: 'capítulos',
  secao: 'seções',
  subsecao: 'subseções',
};

const DIVISION_KIND_SINGULAR: Record<DivisionKind, string> = {
  titulo: 'Título',
  capitulo: 'Capítulo',
  secao: 'Seção',
  subsecao: 'Subseção',
};

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDocFieldText(doc: NormaDocument, fieldKey: string): string | null {
  if (fieldKey === 'ementa') return doc.ementa;
  if (fieldKey === 'autoridade') return doc.autoridade;
  if (fieldKey === 'fundamentoLegal') return doc.fundamentoLegal;
  if (fieldKey === 'vigenciaData') return doc.vigenciaData;
  if (fieldKey === 'localAssinatura') return doc.localAssinatura;
  if (fieldKey.startsWith('revogacao:')) {
    const idx = Number(fieldKey.slice('revogacao:'.length));
    return Number.isInteger(idx) && idx >= 0 && idx < doc.revogacoes.length
      ? doc.revogacoes[idx]
      : null;
  }

  const parts = fieldKey.split(':');
  const kind = parts[0];
  const artId = parts[1];
  const art = doc.artigos.find((a) => a.id === artId);
  if (!art) return null;

  if (kind === 'titulo') return art.titulo ?? null;
  if (kind === 'capitulo') return art.capitulo ?? null;
  if (kind === 'secao') return art.secao ?? null;
  if (kind === 'subsecao') return art.subsecao ?? null;
  if (kind === 'caput') return art.caput;

  if (kind === 'inciso') {
    return art.incisos.find((i) => i.id === parts[2])?.texto ?? null;
  }
  if (kind === 'alinea') {
    const inc = art.incisos.find((i) => i.id === parts[2]);
    return inc?.alineas.find((al) => al.id === parts[3])?.texto ?? null;
  }
  if (kind === 'paragrafo') {
    return art.paragrafos.find((p) => p.id === parts[2])?.texto ?? null;
  }
  if (kind === 'par_inciso') {
    const par = art.paragrafos.find((p) => p.id === parts[2]);
    return par?.incisos?.find((i) => i.id === parts[3])?.texto ?? null;
  }
  if (kind === 'par_alinea') {
    const par = art.paragrafos.find((p) => p.id === parts[2]);
    const inc = par?.incisos?.find((i) => i.id === parts[3]);
    return inc?.alineas.find((al) => al.id === parts[4])?.texto ?? null;
  }
  return null;
}

const IGNORED_SIGNATURES_STORAGE_KEY = 'norma_ignored_review_signatures_v1';
const MARK_COLOR_STORAGE_KEY = 'norma_editor_mark_color_v1';

function readStoredMarkColor(): HighlightMarkColor {
  if (typeof window === 'undefined') return 'yellow';
  try {
    const raw = window.localStorage.getItem(MARK_COLOR_STORAGE_KEY);
    if (
      raw &&
      (HIGHLIGHT_MARK_COLOR_ORDER as string[]).includes(raw)
    ) {
      return raw as HighlightMarkColor;
    }
    return 'yellow';
  } catch {
    return 'yellow';
  }
}

function writeStoredMarkColor(color: HighlightMarkColor): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MARK_COLOR_STORAGE_KEY, color);
  } catch {
    // Ignora falha de armazenamento em modo privado/restrito
  }
}

function readStoredIgnoredSignatures(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(IGNORED_SIGNATURES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((s): s is string => typeof s === 'string' && s.length > 0)
    );
  } catch {
    return new Set();
  }
}

function writeStoredIgnoredSignatures(sigs: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      IGNORED_SIGNATURES_STORAGE_KEY,
      JSON.stringify(Array.from(sigs))
    );
  } catch {
    // Ignora falha de armazenamento em modo privado/restrito
  }
}

export const EditorEstruturadoView: React.FC<EditorEstruturadoViewProps> = ({
  doc,
  onChange,
  onAuditDraft,
  activeCloudNormaId,
  cloudNormas,
  localSnapshots,
  cloudSyncStatus,
  cloudSyncError,
  onSaveNormaNow,
  onSaveAsNewNorma,
  onPrepareNewDraftSlot,
  onSelectCloudNorma,
  onDeleteCloudNorma,
  onRestoreLocalSnapshot,
  revisions,
  revisionsLoading,
  revisionsError,
  onCreateRevision,
  onUpdateRevisionNote,
  onDeleteRevision,
  onRestoreWholeRevision,
  needsDriveAuth,
  driveLoggingIn,
  driveAuthError,
  onConnectGoogleDrive,
  onSaveNormaCopyToDrive,
  aiModelEmenta = DEFAULT_AI_MODEL_EMENTA,
  onOpenAccountAiSettings,
}) => {
  const [copied, setCopied] = useState(false);
  const [layoutMode, setLayoutMode] = useState<EditorLayoutMode>('dividido');
  const [rightPaneMode, setRightPaneMode] = useState<
    'previa' | 'checklist' | 'indice' | 'revisor' | 'historico'
  >('previa');
  const [highlightReview, setHighlightReview] = useState(true);
  const [showInlineHints, setShowInlineHints] = useState(true);
  const [ignoredSignatures, setIgnoredSignatures] = useState<Set<string>>(() =>
    readStoredIgnoredSignatures()
  );
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [editorMarks, setEditorMarks] = useState<StoredEditorMark[]>(() =>
    loadLocalEditorMarks(activeCloudNormaId)
  );
  const [markColor, setMarkColor] = useState<HighlightMarkColor>(() =>
    readStoredMarkColor()
  );

  const handleSelectMarkColor = useCallback((color: HighlightMarkColor) => {
    setMarkColor(color);
    writeStoredMarkColor(color);
  }, []);

  const [collapsedTitulos, setCollapsedTitulos] = useState<
    Record<string, boolean>
  >({});
  const [collapsedSections, setCollapsedSections] = useState<{
    preliminar?: boolean;
    normativa?: boolean;
    final?: boolean;
    imagens?: boolean;
    observacoes?: boolean;
  }>({});
  const observacoesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const quickArtImageInputRef = useRef<HTMLInputElement | null>(null);
  const quickArtTargetIdRef = useRef<string | null>(null);
  const [quickImageError, setQuickImageError] = useState<string | null>(null);
  const [savedLibraryOpen, setSavedLibraryOpen] = useState(false);
  const [savingNow, setSavingNow] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saved' | 'cloned'>('idle');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [validationPanelOpen, setValidationPanelOpen] = useState(false);

  const [driveCopyModalOpen, setDriveCopyModalOpen] = useState(false);
  const [driveHasSessionToken, setDriveHasSessionToken] = useState(false);
  const [driveCopyIncludeDbRecord, setDriveCopyIncludeDbRecord] = useState(true);
  const [driveCopyIncludeDocx, setDriveCopyIncludeDocx] = useState(true);
  const [driveCopyIncludePdf, setDriveCopyIncludePdf] = useState(false);
  const [driveCopyIncludeImages, setDriveCopyIncludeImages] = useState(true);
  const [driveCopyBusy, setDriveCopyBusy] = useState(false);
  const [driveCopyError, setDriveCopyError] = useState<string | null>(null);
  const [driveCopyResult, setDriveCopyResult] =
    useState<SaveNormaCopyToDriveResult | null>(null);
  const [ementaAiLoading, setEmentaAiLoading] = useState(false);
  const [ementaAiError, setEmentaAiError] = useState<string | null>(null);
  const [ementaAiSuggestion, setEmentaAiSuggestion] =
    useState<EmentaSuggestionResult | null>(null);
  const ementaAiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    ementaAiAbortRef.current?.abort();
    ementaAiAbortRef.current = null;
    setEmentaAiLoading(false);
    setEmentaAiError(null);
    setEmentaAiSuggestion(null);
  }, [doc.id]);

  useEffect(() => {
    return () => {
      ementaAiAbortRef.current?.abort();
    };
  }, []);

  const validImagesCount = useMemo(
    () =>
      (doc.imagens || []).filter(
        (img) =>
          typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/')
      ).length,
    [doc.imagens]
  );

  const minutaFolderPreviewName = useMemo(() => buildNormaFolderName(doc), [doc]);
  const imagesFolderPreviewName = useMemo(
    () => buildNormaImagesFolderName(doc),
    [doc]
  );

  const refreshDriveTokenAvailability = useCallback(async () => {
    const token = await getAccessToken();
    setDriveHasSessionToken(Boolean(token));
    return Boolean(token);
  }, []);

  useEffect(() => {
    if (driveCopyModalOpen) {
      void refreshDriveTokenAvailability();
    }
  }, [driveCopyModalOpen, needsDriveAuth, refreshDriveTokenAvailability]);

  const { spellChecker, addToDictionary, nativeFieldProps } = useSpellcheck();

  const activeSpec = useMemo(() => getNormaSpec(doc.tipo), [doc.tipo]);
  const isTech = isTechnicalOperationalProfile(doc.tipo);
  const isWideEmenta = isRegimentalWideEmenta(doc.tipo);
  const progressiveLayout = useMemo(
    () => (isTech ? computeProgressiveStructure(doc.artigos) : null),
    [isTech, doc.artigos]
  );
  const matchingTemplate = useMemo(
    () => NORMA_TEMPLATES.find((t) => t.tipo === doc.tipo) || null,
    [doc.tipo]
  );

  const plainText = useMemo(() => renderNormaPlainText(doc), [doc]);
  const audit = useMemo(
    () => auditNormaText(plainText, doc.tipo),
    [plainText, doc.tipo]
  );
  const fieldValidation = useMemo(() => validateNormaDocument(doc), [doc]);
  const complianceChecklist = useMemo(
    () => buildComplianceChecklist(doc, fieldValidation, audit),
    [doc, fieldValidation, audit]
  );
  const indiceRemissivo = useMemo(
    () => generateIndiceRemissivo(doc),
    [doc]
  );
  const review = useMemo(
    () => analyzeNormaLinguistics(doc, ignoredSignatures, spellChecker),
    [doc, ignoredSignatures, spellChecker]
  );

  // Na Prévia Oficial (texto base), destacam-se apenas erros reais em português
  // (ortografia e gramática) que não tenham sido ignorados pelo usuário.
  const previewFindingsByField = useMemo(() => {
    const map: Record<string, LinguisticFinding[]> = {};
    for (const [key, list] of Object.entries(review.byField)) {
      const filtered = list.filter(isPortugueseErrorFinding);
      if (filtered.length > 0) {
        map[key] = filtered;
      }
    }
    return map;
  }, [review.byField]);

  const previewCounts = useMemo(() => {
    let ortografia = 0;
    let gramatica = 0;
    for (const list of Object.values(previewFindingsByField)) {
      for (const f of list) {
        if (f.categoria === 'ortografia') ortografia++;
        else if (f.categoria === 'gramatica') gramatica++;
      }
    }
    return {
      ortografia,
      gramatica,
      total: ortografia + gramatica,
    };
  }, [previewFindingsByField]);

  const selectedFinding = useMemo(
    () => review.findings.find((f) => f.id === selectedFindingId) || null,
    [review.findings, selectedFindingId]
  );

  // Carrega marcações ao trocar de norma ativa
  useEffect(() => {
    setEditorMarks(loadLocalEditorMarks(activeCloudNormaId));
  }, [activeCloudNormaId]);

  // Mantém as marcações sincronizadas caso o usuário edite o texto ao redor
  useEffect(() => {
    setEditorMarks((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next: StoredEditorMark[] = [];
      for (const mark of prev) {
        const fieldText = getDocFieldText(doc, mark.fieldKey);
        if (fieldText === null) {
          changed = true;
          continue;
        }
        const reconciled = reconcileMarkOffset(fieldText, mark);
        if (!reconciled) {
          changed = true;
          continue;
        }
        if (
          reconciled.start !== mark.start ||
          reconciled.end !== mark.end
        ) {
          changed = true;
        }
        next.push(reconciled);
      }
      if (changed) {
        saveLocalEditorMarks(activeCloudNormaId, next);
        return next;
      }
      return prev;
    });
  }, [doc, activeCloudNormaId]);

  const marksByField = useMemo(() => {
    const map: Record<string, StoredEditorMark[]> = {};
    for (const mark of editorMarks) {
      if (!map[mark.fieldKey]) map[mark.fieldKey] = [];
      map[mark.fieldKey].push(mark);
    }
    return map;
  }, [editorMarks]);

  const updateMarksState = useCallback(
    (updater: (prev: StoredEditorMark[]) => StoredEditorMark[]) => {
      setEditorMarks((prev) => {
        const next = updater(prev);
        saveLocalEditorMarks(activeCloudNormaId, next);
        return next;
      });
    },
    [activeCloudNormaId]
  );

  const handleAddFieldMark = useCallback(
    (
      fieldKey: string,
      fieldLabel: string,
      range: TextSelectionRange,
      color: HighlightMarkColor
    ) => {
      if (range.end <= range.start || !range.text) return;
      updateMarksState((prev) => {
        const existingSame = prev.find(
          (m) =>
            m.fieldKey === fieldKey &&
            m.start === range.start &&
            m.end === range.end
        );
        if (existingSame) {
          return prev.map((m) =>
            m.id === existingSame.id ? { ...m, color, fieldLabel } : m
          );
        }
        const newMark: StoredEditorMark = {
          id: uid('mark'),
          fieldKey,
          fieldLabel,
          start: range.start,
          end: range.end,
          text: range.text,
          color,
          createdAt: new Date().toISOString(),
        };
        return [...prev, newMark];
      });
    },
    [updateMarksState]
  );

  const handleUpdateFieldMarkColor = useCallback(
    (markId: string, color: HighlightMarkColor) => {
      handleSelectMarkColor(color);
      updateMarksState((prev) =>
        prev.map((m) => (m.id === markId ? { ...m, color } : m))
      );
    },
    [handleSelectMarkColor, updateMarksState]
  );

  const handleRemoveFieldMark = useCallback(
    (markId: string) => {
      updateMarksState((prev) => prev.filter((m) => m.id !== markId));
    },
    [updateMarksState]
  );

  const handleClearAllFieldMarks = useCallback(() => {
    updateMarksState(() => []);
  }, [updateMarksState]);

  const handleOpenObservacoes = useCallback(() => {
    if (layoutMode === 'previa') {
      setLayoutMode('dividido');
    }
    setCollapsedSections((prev) => ({ ...prev, observacoes: false }));
    requestAnimationFrame(() => {
      const sec = document.getElementById('secao-observacoes-minuta');
      if (sec) {
        sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      observacoesTextareaRef.current?.focus();
    });
  }, [layoutMode]);

  const activeDivisionKind = useMemo<DivisionKind | null>(() => {
    if (doc.artigos.some((a) => a.titulo !== undefined)) return 'titulo';
    if (doc.artigos.some((a) => a.capitulo !== undefined)) return 'capitulo';
    if (doc.artigos.some((a) => a.secao !== undefined)) return 'secao';
    if (doc.artigos.some((a) => a.subsecao !== undefined)) return 'subsecao';
    return null;
  }, [doc.artigos]);

  const groupUiKeyMapRef = useRef<Record<string, string>>({});

  useEffect(() => {
    groupUiKeyMapRef.current = {};
  }, [doc.id]);

  const getStableGroupKey = useCallback(
    (leaderArtId: string) => groupUiKeyMapRef.current[leaderArtId] || leaderArtId,
    []
  );

  const divisionGroups = useMemo(
    () => buildDivisionGroupSlices(doc.artigos, activeDivisionKind),
    [doc.artigos, activeDivisionKind]
  );

  const hasDivisionsInDoc = activeDivisionKind !== null;

  const allDivisionsCollapsed = useMemo(
    () =>
      hasDivisionsInDoc &&
      divisionGroups.every((g) => Boolean(collapsedTitulos[g.key])),
    [hasDivisionsInDoc, divisionGroups, collapsedTitulos]
  );

  const fundamentoSpans = useMemo(() => {
    const spans: Array<{ text: string; offset: number }> = [];
    const regex = /[^\n]+/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(doc.fundamentoLegal)) !== null) {
      const trimmed = m[0].trim();
      if (!trimmed) continue;
      const leading = m[0].length - m[0].trimStart().length;
      spans.push({ text: trimmed, offset: m.index + leading });
    }
    return spans;
  }, [doc.fundamentoLegal]);

  const updateField = <K extends keyof NormaDocument>(
    key: K,
    value: NormaDocument[K]
  ) => {
    onChange({
      ...doc,
      [key]: value,
      updatedAt: new Date().toISOString(),
    });
  };

  const canSuggestEmenta = useMemo(
    () => hasEmentaAnalysisContent(doc),
    [doc]
  );

  const handleGenerateEmentaSuggestion = async () => {
    if (!canSuggestEmenta) {
      setEmentaAiError(
        `Redija ao menos um ${isTech ? 'item operacional' : 'artigo'} antes de solicitar a sugestão.`
      );
      return;
    }
    ementaAiAbortRef.current?.abort();
    const controller = new AbortController();
    ementaAiAbortRef.current = controller;
    setEmentaAiLoading(true);
    setEmentaAiError(null);

    try {
      const suggestion = await requestEmentaSuggestion(
        doc,
        aiModelEmenta,
        controller.signal
      );
      if (!controller.signal.aborted) {
        setEmentaAiSuggestion(suggestion);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const msg =
        error instanceof Error
          ? error.message
          : 'Não foi possível gerar a sugestão de ementa.';
      setEmentaAiError(msg);
    } finally {
      if (!controller.signal.aborted) {
        setEmentaAiLoading(false);
      }
    }
  };

  const handleApplyEmentaSuggestion = (texto: string) => {
    updateField('ementa', texto);
    setEmentaAiSuggestion(null);
    setEmentaAiError(null);
  };

  const handleTipoChange = (tipo: NormaTipo) => {
    const nextSpec = getNormaSpec(tipo);
    const allSpecs = ALL_NORMA_TIPOS.map((t) => getNormaSpec(t));
    const isDefaultAutoridade =
      !doc.autoridade.trim() ||
      allSpecs.some((s) => s.defaultAutoridade === doc.autoridade.trim());
    const isDefaultFundamento =
      !doc.fundamentoLegal.trim() ||
      allSpecs.some(
        (s) => s.defaultFundamentoLegal === doc.fundamentoLegal.trim()
      );
    const isDefaultEsfera =
      !doc.esfera.trim() ||
      doc.esfera.trim() === 'Administração Pública' ||
      doc.esfera.trim() === 'Executivo Municipal / Órgão Central';

    onChange({
      ...doc,
      tipo,
      ordemExecucao: nextSpec.defaultOrdemExecucao,
      autoridade: isDefaultAutoridade
        ? nextSpec.defaultAutoridade
        : doc.autoridade,
      fundamentoLegal: isDefaultFundamento
        ? nextSpec.defaultFundamentoLegal
        : doc.fundamentoLegal,
      esfera:
        nextSpec.profile === 'tecnico_operacional' && isDefaultEsfera
          ? 'Setor / Unidade Técnica Emitente'
          : doc.esfera,
      updatedAt: new Date().toISOString(),
    });
  };

  const getNextDivisionPrefix = (
    kind: 'titulo' | 'capitulo' | 'secao' | 'subsecao',
    upToIndex: number
  ): string => {
    if (isTech) {
      return '';
    }
    const lastIdx = Math.min(upToIndex, doc.artigos.length - 1);
    let scopeStart = 0;

    if (kind !== 'titulo' && lastIdx >= 0) {
      for (let i = lastIdx; i >= 0; i--) {
        const a = doc.artigos[i];
        const hasTitulo =
          typeof a.titulo === 'string' && a.titulo.trim().length > 0;
        const hasCapitulo =
          typeof a.capitulo === 'string' && a.capitulo.trim().length > 0;
        const hasSecao =
          typeof a.secao === 'string' && a.secao.trim().length > 0;

        if (kind === 'capitulo' && hasTitulo) {
          scopeStart = i;
          break;
        }
        if (kind === 'secao' && (hasTitulo || hasCapitulo)) {
          scopeStart = i;
          break;
        }
        if (kind === 'subsecao' && (hasTitulo || hasCapitulo || hasSecao)) {
          scopeStart = i;
          break;
        }
      }
    }

    const existingCount =
      lastIdx >= scopeStart
        ? doc.artigos.slice(scopeStart, lastIdx + 1).filter((a) => {
            const val = a[kind];
            return typeof val === 'string' && val.trim().length > 0;
          }).length
        : 0;

    const roman = toRoman(existingCount + 1);
    switch (kind) {
      case 'titulo':
        return `TÍTULO ${roman} - `;
      case 'capitulo':
        return `CAPÍTULO ${roman} - `;
      case 'secao':
        return `SEÇÃO ${roman} - `;
      case 'subsecao':
        return `SUBSEÇÃO ${roman} - `;
    }
  };

  const addDivisionToArtigo = (
    artId: string,
    artIndex: number,
    kind: 'titulo' | 'capitulo' | 'secao' | 'subsecao'
  ) => {
    const prefix = getNextDivisionPrefix(kind, artIndex);
    const patch: Partial<ArtigoItem> = { [kind]: prefix };

    if (!isTech && kind === 'titulo') {
      const targetArt = doc.artigos.find((a) => a.id === artId);
      const priorHasCapitulos = doc.artigos
        .slice(0, artIndex)
        .some((a) => a.capitulo !== undefined);

      if (targetArt?.capitulo !== undefined) {
        const capText = targetArt.capitulo.trim();
        const capMatch = capText.match(
          /^CAP[ÍI]TULO\s+[IVXLCDM]+\s*(?:([-–])\s*(.*))?$/i
        );
        if (capMatch) {
          const suffix = capMatch[2]?.trim();
          patch.capitulo = suffix ? `CAPÍTULO I - ${suffix}` : 'CAPÍTULO I - ';
        }
      } else if (priorHasCapitulos) {
        patch.capitulo = 'CAPÍTULO I - ';
      }
    }

    updateArtigo(artId, patch);
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-review-field="${kind}:${CSS.escape(artId)}"] input`
      ) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(prefix.length, prefix.length);
      }
    });
  };

  const insertArtigoAt = (index: number, focusNewCaput = true) => {
    const novoId = uid('art');
    const novo: ArtigoItem = {
      id: novoId,
      caput: '',
      incisos: [],
      paragrafos: [],
    };
    const nextArtigos = [...doc.artigos];
    const safeIdx = Math.max(0, Math.min(index, nextArtigos.length));
    nextArtigos.splice(safeIdx, 0, novo);
    updateField('artigos', nextArtigos);

    if (focusNewCaput) {
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `[data-review-field="caput:${CSS.escape(novoId)}"] textarea`
        ) as HTMLTextAreaElement | null;
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      });
    }
  };

  const addArtigo = () => {
    insertArtigoAt(doc.artigos.length, true);
  };

  const addArtigoComTitulo = () => {
    const prefix = getNextDivisionPrefix('titulo', doc.artigos.length);
    const hasCapitulosNaNorma =
      !isTech && doc.artigos.some((a) => a.capitulo !== undefined);
    const novoId = uid('art');
    const novo: ArtigoItem = {
      id: novoId,
      titulo: prefix,
      ...(hasCapitulosNaNorma ? { capitulo: 'CAPÍTULO I - ' } : {}),
      caput: '',
      incisos: [],
      paragrafos: [],
    };
    setCollapsedTitulos((prev) => ({
      ...prev,
      [`divgrp-titulo-${novoId}`]: false,
    }));
    setCollapsedSections((prev) => ({ ...prev, normativa: false }));
    updateField('artigos', [...doc.artigos, novo]);
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-review-field="titulo:${CSS.escape(novoId)}"] input`
      ) as HTMLInputElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        el.setSelectionRange(prefix.length, prefix.length);
      }
    });
  };

  const toggleDivisionGroup = (groupKey: string) => {
    setCollapsedTitulos((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const toggleAllDivisionGroups = () => {
    const nextState = !allDivisionsCollapsed;
    const nextMap: Record<string, boolean> = {};
    for (const grp of divisionGroups) {
      nextMap[grp.key] = nextState;
    }
    setCollapsedTitulos(nextMap);
  };

  const toggleMainSection = (
    section: 'preliminar' | 'normativa' | 'final' | 'imagens' | 'observacoes'
  ) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const triggerQuickArticleImageUpload = (artId: string) => {
    setQuickImageError(null);
    quickArtTargetIdRef.current = artId;
    quickArtImageInputRef.current?.click();
  };

  const handleQuickArtigoImageSelect = async (files: FileList | null) => {
    const targetArtId = quickArtTargetIdRef.current;
    if (!files || files.length === 0 || !targetArtId) return;
    setQuickImageError(null);
    try {
      const existing = doc.imagens || [];
      const processed = await processUploadedImageFile(files[0], existing);
      const artIdx = doc.artigos.findIndex((a) => a.id === targetArtId);
      const artLabel =
        artIdx >= 0
          ? formatArtigoNumero(artIdx + 1, doc.artigos[artIdx].sufixo)
          : 'Artigo';
      const cleanName = files[0].name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim();

      const nextItem: NormaImagemItem = {
        id: uid('img'),
        titulo: cleanName
          ? `MODELO REFERENTE AO ${artLabel.toUpperCase()} — ${cleanName.toUpperCase()}`
          : '',
        legenda: '',
        dataUrl: processed.dataUrl,
        mimeType: processed.mimeType,
        widthPx: processed.widthPx,
        heightPx: processed.heightPx,
        larguraMm: snapLarguraMm(processed.suggestedLarguraMm),
        alinhamento: 'center',
        posicao: 'pos_artigo',
        artigoId: targetArtId,
      };
      updateField('imagens', [...existing, nextItem]);
      setCollapsedSections((prev) => ({ ...prev, imagens: false }));
      requestAnimationFrame(() => {
        document
          .getElementById('secao-imagens-norma')
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    } catch (err) {
      setQuickImageError(
        err instanceof Error
          ? err.message
          : 'Não foi possível inserir a imagem após o artigo.'
      );
    } finally {
      if (quickArtImageInputRef.current) {
        quickArtImageInputRef.current.value = '';
      }
      quickArtTargetIdRef.current = null;
    }
  };

  const updateArtigo = (artId: string, patch: Partial<ArtigoItem>) => {
    updateField(
      'artigos',
      doc.artigos.map((a) => (a.id === artId ? { ...a, ...patch } : a))
    );
  };

  const removeArtigo = (artId: string) => {
    if (doc.artigos.length <= 1) return;
    updateField(
      'artigos',
      doc.artigos.filter((a) => a.id !== artId)
    );
  };

  const addInciso = (artId: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              incisos: [...a.incisos, { id: uid('inc'), texto: '', alineas: [] }],
            }
          : a
      )
    );
  };

  const updateInciso = (artId: string, incId: string, texto: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              incisos: a.incisos.map((i) =>
                i.id === incId ? { ...i, texto } : i
              ),
            }
          : a
      )
    );
  };

  const removeInciso = (artId: string, incId: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? { ...a, incisos: a.incisos.filter((i) => i.id !== incId) }
          : a
      )
    );
  };

  const addAlinea = (artId: string, incId: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              incisos: a.incisos.map((i) =>
                i.id === incId
                  ? {
                      ...i,
                      alineas: [...i.alineas, { id: uid('al'), texto: '' }],
                    }
                  : i
              ),
            }
          : a
      )
    );
  };

  const updateAlinea = (
    artId: string,
    incId: string,
    alId: string,
    texto: string
  ) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              incisos: a.incisos.map((i) =>
                i.id === incId
                  ? {
                      ...i,
                      alineas: i.alineas.map((al) =>
                        al.id === alId ? { ...al, texto } : al
                      ),
                    }
                  : i
              ),
            }
          : a
      )
    );
  };

  const removeAlinea = (artId: string, incId: string, alId: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              incisos: a.incisos.map((i) =>
                i.id === incId
                  ? {
                      ...i,
                      alineas: i.alineas.filter((al) => al.id !== alId),
                    }
                  : i
              ),
            }
          : a
      )
    );
  };

  const addParagrafo = (artId: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              paragrafos: [...a.paragrafos, { id: uid('par'), texto: '' }],
            }
          : a
      )
    );
  };

  const updateParagrafo = (artId: string, parId: string, texto: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              paragrafos: a.paragrafos.map((p) =>
                p.id === parId ? { ...p, texto } : p
              ),
            }
          : a
      )
    );
  };

  const removeParagrafo = (artId: string, parId: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? { ...a, paragrafos: a.paragrafos.filter((p) => p.id !== parId) }
          : a
      )
    );
  };

  const addParagrafoInciso = (artId: string, parId: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              paragrafos: a.paragrafos.map((p) =>
                p.id === parId
                  ? {
                      ...p,
                      incisos: [
                        ...(p.incisos || []),
                        { id: uid('inc'), texto: '', alineas: [] },
                      ],
                    }
                  : p
              ),
            }
          : a
      )
    );
  };

  const updateParagrafoInciso = (
    artId: string,
    parId: string,
    incId: string,
    texto: string
  ) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              paragrafos: a.paragrafos.map((p) =>
                p.id === parId
                  ? {
                      ...p,
                      incisos: (p.incisos || []).map((i) =>
                        i.id === incId ? { ...i, texto } : i
                      ),
                    }
                  : p
              ),
            }
          : a
      )
    );
  };

  const removeParagrafoInciso = (
    artId: string,
    parId: string,
    incId: string
  ) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              paragrafos: a.paragrafos.map((p) =>
                p.id === parId
                  ? {
                      ...p,
                      incisos: (p.incisos || []).filter((i) => i.id !== incId),
                    }
                  : p
              ),
            }
          : a
      )
    );
  };

  const addParagrafoAlinea = (artId: string, parId: string, incId: string) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              paragrafos: a.paragrafos.map((p) =>
                p.id === parId
                  ? {
                      ...p,
                      incisos: (p.incisos || []).map((i) =>
                        i.id === incId
                          ? {
                              ...i,
                              alineas: [
                                ...i.alineas,
                                { id: uid('al'), texto: '' },
                              ],
                            }
                          : i
                      ),
                    }
                  : p
              ),
            }
          : a
      )
    );
  };

  const updateParagrafoAlinea = (
    artId: string,
    parId: string,
    incId: string,
    alId: string,
    texto: string
  ) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              paragrafos: a.paragrafos.map((p) =>
                p.id === parId
                  ? {
                      ...p,
                      incisos: (p.incisos || []).map((i) =>
                        i.id === incId
                          ? {
                              ...i,
                              alineas: i.alineas.map((al) =>
                                al.id === alId ? { ...al, texto } : al
                              ),
                            }
                          : i
                      ),
                    }
                  : p
              ),
            }
          : a
      )
    );
  };

  const removeParagrafoAlinea = (
    artId: string,
    parId: string,
    incId: string,
    alId: string
  ) => {
    updateField(
      'artigos',
      doc.artigos.map((a) =>
        a.id === artId
          ? {
              ...a,
              paragrafos: a.paragrafos.map((p) =>
                p.id === parId
                  ? {
                      ...p,
                      incisos: (p.incisos || []).map((i) =>
                        i.id === incId
                          ? {
                              ...i,
                              alineas: i.alineas.filter((al) => al.id !== alId),
                            }
                          : i
                      ),
                    }
                  : p
              ),
            }
          : a
      )
    );
  };

  const handleMoveDivisionGroup = (
    groupIndex: number,
    direction: ReorderDirection
  ) => {
    const nextArtigos = moveDivisionGroupInArtigos(
      doc.artigos,
      activeDivisionKind,
      groupIndex,
      direction,
      isTech
    );
    if (nextArtigos === doc.artigos) return;
    updateField('artigos', nextArtigos);
  };

  const handleMoveSubdivisionBlock = (
    artId: string,
    kind: DivisionKind,
    direction: ReorderDirection
  ) => {
    const oldGroups = buildDivisionGroupSlices(doc.artigos, activeDivisionKind);
    const nextArtigos = moveSubdivisionBlockInArtigos(
      doc.artigos,
      artId,
      kind,
      direction,
      isTech
    );
    if (nextArtigos === doc.artigos) return;
    if (activeDivisionKind) {
      const newGroups = buildDivisionGroupSlices(nextArtigos, activeDivisionKind);
      setCollapsedTitulos((prev) => {
        const next = { ...prev };
        for (let i = 0; i < Math.min(oldGroups.length, newGroups.length); i++) {
          const oldKey = oldGroups[i].key;
          const newKey = newGroups[i].key;
          if (oldKey !== newKey && oldKey in prev) {
            next[newKey] = prev[oldKey];
            delete next[oldKey];
          }
        }
        return next;
      });
    }
    updateField('artigos', nextArtigos);
  };

  const syncLeaderKeysAfterSwap = (
    swappedLeaderIds: Array<{ oldId: string; newId: string }>
  ) => {
    if (!activeDivisionKind || swappedLeaderIds.length === 0) return;
    const explicitLeaderSet = new Set(
      divisionGroups
        .filter((g) => g.hasExplicitDivision)
        .map((g) => g.leaderArtId)
    );
    const aliasSnapshot = { ...groupUiKeyMapRef.current };
    for (const { oldId, newId } of swappedLeaderIds) {
      if (!explicitLeaderSet.has(oldId)) continue;
      groupUiKeyMapRef.current[newId] = aliasSnapshot[oldId] || oldId;
      if (!swappedLeaderIds.some((s) => s.newId === oldId)) {
        delete groupUiKeyMapRef.current[oldId];
      }
    }
    setCollapsedTitulos((prev) => {
      const next = { ...prev };
      for (const { oldId, newId } of swappedLeaderIds) {
        const oldKey = `divgrp-${activeDivisionKind}-${oldId}`;
        const newKey = `divgrp-${activeDivisionKind}-${newId}`;
        if (oldKey in prev) {
          next[newKey] = prev[oldKey];
          if (!swappedLeaderIds.some((s) => s.newId === oldId)) {
            delete next[oldKey];
          }
        }
      }
      return next;
    });
  };

  const handleMoveArtigo = (
    artIndex: number,
    direction: ReorderDirection
  ) => {
    const { nextArtigos, swappedLeaderIds } = moveArtigoInList(
      doc.artigos,
      artIndex,
      direction
    );
    if (nextArtigos === doc.artigos) return;
    syncLeaderKeysAfterSwap(swappedLeaderIds);
    updateField('artigos', nextArtigos);
  };

  const handleReorderDivisionGroups = (reorderedStableKeys: string[]) => {
    const explicitGroups = divisionGroups.filter((g) => g.hasExplicitDivision);
    const keyToLeader = new Map(
      explicitGroups.map((g) => [getStableGroupKey(g.leaderArtId), g.leaderArtId])
    );
    const reorderedLeaderIds = reorderedStableKeys
      .map((k) => keyToLeader.get(k))
      .filter((id): id is string => Boolean(id));
    const nextArtigos = reorderExplicitDivisionGroupsInArtigos(
      doc.artigos,
      activeDivisionKind,
      reorderedLeaderIds,
      isTech
    );
    if (nextArtigos === doc.artigos) return;
    updateField('artigos', nextArtigos);
  };

  const handleReorderArtigosInGroup = (
    startIndex: number,
    endIndex: number,
    reorderedArtIds: string[]
  ) => {
    const { nextArtigos, swappedLeaderIds } = reorderArtigosSubsetInList(
      doc.artigos,
      startIndex,
      endIndex,
      reorderedArtIds
    );
    if (nextArtigos === doc.artigos) return;
    syncLeaderKeysAfterSwap(swappedLeaderIds);
    updateField('artigos', nextArtigos);
  };

  const handleMoveInciso = (
    artId: string,
    incisoIndex: number,
    direction: ReorderDirection
  ) => {
    updateField(
      'artigos',
      moveIncisoInArtigos(doc.artigos, artId, incisoIndex, direction)
    );
  };

  const handleReorderIncisos = (artId: string, reorderedIds: string[]) => {
    const nextArtigos = reorderIncisosInArtigos(doc.artigos, artId, reorderedIds);
    if (nextArtigos !== doc.artigos) updateField('artigos', nextArtigos);
  };

  const handleMoveAlinea = (
    artId: string,
    incId: string,
    alineaIndex: number,
    direction: ReorderDirection
  ) => {
    updateField(
      'artigos',
      moveAlineaInArtigos(doc.artigos, artId, incId, alineaIndex, direction)
    );
  };

  const handleReorderAlineas = (
    artId: string,
    incId: string,
    reorderedIds: string[]
  ) => {
    const nextArtigos = reorderAlineasInArtigos(
      doc.artigos,
      artId,
      incId,
      reorderedIds
    );
    if (nextArtigos !== doc.artigos) updateField('artigos', nextArtigos);
  };

  const handleMoveParagrafo = (
    artId: string,
    paragrafoIndex: number,
    direction: ReorderDirection
  ) => {
    updateField(
      'artigos',
      moveParagrafoInArtigos(doc.artigos, artId, paragrafoIndex, direction)
    );
  };

  const handleReorderParagrafos = (artId: string, reorderedIds: string[]) => {
    const nextArtigos = reorderParagrafosInArtigos(
      doc.artigos,
      artId,
      reorderedIds
    );
    if (nextArtigos !== doc.artigos) updateField('artigos', nextArtigos);
  };

  const handleMoveParagrafoInciso = (
    artId: string,
    parId: string,
    incisoIndex: number,
    direction: ReorderDirection
  ) => {
    updateField(
      'artigos',
      moveParagrafoIncisoInArtigos(
        doc.artigos,
        artId,
        parId,
        incisoIndex,
        direction
      )
    );
  };

  const handleReorderParagrafoIncisos = (
    artId: string,
    parId: string,
    reorderedIds: string[]
  ) => {
    const nextArtigos = reorderParagrafoIncisosInArtigos(
      doc.artigos,
      artId,
      parId,
      reorderedIds
    );
    if (nextArtigos !== doc.artigos) updateField('artigos', nextArtigos);
  };

  const handleMoveParagrafoAlinea = (
    artId: string,
    parId: string,
    incId: string,
    alineaIndex: number,
    direction: ReorderDirection
  ) => {
    updateField(
      'artigos',
      moveParagrafoAlineaInArtigos(
        doc.artigos,
        artId,
        parId,
        incId,
        alineaIndex,
        direction
      )
    );
  };

  const handleReorderParagrafoAlineas = (
    artId: string,
    parId: string,
    incId: string,
    reorderedIds: string[]
  ) => {
    const nextArtigos = reorderParagrafoAlineasInArtigos(
      doc.artigos,
      artId,
      parId,
      incId,
      reorderedIds
    );
    if (nextArtigos !== doc.artigos) updateField('artigos', nextArtigos);
  };

  const handleMoveRevogacao = (
    revIndex: number,
    direction: ReorderDirection
  ) => {
    updateField('revogacoes', moveArrayItem(doc.revogacoes, revIndex, direction));
  };

  const renderReorderStepper = ({
    canUp,
    canDown,
    onUp,
    onDown,
    upLabel,
    downLabel,
    groupLabel,
    compact = false,
  }: {
    canUp: boolean;
    canDown: boolean;
    onUp: () => void;
    onDown: () => void;
    upLabel: string;
    downLabel: string;
    groupLabel: string;
    compact?: boolean;
  }) => (
    <div
      className="inline-flex items-center border border-slate-200 rounded bg-white overflow-hidden shrink-0"
      role="group"
      aria-label={groupLabel}
    >
      <button
        type="button"
        onClick={onUp}
        disabled={!canUp}
        title={upLabel}
        aria-label={upLabel}
        className={`${
          compact ? 'p-1' : 'p-1.5'
        } text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors`}
      >
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
      <span className="w-px h-3.5 bg-slate-200" aria-hidden="true" />
      <button
        type="button"
        onClick={onDown}
        disabled={!canDown}
        title={downLabel}
        aria-label={downLabel}
        className={`${
          compact ? 'p-1' : 'p-1.5'
        } text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors`}
      >
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.tipo.toLowerCase().replace(/\s+/g, '-')}-${doc.numero || 'minuta'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadTemplate = async (templateId: string) => {
    const tpl = NORMA_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    await onPrepareNewDraftSlot();
    setCollapsedTitulos({});
    setCollapsedSections({});
    setSelectedFindingId(null);
    onChange({
      ...JSON.parse(JSON.stringify(tpl)),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleCreateBlank = async () => {
    await onPrepareNewDraftSlot();
    setCollapsedTitulos({});
    setCollapsedSections({});
    setSelectedFindingId(null);
    const spec = getNormaSpec(doc.tipo);
    const blankIsTech = spec.profile === 'tecnico_operacional';
    onChange({
      id: uid('doc'),
      tipo: doc.tipo,
      numero: blankIsTech
        ? `${spec.siglaCurta || 'DOC'}-001/2026`
        : '___',
      data: blankIsTech
        ? 'REVISÃO 00 — NOVEMBRO/2026'
        : 'DE 17 DE NOVEMBRO DE 2026',
      esfera: blankIsTech
        ? 'Setor / Unidade Técnica Emitente'
        : 'Administração Pública',
      autoridade: spec.defaultAutoridade,
      fundamentoLegal: spec.defaultFundamentoLegal,
      ementa: blankIsTech
        ? 'Padronizar e orientar a execução segura de [processo ou atividade] no âmbito de [setor].'
        : 'Dispõe sobre [objeto principal da norma].',
      ordemExecucao: spec.defaultOrdemExecucao,
      artigos: [
        {
          id: uid('art'),
          ...(blankIsTech
            ? { titulo: 'OBJETIVO E CAMPO DE APLICAÇÃO' }
            : { capitulo: 'CAPÍTULO I - DAS DISPOSIÇÕES GERAIS' }),
          caput: blankIsTech
            ? 'Este procedimento aplica-se a [setor, equipe ou etapa operacional] e estabelece os requisitos mínimos de execução.'
            : `${spec.vigenciaPronomePrefix} estabelece normas sobre [objeto] no âmbito de [órgão ou abrangência].`,
          incisos: [],
          paragrafos: [],
        },
      ],
      vigenciaTipo: 'imediata',
      vigenciaDias: 30,
      vigenciaData: '',
      revogacoes: [],
      localAssinatura: 'Local, em 17 de novembro de 2026.',
      assinante: '[NOME DO RESPONSÁVEL / AUTORIDADE]',
      cargoAssinante: blankIsTech ? 'Responsável Técnico' : 'Autoridade Competente',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleExplicitSave = async () => {
    if (savingNow) return;
    setSavingNow(true);
    try {
      await onSaveNormaNow();
      setSaveFeedback('saved');
      window.setTimeout(() => setSaveFeedback('idle'), 2400);
    } catch {
      setSaveFeedback('saved');
      window.setTimeout(() => setSaveFeedback('idle'), 2400);
    } finally {
      setSavingNow(false);
    }
  };

  const handleExplicitSaveAsNew = async () => {
    if (savingNow) return;
    setSavingNow(true);
    try {
      await onSaveAsNewNorma();
      setSaveFeedback('cloned');
      setSavedLibraryOpen(true);
      window.setTimeout(() => setSaveFeedback('idle'), 2600);
    } catch {
      // Erro de nuvem exibido pelo banner de sincronização; cópia local preservada
    } finally {
      setSavingNow(false);
    }
  };

  const handleDeleteSavedNorma = async (normaId: string) => {
    setDeletingId(normaId);
    try {
      await onDeleteCloudNorma(normaId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenDriveCopyModal = () => {
    setDriveCopyError(null);
    setDriveCopyResult(null);
    setDriveCopyModalOpen(true);
    void refreshDriveTokenAvailability();
  };

  const handleConnectDriveInModal = async () => {
    setDriveCopyError(null);
    await onConnectGoogleDrive();
    await refreshDriveTokenAvailability();
  };

  const handleConfirmSaveDriveCopy = async () => {
    if (driveCopyBusy) return;
    const hasAnyTarget =
      driveCopyIncludeDbRecord ||
      driveCopyIncludeDocx ||
      driveCopyIncludePdf ||
      (driveCopyIncludeImages && validImagesCount > 0);
    if (!hasAnyTarget) {
      setDriveCopyError(
        'Selecione pelo menos um arquivo ou pasta de imagens para enviar ao Google Drive.'
      );
      return;
    }

    setDriveCopyBusy(true);
    setDriveCopyError(null);
    try {
      const result = await onSaveNormaCopyToDrive({
        includeEditableRecord: driveCopyIncludeDbRecord,
        includeDocx: driveCopyIncludeDocx,
        includePdf: driveCopyIncludePdf,
        includeImagesFolder: driveCopyIncludeImages,
      });
      setDriveCopyResult(result);
    } catch (err) {
      await refreshDriveTokenAvailability();
      setDriveCopyError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar a cópia no Google Drive.'
      );
    } finally {
      setDriveCopyBusy(false);
    }
  };

  const formatSavedDate = (iso?: string): string => {
    if (!iso) return 'Agora';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleApplyReviewFix = (
    finding: LinguisticFinding,
    replacement?: string
  ) => {
    onChange(applyLinguisticFixToDoc(doc, finding, replacement));
    if (selectedFindingId === finding.id) {
      setSelectedFindingId(null);
    }
  };

  const handleApplyAllAutoFixes = () => {
    onChange(applyAllAutoFixesToDoc(doc, review.findings));
    setSelectedFindingId(null);
  };

  const handleIgnoreFinding = (finding: LinguisticFinding) => {
    setIgnoredSignatures((prev) => {
      const next = new Set(prev);
      next.add(finding.signature);
      writeStoredIgnoredSignatures(next);
      return next;
    });
    if (selectedFindingId === finding.id) {
      setSelectedFindingId(null);
    }
  };

  const handleRestoreIgnored = () => {
    const empty = new Set<string>();
    writeStoredIgnoredSignatures(empty);
    setIgnoredSignatures(empty);
  };

  const handleLocateField = (fieldKey: string) => {
    if (layoutMode === 'previa') {
      setLayoutMode('dividido');
    }

    if (
      fieldKey === 'numero' ||
      fieldKey === 'data' ||
      fieldKey === 'esfera' ||
      fieldKey === 'ementa' ||
      fieldKey === 'fundamentoLegal' ||
      fieldKey === 'autoridade' ||
      fieldKey === 'ordemExecucao'
    ) {
      setCollapsedSections((prev) => ({ ...prev, preliminar: false }));
    } else if (
      fieldKey.startsWith('revogacao:') ||
      fieldKey === 'vigencia' ||
      fieldKey === 'vigenciaData' ||
      fieldKey === 'localAssinatura' ||
      fieldKey === 'assinante' ||
      fieldKey === 'cargoAssinante'
    ) {
      setCollapsedSections((prev) => ({ ...prev, final: false }));
    } else {
      setCollapsedSections((prev) => ({ ...prev, normativa: false }));
      const parts = fieldKey.split(':');
      if (parts.length >= 2) {
        const targetArtId = parts[1];
        const targetGroup = divisionGroups.find((g) =>
          g.items.some((item) => item.art.id === targetArtId)
        );
        if (targetGroup && collapsedTitulos[targetGroup.key]) {
          setCollapsedTitulos((prev) => ({
            ...prev,
            [targetGroup.key]: false,
          }));
        }
      }
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = document.querySelector(
          `[data-review-field="${CSS.escape(fieldKey)}"]`
        );
        if (container) {
          container.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const input = container.querySelector('textarea, input, select') as
            | HTMLTextAreaElement
            | HTMLInputElement
            | HTMLSelectElement
            | null;
          if (input) {
            input.focus();
          }
        }
      });
    });
  };

  const handleOpenChecklist = () => {
    if (layoutMode === 'editor') {
      setLayoutMode('dividido');
    }
    setRightPaneMode('checklist');
  };

  const handleOpenIndice = () => {
    if (layoutMode === 'editor') {
      setLayoutMode('dividido');
    }
    setRightPaneMode('indice');
  };

  const handleOpenRevisor = () => {
    if (layoutMode === 'editor') {
      setLayoutMode('dividido');
    }
    setRightPaneMode('revisor');
  };

  const handleOpenHistorico = () => {
    if (layoutMode === 'editor') {
      setLayoutMode('dividido');
    }
    setRightPaneMode('historico');
  };

  const handleAddToObservacoes = useCallback(
    (rawText: string, fieldLabel?: string) => {
      const cleanText = rawText.replace(/\s+/g, ' ').trim();
      if (!cleanText) return;
      const prefix = fieldLabel ? `[${fieldLabel}] ` : '';
      const entry = `• ${prefix}"${cleanText}"`;
      const currentObs = (doc.observacoes || '').trim();
      if (currentObs.includes(entry)) return;
      const nextObs = (currentObs ? `${currentObs}\n${entry}` : entry).slice(
        0,
        4000
      );
      onChange({
        ...doc,
        observacoes: nextObs,
        updatedAt: new Date().toISOString(),
      });
    },
    [doc, onChange]
  );

  const handleSendAllMarksToObservacoes = useCallback(() => {
    if (editorMarks.length === 0) return;
    let nextObs = (doc.observacoes || '').trim();
    for (const m of editorMarks) {
      const cleanText = m.text.replace(/\s+/g, ' ').trim();
      if (!cleanText) continue;
      const entry = `• [${m.fieldLabel}] "${cleanText}"`;
      if (!nextObs.includes(entry)) {
        nextObs = nextObs ? `${nextObs}\n${entry}` : entry;
      }
    }
    onChange({
      ...doc,
      observacoes: nextObs.slice(0, 4000),
      updatedAt: new Date().toISOString(),
    });
    handleOpenObservacoes();
  }, [editorMarks, doc, onChange, handleOpenObservacoes]);

  const getFieldMarkProps = (fieldKey: string, fieldLabel: string) => ({
    fieldLabel,
    markedRanges: marksByField[fieldKey] || [],
    defaultMarkColor: markColor,
    onSelectMarkColor: handleSelectMarkColor,
    onAddMark: (range: TextSelectionRange, color: HighlightMarkColor) =>
      handleAddFieldMark(fieldKey, fieldLabel, range, color),
    onUpdateMarkColor: handleUpdateFieldMarkColor,
    onRemoveMark: handleRemoveFieldMark,
    onAddToObservacoes: handleAddToObservacoes,
    onOpenObservacoes: handleOpenObservacoes,
  });

  const handleRestoreSingleField = (
    fieldKey: FieldDiffItem['key'],
    snapshotDoc: NormaDocument
  ) => {
    const nowIso = new Date().toISOString();
    switch (fieldKey) {
      case 'epigrafe':
        onChange({
          ...doc,
          tipo: snapshotDoc.tipo,
          numero: snapshotDoc.numero,
          data: snapshotDoc.data,
          esfera: snapshotDoc.esfera,
          updatedAt: nowIso,
        });
        break;
      case 'ementa':
        onChange({ ...doc, ementa: snapshotDoc.ementa, updatedAt: nowIso });
        break;
      case 'autoridade':
        onChange({
          ...doc,
          autoridade: snapshotDoc.autoridade,
          updatedAt: nowIso,
        });
        break;
      case 'ordemExecucao':
        onChange({
          ...doc,
          ordemExecucao: snapshotDoc.ordemExecucao,
          updatedAt: nowIso,
        });
        break;
      case 'fundamentoLegal':
        onChange({
          ...doc,
          fundamentoLegal: snapshotDoc.fundamentoLegal,
          updatedAt: nowIso,
        });
        break;
      case 'vigencia':
        onChange({
          ...doc,
          vigenciaTipo: snapshotDoc.vigenciaTipo,
          vigenciaDias: snapshotDoc.vigenciaDias,
          vigenciaData: snapshotDoc.vigenciaData,
          updatedAt: nowIso,
        });
        break;
      case 'revogacoes':
        onChange({
          ...doc,
          revogacoes: snapshotDoc.revogacoes,
          updatedAt: nowIso,
        });
        break;
      case 'localAssinatura':
        onChange({
          ...doc,
          localAssinatura: snapshotDoc.localAssinatura,
          updatedAt: nowIso,
        });
        break;
      case 'assinante':
        onChange({
          ...doc,
          assinante: snapshotDoc.assinante,
          cargoAssinante: snapshotDoc.cargoAssinante,
          updatedAt: nowIso,
        });
        break;
      case 'observacoes':
        onChange({
          ...doc,
          observacoes: snapshotDoc.observacoes ?? '',
          updatedAt: nowIso,
        });
        break;
      default:
        break;
    }
  };

  const handleRestoreSingleArtigo = (artDiff: ArtigoDiffItem) => {
    const nowIso = new Date().toISOString();
    if (artDiff.status === 'removed' && artDiff.oldArt) {
      const cloned = JSON.parse(JSON.stringify(artDiff.oldArt)) as ArtigoItem;
      const nextArtigos = [...doc.artigos];
      const existingIdx = nextArtigos.findIndex((a) => a.id === cloned.id);
      if (existingIdx >= 0) {
        nextArtigos[existingIdx] = cloned;
      } else {
        const insertAt = Math.min(
          Math.max(0, artDiff.oldIndex ?? nextArtigos.length),
          nextArtigos.length
        );
        nextArtigos.splice(insertAt, 0, cloned);
      }
      onChange({ ...doc, artigos: nextArtigos, updatedAt: nowIso });
      return;
    }

    if (artDiff.status === 'added') {
      if (doc.artigos.length <= 1) return;
      const nextArtigos = doc.artigos.filter((a) => a.id !== artDiff.id);
      onChange({ ...doc, artigos: nextArtigos, updatedAt: nowIso });
      return;
    }

    if (artDiff.status === 'modified' && artDiff.oldArt) {
      const cloned = JSON.parse(JSON.stringify(artDiff.oldArt)) as ArtigoItem;
      const nextArtigos = doc.artigos.map((a) =>
        a.id === artDiff.id ? cloned : a
      );
      onChange({ ...doc, artigos: nextArtigos, updatedAt: nowIso });
    }
  };

  const renderRequirementTag = (field: ValidatableDocFieldKey) => {
    const req: FieldRequirementLevel = fieldValidation.rules[field].requirement;
    if (req === 'obrigatorio') {
      return (
        <span className="ml-1.5 text-[11px] font-medium text-slate-600">
          · Obrigatório
        </span>
      );
    }
    if (req === 'recomendado') {
      return (
        <span className="ml-1.5 text-[11px] font-normal text-slate-500">
          · Recomendado
        </span>
      );
    }
    return (
      <span className="ml-1.5 text-[11px] font-medium text-emerald-700">
        · Opcional em {doc.tipo}
      </span>
    );
  };

  const renderFieldValidationAlerts = (field: ValidatableDocFieldKey) => {
    const fieldIssues = (fieldValidation.issuesByField[field] || []).filter(
      (i) => i.severidade === 'erro' || i.severidade === 'alerta'
    );
    if (fieldIssues.length === 0) return null;
    return (
      <div className="space-y-1 mt-1">
        {fieldIssues.map((issue) => (
          <div
            key={issue.id}
            className={`px-2.5 py-1.5 rounded border text-[11px] leading-snug flex items-start gap-1.5 ${
              issue.severidade === 'erro'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{issue.mensagem}</span>{' '}
              <span className="opacity-90">{issue.sugestao}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const showEditor = layoutMode === 'dividido' || layoutMode === 'editor';
  const showPreview = layoutMode === 'dividido' || layoutMode === 'previa';

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Barra de Modelos, Salvamento, Acesso a Decretos Salvos e Auditoria */}
      <div className="no-print bg-white border border-slate-200 rounded-xl px-4 sm:px-5 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExplicitSave()}
              disabled={savingNow}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {saveFeedback === 'saved' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Save className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {savingNow
                  ? 'Salvando...'
                  : saveFeedback === 'saved'
                    ? cloudSyncStatus === 'error' ||
                      cloudSyncStatus === 'offline'
                      ? 'Salvo localmente'
                      : 'Minuta salva'
                    : 'Salvar minuta'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleExplicitSaveAsNew()}
              disabled={savingNow}
              title="Salva uma nova cópia separada desta minuta na nuvem"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {saveFeedback === 'cloned' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <CopyPlus className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {saveFeedback === 'cloned'
                  ? 'Nova cópia salva'
                  : 'Salvar como novo'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSavedLibraryOpen((prev) => !prev)}
              aria-expanded={savedLibraryOpen}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                savedLibraryOpen
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="tabular-nums">
                Minutas salvas ({cloudNormas.length})
              </span>
              {savedLibraryOpen ? (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenDriveCopyModal}
              title="Salvar uma cópia desta minuta no Google Drive com pasta dedicada e subpasta para imagens"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span>Cópia no Drive</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="template-select"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Modelo:
            </label>
            <select
              id="template-select"
              value=""
              onChange={(e) => {
                if (e.target.value) void handleLoadTemplate(e.target.value);
              }}
              className="text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 max-w-[230px] focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Selecionar modelo pronto...</option>
              {NORMA_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.tipo} nº {tpl.numero} — {tpl.ementa.slice(0, 36)}...
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void handleCreateBlank()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Nova minuta em branco</span>
            </button>
          </div>
        </div>

        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-md shrink-0">
            <button
              type="button"
              onClick={() => setLayoutMode('dividido')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                layoutMode === 'dividido'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>Dividido</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('editor')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                layoutMode === 'editor'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileEdit className="w-3.5 h-3.5" />
              <span>Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('previa')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                layoutMode === 'previa'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Prévia</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 tabular-nums">
            <span>
              {audit.totalArtigos}{' '}
              {isTech
                ? audit.totalArtigos === 1
                  ? 'item'
                  : 'itens'
                : audit.totalArtigos === 1
                  ? 'artigo'
                  : 'artigos'}
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setValidationPanelOpen((v) => !v)}
              aria-expanded={validationPanelOpen}
              title={`Verificar requisitos formais dos campos para ${doc.tipo}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                fieldValidation.erros > 0
                  ? 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100 font-medium'
                  : fieldValidation.alertas > 0
                    ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 font-medium'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 font-medium'
              }`}
            >
              {fieldValidation.erros === 0 && fieldValidation.alertas === 0 ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {fieldValidation.erros > 0
                  ? `${fieldValidation.erros} ${
                      fieldValidation.erros === 1
                        ? 'campo obrigatório pendente'
                        : 'campos obrigatórios pendentes'
                    }`
                  : fieldValidation.alertas > 0
                    ? `Campos ok (${fieldValidation.alertas} ${
                        fieldValidation.alertas === 1 ? 'alerta' : 'alertas'
                      })`
                    : 'Requisitos do tipo ok'}
              </span>
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={handleOpenRevisor}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                review.findings.length > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 font-medium'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 font-medium'
              }`}
            >
              <SpellCheck className="w-3.5 h-3.5 shrink-0" />
              <span>
                {review.findings.length === 0
                  ? 'Revisão ortográfica ok'
                  : `${review.findings.length} ${
                      review.findings.length === 1
                        ? 'apontamento linguístico'
                        : 'apontamentos linguísticos'
                    }`}
              </span>
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={handleOpenChecklist}
              title="Abrir Checklist de Conformidade (LC nº 95/1998)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                rightPaneMode === 'checklist'
                  ? 'bg-slate-900 border-slate-900 text-white font-medium'
                  : complianceChecklist.totalPendentes === 0 &&
                      complianceChecklist.totalParciais === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 font-medium'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 font-medium'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="tabular-nums">
                Checklist ({complianceChecklist.totalConformes}/
                {complianceChecklist.totalItems})
              </span>
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={handleOpenIndice}
              title="Gerar e consultar Índice Remissivo automático por assunto e artigo"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                rightPaneMode === 'indice'
                  ? 'bg-slate-900 border-slate-900 text-white font-medium'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 font-medium'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="tabular-nums">
                Índice ({indiceRemissivo.totalAssuntos})
              </span>
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={handleOpenHistorico}
              title="Abrir histórico de revisões, comparador de versões e caixa de observações"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                rightPaneMode === 'historico'
                  ? 'bg-slate-900 border-slate-900 text-white font-medium'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 font-medium'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span className="tabular-nums">
                Histórico ({revisions.length})
              </span>
            </button>
          </div>
        </div>

        {(cloudSyncStatus === 'error' || cloudSyncStatus === 'offline') &&
          cloudSyncError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-950 leading-relaxed">
              <div>
                <strong>
                  {cloudSyncStatus === 'offline'
                    ? 'Salvamento local ativo (aguardando internet):'
                    : 'Salvamento local ativo (sincronização automática pendente):'}
                </strong>{' '}
                {cloudSyncError} Enquanto isso, você pode continuar editando,
                exportar ou salvar uma cópia no Google Drive com pasta para
                imagens.
              </div>
            <button
              type="button"
              onClick={handleOpenDriveCopyModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-950 bg-white border border-amber-300 hover:bg-amber-100 rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span>Salvar cópia no Google Drive</span>
            </button>
          </div>
        )}
      </div>

      {validationPanelOpen && (
        <section className="no-print bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-slate-700 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Validação de Requisitos Formais — {doc.tipo}
                </h3>
                <p className="text-xs text-slate-500">
                  Referência normativa: {fieldValidation.normaRegente} ·{' '}
                  {fieldValidation.erros} erro(s) obrigatório(s),{' '}
                  {fieldValidation.alertas} alerta(s)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setValidationPanelOpen(false)}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded"
              aria-label="Fechar painel de validação formal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {(
                [
                  'numero',
                  'data',
                  'esfera',
                  'ementa',
                  'autoridade',
                  'fundamentoLegal',
                  'ordemExecucao',
                  'assinante',
                ] as ValidatableDocFieldKey[]
              ).map((fKey) => {
                const rule = fieldValidation.rules[fKey];
                const hasErr = (fieldValidation.issuesByField[fKey] || []).some(
                  (i) => i.severidade === 'erro'
                );
                const hasAlert = (
                  fieldValidation.issuesByField[fKey] || []
                ).some((i) => i.severidade === 'alerta');
                return (
                  <button
                    key={fKey}
                    type="button"
                    onClick={() => handleLocateField(fKey)}
                    className={`text-left px-3 py-2 rounded border transition-colors ${
                      hasErr
                        ? 'bg-red-50/70 border-red-200 text-red-950 hover:bg-red-50'
                        : hasAlert
                          ? 'bg-amber-50/70 border-amber-200 text-amber-950 hover:bg-amber-50'
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-medium truncate">{rule.label}</div>
                    <div className="text-[11px] opacity-80">
                      {rule.requirement === 'obrigatorio'
                        ? hasErr
                          ? 'Obrigatório (pendente)'
                          : 'Obrigatório (ok)'
                        : rule.requirement === 'recomendado'
                          ? 'Recomendado'
                          : 'Opcional neste tipo'}
                    </div>
                  </button>
                );
              })}
            </div>

            {fieldValidation.issues.length === 0 ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-md flex items-start gap-2.5 text-xs text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    Todos os requisitos formais de {doc.tipo} estão atendidos.
                  </div>
                  <p className="text-emerald-800 mt-0.5">
                    {fieldValidation.checksPassed.join(' · ')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-md overflow-hidden">
                {fieldValidation.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="px-4 py-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded font-semibold uppercase text-[10px] ${
                            issue.severidade === 'erro'
                              ? 'bg-red-100 text-red-800'
                              : issue.severidade === 'alerta'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {issue.severidade === 'erro'
                            ? 'Obrigatório / Erro'
                            : issue.severidade === 'alerta'
                              ? 'Alerta'
                              : 'Recomendação'}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {issue.fieldLabel}
                        </span>
                        <span className="text-slate-500">· {issue.regra}</span>
                      </div>
                      <p className="text-slate-800">{issue.mensagem}</p>
                      <p className="text-slate-500">{issue.sugestao}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLocateField(issue.fieldSelector)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                    >
                      <LocateFixed className="w-3.5 h-3.5" />
                      <span>Ir ao campo</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {savedLibraryOpen && (
        <section className="no-print bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-slate-700 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Leis, Decretos, Regimentos e Normas Salvos
                </h3>
                <p className="text-xs text-slate-500">
                  Troque de documento a qualquer momento ou recupere versões anteriores salvas automaticamente
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSavedLibraryOpen(false)}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded"
              aria-label="Fechar painel de minutas salvas"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {cloudSyncError && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-950">
              {cloudSyncError}
            </div>
          )}

          <div className="divide-y divide-slate-200">
            {cloudNormas.length === 0 ? (
              <div className="px-5 py-4 text-xs text-slate-500">
                Nenhuma minuta salva na nuvem ainda. Clique em <strong>Salvar minuta</strong> acima para gravar este documento.
              </div>
            ) : (
              cloudNormas.map((item) => {
                const isActive = item.id === activeCloudNormaId;
                const isConfirmingDelete = confirmDeleteId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isActive ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {item.titulo}
                        </span>
                        {isActive && (
                          <span className="text-[11px] font-semibold text-slate-700 shrink-0">
                            · Em edição
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {item.doc.artigos.length}{' '}
                        {item.doc.artigos.length === 1 ? 'dispositivo' : 'dispositivos'} · Atualizado em{' '}
                        {formatSavedDate(item.updatedAtIso)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectCloudNorma(item);
                            setSavedLibraryOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded whitespace-nowrap"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Abrir minuta</span>
                        </button>
                      )}
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => void handleDeleteSavedNorma(item.id)}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded whitespace-nowrap"
                          >
                            {deletingId === item.id ? 'Excluindo...' : 'Confirmar'}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded whitespace-nowrap"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          aria-label={`Excluir ${item.titulo}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {localSnapshots.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <History className="w-3.5 h-3.5 shrink-0" />
                <span>Histórico automático recente neste navegador</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {localSnapshots.slice(0, 6).map((snap) => (
                  <div
                    key={snap.id}
                    className="bg-white border border-slate-200 rounded-md px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 truncate">
                        {snap.label}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums truncate">
                        {snap.subLabel} · {formatSavedDate(snap.savedAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onRestoreLocalSnapshot(snap);
                        setSavedLibraryOpen(false);
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap shrink-0"
                    >
                      Restaurar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Área Principal */}
      <div
        className={
          layoutMode === 'dividido'
            ? 'grid grid-cols-1 lg:grid-cols-12 gap-5 xl:gap-6 items-start'
            : 'max-w-5xl mx-auto space-y-5'
        }
      >
        {/* Coluna Esquerda: Edição Estruturada */}
        {showEditor && (
          <div
            className={`no-print space-y-4 lg:space-y-5 ${
              layoutMode === 'dividido' ? 'lg:col-span-6' : ''
            }`}
          >
            {/* Barra de Marcação nas Caixas de Edição e Acesso às Observações */}
            <div className="bg-slate-50/80 border border-slate-200/90 rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 whitespace-nowrap">
                  <Highlighter className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>Marcação nas caixas:</span>
                </span>
                <div
                  role="group"
                  aria-label="Cor padrão da marcação nas caixas de edição"
                  className="inline-flex items-center gap-1.5"
                >
                  {HIGHLIGHT_MARK_COLOR_ORDER.map((colorKey) => {
                    const meta = HIGHLIGHT_MARK_COLORS[colorKey];
                    const isActive = markColor === colorKey;
                    return (
                      <button
                        key={colorKey}
                        type="button"
                        onClick={() => handleSelectMarkColor(colorKey)}
                        aria-label={`Cor de marcação: ${meta.label}`}
                        aria-pressed={isActive}
                        title={`Cor padrão: ${meta.label}`}
                        className={`w-4 h-4 rounded-xs border transition-transform ${meta.swatchClass} ${
                          isActive
                            ? 'ring-2 ring-slate-900 ring-offset-1 scale-105'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                      />
                    );
                  })}
                </div>
                <span className="font-medium text-slate-800 whitespace-nowrap">
                  {HIGHLIGHT_MARK_COLORS[markColor].label}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {editorMarks.length > 0 ? (
                  <>
                    <span className="text-slate-600 tabular-nums whitespace-nowrap">
                      {editorMarks.length}{' '}
                      {editorMarks.length === 1 ? 'marcação' : 'marcações'}
                    </span>
                    <button
                      type="button"
                      onClick={handleSendAllMarksToObservacoes}
                      className="text-xs font-medium text-slate-800 hover:text-slate-950 underline underline-offset-2 whitespace-nowrap"
                    >
                      Enviar às obs.
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllFieldMarks}
                      className="text-xs text-slate-500 hover:text-red-700 whitespace-nowrap"
                    >
                      Limpar
                    </button>
                    <span aria-hidden="true">·</span>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    Selecione texto em qualquer caixa para marcar
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleOpenObservacoes}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                >
                  <MessageSquareText className="w-3.5 h-3.5 shrink-0" />
                  <span className="tabular-nums">
                    Observações
                    {doc.observacoes?.trim()
                      ? ` (${
                          doc.observacoes
                            .trim()
                            .split('\n')
                            .filter((l) => l.trim()).length
                        })`
                      : ''}
                  </span>
                </button>
              </div>
            </div>

            {/* 1. Parte Preliminar / Identificação Técnica */}
            <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div
                className={`flex flex-wrap items-center justify-between gap-3 ${
                  collapsedSections.preliminar ? '' : 'border-b border-slate-200 pb-3'
                }`}
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {isTech
                      ? '1. Identificação Técnica e Escopo (ABNT NBR 6024)'
                      : '1. Parte Preliminar (Epígrafe, Ementa e Preâmbulo)'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isTech
                      ? 'Quadro técnico de controle, setor emitente, normas de referência e objetivo'
                      : 'Identificação oficial, resumo do objeto e competência jurídica'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleMainSection('preliminar')}
                  aria-expanded={!collapsedSections.preliminar}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  {collapsedSections.preliminar ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {collapsedSections.preliminar ? 'Expandir' : 'Recolher'}
                  </span>
                </button>
              </div>

              {!collapsedSections.preliminar && (
                <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Espécie / Tipo de Documento
                  </label>
                  <NormaTipoSelect value={doc.tipo} onChange={handleTipoChange} />
                </div>
                <div data-review-field="numero">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isTech ? 'Código / Número' : 'Número'}
                    {renderRequirementTag('numero')}
                  </label>
                  <input
                    type="text"
                    value={doc.numero}
                    onChange={(e) => updateField('numero', e.target.value)}
                    placeholder={isTech ? 'Ex.: IT-001/2026' : 'Ex.: 1.842'}
                    className={`w-full text-sm bg-white border rounded-md px-3 py-2 text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                      (fieldValidation.issuesByField.numero || []).some(
                        (i) => i.severidade === 'erro'
                      )
                        ? 'border-red-400'
                        : 'border-slate-300'
                    }`}
                  />
                  {renderFieldValidationAlerts('numero')}
                </div>
                <div data-review-field="data">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isTech ? 'Data / Revisão' : 'Data por Extenso'}
                    {renderRequirementTag('data')}
                  </label>
                  <input
                    type="text"
                    value={doc.data}
                    onChange={(e) => updateField('data', e.target.value)}
                    placeholder={
                      isTech
                        ? 'REVISÃO 00 — NOVEMBRO/2026'
                        : 'DE 17 DE NOVEMBRO DE 2026'
                    }
                    className={`w-full text-sm bg-white border rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                      (fieldValidation.issuesByField.data || []).some(
                        (i) => i.severidade === 'erro'
                      )
                        ? 'border-red-400'
                        : 'border-slate-300'
                    }`}
                  />
                  {renderFieldValidationAlerts('data')}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-900">
                    Padrão ativo: {activeSpec.normaRegente}
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    {activeSpec.resumoFormatacao}
                  </p>
                </div>
                {matchingTemplate && matchingTemplate.tipo !== 'Decreto' && (
                  <button
                    type="button"
                    onClick={() => void handleLoadTemplate(matchingTemplate.id)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                  >
                    Carregar modelo de {doc.tipo}
                  </button>
                )}
              </div>

              <div data-review-field="esfera">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isTech
                    ? 'Área / Setor Emitente (Quadro Técnico)'
                    : 'Esfera / Órgão Emitente'}
                  {renderRequirementTag('esfera')}
                </label>
                <input
                  type="text"
                  value={doc.esfera}
                  onChange={(e) => updateField('esfera', e.target.value)}
                  placeholder={
                    isTech
                      ? 'Ex.: Controle de Qualidade / Coordenação Técnica'
                      : 'Ex.: Executivo Municipal / Órgão Central / Conselho'
                  }
                  className={`w-full text-sm bg-white border rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                    (fieldValidation.issuesByField.esfera || []).some(
                      (i) => i.severidade === 'erro'
                    )
                      ? 'border-red-400'
                      : 'border-slate-300'
                  }`}
                />
                {renderFieldValidationAlerts('esfera')}
              </div>

              <div data-review-field="ementa" className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-700">
                    {isTech
                      ? 'Objetivo / Escopo (ABNT NBR 6024)'
                      : 'Ementa (Resumo objetivo do conteúdo — Art. 5º da LC 95/98)'}
                    {renderRequirementTag('ementa')}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-500">
                      Modelo:{' '}
                      <span className="font-medium text-slate-700">
                        {getAiModelSpec(aiModelEmenta).nome}
                      </span>
                      {onOpenAccountAiSettings && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            onClick={onOpenAccountAiSettings}
                            className="underline hover:text-slate-900"
                          >
                            Alterar
                          </button>
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleGenerateEmentaSuggestion()}
                      disabled={ementaAiLoading || !canSuggestEmenta}
                      title={
                        !canSuggestEmenta
                          ? `Preencha ao menos um ${isTech ? 'item operacional' : 'artigo'} para analisar o texto da norma`
                          : isTech
                            ? 'Analisar os itens da norma e sugerir Objetivo / Escopo com IA'
                            : 'Analisar os artigos da norma e sugerir ementa conforme a LC nº 95/1998'
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {ementaAiLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-700" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-slate-700" />
                      )}
                      {ementaAiLoading
                        ? 'Analisando artigos...'
                        : 'Sugerir ementa com IA'}
                    </button>
                  </div>
                </div>
                <ReviewedTextarea
                  rows={2}
                  value={doc.ementa}
                  onChange={(e) => updateField('ementa', e.target.value)}
                  findings={review.byField['ementa'] || []}
                  highlightEnabled={highlightReview}
                  {...getFieldMarkProps(
                    'ementa',
                    isTech ? 'Objetivo / Escopo' : 'Ementa'
                  )}
                  onApplyFix={handleApplyReviewFix}
                  onIgnoreFinding={handleIgnoreFinding}
                  onAddToDictionary={addToDictionary}
                  {...nativeFieldProps}
                />

                {ementaAiError && (
                  <div className="flex items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                      <span>{ementaAiError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmentaAiError(null)}
                      aria-label="Fechar aviso"
                      className="text-red-500 hover:text-red-800 p-0.5 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {ementaAiSuggestion && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                        <Sparkles className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                        <span>
                          {isTech
                            ? 'Sugestão de Objetivo / Escopo (ABNT NBR 6024)'
                            : 'Sugestão de Ementa conforme a LC nº 95/1998'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleGenerateEmentaSuggestion()}
                          disabled={ementaAiLoading}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Gerar novamente
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmentaAiSuggestion(null)}
                          aria-label="Fechar sugestão"
                          className="p-1 text-slate-500 hover:text-slate-900 rounded transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2.5">
                      <p className="text-sm text-slate-900 leading-relaxed font-medium">
                        {ementaAiSuggestion.ementaSugerida}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500">
                          Baseada em {doc.artigos.length}{' '}
                          {isTech
                            ? doc.artigos.length === 1
                              ? 'item operacional'
                              : 'itens operacionais'
                            : doc.artigos.length === 1
                              ? 'artigo analisado'
                              : 'artigos analisados'}
                          {ementaAiSuggestion.modeloUtilizado
                            ? ` · ${ementaAiSuggestion.modeloUtilizado}`
                            : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleApplyEmentaSuggestion(
                              ementaAiSuggestion.ementaSugerida
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Aplicar esta ementa
                        </button>
                      </div>
                    </div>

                    {ementaAiSuggestion.alternativas.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Variações alternativas (clique para aplicar)
                        </div>
                        <div className="space-y-1.5">
                          {ementaAiSuggestion.alternativas.map((alt, altIdx) => (
                            <button
                              key={`${altIdx}-${alt.slice(0, 20)}`}
                              type="button"
                              onClick={() => handleApplyEmentaSuggestion(alt)}
                              className="w-full text-left flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-100/60 px-2.5 py-2 text-xs text-slate-800 transition-colors"
                            >
                              <span className="leading-relaxed">{alt}</span>
                              <span className="text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0 mt-0.5">
                                Aplicar
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {ementaAiSuggestion.objetosIdentificados.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[11px] font-medium text-slate-600">
                          Núcleos identificados na norma:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {ementaAiSuggestion.objetosIdentificados.map((obj, idx) => (
                            <span
                              key={`${idx}-${obj}`}
                              className="inline-block px-2 py-0.5 text-[11px] text-slate-700 bg-white border border-slate-200 rounded"
                            >
                              {obj}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ementaAiSuggestion.observacaoLegistica && (
                      <p className="text-[11px] text-slate-600 leading-relaxed border-t border-slate-200 pt-2">
                        {ementaAiSuggestion.observacaoLegistica}
                      </p>
                    )}
                  </div>
                )}

                {renderFieldValidationAlerts('ementa')}
                {showInlineHints && (
                  <FieldReviewHints
                    findings={review.byField['ementa'] || []}
                    onApplyFix={handleApplyReviewFix}
                    onIgnore={handleIgnoreFinding}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div data-review-field="autoridade" className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    {isTech
                      ? 'Responsável Técnico / Aprovador'
                      : 'Autoridade Signatária (Preâmbulo)'}
                    {renderRequirementTag('autoridade')}
                  </label>
                  <ReviewedInput
                    type="text"
                    value={doc.autoridade}
                    onChange={(e) => updateField('autoridade', e.target.value)}
                    findings={review.byField['autoridade'] || []}
                    highlightEnabled={highlightReview}
                    {...getFieldMarkProps(
                      'autoridade',
                      isTech ? 'Responsável Técnico' : 'Autoridade Signatária'
                    )}
                    onApplyFix={handleApplyReviewFix}
                    onIgnoreFinding={handleIgnoreFinding}
                    onAddToDictionary={addToDictionary}
                    {...nativeFieldProps}
                    className={`w-full text-sm bg-white border rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                      (fieldValidation.issuesByField.autoridade || []).some(
                        (i) => i.severidade === 'erro'
                      )
                        ? 'border-red-400'
                        : 'border-slate-300'
                    }`}
                  />
                  {renderFieldValidationAlerts('autoridade')}
                  {showInlineHints && (
                    <FieldReviewHints
                      findings={review.byField['autoridade'] || []}
                      onApplyFix={handleApplyReviewFix}
                      onIgnore={handleIgnoreFinding}
                    />
                  )}
                </div>
                <div data-review-field="ordemExecucao">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    {isTech
                      ? 'Faixa de Aprovação / Destinação'
                      : 'Ordem de Execução / Sanção'}
                    {renderRequirementTag('ordemExecucao')}
                  </label>
                  <input
                    type="text"
                    value={doc.ordemExecucao}
                    onChange={(e) => updateField('ordemExecucao', e.target.value)}
                    {...nativeFieldProps}
                    className={`w-full text-sm bg-white border rounded-md px-3 py-2 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                      (fieldValidation.issuesByField.ordemExecucao || []).some(
                        (i) => i.severidade === 'erro'
                      )
                        ? 'border-red-400'
                        : 'border-slate-300'
                    }`}
                  />
                  {renderFieldValidationAlerts('ordemExecucao')}
                </div>
              </div>

              <div data-review-field="fundamentoLegal" className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  {isTech
                    ? 'Normas e Documentos de Referência (ABNT, ISO, legislação sanitária/técnica)'
                    : 'Fundamento Legal de Competência (use Enter para separar blocos ou CONSIDERANDOs)'}
                  {renderRequirementTag('fundamentoLegal')}
                </label>
                <ReviewedTextarea
                  rows={3}
                  value={doc.fundamentoLegal}
                  onChange={(e) => updateField('fundamentoLegal', e.target.value)}
                  findings={review.byField['fundamentoLegal'] || []}
                  highlightEnabled={highlightReview}
                  {...getFieldMarkProps(
                    'fundamentoLegal',
                    isTech
                      ? 'Normas de Referência'
                      : 'Preâmbulo / Fundamento Legal'
                  )}
                  onApplyFix={handleApplyReviewFix}
                  onIgnoreFinding={handleIgnoreFinding}
                  onAddToDictionary={addToDictionary}
                  {...nativeFieldProps}
                />
                {renderFieldValidationAlerts('fundamentoLegal')}
                {showInlineHints && (
                  <FieldReviewHints
                    findings={review.byField['fundamentoLegal'] || []}
                    onApplyFix={handleApplyReviewFix}
                    onIgnore={handleIgnoreFinding}
                  />
                )}
              </div>
                </>
              )}
            </section>

            {/* 2. Parte Normativa (Articulado ou Estrutura Progressiva) */}
            <section
              data-review-field="artigos"
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-5"
            >
              <div
                className={`flex flex-wrap items-center justify-between gap-3 ${
                  collapsedSections.normativa ? '' : 'border-b border-slate-200 pb-3'
                }`}
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {isTech
                      ? '2. Estrutura Técnica e Procedimentos (Numeração Progressiva 1., 1.1)'
                      : '2. Parte Normativa (Títulos, Capítulos, Seções e Artigos)'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isTech
                      ? 'Seções (1.), itens (1.1), subitens (1.1.1) e alíneas conforme ABNT NBR 6024'
                      : 'Numeração ordinal/cardinal e pontuação aplicadas automaticamente'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {hasDivisionsInDoc && !collapsedSections.normativa && (
                    <button
                      type="button"
                      onClick={toggleAllDivisionGroups}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      {allDivisionsCollapsed ? (
                        <ChevronsUpDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronsDownUp className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {allDivisionsCollapsed
                          ? `Expandir ${
                              isTech
                                ? 'seções'
                                : DIVISION_KIND_PLURAL[activeDivisionKind!]
                            }`
                          : `Recolher ${
                              isTech
                                ? 'seções'
                                : DIVISION_KIND_PLURAL[activeDivisionKind!]
                            }`}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={addArtigoComTitulo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isTech ? 'Nova Seção' : 'Novo Título'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={addArtigo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isTech ? 'Adicionar Item' : 'Adicionar Artigo'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMainSection('normativa')}
                    aria-expanded={!collapsedSections.normativa}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    {collapsedSections.normativa ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {collapsedSections.normativa ? 'Expandir' : 'Recolher'}
                    </span>
                  </button>
                </div>
              </div>

              {!collapsedSections.normativa && (
              <MotionConfig reducedMotion="user">
              <div className="space-y-5">
                {renderFieldValidationAlerts('artigos')}
                {(() => {
                  const renderArtigoCard = (
                    art: ArtigoItem,
                    aIdx: number,
                    localIdx: number,
                    groupLength: number
                  ) => {
                    const progLayout = progressiveLayout?.[aIdx] || null;
                    const artLabel = progLayout
                      ? progLayout.hasSections
                        ? `Item ${progLayout.itemLabel}`
                        : `Etapa ${progLayout.itemLabel}`
                      : formatArtigoNumero(aIdx + 1, art.sufixo);
                    const divisions: Array<{
                      kind: 'titulo' | 'capitulo' | 'secao' | 'subsecao';
                      label: string;
                      placeholder: string;
                      value: string | undefined;
                    }> = isTech
                      ? [
                          {
                            kind: 'titulo',
                            label: 'Seção',
                            placeholder: 'Ex.: OBJETIVO / PROCEDIMENTO OPERACIONAL',
                            value: art.titulo,
                          },
                          {
                            kind: 'capitulo',
                            label: 'Subseção',
                            placeholder: 'Ex.: PREPARAÇÃO E MATERIAIS NECESSÁRIOS',
                            value: art.capitulo,
                          },
                          {
                            kind: 'secao',
                            label: 'Tópico',
                            placeholder: 'Ex.: CONDIÇÕES DE SEGURANÇA',
                            value: art.secao,
                          },
                          {
                            kind: 'subsecao',
                            label: 'Subtópico',
                            placeholder: 'Ex.: Pontos críticos de controle',
                            value: art.subsecao,
                          },
                        ]
                      : [
                          {
                            kind: 'titulo',
                            label: 'Título',
                            placeholder: 'Ex.: TÍTULO I - DAS DISPOSIÇÕES GERAIS',
                            value: art.titulo,
                          },
                          {
                            kind: 'capitulo',
                            label: 'Capítulo',
                            placeholder: 'Ex.: CAPÍTULO I - DOS PRINCÍPIOS',
                            value: art.capitulo,
                          },
                          {
                            kind: 'secao',
                            label: 'Seção',
                            placeholder: 'Ex.: SEÇÃO I - DA COMPETÊNCIA',
                            value: art.secao,
                          },
                          {
                            kind: 'subsecao',
                            label: 'Subseção',
                            placeholder: 'Ex.: SUBSEÇÃO I - DOS PRAZOS',
                            value: art.subsecao,
                          },
                        ];

                    return (
                      <SortableNormaItem
                        key={art.id}
                        value={art.id}
                        canDrag={groupLength > 1}
                        className={
                          localIdx > 0
                            ? 'pt-5 border-t border-slate-200 space-y-3 bg-white'
                            : 'space-y-3 bg-white'
                        }
                        draggingClassName="rounded-lg ring-1 ring-slate-300 bg-white px-3 py-3"
                      >
                        {({ isDragging, startDrag }) => (
                          <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {groupLength > 1 && (
                            <SortableDragHandleButton
                              onPointerDown={startDrag}
                              isDragging={isDragging}
                              compact
                              label={`Arrastar para reordenar ${artLabel.replace(/\.$/, '')}`}
                            />
                          )}
                          <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 whitespace-nowrap shrink-0 mr-1">
                            {artLabel}
                          </span>
                          {art.titulo === undefined && (
                            <button
                              type="button"
                              onClick={() =>
                                addDivisionToArtigo(art.id, aIdx, 'titulo')
                              }
                              className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                            >
                              {isTech ? '+ Seção' : '+ Título'}
                            </button>
                          )}
                          {art.capitulo === undefined && (
                            <button
                              type="button"
                              onClick={() =>
                                addDivisionToArtigo(art.id, aIdx, 'capitulo')
                              }
                              className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                            >
                              {isTech ? '+ Subseção' : '+ Capítulo'}
                            </button>
                          )}
                          {art.secao === undefined && (
                            <button
                              type="button"
                              onClick={() =>
                                addDivisionToArtigo(art.id, aIdx, 'secao')
                              }
                              className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                            >
                              {isTech ? '+ Tópico' : '+ Seção'}
                            </button>
                          )}
                          {art.subsecao === undefined && (
                            <button
                              type="button"
                              onClick={() =>
                                addDivisionToArtigo(art.id, aIdx, 'subsecao')
                              }
                              className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                            >
                              {isTech ? '+ Subtópico' : '+ Subseção'}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {doc.artigos.length > 1 &&
                            renderReorderStepper({
                              canUp: aIdx > 0,
                              canDown: aIdx < doc.artigos.length - 1,
                              onUp: () => handleMoveArtigo(aIdx, 'up'),
                              onDown: () => handleMoveArtigo(aIdx, 'down'),
                              upLabel: `Subir ${artLabel.replace(/\.$/, '')}`,
                              downLabel: `Descer ${artLabel.replace(/\.$/, '')}`,
                              groupLabel: `Reordenar ${artLabel.replace(/\.$/, '')}`,
                              compact: true,
                            })}
                          <button
                            type="button"
                            onClick={() => removeArtigo(art.id)}
                            disabled={doc.artigos.length <= 1}
                            aria-label={`Remover ${artLabel}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 transition-colors shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Divisões hierárquicas (Título > Capítulo > Seção > Subseção) */}
                      {divisions.some((d) => d.value !== undefined) && (
                        <div className="space-y-2">
                          {divisions.map((div) => {
                            if (div.value === undefined) return null;
                            const fieldKey = `${div.kind}:${art.id}`;
                            return (
                              <div
                                key={div.kind}
                                data-review-field={fieldKey}
                                className="space-y-1.5"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-medium text-slate-500 w-18 whitespace-nowrap shrink-0">
                                    {div.label}
                                  </span>
                                  <ReviewedInput
                                    type="text"
                                    value={div.value}
                                    onChange={(e) =>
                                      updateArtigo(art.id, {
                                        [div.kind]: e.target.value,
                                      })
                                    }
                                    placeholder={div.placeholder}
                                    findings={review.byField[fieldKey] || []}
                                    highlightEnabled={highlightReview}
                                    {...getFieldMarkProps(
                                      fieldKey,
                                      `${div.label} (${artLabel.replace(/\.$/, '')})`
                                    )}
                                    onApplyFix={handleApplyReviewFix}
                                    onIgnoreFinding={handleIgnoreFinding}
                                    onAddToDictionary={addToDictionary}
                                    {...nativeFieldProps}
                                    className="text-xs font-medium bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-slate-800 flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-slate-900"
                                  />
                                  {div.kind !== activeDivisionKind &&
                                    (() => {
                                      const subCaps =
                                        getSubdivisionMoveCapabilities(
                                          doc.artigos,
                                          art.id,
                                          div.kind
                                        );
                                      if (
                                        !subCaps.canMoveUp &&
                                        !subCaps.canMoveDown
                                      ) {
                                        return null;
                                      }
                                      return renderReorderStepper({
                                        canUp: subCaps.canMoveUp,
                                        canDown: subCaps.canMoveDown,
                                        onUp: () =>
                                          handleMoveSubdivisionBlock(
                                            art.id,
                                            div.kind,
                                            'up'
                                          ),
                                        onDown: () =>
                                          handleMoveSubdivisionBlock(
                                            art.id,
                                            div.kind,
                                            'down'
                                          ),
                                        upLabel: `Subir ${div.label} inteiro (com seus dispositivos)`,
                                        downLabel: `Descer ${div.label} inteiro (com seus dispositivos)`,
                                        groupLabel: `Reordenar ${div.label}`,
                                        compact: true,
                                      });
                                    })()}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateArtigo(art.id, {
                                        [div.kind]: undefined,
                                      })
                                    }
                                    aria-label={`Remover ${div.label}`}
                                    title={`Remover ${div.label}`}
                                    className="p-1 text-slate-400 hover:text-red-600 shrink-0"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {showInlineHints && (
                                  <FieldReviewHints
                                    findings={review.byField[fieldKey] || []}
                                    onApplyFix={handleApplyReviewFix}
                                    onIgnore={handleIgnoreFinding}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div data-review-field={`caput:${art.id}`} className="space-y-1.5">
                        <ReviewedTextarea
                          rows={2}
                          value={art.caput}
                          onChange={(e) =>
                            updateArtigo(art.id, { caput: e.target.value })
                          }
                          placeholder={
                            isTech
                              ? 'Descrição da etapa, requisito técnico ou procedimento...'
                              : 'Redação do caput do artigo...'
                          }
                          findings={review.byField[`caput:${art.id}`] || []}
                          highlightEnabled={highlightReview}
                          {...getFieldMarkProps(
                            `caput:${art.id}`,
                            `${artLabel.replace(/\.$/, '')} (${isTech ? 'texto' : 'caput'})`
                          )}
                          onApplyFix={handleApplyReviewFix}
                          onIgnoreFinding={handleIgnoreFinding}
                          onAddToDictionary={addToDictionary}
                          {...nativeFieldProps}
                        />
                        {showInlineHints && (
                          <FieldReviewHints
                            findings={review.byField[`caput:${art.id}`] || []}
                            onApplyFix={handleApplyReviewFix}
                            onIgnore={handleIgnoreFinding}
                          />
                        )}
                      </div>

                      {/* Incisos / Alíneas */}
                      {art.incisos.length > 0 && (
                        <SortableNormaGroup
                          values={art.incisos.map((i) => i.id)}
                          onReorder={(ids) => handleReorderIncisos(art.id, ids)}
                          className="pl-3 sm:pl-4 space-y-3 border-l border-slate-200"
                        >
                          {art.incisos.map((inc, iIdx) => (
                            <SortableNormaItem
                              key={inc.id}
                              value={inc.id}
                              canDrag={art.incisos.length > 1}
                              className="space-y-2 bg-white"
                              draggingClassName="rounded-md ring-1 ring-slate-300 bg-white px-2 py-1.5"
                            >
                              {({ isDragging: isIncDragging, startDrag: startIncDrag }) => (
                                <>
                              <div
                                data-review-field={`inciso:${art.id}:${inc.id}`}
                                className="space-y-1.5"
                              >
                                <div className="flex items-start gap-2">
                                  {art.incisos.length > 1 && (
                                    <div className="pt-1">
                                      <SortableDragHandleButton
                                        onPointerDown={startIncDrag}
                                        isDragging={isIncDragging}
                                        compact
                                        label={
                                          isTech
                                            ? `Arrastar alínea ${toLetter(iIdx)})`
                                            : `Arrastar inciso ${toRoman(iIdx + 1)}`
                                        }
                                      />
                                    </div>
                                  )}
                                  <span className="font-mono text-xs font-medium text-slate-600 pt-2 min-w-10 whitespace-nowrap shrink-0">
                                    {isTech
                                      ? `${toLetter(iIdx)})`
                                      : `${toRoman(iIdx + 1)} -`}
                                  </span>
                                  <ReviewedTextarea
                                    rows={1}
                                    value={inc.texto}
                                    onChange={(e) =>
                                      updateInciso(art.id, inc.id, e.target.value)
                                    }
                                    placeholder={
                                      isTech
                                        ? 'Texto da alínea / requisito...'
                                        : 'Texto do inciso em minúscula inicial...'
                                    }
                                    findings={
                                      review.byField[`inciso:${art.id}:${inc.id}`] || []
                                    }
                                    highlightEnabled={highlightReview}
                                    {...getFieldMarkProps(
                                      `inciso:${art.id}:${inc.id}`,
                                      isTech
                                        ? `${artLabel.replace(/\.$/, '')}, alínea "${toLetter(iIdx)}"`
                                        : `${artLabel.replace(/\.$/, '')}, inciso ${toRoman(iIdx + 1)}`
                                    )}
                                    onApplyFix={handleApplyReviewFix}
                                    onIgnoreFinding={handleIgnoreFinding}
                                    onAddToDictionary={addToDictionary}
                                    wrapperClassName="flex-1 min-w-0"
                                    textStyleClassName="text-sm text-slate-900 leading-relaxed px-3 py-1.5"
                                    {...nativeFieldProps}
                                  />
                                  {art.incisos.length > 1 &&
                                    renderReorderStepper({
                                      canUp: iIdx > 0,
                                      canDown: iIdx < art.incisos.length - 1,
                                      onUp: () =>
                                        handleMoveInciso(art.id, iIdx, 'up'),
                                      onDown: () =>
                                        handleMoveInciso(art.id, iIdx, 'down'),
                                      upLabel: isTech
                                        ? `Subir alínea ${toLetter(iIdx)})`
                                        : `Subir inciso ${toRoman(iIdx + 1)}`,
                                      downLabel: isTech
                                        ? `Descer alínea ${toLetter(iIdx)})`
                                        : `Descer inciso ${toRoman(iIdx + 1)}`,
                                      groupLabel: isTech
                                        ? 'Reordenar alínea'
                                        : 'Reordenar inciso',
                                      compact: true,
                                    })}
                                  <button
                                    type="button"
                                    onClick={() => addAlinea(art.id, inc.id)}
                                    className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md whitespace-nowrap shrink-0"
                                  >
                                    {isTech ? '+ Marcador' : '+ Alínea'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeInciso(art.id, inc.id)}
                                    aria-label="Remover inciso"
                                    className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {showInlineHints && (
                                  <div className="pl-12">
                                    <FieldReviewHints
                                      findings={
                                        review.byField[
                                          `inciso:${art.id}:${inc.id}`
                                        ] || []
                                      }
                                      onApplyFix={handleApplyReviewFix}
                                      onIgnore={handleIgnoreFinding}
                                    />
                                  </div>
                                )}
                              </div>

                              {inc.alineas.length > 0 && (
                                <SortableNormaGroup
                                  values={inc.alineas.map((a) => a.id)}
                                  onReorder={(ids) =>
                                    handleReorderAlineas(art.id, inc.id, ids)
                                  }
                                  className="pl-10 space-y-1.5"
                                >
                                  {inc.alineas.map((al, alIdx) => (
                                    <SortableNormaItem
                                      key={al.id}
                                      value={al.id}
                                      canDrag={inc.alineas.length > 1}
                                      className="space-y-1 bg-white"
                                      draggingClassName="rounded ring-1 ring-slate-300 bg-white px-2 py-1"
                                    >
                                      {({
                                        isDragging: isAlDragging,
                                        startDrag: startAlDrag,
                                      }) => (
                                        <div
                                          data-review-field={`alinea:${art.id}:${inc.id}:${al.id}`}
                                          className="space-y-1"
                                        >
                                          <div className="flex items-start gap-2">
                                            {inc.alineas.length > 1 && (
                                              <div className="pt-0.5">
                                                <SortableDragHandleButton
                                                  onPointerDown={startAlDrag}
                                                  isDragging={isAlDragging}
                                                  compact
                                                  label={`Arrastar alínea ${toLetter(alIdx)})`}
                                                />
                                              </div>
                                            )}
                                            <span className="font-mono text-xs text-slate-500 pt-1.5 w-6 whitespace-nowrap shrink-0">
                                              {toLetter(alIdx)})
                                            </span>
                                            <ReviewedTextarea
                                              rows={1}
                                              value={al.texto}
                                              onChange={(e) =>
                                                updateAlinea(
                                                  art.id,
                                                  inc.id,
                                                  al.id,
                                                  e.target.value
                                                )
                                              }
                                              placeholder="Texto da alínea..."
                                              findings={
                                                review.byField[
                                                  `alinea:${art.id}:${inc.id}:${al.id}`
                                                ] || []
                                              }
                                              highlightEnabled={highlightReview}
                                              {...getFieldMarkProps(
                                                `alinea:${art.id}:${inc.id}:${al.id}`,
                                                `${artLabel.replace(/\.$/, '')}, inc. ${toRoman(iIdx + 1)}, alínea "${toLetter(alIdx)}"`
                                              )}
                                              onApplyFix={handleApplyReviewFix}
                                              onIgnoreFinding={handleIgnoreFinding}
                                              onAddToDictionary={addToDictionary}
                                              wrapperClassName="flex-1 min-w-0"
                                              textStyleClassName="text-xs text-slate-900 leading-relaxed px-2.5 py-1.5"
                                              {...nativeFieldProps}
                                            />
                                            {inc.alineas.length > 1 &&
                                              renderReorderStepper({
                                                canUp: alIdx > 0,
                                                canDown:
                                                  alIdx <
                                                  inc.alineas.length - 1,
                                                onUp: () =>
                                                  handleMoveAlinea(
                                                    art.id,
                                                    inc.id,
                                                    alIdx,
                                                    'up'
                                                  ),
                                                onDown: () =>
                                                  handleMoveAlinea(
                                                    art.id,
                                                    inc.id,
                                                    alIdx,
                                                    'down'
                                                  ),
                                                upLabel: `Subir alínea ${toLetter(alIdx)})`,
                                                downLabel: `Descer alínea ${toLetter(alIdx)})`,
                                                groupLabel: 'Reordenar alínea',
                                                compact: true,
                                              })}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removeAlinea(
                                                  art.id,
                                                  inc.id,
                                                  al.id
                                                )
                                              }
                                              aria-label="Remover alínea"
                                              className="p-1 text-slate-400 hover:text-red-600 shrink-0"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                          {showInlineHints && (
                                            <div className="pl-8">
                                              <FieldReviewHints
                                                findings={
                                                  review.byField[
                                                    `alinea:${art.id}:${inc.id}:${al.id}`
                                                  ] || []
                                                }
                                                onApplyFix={
                                                  handleApplyReviewFix
                                                }
                                                onIgnore={handleIgnoreFinding}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </SortableNormaItem>
                                  ))}
                                </SortableNormaGroup>
                              )}
                                </>
                              )}
                            </SortableNormaItem>
                          ))}
                        </SortableNormaGroup>
                      )}

                      {/* Parágrafos */}
                      {art.paragrafos.length > 0 && (
                        <SortableNormaGroup
                          values={art.paragrafos.map((p) => p.id)}
                          onReorder={(ids) =>
                            handleReorderParagrafos(art.id, ids)
                          }
                          className="pl-3 sm:pl-4 space-y-3 border-l border-slate-200"
                        >
                          {art.paragrafos.map((par, pIdx) => {
                            const parIncisos = par.incisos || [];
                            return (
                              <SortableNormaItem
                                key={par.id}
                                value={par.id}
                                canDrag={art.paragrafos.length > 1}
                                className="space-y-2 bg-white"
                                draggingClassName="rounded-md ring-1 ring-slate-300 bg-white px-2 py-1.5"
                              >
                                {({
                                  isDragging: isParDragging,
                                  startDrag: startParDrag,
                                }) => (
                                  <>
                                <div
                                  data-review-field={`paragrafo:${art.id}:${par.id}`}
                                  className="space-y-1.5"
                                >
                                  <div className="flex items-start gap-2">
                                    {art.paragrafos.length > 1 && (
                                      <div className="pt-1">
                                        <SortableDragHandleButton
                                          onPointerDown={startParDrag}
                                          isDragging={isParDragging}
                                          compact
                                          label={
                                            isTech
                                              ? 'Arrastar subitem'
                                              : 'Arrastar parágrafo'
                                          }
                                        />
                                      </div>
                                    )}
                                    <span className="font-mono text-xs font-medium text-slate-600 pt-2 w-28 whitespace-nowrap shrink-0">
                                      {isTech
                                        ? progLayout?.subItemLabels[pIdx] ||
                                          `${aIdx + 1}.${pIdx + 1}`
                                        : formatParagrafoNumero(
                                            pIdx,
                                            art.paragrafos.length,
                                            par.sufixo
                                          )}
                                    </span>
                                    <ReviewedTextarea
                                      rows={2}
                                      value={par.texto}
                                      onChange={(e) =>
                                        updateParagrafo(
                                          art.id,
                                          par.id,
                                          e.target.value
                                        )
                                      }
                                      placeholder={
                                        isTech
                                          ? 'Texto do subitem...'
                                          : 'Texto do parágrafo...'
                                      }
                                      findings={
                                        review.byField[
                                          `paragrafo:${art.id}:${par.id}`
                                        ] || []
                                      }
                                      highlightEnabled={highlightReview}
                                      {...getFieldMarkProps(
                                        `paragrafo:${art.id}:${par.id}`,
                                        isTech
                                          ? `${artLabel.replace(/\.$/, '')}, subitem ${
                                              progLayout?.subItemLabels[pIdx] ||
                                              `${aIdx + 1}.${pIdx + 1}`
                                            }`
                                          : `${artLabel.replace(/\.$/, '')}, ${formatParagrafoNumero(
                                              pIdx,
                                              art.paragrafos.length,
                                              par.sufixo
                                            ).replace(/\.$/, '')}`
                                      )}
                                      onApplyFix={handleApplyReviewFix}
                                      onIgnoreFinding={handleIgnoreFinding}
                                      onAddToDictionary={addToDictionary}
                                      wrapperClassName="flex-1 min-w-0"
                                      textStyleClassName="text-sm text-slate-900 leading-relaxed px-3 py-1.5"
                                      {...nativeFieldProps}
                                    />
                                    {art.paragrafos.length > 1 &&
                                      renderReorderStepper({
                                        canUp: pIdx > 0,
                                        canDown: pIdx < art.paragrafos.length - 1,
                                        onUp: () =>
                                          handleMoveParagrafo(
                                            art.id,
                                            pIdx,
                                            'up'
                                          ),
                                        onDown: () =>
                                          handleMoveParagrafo(
                                            art.id,
                                            pIdx,
                                            'down'
                                          ),
                                        upLabel: isTech
                                          ? 'Subir subitem'
                                          : 'Subir parágrafo',
                                        downLabel: isTech
                                          ? 'Descer subitem'
                                          : 'Descer parágrafo',
                                        groupLabel: isTech
                                          ? 'Reordenar subitem'
                                          : 'Reordenar parágrafo',
                                        compact: true,
                                      })}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        addParagrafoInciso(art.id, par.id)
                                      }
                                      title={
                                        isTech
                                          ? 'Adicionar alínea vinculada a este subitem'
                                          : 'Adicionar inciso vinculado a este parágrafo'
                                      }
                                      className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md whitespace-nowrap shrink-0"
                                    >
                                      {isTech ? '+ Alínea' : '+ Inciso'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeParagrafo(art.id, par.id)
                                      }
                                      aria-label="Remover parágrafo"
                                      className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {showInlineHints && (
                                    <div className="pl-30">
                                      <FieldReviewHints
                                        findings={
                                          review.byField[
                                            `paragrafo:${art.id}:${par.id}`
                                          ] || []
                                        }
                                        onApplyFix={handleApplyReviewFix}
                                        onIgnore={handleIgnoreFinding}
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Incisos vinculados a este parágrafo */}
                                {parIncisos.length > 0 && (
                                  <SortableNormaGroup
                                    values={parIncisos.map((i) => i.id)}
                                    onReorder={(ids) =>
                                      handleReorderParagrafoIncisos(
                                        art.id,
                                        par.id,
                                        ids
                                      )
                                    }
                                    className="pl-6 sm:pl-8 space-y-2.5 border-l border-slate-200"
                                  >
                                    {parIncisos.map((inc, iIdx) => (
                                      <SortableNormaItem
                                        key={inc.id}
                                        value={inc.id}
                                        canDrag={parIncisos.length > 1}
                                        className="space-y-2 bg-white"
                                        draggingClassName="rounded-md ring-1 ring-slate-300 bg-white px-2 py-1.5"
                                      >
                                        {({
                                          isDragging: isParIncDragging,
                                          startDrag: startParIncDrag,
                                        }) => (
                                          <>
                                        <div
                                          data-review-field={`par_inciso:${art.id}:${par.id}:${inc.id}`}
                                          className="space-y-1.5"
                                        >
                                          <div className="flex items-start gap-2">
                                            {parIncisos.length > 1 && (
                                              <div className="pt-1">
                                                <SortableDragHandleButton
                                                  onPointerDown={startParIncDrag}
                                                  isDragging={isParIncDragging}
                                                  compact
                                                  label={`Arrastar inciso ${toRoman(iIdx + 1)}`}
                                                />
                                              </div>
                                            )}
                                            <span className="font-mono text-xs font-medium text-slate-600 pt-2 min-w-10 whitespace-nowrap shrink-0">
                                              {toRoman(iIdx + 1)} -
                                            </span>
                                            <ReviewedTextarea
                                              rows={1}
                                              value={inc.texto}
                                              onChange={(e) =>
                                                updateParagrafoInciso(
                                                  art.id,
                                                  par.id,
                                                  inc.id,
                                                  e.target.value
                                                )
                                              }
                                              placeholder="Texto do inciso do parágrafo (em minúscula inicial)..."
                                              findings={
                                                review.byField[
                                                  `par_inciso:${art.id}:${par.id}:${inc.id}`
                                                ] || []
                                              }
                                              highlightEnabled={highlightReview}
                                              {...getFieldMarkProps(
                                                `par_inciso:${art.id}:${par.id}:${inc.id}`,
                                                `${artLabel.replace(/\.$/, '')}, ${formatParagrafoNumero(
                                                  pIdx,
                                                  art.paragrafos.length,
                                                  par.sufixo
                                                ).replace(/\.$/, '')}, inc. ${toRoman(iIdx + 1)}`
                                              )}
                                              onApplyFix={handleApplyReviewFix}
                                              onIgnoreFinding={handleIgnoreFinding}
                                              onAddToDictionary={addToDictionary}
                                              wrapperClassName="flex-1 min-w-0"
                                              textStyleClassName="text-sm text-slate-900 leading-relaxed px-3 py-1.5"
                                              {...nativeFieldProps}
                                            />
                                            {parIncisos.length > 1 &&
                                              renderReorderStepper({
                                                canUp: iIdx > 0,
                                                canDown:
                                                  iIdx < parIncisos.length - 1,
                                                onUp: () =>
                                                  handleMoveParagrafoInciso(
                                                    art.id,
                                                    par.id,
                                                    iIdx,
                                                    'up'
                                                  ),
                                                onDown: () =>
                                                  handleMoveParagrafoInciso(
                                                    art.id,
                                                    par.id,
                                                    iIdx,
                                                    'down'
                                                  ),
                                                upLabel: `Subir inciso ${toRoman(iIdx + 1)}`,
                                                downLabel: `Descer inciso ${toRoman(iIdx + 1)}`,
                                                groupLabel:
                                                  'Reordenar inciso do parágrafo',
                                                compact: true,
                                              })}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                addParagrafoAlinea(
                                                  art.id,
                                                  par.id,
                                                  inc.id
                                                )
                                              }
                                              className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md whitespace-nowrap shrink-0"
                                            >
                                              + Alínea
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removeParagrafoInciso(
                                                  art.id,
                                                  par.id,
                                                  inc.id
                                                )
                                              }
                                              aria-label="Remover inciso do parágrafo"
                                              className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                          {showInlineHints && (
                                            <div className="pl-12">
                                              <FieldReviewHints
                                                findings={
                                                  review.byField[
                                                    `par_inciso:${art.id}:${par.id}:${inc.id}`
                                                  ] || []
                                                }
                                                onApplyFix={handleApplyReviewFix}
                                                onIgnore={handleIgnoreFinding}
                                              />
                                            </div>
                                          )}
                                        </div>

                                        {inc.alineas.length > 0 && (
                                          <SortableNormaGroup
                                            values={inc.alineas.map((a) => a.id)}
                                            onReorder={(ids) =>
                                              handleReorderParagrafoAlineas(
                                                art.id,
                                                par.id,
                                                inc.id,
                                                ids
                                              )
                                            }
                                            className="pl-10 space-y-1.5"
                                          >
                                            {inc.alineas.map((al, alIdx) => (
                                              <SortableNormaItem
                                                key={al.id}
                                                value={al.id}
                                                canDrag={inc.alineas.length > 1}
                                                className="space-y-1 bg-white"
                                                draggingClassName="rounded ring-1 ring-slate-300 bg-white px-2 py-1"
                                              >
                                                {({
                                                  isDragging: isParAlDragging,
                                                  startDrag: startParAlDrag,
                                                }) => (
                                                  <div
                                                    data-review-field={`par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`}
                                                    className="space-y-1"
                                                  >
                                                    <div className="flex items-start gap-2">
                                                      {inc.alineas.length > 1 && (
                                                        <div className="pt-0.5">
                                                          <SortableDragHandleButton
                                                            onPointerDown={
                                                              startParAlDrag
                                                            }
                                                            isDragging={
                                                              isParAlDragging
                                                            }
                                                            compact
                                                            label={`Arrastar alínea ${toLetter(alIdx)})`}
                                                          />
                                                        </div>
                                                      )}
                                                      <span className="font-mono text-xs text-slate-500 pt-1.5 w-6 whitespace-nowrap shrink-0">
                                                        {toLetter(alIdx)})
                                                      </span>
                                                      <ReviewedTextarea
                                                        rows={1}
                                                        value={al.texto}
                                                        onChange={(e) =>
                                                          updateParagrafoAlinea(
                                                            art.id,
                                                            par.id,
                                                            inc.id,
                                                            al.id,
                                                            e.target.value
                                                          )
                                                        }
                                                        placeholder="Texto da alínea..."
                                                        findings={
                                                          review.byField[
                                                            `par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`
                                                          ] || []
                                                        }
                                                        highlightEnabled={
                                                          highlightReview
                                                        }
                                                        {...getFieldMarkProps(
                                                          `par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`,
                                                          `${artLabel.replace(/\.$/, '')}, ${formatParagrafoNumero(
                                                            pIdx,
                                                            art.paragrafos.length,
                                                            par.sufixo
                                                          ).replace(/\.$/, '')}, alínea "${toLetter(alIdx)}"`
                                                        )}
                                                        onApplyFix={
                                                          handleApplyReviewFix
                                                        }
                                                        onIgnoreFinding={
                                                          handleIgnoreFinding
                                                        }
                                                        onAddToDictionary={
                                                          addToDictionary
                                                        }
                                                        wrapperClassName="flex-1 min-w-0"
                                                        textStyleClassName="text-xs text-slate-900 leading-relaxed px-2.5 py-1.5"
                                                        {...nativeFieldProps}
                                                      />
                                                      {inc.alineas.length > 1 &&
                                                        renderReorderStepper({
                                                          canUp: alIdx > 0,
                                                          canDown:
                                                            alIdx <
                                                            inc.alineas.length -
                                                              1,
                                                          onUp: () =>
                                                            handleMoveParagrafoAlinea(
                                                              art.id,
                                                              par.id,
                                                              inc.id,
                                                              alIdx,
                                                              'up'
                                                            ),
                                                          onDown: () =>
                                                            handleMoveParagrafoAlinea(
                                                              art.id,
                                                              par.id,
                                                              inc.id,
                                                              alIdx,
                                                              'down'
                                                            ),
                                                          upLabel: `Subir alínea ${toLetter(alIdx)})`,
                                                          downLabel: `Descer alínea ${toLetter(alIdx)})`,
                                                          groupLabel:
                                                            'Reordenar alínea do parágrafo',
                                                          compact: true,
                                                        })}
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          removeParagrafoAlinea(
                                                            art.id,
                                                            par.id,
                                                            inc.id,
                                                            al.id
                                                          )
                                                        }
                                                        aria-label="Remover alínea do parágrafo"
                                                        className="p-1 text-slate-400 hover:text-red-600 shrink-0"
                                                      >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                      </button>
                                                    </div>
                                                    {showInlineHints && (
                                                      <div className="pl-8">
                                                        <FieldReviewHints
                                                          findings={
                                                            review.byField[
                                                              `par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`
                                                            ] || []
                                                          }
                                                          onApplyFix={
                                                            handleApplyReviewFix
                                                          }
                                                          onIgnore={
                                                            handleIgnoreFinding
                                                          }
                                                        />
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </SortableNormaItem>
                                            ))}
                                          </SortableNormaGroup>
                                        )}
                                          </>
                                        )}
                                      </SortableNormaItem>
                                    ))}
                                  </SortableNormaGroup>
                                )}
                                  </>
                                )}
                              </SortableNormaItem>
                            );
                          })}
                        </SortableNormaGroup>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => addInciso(art.id)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                          >
                            {isTech
                              ? '+ Alínea (a, b)'
                              : '+ Inciso no caput (I, II)'}
                          </button>
                          <button
                            type="button"
                            onClick={() => addParagrafo(art.id)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                          >
                            {isTech ? '+ Subitem (1.1.1)' : '+ Parágrafo (§)'}
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerQuickArticleImageUpload(art.id)}
                            title="Inserir imagem, diagrama ou carimbo logo abaixo"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap"
                          >
                            <ImagePlus className="w-3 h-3" />
                            <span>Imagem após este</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => insertArtigoAt(aIdx + 1, true)}
                            title={
                              isTech
                                ? 'Inserir novo item técnico logo abaixo deste'
                                : 'Inserir novo artigo logo abaixo deste'
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap"
                          >
                            <Plus className="w-3 h-3" />
                            <span>{isTech ? 'Item após este' : 'Artigo após este'}</span>
                          </button>
                        </div>
                      </div>
                          </>
                        )}
                      </SortableNormaItem>
                    );
                  };

                  if (!hasDivisionsInDoc) {
                    const flatGroup = divisionGroups[0];
                    if (!flatGroup) return null;
                    return (
                      <SortableNormaGroup
                        values={flatGroup.items.map((item) => item.art.id)}
                        onReorder={(nextIds) =>
                          handleReorderArtigosInGroup(
                            flatGroup.startIndex,
                            flatGroup.endIndex,
                            nextIds
                          )
                        }
                        className="space-y-5"
                      >
                        {flatGroup.items.map((item, localIdx) =>
                          renderArtigoCard(
                            item.art,
                            item.globalIndex,
                            localIdx,
                            flatGroup.items.length
                          )
                        )}
                      </SortableNormaGroup>
                    );
                  }

                  const kindLabel = isTech
                    ? 'Seção'
                    : activeDivisionKind
                      ? DIVISION_KIND_SINGULAR[activeDivisionKind]
                      : 'Seção';

                  const leadingGroups = divisionGroups
                    .map((group, groupIdx) => ({ group, groupIdx }))
                    .filter(({ group }) => !group.hasExplicitDivision);
                  const explicitGroups = divisionGroups
                    .map((group, groupIdx) => ({ group, groupIdx }))
                    .filter(({ group }) => group.hasExplicitDivision);

                  const getGroupMetrics = (
                    group: (typeof divisionGroups)[number]
                  ) => {
                    const getItemDisplayLabel = (
                      globalIdx: number,
                      sufixo?: string
                    ) =>
                      progressiveLayout?.[globalIdx]
                        ? progressiveLayout[globalIdx].itemLabel.replace(
                            /\.$/,
                            ''
                          )
                        : formatArtigoNumero(globalIdx + 1, sufixo).replace(
                            /\.$/,
                            ''
                          );
                    const firstArtNum = getItemDisplayLabel(
                      group.items[0].globalIndex,
                      group.items[0].art.sufixo
                    );
                    const lastItem = group.items[group.items.length - 1];
                    const lastArtNum = getItemDisplayLabel(
                      lastItem.globalIndex,
                      lastItem.art.sufixo
                    );
                    const rangeLabel =
                      group.items.length === 1
                        ? isTech
                          ? `Item ${firstArtNum}`
                          : firstArtNum
                        : isTech
                          ? `Itens ${firstArtNum} a ${lastArtNum}`
                          : `${firstArtNum} a ${lastArtNum}`;
                    const groupFindingsCount = group.items.reduce((acc, it) => {
                      const artId = it.art.id;
                      const artFindings = review.findings.filter((f) =>
                        f.fieldKey.includes(`:${artId}`)
                      );
                      return acc + artFindings.length;
                    }, 0);
                    return { lastItem, rangeLabel, groupFindingsCount };
                  };

                  return (
                    <>
                      {leadingGroups.map(({ group }) => {
                        const isCollapsed = Boolean(
                          collapsedTitulos[group.key]
                        );
                        const { lastItem, rangeLabel, groupFindingsCount } =
                          getGroupMetrics(group);
                        return (
                          <div
                            key={group.key}
                            className="border border-slate-200 rounded-lg bg-white"
                          >
                            <div
                              className={`bg-slate-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 ${
                                isCollapsed
                                  ? 'rounded-lg'
                                  : 'rounded-t-lg border-b border-slate-200'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleDivisionGroup(group.key)}
                                aria-expanded={!isCollapsed}
                                className="flex items-center gap-2 text-left min-w-0 flex-1 group"
                              >
                                <span className="text-xs font-semibold text-slate-900 truncate group-hover:underline">
                                  {`Disposições Iniciais (sem ${kindLabel})`}
                                </span>
                                <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
                                  · {rangeLabel} ({group.items.length}{' '}
                                  {isTech
                                    ? group.items.length === 1
                                      ? 'item'
                                      : 'itens'
                                    : group.items.length === 1
                                      ? 'artigo'
                                      : 'artigos'}
                                  )
                                </span>
                                {isCollapsed && groupFindingsCount > 0 && (
                                  <span className="px-1.5 py-0.5 text-[11px] font-medium text-amber-800 bg-amber-100 border border-amber-200 rounded whitespace-nowrap shrink-0">
                                    {groupFindingsCount}{' '}
                                    {groupFindingsCount === 1
                                      ? 'apontamento'
                                      : 'apontamentos'}
                                  </span>
                                )}
                              </button>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isCollapsed) {
                                      toggleDivisionGroup(group.key);
                                    }
                                    insertArtigoAt(
                                      lastItem.globalIndex + 1,
                                      true
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>
                                    {isTech
                                      ? `Item nesta ${kindLabel}`
                                      : `Artigo neste ${kindLabel}`}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleDivisionGroup(group.key)}
                                  aria-expanded={!isCollapsed}
                                  aria-label={`${isCollapsed ? 'Expandir' : 'Recolher'} Disposições Iniciais`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {isCollapsed ? 'Expandir' : 'Recolher'}
                                  </span>
                                </button>
                              </div>
                            </div>

                            {!isCollapsed && (
                              <SortableNormaGroup
                                values={group.items.map((item) => item.art.id)}
                                onReorder={(nextIds) =>
                                  handleReorderArtigosInGroup(
                                    group.startIndex,
                                    group.endIndex,
                                    nextIds
                                  )
                                }
                                className="p-4 space-y-5"
                              >
                                {group.items.map((item, localIdx) =>
                                  renderArtigoCard(
                                    item.art,
                                    item.globalIndex,
                                    localIdx,
                                    group.items.length
                                  )
                                )}
                              </SortableNormaGroup>
                            )}
                          </div>
                        );
                      })}

                      <SortableNormaGroup
                        values={explicitGroups.map(({ group }) =>
                          getStableGroupKey(group.leaderArtId)
                        )}
                        onReorder={handleReorderDivisionGroups}
                        className="space-y-4"
                      >
                        {explicitGroups.map(({ group, groupIdx }) => {
                          const stableGroupKey = getStableGroupKey(
                            group.leaderArtId
                          );
                          const isCollapsed = Boolean(
                            collapsedTitulos[group.key]
                          );
                          const { lastItem, rangeLabel, groupFindingsCount } =
                            getGroupMetrics(group);

                          return (
                            <SortableNormaItem
                              key={stableGroupKey}
                              value={stableGroupKey}
                              canDrag={explicitGroups.length > 1}
                              className="border border-slate-200 rounded-lg bg-white"
                              draggingClassName="border-slate-400 ring-1 ring-slate-300 bg-white"
                            >
                              {({ isDragging, startDrag }) => (
                                <>
                                  <div
                                    className={`bg-slate-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 ${
                                      isCollapsed
                                        ? 'rounded-lg'
                                        : 'rounded-t-lg border-b border-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {explicitGroups.length > 1 && (
                                        <SortableDragHandleButton
                                          onPointerDown={startDrag}
                                          isDragging={isDragging}
                                          label={`Arrastar para reordenar ${kindLabel}`}
                                        />
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleDivisionGroup(group.key)
                                        }
                                        aria-expanded={!isCollapsed}
                                        className="flex items-center gap-2 text-left min-w-0 flex-1 group"
                                      >
                                        <span className="text-xs font-semibold text-slate-900 truncate group-hover:underline">
                                          {group.divisionText.trim() ||
                                            `${kindLabel} sem denominação`}
                                        </span>
                                        <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
                                          · {rangeLabel} ({group.items.length}{' '}
                                          {isTech
                                            ? group.items.length === 1
                                              ? 'item'
                                              : 'itens'
                                            : group.items.length === 1
                                              ? 'artigo'
                                              : 'artigos'}
                                          )
                                        </span>
                                        {isCollapsed &&
                                          groupFindingsCount > 0 && (
                                            <span className="px-1.5 py-0.5 text-[11px] font-medium text-amber-800 bg-amber-100 border border-amber-200 rounded whitespace-nowrap shrink-0">
                                              {groupFindingsCount}{' '}
                                              {groupFindingsCount === 1
                                                ? 'apontamento'
                                                : 'apontamentos'}
                                            </span>
                                          )}
                                      </button>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                      {explicitGroups.length > 1 &&
                                        renderReorderStepper({
                                          canUp:
                                            groupIdx > 0 &&
                                            Boolean(
                                              divisionGroups[groupIdx - 1]
                                                ?.hasExplicitDivision
                                            ),
                                          canDown:
                                            groupIdx <
                                            divisionGroups.length - 1,
                                          onUp: () =>
                                            handleMoveDivisionGroup(
                                              groupIdx,
                                              'up'
                                            ),
                                          onDown: () =>
                                            handleMoveDivisionGroup(
                                              groupIdx,
                                              'down'
                                            ),
                                          upLabel: `Subir ${kindLabel} inteiro (reordena numeração)`,
                                          downLabel: `Descer ${kindLabel} inteiro (reordena numeração)`,
                                          groupLabel: `Reordenar ${kindLabel}`,
                                        })}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isCollapsed) {
                                            toggleDivisionGroup(group.key);
                                          }
                                          insertArtigoAt(
                                            lastItem.globalIndex + 1,
                                            true
                                          );
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                                      >
                                        <Plus className="w-3 h-3" />
                                        <span>
                                          {isTech
                                            ? `Item nesta ${kindLabel}`
                                            : `Artigo neste ${kindLabel}`}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleDivisionGroup(group.key)
                                        }
                                        aria-expanded={!isCollapsed}
                                        aria-label={`${isCollapsed ? 'Expandir' : 'Recolher'} ${
                                          group.divisionText.trim() || kindLabel
                                        }`}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                                      >
                                        {isCollapsed ? (
                                          <ChevronRight className="w-3.5 h-3.5" />
                                        ) : (
                                          <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                        <span>
                                          {isCollapsed
                                            ? 'Expandir'
                                            : 'Recolher'}
                                        </span>
                                      </button>
                                    </div>
                                  </div>

                                  {!isCollapsed && (
                                    <SortableNormaGroup
                                      values={group.items.map(
                                        (item) => item.art.id
                                      )}
                                      onReorder={(nextIds) =>
                                        handleReorderArtigosInGroup(
                                          group.startIndex,
                                          group.endIndex,
                                          nextIds
                                        )
                                      }
                                      className="p-4 space-y-5"
                                    >
                                      {group.items.map((item, localIdx) =>
                                        renderArtigoCard(
                                          item.art,
                                          item.globalIndex,
                                          localIdx,
                                          group.items.length
                                        )
                                      )}
                                    </SortableNormaGroup>
                                  )}
                                </>
                              )}
                            </SortableNormaItem>
                          );
                        })}
                      </SortableNormaGroup>
                    </>
                  );
                })()}
              </div>
              </MotionConfig>
              )}
            </section>

            {/* 3. Parte Final (Vigência, Revogações e Assinatura) */}
            <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div
                className={`flex flex-wrap items-center justify-between gap-3 ${
                  collapsedSections.final ? '' : 'border-b border-slate-200 pb-3'
                }`}
              >
                <h2 className="text-sm font-semibold text-slate-900">
                  3. Parte Final (Vigência, Revogação Expressa e Fecho)
                </h2>
                <button
                  type="button"
                  onClick={() => toggleMainSection('final')}
                  aria-expanded={!collapsedSections.final}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  {collapsedSections.final ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {collapsedSections.final ? 'Expandir' : 'Recolher'}
                  </span>
                </button>
              </div>

              {!collapsedSections.final && (
                <>

              <div
                data-review-field="vigencia"
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isTech
                      ? 'Vigência e Controle de Revisão'
                      : 'Regra de Vigência (Art. 8º LC 95/98)'}
                    {renderRequirementTag('vigencia')}
                  </label>
                  <select
                    value={doc.vigenciaTipo}
                    onChange={(e) =>
                      updateField('vigenciaTipo', e.target.value as VigenciaTipo)
                    }
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="imediata">Na data da publicação</option>
                    <option value="dias">Vacatio legis em dias</option>
                    <option value="data_certa">Data certa no calendário</option>
                  </select>
                </div>

                {doc.vigenciaTipo === 'dias' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Dias após publicação
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={doc.vigenciaDias}
                      onChange={(e) =>
                        updateField('vigenciaDias', Number(e.target.value) || 1)
                      }
                      className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                )}

                {doc.vigenciaTipo === 'data_certa' && (
                  <div data-review-field="vigenciaData" className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700">
                      Data de início da vigência
                    </label>
                    <ReviewedInput
                      type="text"
                      value={doc.vigenciaData}
                      onChange={(e) => updateField('vigenciaData', e.target.value)}
                      placeholder="Ex.: 1º de janeiro de 2027"
                      findings={review.byField['vigenciaData'] || []}
                      highlightEnabled={highlightReview}
                      {...getFieldMarkProps('vigenciaData', 'Data de Vigência')}
                      onApplyFix={handleApplyReviewFix}
                      onIgnoreFinding={handleIgnoreFinding}
                      onAddToDictionary={addToDictionary}
                      {...nativeFieldProps}
                      className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    {showInlineHints && (
                      <FieldReviewHints
                        findings={review.byField['vigenciaData'] || []}
                        onApplyFix={handleApplyReviewFix}
                        onIgnore={handleIgnoreFinding}
                      />
                    )}
                  </div>
                )}
              </div>
              {renderFieldValidationAlerts('vigencia')}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">
                    {isTech
                      ? 'Documentos Substituídos / Cancelados (opcional)'
                      : 'Revogações Expressas (Art. 9º da LC 95/98 — nunca use "em contrário")'}
                  </label>
                  <button
                    type="button"
                    onClick={() => updateField('revogacoes', [...doc.revogacoes, ''])}
                    className="text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                  >
                    + Adicionar item revogado
                  </button>
                </div>
                {doc.revogacoes.length === 0 && (
                  <p className="text-xs text-slate-500">
                    Nenhuma revogação informada. Adicione apenas se o documento substituir norma ou instrução anterior.
                  </p>
                )}
                {doc.revogacoes.map((rev, rIdx) => (
                  <div
                    key={rIdx}
                    data-review-field={`revogacao:${rIdx}`}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <ReviewedInput
                        type="text"
                        value={rev}
                        onChange={(e) => {
                          const next = [...doc.revogacoes];
                          next[rIdx] = e.target.value;
                          updateField('revogacoes', next);
                        }}
                        placeholder="Ex.: Decreto nº 1.105, de 12 de abril de 2019"
                        findings={review.byField[`revogacao:${rIdx}`] || []}
                        highlightEnabled={highlightReview}
                        {...getFieldMarkProps(
                          `revogacao:${rIdx}`,
                          `Revogação #${rIdx + 1}`
                        )}
                        onApplyFix={handleApplyReviewFix}
                        onIgnoreFinding={handleIgnoreFinding}
                        onAddToDictionary={addToDictionary}
                        {...nativeFieldProps}
                        className="flex-1 text-sm bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                      {doc.revogacoes.length > 1 &&
                        renderReorderStepper({
                          canUp: rIdx > 0,
                          canDown: rIdx < doc.revogacoes.length - 1,
                          onUp: () => handleMoveRevogacao(rIdx, 'up'),
                          onDown: () => handleMoveRevogacao(rIdx, 'down'),
                          upLabel: 'Subir item revogado',
                          downLabel: 'Descer item revogado',
                          groupLabel: 'Reordenar revogação',
                          compact: true,
                        })}
                      <button
                        type="button"
                        onClick={() =>
                          updateField(
                            'revogacoes',
                            doc.revogacoes.filter((_, idx) => idx !== rIdx)
                          )
                        }
                        aria-label="Remover revogação"
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {showInlineHints && (
                      <FieldReviewHints
                        findings={review.byField[`revogacao:${rIdx}`] || []}
                        onApplyFix={handleApplyReviewFix}
                        onIgnore={handleIgnoreFinding}
                      />
                    )}
                  </div>
                ))}
              </div>

              {renderFieldValidationAlerts('revogacoes')}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div data-review-field="localAssinatura" className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Local e Data
                    {renderRequirementTag('localAssinatura')}
                  </label>
                  <ReviewedInput
                    type="text"
                    value={doc.localAssinatura}
                    onChange={(e) => updateField('localAssinatura', e.target.value)}
                    findings={review.byField['localAssinatura'] || []}
                    highlightEnabled={highlightReview}
                    {...getFieldMarkProps('localAssinatura', 'Local e Data')}
                    onApplyFix={handleApplyReviewFix}
                    onIgnoreFinding={handleIgnoreFinding}
                    onAddToDictionary={addToDictionary}
                    {...nativeFieldProps}
                    className={`w-full text-sm bg-white border rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                      (fieldValidation.issuesByField.localAssinatura || []).some(
                        (i) => i.severidade === 'erro'
                      )
                        ? 'border-red-400'
                        : 'border-slate-300'
                    }`}
                  />
                  {renderFieldValidationAlerts('localAssinatura')}
                  {showInlineHints && (
                    <FieldReviewHints
                      findings={review.byField['localAssinatura'] || []}
                      onApplyFix={handleApplyReviewFix}
                      onIgnore={handleIgnoreFinding}
                    />
                  )}
                </div>
                <div data-review-field="assinante">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isTech ? 'Aprovador / Signatário' : 'Autoridade'}
                    {renderRequirementTag('assinante')}
                  </label>
                  <input
                    type="text"
                    value={doc.assinante}
                    onChange={(e) => updateField('assinante', e.target.value)}
                    className={`w-full text-sm bg-white border rounded-md px-3 py-2 text-slate-900 ${
                      (fieldValidation.issuesByField.assinante || []).some(
                        (i) => i.severidade === 'erro'
                      )
                        ? 'border-red-400'
                        : 'border-slate-300'
                    }`}
                  />
                  {renderFieldValidationAlerts('assinante')}
                </div>
                <div data-review-field="cargoAssinante">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isTech ? 'Cargo / Registro Técnico' : 'Cargo'}
                    {renderRequirementTag('cargoAssinante')}
                  </label>
                  <input
                    type="text"
                    value={doc.cargoAssinante}
                    onChange={(e) => updateField('cargoAssinante', e.target.value)}
                    className={`w-full text-sm bg-white border rounded-md px-3 py-2 text-slate-900 ${
                      (fieldValidation.issuesByField.cargoAssinante || []).some(
                        (i) => i.severidade === 'erro'
                      )
                        ? 'border-red-400'
                        : 'border-slate-300'
                    }`}
                  />
                  {renderFieldValidationAlerts('cargoAssinante')}
                </div>
              </div>
                </>
              )}
            </section>

            {/* Input oculto para inserção rápida de imagem após um artigo */}
            <input
              ref={quickArtImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              onChange={(e) => void handleQuickArtigoImageSelect(e.target.files)}
              className="hidden"
            />
            {quickImageError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 flex items-center justify-between gap-2">
                <span>{quickImageError}</span>
                <button
                  type="button"
                  onClick={() => setQuickImageError(null)}
                  className="text-red-700 hover:text-red-900 font-medium whitespace-nowrap"
                >
                  Fechar
                </button>
              </div>
            )}

            {/* 4. Imagens, Carimbos e Anexos Gráficos */}
            <NormaImagensSection
              imagens={doc.imagens || []}
              artigos={doc.artigos}
              isCollapsed={Boolean(collapsedSections.imagens)}
              onToggleCollapse={() => toggleMainSection('imagens')}
              onChange={(nextImagens) => updateField('imagens', nextImagens)}
            />

            {/* 5. Observações Internas da Minuta */}
            <section
              id="secao-observacoes-minuta"
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-3"
            >
              <div
                className={`flex flex-wrap items-center justify-between gap-3 ${
                  collapsedSections.observacoes
                    ? ''
                    : 'border-b border-slate-200 pb-3'
                }`}
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <MessageSquareText className="w-4 h-4 text-slate-700 shrink-0" />
                    <span>5. Observações Internas da Minuta</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Notas de trabalho e trechos enviados das caixas de edição — não aparecem na Prévia Oficial nem nas exportações
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleMainSection('observacoes')}
                  aria-expanded={!collapsedSections.observacoes}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  {collapsedSections.observacoes ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {collapsedSections.observacoes ? 'Expandir' : 'Recolher'}
                  </span>
                </button>
              </div>

              {!collapsedSections.observacoes && (
                <div className="space-y-2.5">
                  <textarea
                    ref={observacoesTextareaRef}
                    rows={4}
                    value={doc.observacoes || ''}
                    maxLength={4000}
                    onChange={(e) => updateField('observacoes', e.target.value)}
                    placeholder="Anote pendências de revisão, justificativas ou envie trechos selecionados das caixas acima..."
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-900 resize-y"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="tabular-nums">
                      {(doc.observacoes || '').length}/4000 caracteres
                    </span>
                    {editorMarks.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSendAllMarksToObservacoes}
                          className="font-medium text-slate-800 hover:text-slate-950 underline underline-offset-2 whitespace-nowrap"
                        >
                          Inserir {editorMarks.length}{' '}
                          {editorMarks.length === 1
                            ? 'marcação das caixas'
                            : 'marcações das caixas'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Coluna Direita: Folha Oficial em Tempo Real, Checklist, Revisor ou Histórico */}
        {showPreview && (
          <div
            className={`space-y-3 print-scroll-container ${
              layoutMode === 'dividido'
                ? 'lg:col-span-6 lg:sticky lg:top-[5.25rem] lg:max-h-[calc(100vh-6.25rem)] lg:flex lg:flex-col'
                : ''
            }`}
          >
            <div className="no-print bg-white border border-slate-200 rounded-xl px-4 py-2.5 space-y-2 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center p-1 bg-slate-100 rounded-md max-w-full overflow-x-auto custom-scrollbar shrink-0">
                  <button
                    type="button"
                    onClick={() => setRightPaneMode('previa')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      rightPaneMode === 'previa'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Prévia Oficial</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPaneMode('checklist')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      rightPaneMode === 'checklist'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    <span className="tabular-nums">
                      Checklist ({complianceChecklist.totalConformes}/
                      {complianceChecklist.totalItems})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPaneMode('indice')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      rightPaneMode === 'indice'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="tabular-nums">
                      Índice ({indiceRemissivo.totalAssuntos})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPaneMode('revisor')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      rightPaneMode === 'revisor'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <SpellCheck className="w-3.5 h-3.5" />
                    <span className="tabular-nums">
                      Revisor ({review.findings.length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPaneMode('historico')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      rightPaneMode === 'historico'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span className="tabular-nums">
                      Histórico ({revisions.length})
                    </span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {rightPaneMode === 'previa' && (
                    <button
                      type="button"
                      onClick={() => setHighlightReview((v) => !v)}
                      title="Destacar desvios ortográficos, gramaticais e de linguagem jurídica na prévia"
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                        highlightReview
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Highlighter className="w-3.5 h-3.5" />
                      <span>Realce</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTxt}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>.txt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAuditDraft(plainText)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Auditar</span>
                  </button>
                </div>
              </div>

              {rightPaneMode === 'previa' &&
                highlightReview &&
                previewCounts.total > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-red-200 border-b-2 border-red-600" />
                        <span>Ortografia ({previewCounts.ortografia})</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-amber-200 border-b-2 border-amber-600" />
                        <span>Gramática ({previewCounts.gramatica})</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-600">
                        <input
                          type="checkbox"
                          checked={showInlineHints}
                          onChange={(e) => setShowInlineHints(e.target.checked)}
                          className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                        />
                        <span>Alertas nos campos</span>
                      </label>
                    </div>
                  </div>
                )}
            </div>

            <div
              className={
                layoutMode === 'dividido'
                  ? 'lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar lg:pr-1 space-y-3 print-scroll-inner'
                  : 'space-y-3'
              }
            >
            {rightPaneMode === 'previa' && selectedFinding && (
              <div className="no-print bg-white border border-slate-300 rounded-lg p-3.5 space-y-2 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-semibold text-slate-900">
                      {selectedFinding.fieldLabel} — {selectedFinding.titulo}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {selectedFinding.explicacao}{' '}
                      <strong className="text-slate-800">
                        {selectedFinding.orientacao}
                      </strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFindingId(null)}
                    aria-label="Fechar detalhes do apontamento"
                    className="p-1 text-slate-400 hover:text-slate-700 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {(selectedFinding.alternativas &&
                  selectedFinding.alternativas.length > 0
                    ? selectedFinding.alternativas
                    : selectedFinding.sugestaoTexto !== undefined
                      ? [selectedFinding.sugestaoTexto]
                      : []
                  ).map((alt) => (
                    <button
                      key={alt}
                      type="button"
                      onClick={() => handleApplyReviewFix(selectedFinding, alt)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>Aplicar: &quot;{alt}&quot;</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleLocateField(selectedFinding.fieldKey)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded transition-colors whitespace-nowrap"
                  >
                    <LocateFixed className="w-3 h-3" />
                    <span>Ir ao campo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIgnoreFinding(selectedFinding)}
                    className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap"
                  >
                    Ignorar
                  </button>
                </div>
              </div>
            )}

            {rightPaneMode === 'checklist' ? (
              <ChecklistConformidadePanel
                summary={complianceChecklist}
                onLocateField={handleLocateField}
                onRunFullAudit={() => onAuditDraft(plainText)}
              />
            ) : rightPaneMode === 'indice' ? (
              <IndiceRemissivoPanel
                doc={doc}
                indexResult={indiceRemissivo}
                onLocateField={handleLocateField}
              />
            ) : rightPaneMode === 'revisor' ? (
              <RevisorLinguisticoPanel
                summary={review}
                ignoredCount={ignoredSignatures.size}
                selectedFindingId={selectedFindingId}
                onSelectFinding={(f) => setSelectedFindingId(f.id)}
                onApplyFix={handleApplyReviewFix}
                onApplyAllAutoFixes={handleApplyAllAutoFixes}
                onIgnore={handleIgnoreFinding}
                onRestoreIgnored={handleRestoreIgnored}
                onLocateField={handleLocateField}
              />
            ) : rightPaneMode === 'historico' ? (
              <HistoricoRevisoesPanel
                currentDoc={doc}
                revisions={revisions}
                localSnapshots={localSnapshots}
                revisionsLoading={revisionsLoading}
                revisionsError={revisionsError}
                onChangeDocObservacoes={(val) => updateField('observacoes', val)}
                onCreateRevision={onCreateRevision}
                onUpdateRevisionNote={onUpdateRevisionNote}
                onDeleteRevision={onDeleteRevision}
                onRestoreWholeDoc={onRestoreWholeRevision}
                onRestoreSingleField={handleRestoreSingleField}
                onRestoreSingleArtigo={handleRestoreSingleArtigo}
              />
            ) : (
              <article
                className={`print-sheet bg-white border border-slate-200 rounded-xl p-6 sm:p-8 xl:p-10 2xl:p-12 text-slate-900 leading-relaxed ${
                  isTech ? 'font-sans' : 'font-serif'
                }`}
              >
                {(doc.imagens || [])
                  .filter((img) => img.posicao === 'cabecalho')
                  .map((img) => (
                    <NormaImagemPreviewBlock key={img.id} img={img} />
                  ))}

                {isTech ? (
                  <>
                    {/* Quadro Técnico de Identificação (ABNT NBR 6024 / ISO 9001) */}
                    <div className="border border-slate-400 rounded-xs overflow-hidden mb-6 text-xs">
                      <div className="bg-slate-100 border-b border-slate-400 px-4 py-2.5 text-center font-bold tracking-wide uppercase text-sm text-slate-900">
                        {formatNormaEpigrafe(doc)}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-slate-300">
                        <div className="px-3 py-2 sm:border-r border-slate-300">
                          <span className="font-semibold text-slate-700">
                            Área / Setor Emitente:{' '}
                          </span>
                          <span className="text-slate-900">
                            {doc.esfera.trim() || '—'}
                          </span>
                        </div>
                        <div className="px-3 py-2 border-t sm:border-t-0 border-slate-300">
                          <span className="font-semibold text-slate-700">
                            Data / Revisão:{' '}
                          </span>
                          <span className="text-slate-900">
                            {doc.data.trim() || '—'}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-slate-300">
                        <div className="px-3 py-2 sm:border-r border-slate-300">
                          <span className="font-semibold text-slate-700">
                            Responsável Técnico:{' '}
                          </span>
                          <HighlightedLegalText
                            displayText={doc.autoridade.trim() || '—'}
                            baseOffset={
                              doc.autoridade.length -
                              doc.autoridade.trimStart().length
                            }
                            findings={previewFindingsByField['autoridade'] || []}
                            enabled={highlightReview}
                            selectedFindingId={selectedFindingId}
                            onSelectFinding={(f) => setSelectedFindingId(f.id)}
                          />
                        </div>
                        <div className="px-3 py-2 border-t sm:border-t-0 border-slate-300">
                          <span className="font-semibold text-slate-700">
                            Vigência:{' '}
                          </span>
                          <span className="text-slate-900">
                            {doc.vigenciaTipo === 'imediata'
                              ? 'Na data da publicação / aprovação'
                              : doc.vigenciaTipo === 'dias'
                                ? `${Math.max(1, doc.vigenciaDias || 30)} dias após publicação`
                                : doc.vigenciaData.trim() || 'Data definida'}
                          </span>
                        </div>
                      </div>
                      {doc.fundamentoLegal.trim() && (
                        <div className="px-3 py-2 border-b border-slate-300">
                          <span className="font-semibold text-slate-700">
                            Normas de Referência:{' '}
                          </span>
                          <HighlightedLegalText
                            displayText={doc.fundamentoLegal
                              .replace(/\n+/g, '; ')
                              .trim()}
                            baseOffset={
                              doc.fundamentoLegal.length -
                              doc.fundamentoLegal.trimStart().length
                            }
                            findings={
                              previewFindingsByField['fundamentoLegal'] || []
                            }
                            enabled={highlightReview}
                            selectedFindingId={selectedFindingId}
                            onSelectFinding={(f) => setSelectedFindingId(f.id)}
                          />
                        </div>
                      )}
                      {doc.ementa.trim() && (
                        <div className="px-3 py-2.5 bg-slate-50/70">
                          <span className="font-semibold text-slate-700">
                            Objetivo / Escopo:{' '}
                          </span>
                          <HighlightedLegalText
                            displayText={doc.ementa.trim()}
                            baseOffset={
                              doc.ementa.length - doc.ementa.trimStart().length
                            }
                            findings={previewFindingsByField['ementa'] || []}
                            enabled={highlightReview}
                            selectedFindingId={selectedFindingId}
                            onSelectFinding={(f) => setSelectedFindingId(f.id)}
                          />
                        </div>
                      )}
                    </div>

                    {doc.ordemExecucao.trim() && (
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-800 mb-4">
                        {doc.ordemExecucao.trim()}
                      </p>
                    )}

                    <div className="space-y-3.5 text-sm text-justify">
                      {(() => {
                        const layouts = progressiveLayout || [];
                        let nextPrimarySec = 1;
                        let nextFlatNum = 1;
                        let hasSections = false;

                        return (
                          <>
                            {doc.artigos.map((art, aIdx) => {
                              const layout = layouts[aIdx];
                              if (layout) {
                                nextPrimarySec = layout.nextPrimarySectionNum;
                                nextFlatNum = layout.nextFlatItemNum;
                                hasSections = layout.hasSections;
                              }
                              const itemLabel = layout
                                ? layout.itemLabel
                                : `${aIdx + 1}.`;
                              const hasInc = art.incisos.length > 0;
                              const leadCaput =
                                art.caput.length - art.caput.trimStart().length;
                              let caput = art.caput.trim();
                              if (hasInc && !caput.endsWith(':')) {
                                caput = `${caput.replace(/[.;]+$/, '')}:`;
                              } else if (
                                !hasInc &&
                                caput &&
                                !/[.!?]$/.test(caput)
                              ) {
                                caput = `${caput}.`;
                              }

                              return (
                                <div key={art.id} className="space-y-2">
                                  {layout?.headings.map((heading) => (
                                    <div
                                      key={heading.fieldKey}
                                      className={
                                        heading.kind === 'titulo'
                                          ? 'font-bold text-sm uppercase text-slate-900 pt-3 pb-0.5 border-b border-slate-200'
                                          : heading.kind === 'capitulo'
                                            ? 'font-bold text-xs uppercase text-slate-800 pt-2'
                                            : 'font-semibold text-xs text-slate-800 pt-1'
                                      }
                                    >
                                      <HighlightedLegalText
                                        displayText={heading.formattedText}
                                        baseOffset={heading.baseOffset}
                                        findings={
                                          previewFindingsByField[
                                            heading.fieldKey
                                          ] || []
                                        }
                                        enabled={highlightReview}
                                        selectedFindingId={selectedFindingId}
                                        onSelectFinding={(f) =>
                                          setSelectedFindingId(f.id)
                                        }
                                      />
                                    </div>
                                  ))}

                                  <p className="whitespace-pre-line">
                                    <span className="font-semibold">
                                      {itemLabel}
                                    </span>{' '}
                                    <HighlightedLegalText
                                      displayText={caput}
                                      baseOffset={leadCaput}
                                      findings={
                                        previewFindingsByField[
                                          `caput:${art.id}`
                                        ] || []
                                      }
                                      enabled={highlightReview}
                                      selectedFindingId={selectedFindingId}
                                      onSelectFinding={(f) =>
                                        setSelectedFindingId(f.id)
                                      }
                                    />
                                  </p>

                                  {art.incisos.map((inc, iIdx) => {
                                    const isLastInc =
                                      iIdx === art.incisos.length - 1;
                                    const hasAl = inc.alineas.length > 0;
                                    const leadInc =
                                      inc.texto.length -
                                      inc.texto.trimStart().length;
                                    let txt = inc.texto.trim();
                                    if (hasAl)
                                      txt = `${txt.replace(/[.;:]+$/, '')}:`;
                                    else if (isLastInc)
                                      txt = `${txt.replace(/[.;:]+$/, '')}.`;
                                    else txt = `${txt.replace(/[.;:]+$/, '')};`;

                                    return (
                                      <div key={inc.id} className="space-y-1">
                                        <p className="pl-6 whitespace-pre-line">
                                          {toLetter(iIdx)}){' '}
                                          <HighlightedLegalText
                                            displayText={txt}
                                            baseOffset={leadInc}
                                            findings={
                                              previewFindingsByField[
                                                `inciso:${art.id}:${inc.id}`
                                              ] || []
                                            }
                                            enabled={highlightReview}
                                            selectedFindingId={
                                              selectedFindingId
                                            }
                                            onSelectFinding={(f) =>
                                              setSelectedFindingId(f.id)
                                            }
                                          />
                                        </p>
                                        {inc.alineas.map((al, alIdx) => {
                                          const isLastAl =
                                            alIdx === inc.alineas.length - 1;
                                          const alSep =
                                            isLastAl && isLastInc ? '.' : ';';
                                          const leadAl =
                                            al.texto.length -
                                            al.texto.trimStart().length;
                                          const dispAl = `${al.texto
                                            .trim()
                                            .replace(/[.;:]+$/, '')}${alSep}`;
                                          return (
                                            <p
                                              key={al.id}
                                              className="pl-12 whitespace-pre-line"
                                            >
                                              •{' '}
                                              <HighlightedLegalText
                                                displayText={dispAl}
                                                baseOffset={leadAl}
                                                findings={
                                                  previewFindingsByField[
                                                    `alinea:${art.id}:${inc.id}:${al.id}`
                                                  ] || []
                                                }
                                                enabled={highlightReview}
                                                selectedFindingId={
                                                  selectedFindingId
                                                }
                                                onSelectFinding={(f) =>
                                                  setSelectedFindingId(f.id)
                                                }
                                              />
                                            </p>
                                          );
                                        })}
                                      </div>
                                    );
                                  })}

                                  {art.paragrafos.map((par, pIdx) => {
                                    const subLabel =
                                      layout?.subItemLabels[pIdx] ||
                                      `${itemLabel.replace(/\.$/, '')}.${pIdx + 1}`;
                                    const parIncisos = par.incisos || [];
                                    const leadPar =
                                      par.texto.length -
                                      par.texto.trimStart().length;
                                    let pTxt = par.texto.trim();
                                    if (
                                      parIncisos.length > 0 &&
                                      !pTxt.endsWith(':')
                                    ) {
                                      pTxt = `${pTxt.replace(/[.;]+$/, '')}:`;
                                    } else if (
                                      parIncisos.length === 0 &&
                                      pTxt &&
                                      !/[.!?]$/.test(pTxt)
                                    ) {
                                      pTxt = `${pTxt}.`;
                                    }

                                    return (
                                      <div key={par.id} className="space-y-1.5">
                                        <p className="whitespace-pre-line">
                                          <span className="font-semibold">
                                            {subLabel}
                                          </span>{' '}
                                          <HighlightedLegalText
                                            displayText={pTxt}
                                            baseOffset={leadPar}
                                            findings={
                                              previewFindingsByField[
                                                `paragrafo:${art.id}:${par.id}`
                                              ] || []
                                            }
                                            enabled={highlightReview}
                                            selectedFindingId={
                                              selectedFindingId
                                            }
                                            onSelectFinding={(f) =>
                                              setSelectedFindingId(f.id)
                                            }
                                          />
                                        </p>

                                        {parIncisos.map((inc, iIdx) => {
                                          const isLastInc =
                                            iIdx === parIncisos.length - 1;
                                          const hasAl = inc.alineas.length > 0;
                                          const leadInc =
                                            inc.texto.length -
                                            inc.texto.trimStart().length;
                                          let txt = inc.texto.trim();
                                          if (hasAl)
                                            txt = `${txt.replace(/[.;:]+$/, '')}:`;
                                          else if (isLastInc)
                                            txt = `${txt.replace(/[.;:]+$/, '')}.`;
                                          else
                                            txt = `${txt.replace(/[.;:]+$/, '')};`;

                                          return (
                                            <div
                                              key={inc.id}
                                              className="space-y-1"
                                            >
                                              <p className="pl-6 whitespace-pre-line">
                                                {toLetter(iIdx)}){' '}
                                                <HighlightedLegalText
                                                  displayText={txt}
                                                  baseOffset={leadInc}
                                                  findings={
                                                    previewFindingsByField[
                                                      `par_inciso:${art.id}:${par.id}:${inc.id}`
                                                    ] || []
                                                  }
                                                  enabled={highlightReview}
                                                  selectedFindingId={
                                                    selectedFindingId
                                                  }
                                                  onSelectFinding={(f) =>
                                                    setSelectedFindingId(f.id)
                                                  }
                                                />
                                              </p>
                                              {inc.alineas.map((al, alIdx) => {
                                                const isLastAl =
                                                  alIdx ===
                                                  inc.alineas.length - 1;
                                                const alSep =
                                                  isLastAl && isLastInc
                                                    ? '.'
                                                    : ';';
                                                const leadAl =
                                                  al.texto.length -
                                                  al.texto.trimStart().length;
                                                const dispAl = `${al.texto
                                                  .trim()
                                                  .replace(/[.;:]+$/, '')}${alSep}`;
                                                return (
                                                  <p
                                                    key={al.id}
                                                    className="pl-12 whitespace-pre-line"
                                                  >
                                                    •{' '}
                                                    <HighlightedLegalText
                                                      displayText={dispAl}
                                                      baseOffset={leadAl}
                                                      findings={
                                                        previewFindingsByField[
                                                          `par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`
                                                        ] || []
                                                      }
                                                      enabled={highlightReview}
                                                      selectedFindingId={
                                                        selectedFindingId
                                                      }
                                                      onSelectFinding={(f) =>
                                                        setSelectedFindingId(
                                                          f.id
                                                        )
                                                      }
                                                    />
                                                  </p>
                                                );
                                              })}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })}

                                  {(doc.imagens || [])
                                    .filter(
                                      (img) =>
                                        img.posicao === 'pos_artigo' &&
                                        img.artigoId === art.id
                                    )
                                    .map((img) => (
                                      <NormaImagemPreviewBlock
                                        key={img.id}
                                        img={img}
                                      />
                                    ))}
                                </div>
                              );
                            })}

                            {(() => {
                              const revEntries = doc.revogacoes
                                .map((raw, idx) => ({
                                  raw,
                                  trimmed: raw.trim(),
                                  lead: raw.length - raw.trimStart().length,
                                  idx,
                                }))
                                .filter((item) => item.trimmed.length > 0);
                              let curPrimary = nextPrimarySec;
                              let curFlat = nextFlatNum;
                              const blocks: React.ReactNode[] = [];

                              if (revEntries.length > 0) {
                                const secPrefix = hasSections
                                  ? `${curPrimary}.1`
                                  : `${curFlat}.`;
                                blocks.push(
                                  <div key="tech-rev" className="space-y-1.5 pt-2">
                                    {hasSections && (
                                      <div className="font-bold text-sm uppercase text-slate-900 border-b border-slate-200 pb-0.5">
                                        {curPrimary}. DISPOSIÇÕES SUBSTITUÍDAS
                                      </div>
                                    )}
                                    {revEntries.length === 1 ? (
                                      <p>
                                        <span className="font-semibold">
                                          {secPrefix}
                                        </span>{' '}
                                        Fica substituído/revogado o documento{' '}
                                        <HighlightedLegalText
                                          displayText={`${revEntries[0].trimmed.replace(/\.$/, '')}.`}
                                          baseOffset={revEntries[0].lead}
                                          findings={
                                            previewFindingsByField[
                                              `revogacao:${revEntries[0].idx}`
                                            ] || []
                                          }
                                          enabled={highlightReview}
                                          selectedFindingId={selectedFindingId}
                                          onSelectFinding={(f) =>
                                            setSelectedFindingId(f.id)
                                          }
                                        />
                                      </p>
                                    ) : (
                                      <>
                                        <p>
                                          <span className="font-semibold">
                                            {secPrefix}
                                          </span>{' '}
                                          Ficam substituídos ou revogados:
                                        </p>
                                        {revEntries.map((item, rPos) => (
                                          <p key={item.idx} className="pl-6">
                                            {toLetter(rPos)}){' '}
                                            <HighlightedLegalText
                                              displayText={`${item.trimmed.replace(/[.;]+$/, '')}${
                                                rPos === revEntries.length - 1
                                                  ? '.'
                                                  : ';'
                                              }`}
                                              baseOffset={item.lead}
                                              findings={
                                                previewFindingsByField[
                                                  `revogacao:${item.idx}`
                                                ] || []
                                              }
                                              enabled={highlightReview}
                                              selectedFindingId={
                                                selectedFindingId
                                              }
                                              onSelectFinding={(f) =>
                                                setSelectedFindingId(f.id)
                                              }
                                            />
                                          </p>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                );
                                if (hasSections) curPrimary += 1;
                                else curFlat += 1;
                              }

                              blocks.push(
                                <div key="tech-vig" className="space-y-1.5 pt-2">
                                  {hasSections && (
                                    <div className="font-bold text-sm uppercase text-slate-900 border-b border-slate-200 pb-0.5">
                                      {curPrimary}. VIGÊNCIA E CONTROLE DE REVISÃO
                                    </div>
                                  )}
                                  <p>
                                    <span className="font-semibold">
                                      {hasSections
                                        ? `${curPrimary}.1`
                                        : `${curFlat}.`}
                                    </span>{' '}
                                    {renderVigenciaClause(doc)}
                                  </p>
                                </div>
                              );

                              return blocks;
                            })()}
                          </>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <>
                <div className="text-center font-bold tracking-wide text-sm uppercase mb-6">
                  {formatNormaEpigrafe(doc)}
                </div>

                {doc.ementa.trim() && (
                  <p
                    className={
                      isWideEmenta
                        ? 'text-sm leading-relaxed text-center italic border-y border-slate-300 py-3 px-4 mb-6'
                        : 'text-sm leading-relaxed ml-auto w-full sm:w-3/5 text-justify mb-6'
                    }
                  >
                    <HighlightedLegalText
                      displayText={doc.ementa.trim()}
                      baseOffset={
                        doc.ementa.length - doc.ementa.trimStart().length
                      }
                      findings={previewFindingsByField['ementa'] || []}
                      enabled={highlightReview}
                      selectedFindingId={selectedFindingId}
                      onSelectFinding={(f) => setSelectedFindingId(f.id)}
                    />
                  </p>
                )}

                {/* Preâmbulo preservando múltiplos CONSIDERANDOs / parágrafos e sanção legislativa */}
                <div className="space-y-3 text-sm text-justify mb-6">
                  {(() => {
                    const pre = formatPreambuloParts(doc);
                    const fundFindings =
                      previewFindingsByField['fundamentoLegal'] || [];
                    const autFindings =
                      previewFindingsByField['autoridade'] || [];
                    const autTrimLead =
                      doc.autoridade.length - doc.autoridade.trimStart().length;

                    if (fundamentoSpans.length === 0) {
                      return (
                        <p className="indent-8">
                          <span className="font-semibold">
                            <HighlightedLegalText
                              displayText={pre.autoridade}
                              baseOffset={autTrimLead}
                              findings={autFindings}
                              enabled={highlightReview}
                              selectedFindingId={selectedFindingId}
                              onSelectFinding={(f) =>
                                setSelectedFindingId(f.id)
                              }
                            />
                          </span>
                          {pre.separadorAutoridade}
                          <span className="font-semibold">{pre.ordem}</span>
                        </p>
                      );
                    }

                    if (fundamentoSpans.length === 1) {
                      const span = fundamentoSpans[0];
                      return (
                        <p className="indent-8">
                          <span className="font-semibold">
                            <HighlightedLegalText
                              displayText={pre.autoridade}
                              baseOffset={autTrimLead}
                              findings={autFindings}
                              enabled={highlightReview}
                              selectedFindingId={selectedFindingId}
                              onSelectFinding={(f) =>
                                setSelectedFindingId(f.id)
                              }
                            />
                          </span>
                          {pre.separadorAutoridade}
                          <HighlightedLegalText
                            displayText={span.text}
                            baseOffset={span.offset}
                            findings={fundFindings}
                            enabled={highlightReview}
                            selectedFindingId={selectedFindingId}
                            onSelectFinding={(f) => setSelectedFindingId(f.id)}
                          />
                          {pre.ordem && (
                            <>
                              {pre.needsCommaBeforeOrdem ? ',' : ''}{' '}
                              <span className="font-semibold">{pre.ordem}</span>
                            </>
                          )}
                        </p>
                      );
                    }

                    const lastIdx = fundamentoSpans.length - 1;
                    return fundamentoSpans.map((span, lIdx) => {
                      const isFirst = lIdx === 0;
                      const isLast = lIdx === lastIdx;
                      return (
                        <p key={lIdx} className="indent-8">
                          {isFirst && pre.autoridade && (
                            <>
                              <span className="font-semibold">
                                <HighlightedLegalText
                                  displayText={pre.autoridade}
                                  baseOffset={autTrimLead}
                                  findings={autFindings}
                                  enabled={highlightReview}
                                  selectedFindingId={selectedFindingId}
                                  onSelectFinding={(f) =>
                                    setSelectedFindingId(f.id)
                                  }
                                />
                              </span>
                              {pre.separadorAutoridade}
                            </>
                          )}
                          <HighlightedLegalText
                            displayText={span.text}
                            baseOffset={span.offset}
                            findings={fundFindings}
                            enabled={highlightReview}
                            selectedFindingId={selectedFindingId}
                            onSelectFinding={(f) => setSelectedFindingId(f.id)}
                          />
                          {isLast && pre.ordem && (
                            <>
                              {pre.needsCommaBeforeOrdem ? ',' : ''}{' '}
                              <span className="font-semibold">{pre.ordem}</span>
                            </>
                          )}
                        </p>
                      );
                    });
                  })()}
                </div>

                <div className="space-y-4 text-sm text-justify">
                  {(() => {
                    let lastTitulo = '';
                    let lastCap = '';
                    let lastSecao = '';
                    let lastSubsecao = '';
                    return doc.artigos.map((art, aIdx) => {
                      const showTitulo =
                        art.titulo && art.titulo.trim() !== lastTitulo;
                      if (showTitulo) {
                        lastTitulo = art.titulo!.trim();
                        lastCap = '';
                        lastSecao = '';
                        lastSubsecao = '';
                      }

                      const showCap =
                        art.capitulo && art.capitulo.trim() !== lastCap;
                      if (showCap) {
                        lastCap = art.capitulo!.trim();
                        lastSecao = '';
                        lastSubsecao = '';
                      }

                      const showSecao =
                        art.secao && art.secao.trim() !== lastSecao;
                      if (showSecao) {
                        lastSecao = art.secao!.trim();
                        lastSubsecao = '';
                      }

                      const showSubsecao =
                        art.subsecao && art.subsecao.trim() !== lastSubsecao;
                      if (showSubsecao) {
                        lastSubsecao = art.subsecao!.trim();
                      }

                      const artLabel = formatArtigoNumero(aIdx + 1, art.sufixo);
                      const hasInc = art.incisos.length > 0;
                      const leadCaput =
                        art.caput.length - art.caput.trimStart().length;
                      let caput = art.caput.trim();
                      if (hasInc && !caput.endsWith(':')) {
                        caput = `${caput.replace(/[.;]+$/, '')}:`;
                      } else if (!hasInc && caput && !/[.!?]$/.test(caput)) {
                        caput = `${caput}.`;
                      }

                      return (
                        <div key={art.id} className="space-y-2.5">
                          {showTitulo && (
                            <div className="text-center font-bold text-xs tracking-wider uppercase pt-4 pb-1">
                              <HighlightedLegalText
                                displayText={art.titulo!.trim()}
                                baseOffset={
                                  (art.titulo?.length || 0) -
                                  (art.titulo?.trimStart().length || 0)
                                }
                                findings={
                                  previewFindingsByField[`titulo:${art.id}`] || []
                                }
                                enabled={highlightReview}
                                selectedFindingId={selectedFindingId}
                                onSelectFinding={(f) =>
                                  setSelectedFindingId(f.id)
                                }
                              />
                            </div>
                          )}
                          {showCap && (
                            <div className="text-center font-semibold text-xs tracking-wider uppercase pt-3 pb-1">
                              <HighlightedLegalText
                                displayText={art.capitulo!.trim()}
                                baseOffset={
                                  (art.capitulo?.length || 0) -
                                  (art.capitulo?.trimStart().length || 0)
                                }
                                findings={
                                  previewFindingsByField[`capitulo:${art.id}`] ||
                                  []
                                }
                                enabled={highlightReview}
                                selectedFindingId={selectedFindingId}
                                onSelectFinding={(f) =>
                                  setSelectedFindingId(f.id)
                                }
                              />
                            </div>
                          )}
                          {showSecao && (
                            <div className="text-center font-semibold text-xs tracking-wide uppercase pt-2 pb-0.5">
                              <HighlightedLegalText
                                displayText={art.secao!.trim()}
                                baseOffset={
                                  (art.secao?.length || 0) -
                                  (art.secao?.trimStart().length || 0)
                                }
                                findings={
                                  previewFindingsByField[`secao:${art.id}`] || []
                                }
                                enabled={highlightReview}
                                selectedFindingId={selectedFindingId}
                                onSelectFinding={(f) =>
                                  setSelectedFindingId(f.id)
                                }
                              />
                            </div>
                          )}
                          {showSubsecao && (
                            <div className="text-center font-semibold text-xs pt-1.5 pb-0.5">
                              <HighlightedLegalText
                                displayText={art.subsecao!.trim()}
                                baseOffset={
                                  (art.subsecao?.length || 0) -
                                  (art.subsecao?.trimStart().length || 0)
                                }
                                findings={
                                  previewFindingsByField[`subsecao:${art.id}`] ||
                                  []
                                }
                                enabled={highlightReview}
                                selectedFindingId={selectedFindingId}
                                onSelectFinding={(f) =>
                                  setSelectedFindingId(f.id)
                                }
                              />
                            </div>
                          )}
                          <p className="indent-8 whitespace-pre-line">
                            <span className="font-semibold">{artLabel}</span>{' '}
                            <HighlightedLegalText
                              displayText={caput}
                              baseOffset={leadCaput}
                              findings={
                                previewFindingsByField[`caput:${art.id}`] || []
                              }
                              enabled={highlightReview}
                              selectedFindingId={selectedFindingId}
                              onSelectFinding={(f) =>
                                setSelectedFindingId(f.id)
                              }
                            />
                          </p>

                          {art.incisos.map((inc, iIdx) => {
                            const isLastInc = iIdx === art.incisos.length - 1;
                            const hasAl = inc.alineas.length > 0;
                            const leadInc =
                              inc.texto.length - inc.texto.trimStart().length;
                            let txt = inc.texto.trim();
                            if (hasAl) txt = `${txt.replace(/[.;:]+$/, '')}:`;
                            else if (isLastInc)
                              txt = `${txt.replace(/[.;:]+$/, '')}.`;
                            else txt = `${txt.replace(/[.;:]+$/, '')};`;

                            return (
                              <div key={inc.id} className="space-y-1.5">
                                <p className="pl-8 whitespace-pre-line">
                                  {toRoman(iIdx + 1)} -{' '}
                                  <HighlightedLegalText
                                    displayText={txt}
                                    baseOffset={leadInc}
                                    findings={
                                      previewFindingsByField[
                                        `inciso:${art.id}:${inc.id}`
                                      ] || []
                                    }
                                    enabled={highlightReview}
                                    selectedFindingId={selectedFindingId}
                                    onSelectFinding={(f) =>
                                      setSelectedFindingId(f.id)
                                    }
                                  />
                                </p>
                                {inc.alineas.map((al, alIdx) => {
                                  const isLastAl =
                                    alIdx === inc.alineas.length - 1;
                                  const alSep =
                                    isLastAl && isLastInc ? '.' : ';';
                                  const leadAl =
                                    al.texto.length -
                                    al.texto.trimStart().length;
                                  const dispAl = `${al.texto
                                    .trim()
                                    .replace(/[.;:]+$/, '')}${alSep}`;
                                  return (
                                    <p
                                      key={al.id}
                                      className="pl-14 whitespace-pre-line"
                                    >
                                      {toLetter(alIdx)}){' '}
                                      <HighlightedLegalText
                                        displayText={dispAl}
                                        baseOffset={leadAl}
                                        findings={
                                          previewFindingsByField[
                                            `alinea:${art.id}:${inc.id}:${al.id}`
                                          ] || []
                                        }
                                        enabled={highlightReview}
                                        selectedFindingId={selectedFindingId}
                                        onSelectFinding={(f) =>
                                          setSelectedFindingId(f.id)
                                        }
                                      />
                                    </p>
                                  );
                                })}
                              </div>
                            );
                          })}

                          {art.paragrafos.map((par, pIdx) => {
                            const parLabel = formatParagrafoNumero(
                              pIdx,
                              art.paragrafos.length,
                              par.sufixo
                            );
                            const parIncisos = par.incisos || [];
                            const leadPar =
                              par.texto.length - par.texto.trimStart().length;
                            let pTxt = par.texto.trim();
                            if (parIncisos.length > 0 && !pTxt.endsWith(':')) {
                              pTxt = `${pTxt.replace(/[.;]+$/, '')}:`;
                            } else if (
                              parIncisos.length === 0 &&
                              pTxt &&
                              !/[.!?]$/.test(pTxt)
                            ) {
                              pTxt = `${pTxt}.`;
                            }

                            return (
                              <div key={par.id} className="space-y-2">
                                <p className="indent-8 whitespace-pre-line">
                                  <span className="font-semibold">
                                    {parLabel}
                                  </span>{' '}
                                  <HighlightedLegalText
                                    displayText={pTxt}
                                    baseOffset={leadPar}
                                    findings={
                                      previewFindingsByField[
                                        `paragrafo:${art.id}:${par.id}`
                                      ] || []
                                    }
                                    enabled={highlightReview}
                                    selectedFindingId={selectedFindingId}
                                    onSelectFinding={(f) =>
                                      setSelectedFindingId(f.id)
                                    }
                                  />
                                </p>

                                {parIncisos.map((inc, iIdx) => {
                                  const isLastInc =
                                    iIdx === parIncisos.length - 1;
                                  const hasAl = inc.alineas.length > 0;
                                  const leadInc =
                                    inc.texto.length -
                                    inc.texto.trimStart().length;
                                  let txt = inc.texto.trim();
                                  if (hasAl)
                                    txt = `${txt.replace(/[.;:]+$/, '')}:`;
                                  else if (isLastInc)
                                    txt = `${txt.replace(/[.;:]+$/, '')}.`;
                                  else txt = `${txt.replace(/[.;:]+$/, '')};`;

                                  return (
                                    <div key={inc.id} className="space-y-1.5">
                                      <p className="pl-8 whitespace-pre-line">
                                        {toRoman(iIdx + 1)} -{' '}
                                        <HighlightedLegalText
                                          displayText={txt}
                                          baseOffset={leadInc}
                                          findings={
                                            previewFindingsByField[
                                              `par_inciso:${art.id}:${par.id}:${inc.id}`
                                            ] || []
                                          }
                                          enabled={highlightReview}
                                          selectedFindingId={selectedFindingId}
                                          onSelectFinding={(f) =>
                                            setSelectedFindingId(f.id)
                                          }
                                        />
                                      </p>
                                      {inc.alineas.map((al, alIdx) => {
                                        const isLastAl =
                                          alIdx === inc.alineas.length - 1;
                                        const alSep =
                                          isLastAl && isLastInc ? '.' : ';';
                                        const leadAl =
                                          al.texto.length -
                                          al.texto.trimStart().length;
                                        const dispAl = `${al.texto
                                          .trim()
                                          .replace(/[.;:]+$/, '')}${alSep}`;
                                        return (
                                          <p
                                            key={al.id}
                                            className="pl-14 whitespace-pre-line"
                                          >
                                            {toLetter(alIdx)}){' '}
                                            <HighlightedLegalText
                                              displayText={dispAl}
                                              baseOffset={leadAl}
                                              findings={
                                                previewFindingsByField[
                                                  `par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`
                                                ] || []
                                              }
                                              enabled={highlightReview}
                                              selectedFindingId={
                                                selectedFindingId
                                              }
                                              onSelectFinding={(f) =>
                                                setSelectedFindingId(f.id)
                                              }
                                            />
                                          </p>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}

                          {(doc.imagens || [])
                            .filter(
                              (img) =>
                                img.posicao === 'pos_artigo' &&
                                img.artigoId === art.id
                            )
                            .map((img) => (
                              <NormaImagemPreviewBlock key={img.id} img={img} />
                            ))}
                        </div>
                      );
                    });
                  })()}

                  {doc.revogacoes.filter((r) => r.trim()).length > 0 && (
                    <div className="space-y-2 pt-1">
                      {(() => {
                        const revEntries = doc.revogacoes
                          .map((raw, idx) => ({
                            raw,
                            trimmed: raw.trim(),
                            lead: raw.length - raw.trimStart().length,
                            idx,
                          }))
                          .filter((item) => item.trimmed.length > 0);
                        const artLabel = formatArtigoNumero(
                          doc.artigos.length + 1
                        );
                        if (revEntries.length === 1) {
                          const item = revEntries[0];
                          const disp = `${item.trimmed.replace(/\.$/, '')}.`;
                          return (
                            <p className="indent-8">
                              <span className="font-semibold">{artLabel}</span>{' '}
                              Fica revogado o{' '}
                              <HighlightedLegalText
                                displayText={disp}
                                baseOffset={item.lead}
                                findings={
                                  previewFindingsByField[
                                    `revogacao:${item.idx}`
                                  ] || []
                                }
                                enabled={highlightReview}
                                selectedFindingId={selectedFindingId}
                                onSelectFinding={(f) =>
                                  setSelectedFindingId(f.id)
                                }
                              />
                            </p>
                          );
                        }
                        return (
                          <>
                            <p className="indent-8">
                              <span className="font-semibold">{artLabel}</span>{' '}
                              Ficam revogados:
                            </p>
                            {revEntries.map((item, rPos) => {
                              const disp = `${item.trimmed.replace(/[.;]+$/, '')}${
                                rPos === revEntries.length - 1 ? '.' : ';'
                              }`;
                              return (
                                <p key={item.idx} className="pl-8">
                                  {toRoman(rPos + 1)} -{' '}
                                  <HighlightedLegalText
                                    displayText={disp}
                                    baseOffset={item.lead}
                                    findings={
                                      previewFindingsByField[
                                        `revogacao:${item.idx}`
                                      ] || []
                                    }
                                    enabled={highlightReview}
                                    selectedFindingId={selectedFindingId}
                                    onSelectFinding={(f) =>
                                      setSelectedFindingId(f.id)
                                    }
                                  />
                                </p>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <p className="indent-8 pt-1">
                    <span className="font-semibold">
                      {formatArtigoNumero(
                        doc.artigos.length +
                          (doc.revogacoes.some((r) => r.trim()) ? 2 : 1)
                      )}
                    </span>{' '}
                    {renderVigenciaClause(doc)}
                  </p>
                </div>
                  </>
                )}

                <div className="mt-10 space-y-6 text-sm">
                  {doc.localAssinatura.trim() && (
                    <p className={isTech ? '' : 'indent-8'}>
                      <HighlightedLegalText
                        displayText={doc.localAssinatura.trim()}
                        baseOffset={
                          doc.localAssinatura.length -
                          doc.localAssinatura.trimStart().length
                        }
                        findings={
                          previewFindingsByField['localAssinatura'] || []
                        }
                        enabled={highlightReview}
                        selectedFindingId={selectedFindingId}
                        onSelectFinding={(f) => setSelectedFindingId(f.id)}
                      />
                    </p>
                  )}
                  {doc.assinante.trim() && (
                    <div className="text-center pt-4">
                      <div className="font-semibold uppercase">
                        {doc.assinante.trim()}
                      </div>
                      {doc.cargoAssinante.trim() && (
                        <div className="text-slate-700">
                          {doc.cargoAssinante.trim()}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {(() => {
                  const artIds = new Set(doc.artigos.map((a) => a.id));
                  const anexoImagens = (doc.imagens || []).filter(
                    (img) =>
                      img.posicao === 'anexo' ||
                      (img.posicao === 'pos_artigo' &&
                        (!img.artigoId || !artIds.has(img.artigoId)))
                  );
                  if (anexoImagens.length === 0) return null;
                  return (
                    <div className="mt-10 pt-8 border-t border-slate-200 space-y-6">
                      {anexoImagens.map((img) => (
                        <NormaImagemPreviewBlock key={img.id} img={img} />
                      ))}
                    </div>
                  );
                })()}
              </article>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Modal de Confirmação: Salvar cópia no Google Drive + Pasta de Imagens */}
      {driveCopyModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="editor-drive-copy-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <HardDrive className="w-5 h-5 text-slate-800 shrink-0 mt-0.5" />
                <div>
                  <h3
                    id="editor-drive-copy-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    Salvar cópia no Google Drive
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    Cria uma cópia da minuta atual e organiza as imagens
                    anexadas em uma pasta vinculada à norma.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDriveCopyModalOpen(false)}
                disabled={driveCopyBusy}
                aria-label="Fechar janela de cópia no Google Drive"
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-1.5 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">
                Estrutura de pastas no Google Drive
              </div>
              <div>
                Raiz:{' '}
                <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 border border-slate-200 rounded">
                  {DRIVE_DB_FOLDER_NAME}
                </span>
              </div>
              <div>
                Pasta da minuta:{' '}
                <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 border border-slate-200 rounded">
                  {minutaFolderPreviewName}
                </span>
              </div>
              <div>
                Pasta das imagens:{' '}
                <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 border border-slate-200 rounded">
                  {imagesFolderPreviewName}
                </span>{' '}
                <span className="text-slate-500 tabular-nums">
                  ({validImagesCount}{' '}
                  {validImagesCount === 1
                    ? 'imagem anexada'
                    : 'imagens anexadas'}
                  )
                </span>
              </div>
            </div>

            {(!driveHasSessionToken || needsDriveAuth) && !driveCopyResult ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-md space-y-3">
                <div className="flex items-start gap-2 text-xs text-amber-950 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    Autorize o acesso ao Google Drive na sua conta para gravar a
                    cópia desta minuta e enviar as imagens anexadas sem sair do
                    editor.
                  </span>
                </div>
                {driveAuthError && (
                  <p className="text-xs text-red-700">{driveAuthError.message}</p>
                )}
                <button
                  type="button"
                  onClick={() => void handleConnectDriveInModal()}
                  disabled={driveLoggingIn}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>
                    {driveLoggingIn
                      ? 'Conectando ao Google...'
                      : 'Conectar Google Drive'}
                  </span>
                </button>
              </div>
            ) : driveCopyResult ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md space-y-3 text-xs text-emerald-950">
                <div className="flex items-start gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    Cópia salva no Google Drive com sucesso.
                    {driveCopyResult.totalImagesCount > 0
                      ? ` Imagens: ${driveCopyResult.uploadedImagesCount} nova(s) enviada(s), ${driveCopyResult.skippedImagesCount} já existente(s).`
                      : ''}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {driveCopyResult.minutaFolder.webViewLink && (
                    <a
                      href={driveCopyResult.minutaFolder.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-md whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir pasta da minuta</span>
                    </a>
                  )}
                  {driveCopyResult.imagesFolder?.webViewLink && (
                    <a
                      href={driveCopyResult.imagesFolder.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-md whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir pasta das imagens</span>
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="font-medium text-slate-900">
                  Itens que serão salvos nesta cópia:
                </div>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={driveCopyIncludeDbRecord}
                    onChange={(e) =>
                      setDriveCopyIncludeDbRecord(e.target.checked)
                    }
                    className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>
                    Cópia editável de backup (
                    <span className="font-mono text-[11px]">.norma-db.json</span>
                    ) no Banco de Dados Legislativo para restaurar no editor
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={driveCopyIncludeDocx}
                    onChange={(e) => setDriveCopyIncludeDocx(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>
                    Documento Word (
                    <span className="font-mono text-[11px]">.docx</span>) dentro
                    da pasta da minuta
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={driveCopyIncludePdf}
                    onChange={(e) => setDriveCopyIncludePdf(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>
                    Cópia em PDF (<span className="font-mono text-[11px]">.pdf</span>
                    ) dentro da pasta da minuta
                  </span>
                </label>

                <label
                  className={`flex items-start gap-2 select-none ${
                    validImagesCount === 0
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={driveCopyIncludeImages && validImagesCount > 0}
                    disabled={validImagesCount === 0}
                    onChange={(e) =>
                      setDriveCopyIncludeImages(e.target.checked)
                    }
                    className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>
                    {validImagesCount > 0
                      ? `Salvar ${validImagesCount} ${
                          validImagesCount === 1
                            ? 'imagem anexada'
                            : 'imagens anexadas'
                        } na subpasta "${imagesFolderPreviewName}" (sem duplicar as já enviadas)`
                      : 'Nenhuma imagem anexada nesta minuta no momento'}
                  </span>
                </label>
              </div>
            )}

            {driveCopyError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
                {driveCopyError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDriveCopyModalOpen(false)}
                disabled={driveCopyBusy}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
              >
                {driveCopyResult ? 'Fechar' : 'Cancelar'}
              </button>
              {!driveCopyResult && driveHasSessionToken && !needsDriveAuth && (
                <button
                  type="button"
                  onClick={() => void handleConfirmSaveDriveCopy()}
                  disabled={driveCopyBusy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>
                    {driveCopyBusy
                      ? 'Salvando cópia...'
                      : 'Confirmar e salvar cópia'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
