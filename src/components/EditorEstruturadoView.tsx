import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Cloud,
  Columns2,
  Copy,
  CopyPlus,
  Download,
  Eye,
  FileEdit,
  FolderOpen,
  Highlighter,
  History,
  ImagePlus,
  LocateFixed,
  MessageSquareText,
  Plus,
  Printer,
  RotateCcw,
  Save,
  ShieldCheck,
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
  getOrdemExecucaoPadrao,
  renderNormaPlainText,
  toLetter,
  toRoman,
} from '../utils/legistica';
import {
  analyzeNormaLinguistics,
  applyAllAutoFixesToDoc,
  applyLinguisticFixToDoc,
  isPortugueseErrorFinding,
} from '../utils/revisorLinguistico';
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
import {
  ReviewedInput,
  ReviewedTextarea,
  TextSelectionRange,
} from './ReviewedTextFields';
import {
  FieldReviewHints,
  HIGHLIGHT_MARK_COLORS,
  HIGHLIGHT_MARK_COLOR_ORDER,
  HighlightMarkColor,
  HighlightedLegalText,
  RevisorLinguisticoPanel,
} from './RevisorLinguisticoPanel';
import { HistoricoRevisoesPanel } from './HistoricoRevisoesPanel';

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
}

type EditorLayoutMode = 'dividido' | 'editor' | 'previa';

type DivisionKind = 'titulo' | 'capitulo' | 'secao' | 'subsecao';

