import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  EyeOff,
  LocateFixed,
  RotateCcw,
  SpellCheck,
  Wand2,
} from 'lucide-react';
import {
  LinguisticCategory,
  LinguisticFinding,
  LinguisticReviewSummary,
} from '../types/norma';

const CATEGORY_META: Record<
  LinguisticCategory,
  {
    label: string;
    shortLabel: string;
    markClass: string;
    activeMarkClass: string;
    badgeTextClass: string;
    dotClass: string;
  }
> = {
  ortografia: {
    label: 'Ortografia e Digitação',
    shortLabel: 'Ortografia',
    markClass:
      'bg-red-100/90 text-red-950 border-b-2 border-red-600 hover:bg-red-200/80',
    activeMarkClass: 'bg-red-200 ring-2 ring-slate-900',
    badgeTextClass: 'text-red-700',
    dotClass: 'bg-red-600',
  },
  gramatica: {
    label: 'Gramática e Regência',
    shortLabel: 'Gramática',
    markClass:
      'bg-amber-100/90 text-amber-950 border-b-2 border-amber-600 hover:bg-amber-200/80',
    activeMarkClass: 'bg-amber-200 ring-2 ring-slate-900',
    badgeTextClass: 'text-amber-700',
    dotClass: 'bg-amber-600',
  },
  linguagem_juridica: {
    label: 'Linguagem Jurídica Formal',
    shortLabel: 'Linguagem Jurídica',
    markClass:
      'bg-sky-100/90 text-sky-950 border-b-2 border-sky-600 hover:bg-sky-200/80',
    activeMarkClass: 'bg-sky-200 ring-2 ring-slate-900',
    badgeTextClass: 'text-sky-700',
    dotClass: 'bg-sky-600',
  },
};

export type HighlightMarkColor = 'yellow' | 'green' | 'blue' | 'pink' | 'dark';

export const HIGHLIGHT_MARK_COLORS: Record<
  HighlightMarkColor,
  {
    label: string;
    previewClass: string;
    editorBackdropClass: string;
    swatchClass: string;
    orthoUnderlineClass: string;
    gramUnderlineClass: string;
    jurUnderlineClass: string;
  }
> = {
  yellow: {
    label: 'Amarelo',
    previewClass: 'bg-yellow-300/90 text-slate-950',
    editorBackdropClass: 'bg-yellow-300/65',
    swatchClass: 'bg-yellow-300 border-yellow-500',
    orthoUnderlineClass: 'underline decoration-wavy decoration-red-600 underline-offset-2',
    gramUnderlineClass: 'underline decoration-wavy decoration-amber-800 underline-offset-2',
    jurUnderlineClass: 'underline decoration-wavy decoration-sky-700 underline-offset-2',
  },
  green: {
    label: 'Verde',
    previewClass: 'bg-lime-200/95 text-slate-950',
    editorBackdropClass: 'bg-lime-300/60',
    swatchClass: 'bg-lime-300 border-lime-500',
    orthoUnderlineClass: 'underline decoration-wavy decoration-red-600 underline-offset-2',
    gramUnderlineClass: 'underline decoration-wavy decoration-amber-800 underline-offset-2',
    jurUnderlineClass: 'underline decoration-wavy decoration-sky-700 underline-offset-2',
  },
  blue: {
    label: 'Azul',
    previewClass: 'bg-sky-200/95 text-slate-950',
    editorBackdropClass: 'bg-sky-300/60',
    swatchClass: 'bg-sky-300 border-sky-500',
    orthoUnderlineClass: 'underline decoration-wavy decoration-red-600 underline-offset-2',
    gramUnderlineClass: 'underline decoration-wavy decoration-amber-800 underline-offset-2',
    jurUnderlineClass: 'underline decoration-wavy decoration-sky-800 underline-offset-2',
  },
  pink: {
    label: 'Rosa',
    previewClass: 'bg-pink-200/95 text-slate-950',
    editorBackdropClass: 'bg-pink-300/60',
    swatchClass: 'bg-pink-300 border-pink-500',
    orthoUnderlineClass: 'underline decoration-wavy decoration-red-700 underline-offset-2',
    gramUnderlineClass: 'underline decoration-wavy decoration-amber-800 underline-offset-2',
    jurUnderlineClass: 'underline decoration-wavy decoration-sky-700 underline-offset-2',
  },
  dark: {
    label: 'Escuro',
    previewClass: 'bg-slate-900 text-white',
    editorBackdropClass: 'bg-slate-800/20',
    swatchClass: 'bg-slate-900 border-slate-950',
    orthoUnderlineClass: 'underline decoration-wavy decoration-red-400 underline-offset-2',
    gramUnderlineClass: 'underline decoration-wavy decoration-amber-300 underline-offset-2',
    jurUnderlineClass: 'underline decoration-wavy decoration-sky-300 underline-offset-2',
  },
};

