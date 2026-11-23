import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  Highlighter,
  MessageSquarePlus,
  SpellCheck,
  X,
} from 'lucide-react';
import { LinguisticCategory, LinguisticFinding } from '../types/norma';
import {
  HIGHLIGHT_MARK_COLORS,
  HIGHLIGHT_MARK_COLOR_ORDER,
  HighlightMarkColor,
} from './RevisorLinguisticoPanel';
import { SpellcheckContextMenu } from './SpellcheckContextMenu';

export interface TextSelectionRange {
  start: number;
  end: number;
  text: string;
}

export interface EditorTextMark {
  id: string;
  start: number;
  end: number;
  text: string;
  color: HighlightMarkColor;
}

const BACKDROP_MARK_STYLES: Record<LinguisticCategory, string> = {
  ortografia:
    'underline decoration-wavy decoration-red-600 decoration-[1.5px] underline-offset-2 bg-red-100/55 text-transparent rounded-xs',
  gramatica:
    'underline decoration-wavy decoration-amber-500 decoration-[1.5px] underline-offset-2 bg-amber-100/55 text-transparent rounded-xs',
  linguagem_juridica:
    'underline decoration-wavy decoration-sky-500 decoration-[1.5px] underline-offset-2 bg-sky-100/55 text-transparent rounded-xs',
};

function renderHighlightSegments(
  value: string,
  findings: LinguisticFinding[],
  markedRanges: EditorTextMark[] = []
): React.ReactNode {
  const validMarks = markedRanges
    .filter(
      (m) =>
        m.end > m.start &&
        m.start < value.length &&
        m.end > 0
    )
    .map((m) => ({
      ...m,
      start: Math.max(0, m.start),
      end: Math.min(value.length, m.end),
    }))
    .filter((m) => m.end > m.start);

  if (!value || (findings.length === 0 && validMarks.length === 0)) {
    return value.endsWith('\n') ? `${value} ` : value;
  }

  const ordered = [...findings]
    .filter((f) => f.start >= 0 && f.end > f.start && f.end <= value.length)
    .sort((a, b) => a.start - b.start);

  if (ordered.length === 0 && validMarks.length === 0) {
    return value.endsWith('\n') ? `${value} ` : value;
  }

  const points = new Set<number>([0, value.length]);
  for (const f of ordered) {
    points.add(f.start);
    points.add(f.end);
  }
  for (const m of validMarks) {
    points.add(m.start);
    points.add(m.end);
  }
  const sorted = Array.from(points).sort((a, b) => a - b);

  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segEnd <= segStart) continue;

    const slice = value.slice(segStart, segEnd);
    const finding = ordered.find((f) => segStart >= f.start && segEnd <= f.end);

    let activeMark: EditorTextMark | null = null;
    for (const m of validMarks) {
      if (segStart >= m.start && segEnd <= m.end) {
        activeMark = m;
      }
    }

    if (!finding && !activeMark) {
      nodes.push(
        <React.Fragment key={`t-${segStart}`}>{slice}</React.Fragment>
      );
      continue;
    }

    const markedBgClass = activeMark
      ? HIGHLIGHT_MARK_COLORS[activeMark.color]?.editorBackdropClass ||
        HIGHLIGHT_MARK_COLORS.yellow.editorBackdropClass
      : '';

    const markClass = activeMark
      ? finding
        ? `${BACKDROP_MARK_STYLES[finding.categoria]} ${markedBgClass}`
        : `${markedBgClass} text-transparent rounded-xs`
      : BACKDROP_MARK_STYLES[finding!.categoria];

    nodes.push(
      <mark
        key={`m-${segStart}-${finding?.id || activeMark?.id || 'sel'}`}
        data-finding-id={finding?.id}
        className={markClass}
      >
        {slice}
      </mark>
    );
  }

  if (value.endsWith('\n')) {
    nodes.push(<React.Fragment key="trailing-nl">{' '}</React.Fragment>);
  }

  return nodes;
}

interface SelectionMarkPopoverProps {
  selection: TextSelectionRange;
  overlappingMarks: EditorTextMark[];
  defaultColor: HighlightMarkColor;
  fieldLabel?: string;
  obsAdded: boolean;
  onSelectColor?: (color: HighlightMarkColor) => void;
  onApplyMark?: (range: TextSelectionRange, color: HighlightMarkColor) => void;
  onRemoveOverlapping?: (ids: string[]) => void;
  onAddToObservacoes?: (text: string, fieldLabel?: string) => void;
  onOpenObservacoes?: () => void;
}