interface DivisionGroup {
  key: string;
  hasExplicitDivision: boolean;
  divisionText: string;
  leaderArtId: string;
  items: Array<{ art: ArtigoItem; globalIndex: number }>;
}

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
}) => {
  const [copied, setCopied] = useState(false);
  const [layoutMode, setLayoutMode] = useState<EditorLayoutMode>('dividido');
  const [rightPaneMode, setRightPaneMode] = useState<
    'previa' | 'revisor' | 'historico'
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

  const { spellChecker, addToDictionary, nativeFieldProps } = useSpellcheck();

  const plainText = useMemo(() => renderNormaPlainText(doc), [doc]);
  const audit = useMemo(() => auditNormaText(plainText), [plainText]);
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

  const divisionGroups = useMemo<DivisionGroup[]>(() => {
    const groups: DivisionGroup[] = [];
    for (let i = 0; i < doc.artigos.length; i++) {
      const art = doc.artigos[i];
      const divVal = activeDivisionKind ? art[activeDivisionKind] : undefined;
      if (activeDivisionKind && divVal !== undefined) {
        groups.push({
          key: `divgrp-${activeDivisionKind}-${art.id}`,
          hasExplicitDivision: true,
          divisionText: divVal,
          leaderArtId: art.id,
          items: [{ art, globalIndex: i }],
        });
      } else if (groups.length === 0) {
        groups.push({
          key: 'divgrp-inicial',
          hasExplicitDivision: false,
          divisionText: '',
          leaderArtId: art.id,
          items: [{ art, globalIndex: i }],
        });
      } else {
        groups[groups.length - 1].items.push({ art, globalIndex: i });
      }
    }
    return groups;
  }, [doc.artigos, activeDivisionKind]);

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

  const handleTipoChange = (tipo: NormaTipo) => {
    onChange({
      ...doc,
      tipo,
      ordemExecucao: getOrdemExecucaoPadrao(tipo),
      updatedAt: new Date().toISOString(),
    });
  };

  const getNextDivisionPrefix = (
    kind: 'titulo' | 'capitulo' | 'secao' | 'subsecao',
    upToIndex: number
  ): string => {
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

    if (kind === 'titulo') {
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
    const hasCapitulosNaNorma = doc.artigos.some(
      (a) => a.capitulo !== undefined
    );
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
    onChange({
      id: uid('doc'),
      tipo: 'Decreto',
      numero: '___',
      data: 'DE 17 DE NOVEMBRO DE 2026',
      esfera: 'Administração Pública',
      autoridade: 'O PREFEITO MUNICIPAL',
      fundamentoLegal: 'no uso das atribuições que lhe confere a lei',
      ementa: 'Dispõe sobre [objeto principal da norma].',
      ordemExecucao: 'DECRETA:',
      artigos: [
        {
          id: uid('art'),
          capitulo: 'CAPÍTULO I - DAS DISPOSIÇÕES GERAIS',
          caput:
            'Este ato estabelece normas sobre [objeto] no âmbito de [órgão ou abrangência].',
          incisos: [],
          paragrafos: [],
        },
      ],
      vigenciaTipo: 'imediata',
      vigenciaDias: 30,
      vigenciaData: '',
      revogacoes: [],
      localAssinatura: 'Palácio Municipal, em 17 de novembro de 2026.',
      assinante: '[NOME DA AUTORIDADE]',
      cargoAssinante: 'Prefeito Municipal',
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
      fieldKey === 'ementa' ||
      fieldKey === 'fundamentoLegal' ||
      fieldKey === 'autoridade'
    ) {
      setCollapsedSections((prev) => ({ ...prev, preliminar: false }));
    } else if (
      fieldKey.startsWith('revogacao:') ||
      fieldKey === 'vigenciaData' ||
      fieldKey === 'localAssinatura'
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
          const input = container.querySelector('textarea, input') as
            | HTMLTextAreaElement
            | HTMLInputElement
            | null;
          if (input) {
            input.focus();
          }
        }
      });
    });
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

  const showEditor = layoutMode === 'dividido' || layoutMode === 'editor';
  const showPreview = layoutMode === 'dividido' || layoutMode === 'previa';

  return (
    <div className="space-y-6">
      {/* Barra de Modelos, Salvamento, Acesso a Decretos Salvos e Auditoria */}
      <div className="no-print bg-white border border-slate-200 rounded-lg px-5 py-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleExplicitSave()}
              disabled={savingNow || cloudSyncStatus === 'saving'}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {saveFeedback === 'saved' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Save className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {savingNow || cloudSyncStatus === 'saving'
                  ? 'Salvando...'
                  : saveFeedback === 'saved'
                    ? 'Decreto salvo'
                    : 'Salvar decreto'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleExplicitSaveAsNew()}
              disabled={savingNow}
              title="Salva uma nova cópia separada deste decreto na nuvem"
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
                Decretos salvos ({cloudNormas.length})
              </span>
              {savedLibraryOpen ? (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              )}
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
            <span>{audit.totalArtigos} artigos</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                audit.erros > 0
                  ? 'font-medium text-red-700'
                  : 'font-medium text-emerald-700'
              }
            >
              {audit.erros === 0
                ? 'Sem erros formais'
                : `${audit.erros} ${audit.erros === 1 ? 'erro formal' : 'erros formais'}`}
            </span>
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
      </div>

      {savedLibraryOpen && (
        <section className="no-print bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-slate-700 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Decretos e Minutas Salvas na Conta
                </h3>
                <p className="text-xs text-slate-500">
                  Troque de decreto a qualquer momento ou recupere versões anteriores salvas automaticamente
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSavedLibraryOpen(false)}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded"
              aria-label="Fechar painel de decretos salvos"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {cloudSyncError && (
            <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-800">
              Não foi possível concluir o último salvamento na nuvem. Seus dados locais permanecem protegidos abaixo.
            </div>
          )}

          <div className="divide-y divide-slate-200">
            {cloudNormas.length === 0 ? (
              <div className="px-5 py-4 text-xs text-slate-500">
                Nenhum decreto salvo na nuvem ainda. Clique em <strong>Salvar decreto</strong> acima para gravar esta minuta.
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
                        {item.doc.artigos.length === 1 ? 'artigo' : 'artigos'} · Atualizado em{' '}
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
                          <span>Abrir decreto</span>
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
            ? 'grid grid-cols-1 xl:grid-cols-12 gap-6 items-start'
            : 'max-w-4xl mx-auto space-y-6'
        }
      >
        {/* Coluna Esquerda: Edição Estruturada */}
        {showEditor && (
          <div
            className={`no-print space-y-6 ${
              layoutMode === 'dividido' ? 'xl:col-span-6' : ''
            }`}
          >
            {/* Barra de Marcação nas Caixas de Edição e Acesso às Observações */}
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
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

            {/* 1. Parte Preliminar */}
            <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div
                className={`flex flex-wrap items-center justify-between gap-3 ${
                  collapsedSections.preliminar ? '' : 'border-b border-slate-200 pb-3'
                }`}
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    1. Parte Preliminar (Epígrafe, Ementa e Preâmbulo)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Identificação oficial, resumo do objeto e competência jurídica
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
                    Espécie Normativa
                  </label>
                  <select
                    value={doc.tipo}
                    onChange={(e) => handleTipoChange(e.target.value as NormaTipo)}
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="Decreto">Decreto</option>
                    <option value="Instrução Normativa">Instrução Normativa</option>
                    <option value="Portaria">Portaria</option>
                    <option value="Resolução">Resolução</option>
                    <option value="Norma Interna">Norma Interna</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Número
                  </label>
                  <input
                    type="text"
                    value={doc.numero}
                    onChange={(e) => updateField('numero', e.target.value)}
                    placeholder="Ex.: 1.842"
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data por Extenso
                  </label>
                  <input
                    type="text"
                    value={doc.data}
                    onChange={(e) => updateField('data', e.target.value)}
                    placeholder="DE 17 DE NOVEMBRO DE 2026"
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div data-review-field="ementa" className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Ementa (Resumo objetivo do conteúdo — Art. 5º da LC 95/98)
                </label>
                <ReviewedTextarea
                  rows={2}
                  value={doc.ementa}
                  onChange={(e) => updateField('ementa', e.target.value)}
                  findings={review.byField['ementa'] || []}
                  highlightEnabled={highlightReview}
                  {...getFieldMarkProps('ementa', 'Ementa')}
                  onApplyFix={handleApplyReviewFix}
                  onIgnoreFinding={handleIgnoreFinding}
                  onAddToDictionary={addToDictionary}
                  {...nativeFieldProps}
                />
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
                    Autoridade Signatária (Preâmbulo)
                  </label>
                  <ReviewedInput
                    type="text"
                    value={doc.autoridade}
                    onChange={(e) => updateField('autoridade', e.target.value)}
                    findings={review.byField['autoridade'] || []}
                    highlightEnabled={highlightReview}
                    {...getFieldMarkProps('autoridade', 'Autoridade Signatária')}
                    onApplyFix={handleApplyReviewFix}
                    onIgnoreFinding={handleIgnoreFinding}
                    onAddToDictionary={addToDictionary}
                    {...nativeFieldProps}
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  {showInlineHints && (
                    <FieldReviewHints
                      findings={review.byField['autoridade'] || []}
                      onApplyFix={handleApplyReviewFix}
                      onIgnore={handleIgnoreFinding}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Ordem de Execução
                  </label>
                  <input
                    type="text"
                    value={doc.ordemExecucao}
                    onChange={(e) => updateField('ordemExecucao', e.target.value)}
                    {...nativeFieldProps}
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div data-review-field="fundamentoLegal" className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Fundamento Legal de Competência (use Enter para separar blocos ou CONSIDERANDOs)
                </label>
                <ReviewedTextarea
                  rows={3}
                  value={doc.fundamentoLegal}
                  onChange={(e) => updateField('fundamentoLegal', e.target.value)}
                  findings={review.byField['fundamentoLegal'] || []}
                  highlightEnabled={highlightReview}
                  {...getFieldMarkProps(
                    'fundamentoLegal',
                    'Preâmbulo / Fundamento Legal'
                  )}
                  onApplyFix={handleApplyReviewFix}
                  onIgnoreFinding={handleIgnoreFinding}
                  onAddToDictionary={addToDictionary}
                  {...nativeFieldProps}
                />
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

            {/* 2. Parte Normativa (Articulado) */}
            <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
              <div
                className={`flex flex-wrap items-center justify-between gap-3 ${
                  collapsedSections.normativa ? '' : 'border-b border-slate-200 pb-3'
                }`}
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    2. Parte Normativa (Títulos, Capítulos, Seções e Artigos)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Numeração ordinal/cardinal e pontuação aplicadas automaticamente
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
                          ? `Expandir ${DIVISION_KIND_PLURAL[activeDivisionKind!]}`
                          : `Recolher ${DIVISION_KIND_PLURAL[activeDivisionKind!]}`}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={addArtigoComTitulo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Título</span>
                  </button>
                  <button
                    type="button"
                    onClick={addArtigo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Artigo</span>
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
              <div className="space-y-5">
                {divisionGroups.map((group) => {
                  const isCollapsed =
                    hasDivisionsInDoc && Boolean(collapsedTitulos[group.key]);
                  const firstArtNum = formatArtigoNumero(
                    group.items[0].globalIndex + 1,
                    group.items[0].art.sufixo
                  ).replace(/\.$/, '');
                  const lastItem = group.items[group.items.length - 1];
                  const lastArtNum = formatArtigoNumero(
                    lastItem.globalIndex + 1,
                    lastItem.art.sufixo
                  ).replace(/\.$/, '');
                  const rangeLabel =
                    group.items.length === 1
                      ? firstArtNum
                      : `${firstArtNum} a ${lastArtNum}`;
                  const groupFindingsCount = group.items.reduce((acc, it) => {
                    const artId = it.art.id;
                    const artFindings = review.findings.filter((f) =>
                      f.fieldKey.includes(`:${artId}`)
                    );
                    return acc + artFindings.length;
                  }, 0);

                  const renderArtigoCard = (
                    art: ArtigoItem,
                    aIdx: number,
                    localIdx: number
                  ) => {
                    const artLabel = formatArtigoNumero(aIdx + 1, art.sufixo);
                    const divisions: Array<{
                      kind: 'titulo' | 'capitulo' | 'secao' | 'subsecao';
                      label: string;
                      placeholder: string;
                      value: string | undefined;
                    }> = [
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
                      <div
                        key={art.id}
                        className={localIdx > 0 ? 'pt-6 space-y-3' : 'space-y-3'}
                      >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
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
                              + Título
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
                              + Capítulo
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
                              + Seção
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
                              + Subseção
                            </button>
                          )}
                        </div>

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
                          placeholder="Redação do caput do artigo..."
                          findings={review.byField[`caput:${art.id}`] || []}
                          highlightEnabled={highlightReview}
                          {...getFieldMarkProps(
                            `caput:${art.id}`,
                            `${artLabel.replace(/\.$/, '')} (caput)`
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

                      {/* Incisos */}
                      {art.incisos.length > 0 && (
                        <div className="pl-3 sm:pl-4 space-y-3 border-l border-slate-200">
                          {art.incisos.map((inc, iIdx) => (
                            <div key={inc.id} className="space-y-2">
                              <div
                                data-review-field={`inciso:${art.id}:${inc.id}`}
                                className="space-y-1.5"
                              >
                                <div className="flex items-start gap-2">
                                  <span className="font-mono text-xs font-medium text-slate-600 pt-2 min-w-10 whitespace-nowrap shrink-0">
                                    {toRoman(iIdx + 1)} -
                                  </span>
                                  <ReviewedTextarea
                                    rows={1}
                                    value={inc.texto}
                                    onChange={(e) =>
                                      updateInciso(art.id, inc.id, e.target.value)
                                    }
                                    placeholder="Texto do inciso em minúscula inicial..."
                                    findings={
                                      review.byField[`inciso:${art.id}:${inc.id}`] || []
                                    }
                                    highlightEnabled={highlightReview}
                                    {...getFieldMarkProps(
                                      `inciso:${art.id}:${inc.id}`,
                                      `${artLabel.replace(/\.$/, '')}, inciso ${toRoman(iIdx + 1)}`
                                    )}
                                    onApplyFix={handleApplyReviewFix}
                                    onIgnoreFinding={handleIgnoreFinding}
                                    onAddToDictionary={addToDictionary}
                                    wrapperClassName="flex-1 min-w-0"
                                    textStyleClassName="text-sm text-slate-900 leading-relaxed px-3 py-1.5"
                                    {...nativeFieldProps}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => addAlinea(art.id, inc.id)}
                                    className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md whitespace-nowrap shrink-0"
                                  >
                                    + Alínea
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
                                <div className="pl-10 space-y-1.5">
                                  {inc.alineas.map((al, alIdx) => (
                                    <div
                                      key={al.id}
                                      data-review-field={`alinea:${art.id}:${inc.id}:${al.id}`}
                                      className="space-y-1"
                                    >
                                      <div className="flex items-start gap-2">
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
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeAlinea(art.id, inc.id, al.id)
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
                                            onApplyFix={handleApplyReviewFix}
                                            onIgnore={handleIgnoreFinding}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Parágrafos */}
                      {art.paragrafos.length > 0 && (
                        <div className="pl-3 sm:pl-4 space-y-3 border-l border-slate-200">
                          {art.paragrafos.map((par, pIdx) => {
                            const parIncisos = par.incisos || [];
                            return (
                              <div
                                key={par.id}
                                className="space-y-2"
                              >
                                <div
                                  data-review-field={`paragrafo:${art.id}:${par.id}`}
                                  className="space-y-1.5"
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="font-mono text-xs font-medium text-slate-600 pt-2 w-28 whitespace-nowrap shrink-0">
                                      {formatParagrafoNumero(
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
                                      placeholder="Texto do parágrafo..."
                                      findings={
                                        review.byField[
                                          `paragrafo:${art.id}:${par.id}`
                                        ] || []
                                      }
                                      highlightEnabled={highlightReview}
                                      {...getFieldMarkProps(
                                        `paragrafo:${art.id}:${par.id}`,
                                        `${artLabel.replace(/\.$/, '')}, ${formatParagrafoNumero(
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
                                    <button
                                      type="button"
                                      onClick={() =>
                                        addParagrafoInciso(art.id, par.id)
                                      }
                                      title="Adicionar inciso vinculado a este parágrafo"
                                      className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md whitespace-nowrap shrink-0"
                                    >
                                      + Inciso
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
                                  <div className="pl-6 sm:pl-8 space-y-2.5 border-l border-slate-200">
                                    {parIncisos.map((inc, iIdx) => (
                                      <div key={inc.id} className="space-y-2">
                                        <div
                                          data-review-field={`par_inciso:${art.id}:${par.id}:${inc.id}`}
                                          className="space-y-1.5"
                                        >
                                          <div className="flex items-start gap-2">
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
                                          <div className="pl-10 space-y-1.5">
                                            {inc.alineas.map((al, alIdx) => (
                                              <div
                                                key={al.id}
                                                data-review-field={`par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`}
                                                className="space-y-1"
                                              >
                                                <div className="flex items-start gap-2">
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
                                                    highlightEnabled={highlightReview}
                                                    {...getFieldMarkProps(
                                                      `par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`,
                                                      `${artLabel.replace(/\.$/, '')}, ${formatParagrafoNumero(
                                                        pIdx,
                                                        art.paragrafos.length,
                                                        par.sufixo
                                                      ).replace(/\.$/, '')}, alínea "${toLetter(alIdx)}"`
                                                    )}
                                                    onApplyFix={handleApplyReviewFix}
                                                    onIgnoreFinding={handleIgnoreFinding}
                                                    onAddToDictionary={addToDictionary}
                                                    wrapperClassName="flex-1 min-w-0"
                                                    textStyleClassName="text-xs text-slate-900 leading-relaxed px-2.5 py-1.5"
                                                    {...nativeFieldProps}
                                                  />
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
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => addInciso(art.id)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                          >
                            + Inciso no caput (I, II)
                          </button>
                          <button
                            type="button"
                            onClick={() => addParagrafo(art.id)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                          >
                            + Parágrafo (§)
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerQuickArticleImageUpload(art.id)}
                            title="Inserir imagem ou carimbo logo abaixo deste artigo"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap"
                          >
                            <ImagePlus className="w-3 h-3" />
                            <span>Imagem após este</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => insertArtigoAt(aIdx + 1, true)}
                            title="Inserir novo artigo logo abaixo deste"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Artigo após este</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                };

                if (!hasDivisionsInDoc) {
                  return (
                    <div key={group.key} className="space-y-6 divide-y divide-slate-200">
                      {group.items.map((item, localIdx) =>
                        renderArtigoCard(item.art, item.globalIndex, localIdx)
                      )}
                    </div>
                  );
                }

                const kindLabel = activeDivisionKind
                  ? DIVISION_KIND_SINGULAR[activeDivisionKind]
                  : 'Seção';

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
                          {group.hasExplicitDivision
                            ? group.divisionText.trim() ||
                              `${kindLabel} sem denominação`
                            : `Disposições Iniciais (sem ${kindLabel})`}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
                          · {rangeLabel} ({group.items.length}{' '}
                          {group.items.length === 1 ? 'artigo' : 'artigos'})
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
                            insertArtigoAt(lastItem.globalIndex + 1, true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Artigo neste {kindLabel}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleDivisionGroup(group.key)}
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
                          <span>{isCollapsed ? 'Expandir' : 'Recolher'}</span>
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="p-4 space-y-6 divide-y divide-slate-200">
                        {group.items.map((item, localIdx) =>
                          renderArtigoCard(item.art, item.globalIndex, localIdx)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Regra de Vigência (Art. 8º LC 95/98)
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">
                    Revogações Expressas (Art. 9º da LC 95/98 — nunca use &quot;em contrário&quot;)
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
                    Nenhuma revogação informada. Adicione apenas se o ato substituir norma anterior.
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div data-review-field="localAssinatura" className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Local e Data
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
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  {showInlineHints && (
                    <FieldReviewHints
                      findings={review.byField['localAssinatura'] || []}
                      onApplyFix={handleApplyReviewFix}
                      onIgnore={handleIgnoreFinding}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Autoridade
                  </label>
                  <input
                    type="text"
                    value={doc.assinante}
                    onChange={(e) => updateField('assinante', e.target.value)}
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cargo
                  </label>
                  <input
                    type="text"
                    value={doc.cargoAssinante}
                    onChange={(e) => updateField('cargoAssinante', e.target.value)}
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                  />
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

        {/* Coluna Direita: Folha Oficial em Tempo Real ou Revisor Linguístico */}
        {showPreview && (
          <div
            className={`space-y-3 ${
              layoutMode === 'dividido' ? 'xl:col-span-6 xl:sticky xl:top-6' : ''
            }`}
          >
            <div className="no-print bg-white border border-slate-200 rounded-lg px-4 py-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center p-1 bg-slate-100 rounded-md shrink-0">
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

            {rightPaneMode === 'revisor' ? (
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
              <article className="print-sheet bg-white border border-slate-200 rounded-lg p-8 sm:p-12 font-serif text-slate-900 leading-relaxed">
                {(doc.imagens || [])
                  .filter((img) => img.posicao === 'cabecalho')
                  .map((img) => (
                    <NormaImagemPreviewBlock key={img.id} img={img} />
                  ))}

                <div className="text-center font-bold tracking-wide text-sm uppercase mb-6">
                  {doc.tipo.toUpperCase()} Nº {doc.numero.trim() || '___'},{' '}
                  {(doc.data || 'DE ___ DE __________ DE _____').toUpperCase()}
                </div>

                {doc.ementa.trim() && (
                  <p className="text-sm leading-relaxed ml-auto w-full sm:w-3/5 text-justify mb-6">
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

                {/* Preâmbulo preservando múltiplos CONSIDERANDOs / parágrafos */}
                <div className="space-y-3 text-sm text-justify mb-6">
                  {(() => {
                    const ordem =
                      doc.ordemExecucao.trim() ||
                      getOrdemExecucaoPadrao(doc.tipo);
                    const fundFindings =
                      previewFindingsByField['fundamentoLegal'] || [];
                    const autFindings =
                      previewFindingsByField['autoridade'] || [];
                    const autTrimLead =
                      doc.autoridade.length - doc.autoridade.trimStart().length;
                    if (fundamentoSpans.length <= 1) {
                      const span = fundamentoSpans[0] || {
                        text: '',
                        offset: 0,
                      };
                      const needsComma = span.text && !/[,:;]$/.test(span.text);
                      return (
                        <p className="indent-8">
                          <span className="font-semibold">
                            <HighlightedLegalText
                              displayText={doc.autoridade.trim()}
                              baseOffset={autTrimLead}
                              findings={autFindings}
                              enabled={highlightReview}
                              selectedFindingId={selectedFindingId}
                              onSelectFinding={(f) =>
                                setSelectedFindingId(f.id)
                              }
                            />
                          </span>
                          ,{' '}
                          <HighlightedLegalText
                            displayText={span.text}
                            baseOffset={span.offset}
                            findings={fundFindings}
                            enabled={highlightReview}
                            selectedFindingId={selectedFindingId}
                            onSelectFinding={(f) => setSelectedFindingId(f.id)}
                          />
                          {needsComma ? ',' : ''}{' '}
                          <span className="font-semibold">{ordem}</span>
                        </p>
                      );
                    }
                    const lastIdx = fundamentoSpans.length - 1;
                    return fundamentoSpans.map((span, lIdx) => {
                      const isFirst = lIdx === 0;
                      const isLast = lIdx === lastIdx;
                      const hasOrdemInside =
                        /(DECRETA:|RESOLVE:|ESTABELECE:|PROMULGA:)\s*$/i.test(
                          span.text
                        );
                      const needsComma = !/[,:;]$/.test(span.text);
                      return (
                        <p key={lIdx} className="indent-8">
                          {isFirst && (
                            <>
                              <span className="font-semibold">
                                <HighlightedLegalText
                                  displayText={doc.autoridade.trim()}
                                  baseOffset={autTrimLead}
                                  findings={autFindings}
                                  enabled={highlightReview}
                                  selectedFindingId={selectedFindingId}
                                  onSelectFinding={(f) =>
                                    setSelectedFindingId(f.id)
                                  }
                                />
                              </span>
                              ,{' '}
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
                          {isLast && !hasOrdemInside && (
                            <>
                              {needsComma ? ',' : ''}{' '}
                              <span className="font-semibold">{ordem}</span>
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
                    {(() => {
                      const lines = plainText.split('\n');
                      const vigLine = lines.find((l) =>
                        /entra em vigor/i.test(l)
                      );
                      return vigLine
                        ? vigLine.replace(/^Art\.\s*\d+º?\s*/, '')
                        : 'Este ato entra em vigor na data de sua publicação.';
                    })()}
                  </p>
                </div>

                <div className="mt-10 space-y-6 text-sm">
                  {doc.localAssinatura.trim() && (
                    <p className="indent-8">
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
        )}
      </div>
    </div>
  );
};