export const HIGHLIGHT_MARK_COLOR_ORDER: HighlightMarkColor[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'dark',
];

interface HighlightedLegalTextProps {
  displayText: string;
  baseOffset?: number;
  findings: LinguisticFinding[];
  enabled: boolean;
  selectedFindingId: string | null;
  onSelectFinding: (finding: LinguisticFinding) => void;
  selectionRange?: { start: number; end: number } | null;
  selectionColor?: HighlightMarkColor;
}

export const HighlightedLegalText: React.FC<HighlightedLegalTextProps> = ({
  displayText,
  baseOffset = 0,
  findings,
  enabled,
  selectedFindingId,
  onSelectFinding,
  selectionRange = null,
  selectionColor = 'yellow',
}) => {
  if (!displayText) {
    return <>{displayText}</>;
  }

  const colorStyle =
    HIGHLIGHT_MARK_COLORS[selectionColor] || HIGHLIGHT_MARK_COLORS.yellow;

  const mapped =
    enabled && findings.length > 0
      ? findings
          .map((f) => ({
            finding: f,
            relStart: f.start - baseOffset,
            relEnd: f.end - baseOffset,
          }))
          .filter((item) => item.relEnd > 0 && item.relStart < displayText.length)
          .map((item) => ({
            ...item,
            relStart: Math.max(0, item.relStart),
            relEnd: Math.min(displayText.length, item.relEnd),
          }))
          .filter((item) => item.relEnd > item.relStart)
          .sort((a, b) => a.relStart - b.relStart)
      : [];

  let selRel: { relStart: number; relEnd: number } | null = null;
  if (selectionRange && selectionRange.end > selectionRange.start) {
    const rawStart = selectionRange.start - baseOffset;
    const rawEnd = selectionRange.end - baseOffset;
    if (rawEnd > 0 && rawStart < displayText.length) {
      const relStart = Math.max(0, rawStart);
      const relEnd = Math.min(displayText.length, rawEnd);
      if (relEnd > relStart) {
        selRel = { relStart, relEnd };
      }
    }
  }

  if (mapped.length === 0 && !selRel) {
    return <>{displayText}</>;
  }

  const points = new Set<number>([0, displayText.length]);
  for (const item of mapped) {
    points.add(item.relStart);
    points.add(item.relEnd);
  }
  if (selRel) {
    points.add(selRel.relStart);
    points.add(selRel.relEnd);
  }

  const sortedPoints = Array.from(points).sort((a, b) => a - b);
  const parts: React.ReactNode[] = [];

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const segStart = sortedPoints[i];
    const segEnd = sortedPoints[i + 1];
    if (segEnd <= segStart) continue;

    const segment = displayText.slice(segStart, segEnd);
    const findingItem = mapped.find(
      (item) => segStart >= item.relStart && segEnd <= item.relEnd
    );
    const isMarked =
      selRel !== null &&
      segStart >= selRel.relStart &&
      segEnd <= selRel.relEnd;

    if (!findingItem && !isMarked) {
      parts.push(
        <React.Fragment key={`txt-${segStart}`}>{segment}</React.Fragment>
      );
      continue;
    }

    if (isMarked && !findingItem) {
      parts.push(
        <mark
          key={`sel-${segStart}`}
          data-editor-selection="true"
          className={`${colorStyle.previewClass} rounded-xs px-0.5 print:bg-transparent print:text-inherit print:px-0`}
        >
          {segment}
        </mark>
      );
      continue;
    }

    const finding = findingItem!.finding;
    const meta = CATEGORY_META[finding.categoria];
    const isSelected = selectedFindingId === finding.id;

    if (isMarked) {
      const underlineClass =
        finding.categoria === 'ortografia'
          ? colorStyle.orthoUnderlineClass
          : finding.categoria === 'gramatica'
            ? colorStyle.gramUnderlineClass
            : colorStyle.jurUnderlineClass;

      parts.push(
        <mark
          key={`sel-f-${segStart}-${finding.id}`}
          data-editor-selection="true"
          role="button"
          tabIndex={0}
          title={`${meta.shortLabel}: ${finding.titulo}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectFinding(finding);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectFinding(finding);
            }
          }}
          className={`cursor-pointer ${colorStyle.previewClass} ${underlineClass} rounded-xs px-0.5 print:bg-transparent print:no-underline print:text-inherit print:px-0`}
        >
          {segment}
        </mark>
      );
      continue;
    }

    parts.push(
      <mark
        key={`f-${segStart}-${finding.id}`}
        role="button"
        tabIndex={0}
        title={`${meta.shortLabel}: ${finding.titulo}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelectFinding(finding);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectFinding(finding);
          }
        }}
        className={`cursor-pointer rounded-xs px-0.5 transition-colors print:bg-transparent print:border-0 print:ring-0 print:text-inherit print:px-0 ${
          isSelected ? meta.activeMarkClass : meta.markClass
        }`}
      >
        {segment}
      </mark>
    );
  }

  return <>{parts}</>;
};