const SelectionMarkPopover: React.FC<SelectionMarkPopoverProps> = ({
  selection,
  overlappingMarks,
  defaultColor,
  fieldLabel,
  obsAdded,
  onSelectColor,
  onApplyMark,
  onRemoveOverlapping,
  onAddToObservacoes,
  onOpenObservacoes,
}) => {
  if (!onApplyMark && !onAddToObservacoes) return null;

  return (
    <div
      role="toolbar"
      aria-label="Opções de marcação e observação para o trecho selecionado"
      onMouseDown={(e) => e.preventDefault()}
      className="absolute bottom-full left-0 mb-1.5 z-30 flex flex-wrap items-center gap-2 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 shadow-md text-xs text-slate-700 max-w-full"
    >
      {onApplyMark && (
        <div className="flex items-center gap-1.5">
          <Highlighter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="font-medium text-slate-800 whitespace-nowrap">
            Marcar:
          </span>
          <div className="inline-flex items-center gap-1">
            {HIGHLIGHT_MARK_COLOR_ORDER.map((colorKey) => {
              const meta = HIGHLIGHT_MARK_COLORS[colorKey];
              const isDefault = defaultColor === colorKey;
              return (
                <button
                  key={colorKey}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectColor?.(colorKey);
                    onApplyMark(selection, colorKey);
                  }}
                  aria-label={`Marcar trecho em ${meta.label}`}
                  title={`Marcar em ${meta.label}`}
                  className={`w-4 h-4 rounded-xs border transition-transform ${meta.swatchClass} ${
                    isDefault
                      ? 'ring-2 ring-slate-900 ring-offset-1 scale-105'
                      : 'opacity-85 hover:opacity-100 hover:scale-105'
                  }`}
                />
              );
            })}
          </div>
          {overlappingMarks.length > 0 && onRemoveOverlapping && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                onRemoveOverlapping(overlappingMarks.map((m) => m.id))
              }
              title="Remover marcação deste trecho"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors whitespace-nowrap"
            >
              <Eraser className="w-3 h-3" />
              <span>Desmarcar</span>
            </button>
          )}
        </div>
      )}

      {onApplyMark && onAddToObservacoes && (
        <span className="h-3.5 w-px bg-slate-200 shrink-0" aria-hidden="true" />
      )}

      {onAddToObservacoes && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAddToObservacoes(selection.text, fieldLabel)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap ${
              obsAdded
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {obsAdded ? (
              <Check className="w-3 h-3 shrink-0" />
            ) : (
              <MessageSquarePlus className="w-3 h-3 shrink-0" />
            )}
            <span>{obsAdded ? 'Adicionado' : '+ Observações'}</span>
          </button>
          {obsAdded && onOpenObservacoes && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onOpenObservacoes}
              className="px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:text-slate-950 underline underline-offset-2 whitespace-nowrap"
            >
              Ver obs.
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface FieldMarksStripProps {
  marks: EditorTextMark[];
  fieldLabel?: string;
  onFocusRange: (start: number, end: number) => void;
  onUpdateMarkColor?: (markId: string, color: HighlightMarkColor) => void;
  onRemoveMark?: (markId: string) => void;
  onAddToObservacoes?: (text: string, fieldLabel?: string) => void;
  onOpenObservacoes?: () => void;
}

const FieldMarksStrip: React.FC<FieldMarksStripProps> = ({
  marks,
  fieldLabel,
  onFocusRange,
  onUpdateMarkColor,
  onRemoveMark,
  onAddToObservacoes,
  onOpenObservacoes,
}) => {
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [addedMarkId, setAddedMarkId] = useState<string | null>(null);

  if (marks.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
      {marks.map((mark) => {
        const meta =
          HIGHLIGHT_MARK_COLORS[mark.color] || HIGHLIGHT_MARK_COLORS.yellow;
        const snippet =
          mark.text.replace(/\s+/g, ' ').trim().slice(0, 40) +
          (mark.text.replace(/\s+/g, ' ').trim().length > 40 ? '...' : '');
        const isEditingColor = editingColorId === mark.id;
        const wasAdded = addedMarkId === mark.id;

        return (
          <div
            key={mark.id}
            className="inline-flex items-center gap-1.5 max-w-full"
          >
            {onUpdateMarkColor && (
              <div className="inline-flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setEditingColorId((prev) =>
                      prev === mark.id ? null : mark.id
                    )
                  }
                  title={`Cor: ${meta.label}. Clique para alterar a cor da marcação`}
                  aria-label={`Alterar cor da marcação (${meta.label})`}
                  className={`w-3 h-3 rounded-xs border transition-transform hover:scale-110 ${meta.swatchClass}`}
                />
                {isEditingColor && (
                  <span className="inline-flex items-center gap-1 pl-0.5 pr-1 py-0.5 bg-white border border-slate-200 rounded shadow-xs">
                    {HIGHLIGHT_MARK_COLOR_ORDER.map((colorKey) => {
                      const cMeta = HIGHLIGHT_MARK_COLORS[colorKey];
                      return (
                        <button
                          key={colorKey}
                          type="button"
                          onClick={() => {
                            onUpdateMarkColor(mark.id, colorKey);
                            setEditingColorId(null);
                          }}
                          aria-label={`Mudar para ${cMeta.label}`}
                          title={cMeta.label}
                          className={`w-3 h-3 rounded-xs border ${cMeta.swatchClass} ${
                            mark.color === colorKey
                              ? 'ring-1 ring-slate-900 ring-offset-1'
                              : 'opacity-80 hover:opacity-100'
                          }`}
                        />
                      );
                    })}
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => onFocusRange(mark.start, mark.end)}
              title={`Selecionar "${mark.text}" na caixa de edição`}
              className="text-slate-700 hover:text-slate-950 hover:underline truncate max-w-[220px] text-left"
            >
              &ldquo;{snippet}&rdquo;
            </button>

            {onAddToObservacoes && (
              <button
                type="button"
                onClick={() => {
                  onAddToObservacoes(mark.text, fieldLabel);
                  setAddedMarkId(mark.id);
                  window.setTimeout(() => {
                    setAddedMarkId((curr) => (curr === mark.id ? null : curr));
                  }, 2200);
                }}
                title="Adicionar este trecho marcado às observações da minuta"
                className={`inline-flex items-center gap-0.5 font-medium whitespace-nowrap ${
                  wasAdded
                    ? 'text-emerald-700'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {wasAdded ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Obs. ok</span>
                  </>
                ) : (
                  <span>+ Obs.</span>
                )}
              </button>
            )}

            {wasAdded && onOpenObservacoes && (
              <button
                type="button"
                onClick={onOpenObservacoes}
                className="text-slate-600 hover:text-slate-950 underline underline-offset-2 whitespace-nowrap"
              >
                Ver
              </button>
            )}

            {onRemoveMark && (
              <button
                type="button"
                onClick={() => onRemoveMark(mark.id)}
                aria-label="Remover marcação"
                title="Remover marcação"
                className="text-slate-400 hover:text-red-600 p-0.5 shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface ContextMenuState {
  x: number;
  y: number;
  findingId: string;
}

function findHitFinding(
  backdropEl: HTMLDivElement | null,
  inputEl: HTMLTextAreaElement | HTMLInputElement | null,
  findings: LinguisticFinding[],
  clientX: number,
  clientY: number,
  isSingleLine: boolean
): LinguisticFinding | null {
  if (findings.length === 0) return null;

  if (backdropEl) {
    const marks = Array.from(
      backdropEl.querySelectorAll<HTMLElement>('[data-finding-id]')
    );
    const pad = 6;
    for (const mark of marks) {
      const rects = Array.from(mark.getClientRects());
      for (const rect of rects) {
        if (
          clientX >= rect.left - pad &&
          clientX <= rect.right + pad &&
          clientY >= rect.top - pad &&
          clientY <= rect.bottom + pad
        ) {
          const id = mark.getAttribute('data-finding-id');
          const found = findings.find((f) => f.id === id);
          if (found) return found;
        }
      }
    }
  }

  if (inputEl) {
    const selStart = inputEl.selectionStart ?? 0;
    const selEnd = inputEl.selectionEnd ?? selStart;
    if (selEnd > selStart) {
      const overlaps = findings.find(
        (f) => selStart < f.end && selEnd > f.start
      );
      if (overlaps) return overlaps;
      return null;
    }

    const atCaret = findings.find(
      (f) => selStart >= f.start - 1 && selStart <= f.end + 1
    );
    if (atCaret) return atCaret;
  }

  if (backdropEl) {
    const marks = Array.from(
      backdropEl.querySelectorAll<HTMLElement>('[data-finding-id]')
    );
    let bestMark: { id: string; dist: number } | null = null;
    for (const mark of marks) {
      const rect = mark.getBoundingClientRect();
      const sameLine =
        isSingleLine ||
        (clientY >= rect.top - 10 && clientY <= rect.bottom + 10);
      if (!sameLine) continue;
      const centerX = (rect.left + rect.right) / 2;
      const dist = Math.abs(clientX - centerX);
      const id = mark.getAttribute('data-finding-id');
      if (id && (!bestMark || dist < bestMark.dist)) {
        bestMark = { id, dist };
      }
    }
    if (bestMark) {
      const matched = findings.find((f) => f.id === bestMark.id);
      if (matched) return matched;
    }
  }

  if (isSingleLine) {
    return findings[0] ?? null;
  }

  return null;
}

function resolveBorderClass(
  highlightEnabled: boolean,
  findings: LinguisticFinding[]
): string {
  if (!highlightEnabled || findings.length === 0) return '';
  if (findings.some((f) => f.categoria === 'ortografia')) {
    return 'border-red-500 focus:ring-red-600';
  }
  if (findings.some((f) => f.categoria === 'gramatica')) {
    return 'border-amber-400 focus:ring-amber-600';
  }
  return 'border-sky-400 focus:ring-sky-600';
}

export interface ReviewedTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  findings?: LinguisticFinding[];
  highlightEnabled?: boolean;
  fieldLabel?: string;
  markedRanges?: EditorTextMark[];
  defaultMarkColor?: HighlightMarkColor;
  onSelectMarkColor?: (color: HighlightMarkColor) => void;
  onAddMark?: (range: TextSelectionRange, color: HighlightMarkColor) => void;
  onUpdateMarkColor?: (markId: string, color: HighlightMarkColor) => void;
  onRemoveMark?: (markId: string) => void;
  onAddToObservacoes?: (text: string, fieldLabel?: string) => void;
  onOpenObservacoes?: () => void;
  wrapperClassName?: string;
  surfaceClassName?: string;
  textStyleClassName?: string;
  onApplyFix?: (finding: LinguisticFinding, replacement?: string) => void;
  onIgnoreFinding?: (finding: LinguisticFinding) => void;
  onAddToDictionary?: (word: string) => void;
  onTextSelect?: (range: TextSelectionRange | null) => void;
}

export const ReviewedTextarea: React.FC<ReviewedTextareaProps> = ({
  value,
  findings = [],
  highlightEnabled = true,
  fieldLabel,
  markedRanges = [],
  defaultMarkColor = 'yellow',
  onSelectMarkColor,
  onAddMark,
  onUpdateMarkColor,
  onRemoveMark,
  onAddToObservacoes,
  onOpenObservacoes,
  wrapperClassName = 'w-full',
  surfaceClassName = 'bg-white border-slate-300',
  textStyleClassName = 'text-sm text-slate-900 leading-relaxed px-3 py-2',
  className = '',
  rows = 2,
  onScroll,
  onContextMenu,
  onKeyDown,
  onSelect,
  onMouseUp,
  onKeyUp,
  onBlur,
  onApplyFix,
  onIgnoreFinding,
  onAddToDictionary,
  onTextSelect,
  spellCheck = true,
  lang = 'pt-BR',
  title,
  ...rest
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeSelection, setActiveSelection] =
    useState<TextSelectionRange | null>(null);
  const [obsAdded, setObsAdded] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, rows * 22 + 16)}px`;
    if (backdropRef.current) {
      backdropRef.current.scrollTop = el.scrollTop;
      backdropRef.current.scrollLeft = el.scrollLeft;
    }
  }, [value, rows]);

  useEffect(() => {
    if (findings.length === 0) {
      setContextMenu(null);
    }
  }, [findings.length]);

  const activeFindingsForBackdrop = highlightEnabled ? findings : [];
  const showBackdrop =
    value.length > 0 &&
    ((highlightEnabled && findings.length > 0) || markedRanges.length > 0);
  const hasInteractiveMenu =
    highlightEnabled && findings.length > 0 && Boolean(onApplyFix);

  const backdropNodes = useMemo(
    () =>
      showBackdrop
        ? renderHighlightSegments(value, activeFindingsForBackdrop, markedRanges)
        : null,
    [showBackdrop, value, activeFindingsForBackdrop, markedRanges]
  );

  const borderOverride = resolveBorderClass(highlightEnabled, findings);
  const hasOrthoError =
    highlightEnabled && findings.some((f) => f.categoria === 'ortografia');

  const syncSelection = useCallback(
    (el: HTMLTextAreaElement) => {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? start;
      if (end > start) {
        const range: TextSelectionRange = {
          start,
          end,
          text: value.slice(start, end),
        };
        setActiveSelection(range);
        onTextSelect?.(range);
      } else {
        setActiveSelection(null);
        setObsAdded(false);
        onTextSelect?.(null);
      }
    },
    [onTextSelect, value]
  );

  const overlappingMarks = useMemo(() => {
    if (!activeSelection) return [];
    return markedRanges.filter(
      (m) => activeSelection.start < m.end && activeSelection.end > m.start
    );
  }, [activeSelection, markedRanges]);

  const handleApplyMarkFromSelection = (
    range: TextSelectionRange,
    color: HighlightMarkColor
  ) => {
    onAddMark?.(range, color);
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(range.end, range.end);
    }
    setActiveSelection(null);
    setObsAdded(false);
    onTextSelect?.(null);
  };

  const handleRemoveOverlappingMarks = (ids: string[]) => {
    if (!onRemoveMark) return;
    for (const id of ids) {
      onRemoveMark(id);
    }
  };

  const handleFocusRange = (start: number, end: number) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const safeStart = Math.max(0, Math.min(start, value.length));
    const safeEnd = Math.max(safeStart, Math.min(end, value.length));
    el.setSelectionRange(safeStart, safeEnd);
    setActiveSelection(
      safeEnd > safeStart
        ? {
            start: safeStart,
            end: safeEnd,
            text: value.slice(safeStart, safeEnd),
          }
        : null
    );
  };

  const closeMenu = useCallback(() => {
    setContextMenu(null);
    textareaRef.current?.focus();
  }, []);

  const handleContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    onContextMenu?.(e);
    if (e.defaultPrevented) return;
    if (!highlightEnabled || findings.length === 0 || !onApplyFix) return;

    const hit = findHitFinding(
      backdropRef.current,
      textareaRef.current,
      findings,
      e.clientX,
      e.clientY,
      false
    );

    if (hit) {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        findingId: hit.id,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (
      (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) &&
      highlightEnabled &&
      findings.length > 0 &&
      onApplyFix
    ) {
      const el = textareaRef.current;
      const selStart = el?.selectionStart ?? 0;
      const hit =
        findings.find((f) => selStart >= f.start - 1 && selStart <= f.end + 1) ||
        findings[0];
      if (hit && el) {
        e.preventDefault();
        const markEl = backdropRef.current?.querySelector<HTMLElement>(
          `[data-finding-id="${CSS.escape(hit.id)}"]`
        );
        const rect = markEl?.getBoundingClientRect() || el.getBoundingClientRect();
        setContextMenu({
          x: rect.left,
          y: rect.bottom + 4,
          findingId: hit.id,
        });
      }
    }
  };

  const rightPadClass = hasInteractiveMenu ? 'pr-9' : '';

  return (
    <div className={wrapperClassName}>
      <div className={`relative rounded-md ${surfaceClassName}`}>
        {activeSelection && (onAddMark || onAddToObservacoes) && (
          <SelectionMarkPopover
            selection={activeSelection}
            overlappingMarks={overlappingMarks}
            defaultColor={defaultMarkColor}
            fieldLabel={fieldLabel}
            obsAdded={obsAdded}
            onSelectColor={onSelectMarkColor}
            onApplyMark={onAddMark ? handleApplyMarkFromSelection : undefined}
            onRemoveOverlapping={
              onRemoveMark ? handleRemoveOverlappingMarks : undefined
            }
            onAddToObservacoes={
              onAddToObservacoes
                ? (txt, lbl) => {
                    onAddToObservacoes(txt, lbl);
                    setObsAdded(true);
                  }
                : undefined
            }
            onOpenObservacoes={onOpenObservacoes}
          />
        )}

        {showBackdrop && (
          <div
            ref={backdropRef}
            aria-hidden="true"
            className={`pointer-events-none select-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border border-transparent rounded-md text-transparent ${textStyleClassName} ${rightPadClass}`}
          >
            {backdropNodes}
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          spellCheck={spellCheck}
          lang={lang}
          title={
            title ||
            (hasInteractiveMenu
              ? 'Clique com o botão direito nos termos sublinhados para ver sugestões'
              : undefined)
          }
          onScroll={(e) => {
            if (backdropRef.current) {
              backdropRef.current.scrollTop = e.currentTarget.scrollTop;
              backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
            onScroll?.(e);
          }}
          onSelect={(e) => {
            syncSelection(e.currentTarget);
            onSelect?.(e);
          }}
          onMouseUp={(e) => {
            syncSelection(e.currentTarget);
            onMouseUp?.(e);
          }}
          onKeyUp={(e) => {
            syncSelection(e.currentTarget);
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setActiveSelection(null);
            setObsAdded(false);
            onBlur?.(e);
          }}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
          className={`relative z-10 w-full block bg-transparent border rounded-md overflow-hidden resize-y focus:outline-none focus:ring-2 focus:ring-slate-900 ${textStyleClassName} ${rightPadClass} ${
            borderOverride || 'border-slate-300'
          } ${className}`}
          {...rest}
        />

        {hasInteractiveMenu && (
          <button
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setContextMenu({
                x: rect.left - 240,
                y: rect.bottom + 4,
                findingId: findings[0].id,
              });
            }}
            title="Abrir menu de sugestões de correção"
            aria-label={`Abrir sugestões (${findings.length})`}
            className={`absolute top-1.5 right-1.5 z-20 inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
              hasOrthoError
                ? 'text-red-700 bg-red-50/90 hover:bg-red-100 border border-red-200'
                : 'text-amber-800 bg-amber-50/90 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <SpellCheck className="w-3.5 h-3.5" />
          </button>
        )}

        {contextMenu && onApplyFix && findings.length > 0 && (
          <SpellcheckContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            findings={findings}
            activeFindingId={contextMenu.findingId}
            onSelectFindingId={(id) =>
              setContextMenu((prev) => (prev ? { ...prev, findingId: id } : null))
            }
            onApplyFix={onApplyFix}
            onIgnoreFinding={onIgnoreFinding}
            onAddToDictionary={onAddToDictionary}
            onClose={closeMenu}
          />
        )}
      </div>

      <FieldMarksStrip
        marks={markedRanges}
        fieldLabel={fieldLabel}
        onFocusRange={handleFocusRange}
        onUpdateMarkColor={onUpdateMarkColor}
        onRemoveMark={onRemoveMark}
        onAddToObservacoes={onAddToObservacoes}
        onOpenObservacoes={onOpenObservacoes}
      />
    </div>
  );
};

function parseInputClasses(className: string): {
  wrapperLayout: string;
  surface: string;
  textAndPadding: string;
  extra: string;
} {
  const tokens = className.split(/\s+/).filter(Boolean);
  const wrapperLayoutTokens: string[] = [];
  const surfaceTokens: string[] = [];
  const textPaddingTokens: string[] = [];
  const extraTokens: string[] = [];

  for (const tok of tokens) {
    if (
      tok === 'flex-1' ||
      tok === 'min-w-0' ||
      tok === 'w-full' ||
      /^w-\d+$/.test(tok)
    ) {
      wrapperLayoutTokens.push(tok);
    } else if (
      tok.startsWith('bg-') ||
      tok === 'rounded' ||
      tok.startsWith('rounded-')
    ) {
      surfaceTokens.push(tok);
    } else if (
      tok.startsWith('text-') ||
      tok.startsWith('font-') ||
      tok.startsWith('px-') ||
      tok.startsWith('py-') ||
      tok.startsWith('pl-') ||
      tok.startsWith('pr-') ||
      tok.startsWith('leading-')
    ) {
      textPaddingTokens.push(tok);
    } else if (tok === 'border' || tok.startsWith('border-')) {
      surfaceTokens.push(tok);
    } else {
      extraTokens.push(tok);
    }
  }

  return {
    wrapperLayout:
      wrapperLayoutTokens.length > 0
        ? wrapperLayoutTokens.join(' ')
        : 'w-full',
    surface:
      surfaceTokens.length > 0
        ? surfaceTokens.join(' ')
        : 'bg-white border-slate-300 rounded-md',
    textAndPadding:
      textPaddingTokens.length > 0
        ? textPaddingTokens.join(' ')
        : 'text-sm px-3 py-2 text-slate-900',
    extra: extraTokens.join(' '),
  };
}

export interface ReviewedInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  findings?: LinguisticFinding[];
  highlightEnabled?: boolean;
  fieldLabel?: string;
  markedRanges?: EditorTextMark[];
  defaultMarkColor?: HighlightMarkColor;
  onSelectMarkColor?: (color: HighlightMarkColor) => void;
  onAddMark?: (range: TextSelectionRange, color: HighlightMarkColor) => void;
  onUpdateMarkColor?: (markId: string, color: HighlightMarkColor) => void;
  onRemoveMark?: (markId: string) => void;
  onAddToObservacoes?: (text: string, fieldLabel?: string) => void;
  onOpenObservacoes?: () => void;
  onApplyFix?: (finding: LinguisticFinding, replacement?: string) => void;
  onIgnoreFinding?: (finding: LinguisticFinding) => void;
  onAddToDictionary?: (word: string) => void;
  onTextSelect?: (range: TextSelectionRange | null) => void;
}

export const ReviewedInput: React.FC<ReviewedInputProps> = ({
  value,
  findings = [],
  highlightEnabled = true,
  fieldLabel,
  markedRanges = [],
  defaultMarkColor = 'yellow',
  onSelectMarkColor,
  onAddMark,
  onUpdateMarkColor,
  onRemoveMark,
  onAddToObservacoes,
  onOpenObservacoes,
  className = '',
  onScroll,
  onContextMenu,
  onKeyDown,
  onSelect,
  onMouseUp,
  onKeyUp,
  onBlur,
  onApplyFix,
  onIgnoreFinding,
  onAddToDictionary,
  onTextSelect,
  spellCheck = true,
  lang = 'pt-BR',
  title,
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeSelection, setActiveSelection] =
    useState<TextSelectionRange | null>(null);
  const [obsAdded, setObsAdded] = useState(false);

  const parsed = useMemo(() => parseInputClasses(className), [className]);

  const syncScrollLeft = useCallback(() => {
    if (backdropRef.current && inputRef.current) {
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    syncScrollLeft();
  }, [value, syncScrollLeft]);

  useEffect(() => {
    if (findings.length === 0) {
      setContextMenu(null);
    }
  }, [findings.length]);

  const activeFindingsForBackdrop = highlightEnabled ? findings : [];
  const showBackdrop =
    value.length > 0 &&
    ((highlightEnabled && findings.length > 0) || markedRanges.length > 0);
  const hasInteractiveMenu =
    highlightEnabled && findings.length > 0 && Boolean(onApplyFix);

  const backdropNodes = useMemo(
    () =>
      showBackdrop
        ? renderHighlightSegments(value, activeFindingsForBackdrop, markedRanges)
        : null,
    [showBackdrop, value, activeFindingsForBackdrop, markedRanges]
  );

  const borderOverride = resolveBorderClass(highlightEnabled, findings);
  const hasOrthoError =
    highlightEnabled && findings.some((f) => f.categoria === 'ortografia');

  const syncSelection = useCallback(
    (el: HTMLInputElement) => {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? start;
      if (end > start) {
        const range: TextSelectionRange = {
          start,
          end,
          text: value.slice(start, end),
        };
        setActiveSelection(range);
        onTextSelect?.(range);
      } else {
        setActiveSelection(null);
        setObsAdded(false);
        onTextSelect?.(null);
      }
    },
    [onTextSelect, value]
  );

  const overlappingMarks = useMemo(() => {
    if (!activeSelection) return [];
    return markedRanges.filter(
      (m) => activeSelection.start < m.end && activeSelection.end > m.start
    );
  }, [activeSelection, markedRanges]);

  const handleApplyMarkFromSelection = (
    range: TextSelectionRange,
    color: HighlightMarkColor
  ) => {
    onAddMark?.(range, color);
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(range.end, range.end);
    }
    setActiveSelection(null);
    setObsAdded(false);
    onTextSelect?.(null);
  };

  const handleRemoveOverlappingMarks = (ids: string[]) => {
    if (!onRemoveMark) return;
    for (const id of ids) {
      onRemoveMark(id);
    }
  };

  const handleFocusRange = (start: number, end: number) => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const safeStart = Math.max(0, Math.min(start, value.length));
    const safeEnd = Math.max(safeStart, Math.min(end, value.length));
    el.setSelectionRange(safeStart, safeEnd);
    setActiveSelection(
      safeEnd > safeStart
        ? {
            start: safeStart,
            end: safeEnd,
            text: value.slice(safeStart, safeEnd),
          }
        : null
    );
  };

  const closeMenu = useCallback(() => {
    setContextMenu(null);
    inputRef.current?.focus();
  }, []);

  const handleContextMenu = (e: React.MouseEvent<HTMLInputElement>) => {
    onContextMenu?.(e);
    if (e.defaultPrevented) return;
    if (!highlightEnabled || findings.length === 0 || !onApplyFix) return;

    const hit = findHitFinding(
      backdropRef.current,
      inputRef.current,
      findings,
      e.clientX,
      e.clientY,
      true
    );

    if (hit) {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        findingId: hit.id,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (
      (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) &&
      highlightEnabled &&
      findings.length > 0 &&
      onApplyFix
    ) {
      const el = inputRef.current;
      const selStart = el?.selectionStart ?? 0;
      const hit =
        findings.find((f) => selStart >= f.start - 1 && selStart <= f.end + 1) ||
        findings[0];
      if (hit && el) {
        e.preventDefault();
        const markEl = backdropRef.current?.querySelector<HTMLElement>(
          `[data-finding-id="${CSS.escape(hit.id)}"]`
        );
        const rect = markEl?.getBoundingClientRect() || el.getBoundingClientRect();
        setContextMenu({
          x: rect.left,
          y: rect.bottom + 4,
          findingId: hit.id,
        });
      }
    }
  };

  const surfaceRadius = parsed.surface.includes('rounded-md')
    ? 'rounded-md'
    : 'rounded';
  const surfaceBg = parsed.surface.includes('bg-slate-50')
    ? 'bg-slate-50'
    : 'bg-white';
  const defaultBorder = parsed.surface.includes('border-slate-200')
    ? 'border-slate-200'
    : 'border-slate-300';
  const rightPadClass = hasInteractiveMenu ? 'pr-8' : '';

  return (
    <div className={parsed.wrapperLayout}>
      <div className={`relative ${surfaceRadius} ${surfaceBg}`}>
        {activeSelection && (onAddMark || onAddToObservacoes) && (
          <SelectionMarkPopover
            selection={activeSelection}
            overlappingMarks={overlappingMarks}
            defaultColor={defaultMarkColor}
            fieldLabel={fieldLabel}
            obsAdded={obsAdded}
            onSelectColor={onSelectMarkColor}
            onApplyMark={onAddMark ? handleApplyMarkFromSelection : undefined}
            onRemoveOverlapping={
              onRemoveMark ? handleRemoveOverlappingMarks : undefined
            }
            onAddToObservacoes={
              onAddToObservacoes
                ? (txt, lbl) => {
                    onAddToObservacoes(txt, lbl);
                    setObsAdded(true);
                  }
                : undefined
            }
            onOpenObservacoes={onOpenObservacoes}
          />
        )}

        {showBackdrop && (
          <div
            ref={backdropRef}
            aria-hidden="true"
            className={`pointer-events-none select-none absolute inset-0 overflow-hidden whitespace-pre border border-transparent leading-5 ${surfaceRadius} text-transparent ${parsed.textAndPadding} ${rightPadClass}`}
          >
            {backdropNodes}
          </div>
        )}

        <input
          ref={inputRef}
          value={value}
          spellCheck={spellCheck}
          lang={lang}
          title={
            title ||
            (hasInteractiveMenu
              ? 'Clique com o botão direito nos termos sublinhados para ver sugestões'
              : undefined)
          }
          onScroll={(e) => {
            syncScrollLeft();
            onScroll?.(e);
          }}
          onSelect={(e) => {
            syncSelection(e.currentTarget);
            onSelect?.(e);
          }}
          onMouseUp={(e) => {
            syncSelection(e.currentTarget);
            onMouseUp?.(e);
          }}
          onKeyUp={(e) => {
            syncScrollLeft();
            syncSelection(e.currentTarget);
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setActiveSelection(null);
            setObsAdded(false);
            onBlur?.(e);
          }}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
          className={`relative z-10 w-full block bg-transparent border leading-5 ${surfaceRadius} ${parsed.textAndPadding} ${rightPadClass} ${
            borderOverride || defaultBorder
          } ${parsed.extra}`}
          {...rest}
        />

        {hasInteractiveMenu && (
          <button
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setContextMenu({
                x: rect.left - 240,
                y: rect.bottom + 4,
                findingId: findings[0].id,
              });
            }}
            title="Abrir menu de sugestões de correção"
            aria-label={`Abrir sugestões (${findings.length})`}
            className={`absolute top-1/2 -translate-y-1/2 right-1.5 z-20 inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
              hasOrthoError
                ? 'text-red-700 bg-red-50/90 hover:bg-red-100 border border-red-200'
                : 'text-amber-800 bg-amber-50/90 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <SpellCheck className="w-3.5 h-3.5" />
          </button>
        )}

        {contextMenu && onApplyFix && findings.length > 0 && (
          <SpellcheckContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            findings={findings}
            activeFindingId={contextMenu.findingId}
            onSelectFindingId={(id) =>
              setContextMenu((prev) => (prev ? { ...prev, findingId: id } : null))
            }
            onApplyFix={onApplyFix}
            onIgnoreFinding={onIgnoreFinding}
            onAddToDictionary={onAddToDictionary}
            onClose={closeMenu}
          />
        )}
      </div>

      <FieldMarksStrip
        marks={markedRanges}
        fieldLabel={fieldLabel}
        onFocusRange={handleFocusRange}
        onUpdateMarkColor={onUpdateMarkColor}
        onRemoveMark={onRemoveMark}
        onAddToObservacoes={onAddToObservacoes}
        onOpenObservacoes={onOpenObservacoes}
      />
    </div>
  );
};