interface FieldReviewHintsProps {
  findings: LinguisticFinding[];
  onApplyFix: (finding: LinguisticFinding, replacement?: string) => void;
  onIgnore: (finding: LinguisticFinding) => void;
}

export const FieldReviewHints: React.FC<FieldReviewHintsProps> = ({
  findings,
  onApplyFix,
  onIgnore,
}) => {
  if (findings.length === 0) return null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 space-y-2">
      {findings.map((f) => {
        const meta = CATEGORY_META[f.categoria];
        const suggestionOptions =
          f.alternativas && f.alternativas.length > 0
            ? f.alternativas
            : f.sugestaoTexto !== undefined
              ? [f.sugestaoTexto]
              : [];
        return (
          <div
            key={f.id}
            className="flex flex-wrap items-start justify-between gap-2 text-xs leading-relaxed"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <span
                className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`}
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-1">
                <div>
                  <span className={`font-semibold ${meta.badgeTextClass}`}>
                    {meta.shortLabel}:
                  </span>{' '}
                  <span className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded text-slate-900">
                    {f.trecho}
                  </span>{' '}
                  <span className="text-slate-600">— {f.orientacao}</span>
                </div>
                {suggestionOptions.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] text-slate-500">
                      Substituir por:
                    </span>
                    {suggestionOptions.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        onClick={() => onApplyFix(f, alt)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors whitespace-nowrap"
                      >
                        <Wand2 className="w-3 h-3 text-emerald-700" />
                        <span>{alt}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {suggestionOptions.length === 1 && (
                <button
                  type="button"
                  onClick={() => onApplyFix(f, suggestionOptions[0])}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>Corrigir: {suggestionOptions[0]}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onIgnore(f)}
                title="Ignorar este apontamento"
                className="px-1.5 py-0.5 text-xs text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap"
              >
                Ignorar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface RevisorLinguisticoPanelProps {
  summary: LinguisticReviewSummary;
  ignoredCount: number;
  selectedFindingId: string | null;
  onSelectFinding: (finding: LinguisticFinding) => void;
  onApplyFix: (finding: LinguisticFinding, replacement?: string) => void;
  onApplyAllAutoFixes: () => void;
  onIgnore: (finding: LinguisticFinding) => void;
  onRestoreIgnored: () => void;
  onLocateField: (fieldKey: string) => void;
}

export const RevisorLinguisticoPanel: React.FC<RevisorLinguisticoPanelProps> = ({
  summary,
  ignoredCount,
  selectedFindingId,
  onSelectFinding,
  onApplyFix,
  onApplyAllAutoFixes,
  onIgnore,
  onRestoreIgnored,
  onLocateField,
}) => {
  const [filter, setFilter] = useState<'todos' | LinguisticCategory>('todos');

  const filtered = useMemo(() => {
    if (filter === 'todos') return summary.findings;
    return summary.findings.filter((f) => f.categoria === filter);
  }, [summary.findings, filter]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
      {/* Cabeçalho e Resumo */}
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <SpellCheck className="w-4 h-4 text-slate-700 shrink-0" />
              <span>Revisão Ortográfica, Gramatical e Linguagem Jurídica</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Detecta desvios ortográficos, crase, concordância, termos coloquiais,
              imprecisões e estrangeirismos em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {ignoredCount > 0 && (
              <button
                type="button"
                onClick={onRestoreIgnored}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar ignorados ({ignoredCount})</span>
              </button>
            )}
            {summary.totalAutoCorrigiveis > 0 && (
              <button
                type="button"
                onClick={onApplyAllAutoFixes}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>
                  Corrigir automáticos ({summary.totalAutoCorrigiveis})
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Métricas por categoria */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <div className="text-xs text-slate-500">Ortografia / Digitação</div>
            <div
              className={`text-lg font-semibold font-mono tabular-nums mt-0.5 ${
                summary.totalOrtografia > 0 ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {summary.totalOrtografia}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <div className="text-xs text-slate-500">Gramática / Regência</div>
            <div
              className={`text-lg font-semibold font-mono tabular-nums mt-0.5 ${
                summary.totalGramatica > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {summary.totalGramatica}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <div className="text-xs text-slate-500">Linguagem Jurídica</div>
            <div
              className={`text-lg font-semibold font-mono tabular-nums mt-0.5 ${
                summary.totalLinguagemJuridica > 0
                  ? 'text-sky-700'
                  : 'text-slate-900'
              }`}
            >
              {summary.totalLinguagemJuridica}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { key: 'todos', label: `Todos (${summary.findings.length})` },
              {
                key: 'ortografia',
                label: `Ortografia (${summary.totalOrtografia})`,
              },
              {
                key: 'gramatica',
                label: `Gramática (${summary.totalGramatica})`,
              },
              {
                key: 'linguagem_juridica',
                label: `Linguagem Jurídica (${summary.totalLinguagemJuridica})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === tab.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Apontamentos */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center space-y-2">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">
            {summary.findings.length === 0
              ? 'Nenhum desvio linguístico detectado na minuta'
              : 'Nenhum apontamento nesta categoria'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            O módulo monitora continuamente ortografia, digitação (palavras
            repetidas, acentuação, n/m antes de p/b), crase, concordância,
            expressões coloquiais, termos imprecisos, estrangeirismos e
            pleonasmos jurídicos.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 max-h-[680px] overflow-y-auto">
          {filtered.map((f) => {
            const meta = CATEGORY_META[f.categoria];
            const isSelected = selectedFindingId === f.id;
            return (
              <div
                key={f.id}
                onClick={() => onSelectFinding(f)}
                className={`p-4 space-y-2.5 transition-colors cursor-pointer ${
                  isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 font-semibold ${meta.badgeTextClass}`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${meta.dotClass}`}
                        aria-hidden="true"
                      />
                      {meta.label}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-slate-600">
                      {f.fieldLabel}
                    </span>
                  </div>

                  {f.severidade === 'erro' && (
                    <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Correção recomendada
                    </span>
                  )}
                </div>

                <div className="text-sm font-medium text-slate-900">
                  {f.titulo}
                </div>

                {/* Trecho detectado e sugestões */}
                <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                  <span className="text-slate-500">Trecho:</span>
                  <code className="font-mono px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-900">
                    {f.trecho}
                  </code>
                  {(f.alternativas && f.alternativas.length > 0
                    ? f.alternativas
                    : f.sugestaoTexto !== undefined
                      ? [f.sugestaoTexto]
                      : []
                  ).map((alt, altIdx) => (
                    <React.Fragment key={alt}>
                      {altIdx === 0 && (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApplyFix(f, alt);
                        }}
                        title={`Substituir "${f.trecho}" por "${alt}"`}
                        className="font-mono px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded text-emerald-900 font-medium transition-colors"
                      >
                        {alt}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {f.explicacao}{' '}
                  <strong className="text-slate-800">{f.orientacao}</strong>
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {f.sugestaoTexto !== undefined && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApplyFix(f, f.sugestaoTexto);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>Aplicar correção</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLocateField(f.fieldKey);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap"
                  >
                    <LocateFixed className="w-3 h-3" />
                    <span>Ir ao campo</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onIgnore(f);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap"
                  >
                    <EyeOff className="w-3 h-3" />
                    <span>Ignorar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
