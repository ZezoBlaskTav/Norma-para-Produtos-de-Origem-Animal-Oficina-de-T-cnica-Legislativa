import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  SpellCheck,
  Wand2,
} from 'lucide-react';
import { LinguisticCategory, LinguisticFinding } from '../types/norma';

const CATEGORY_INFO: Record<
  LinguisticCategory,
  { label: string; dotClass: string; textClass: string }
> = {
  ortografia: {
    label: 'Ortografia',
    dotClass: 'bg-red-600',
    textClass: 'text-red-700',
  },
  gramatica: {
    label: 'Gramática',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-800',
  },
  linguagem_juridica: {
    label: 'Linguagem Jurídica',
    dotClass: 'bg-sky-600',
    textClass: 'text-sky-800',
  },
};

export interface SpellcheckContextMenuProps {
  x: number;
  y: number;
  findings: LinguisticFinding[];
  activeFindingId: string;
  onSelectFindingId: (id: string) => void;
  onApplyFix: (finding: LinguisticFinding, replacement?: string) => void;
  onIgnoreFinding?: (finding: LinguisticFinding) => void;
  onAddToDictionary?: (word: string) => void;
  onClose: () => void;
}

export const SpellcheckContextMenu: React.FC<SpellcheckContextMenuProps> = ({
  x,
  y,
  findings,
  activeFindingId,
  onSelectFindingId,
  onApplyFix,
  onIgnoreFinding,
  onAddToDictionary,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  const activeIndex = Math.max(
    0,
    findings.findIndex((f) => f.id === activeFindingId)
  );
  const finding = findings[activeIndex] || findings[0];

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 10;
    const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
    const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
    setCoords({
      left: Math.min(Math.max(pad, x), maxLeft),
      top: Math.min(Math.max(pad, y), maxTop),
    });
  }, [x, y, finding?.id]);

  useEffect(() => {
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>(
      '[data-menu-focusable="true"]'
    );
    firstItem?.focus();
  }, [finding?.id]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleScroll = (event: Event) => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        menuRef.current.contains(event.target)
      ) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>(
            '[data-menu-focusable="true"]'
          ) || []
        );
        if (items.length === 0) return;
        event.preventDefault();
        const currentIdx = items.indexOf(
          document.activeElement as HTMLButtonElement
        );
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIdx =
          currentIdx === -1
            ? 0
            : (currentIdx + delta + items.length) % items.length;
        items[nextIdx]?.focus();
      }
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!finding || typeof document === 'undefined') return null;

  const meta = CATEGORY_INFO[finding.categoria];
  const suggestions =
    finding.alternativas && finding.alternativas.length > 0
      ? finding.alternativas
      : finding.sugestaoTexto !== undefined
        ? [finding.sugestaoTexto]
        : [];

  const canAddWord =
    Boolean(onAddToDictionary) &&
    finding.categoria === 'ortografia' &&
    !/\s/.test(finding.trecho.trim()) &&
    finding.trecho.trim().length > 2;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Sugestões de correção ortográfica e gramatical"
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 w-80 max-w-[calc(100vw-20px)] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden text-slate-900"
    >
      {/* Cabeçalho do erro */}
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${meta.textClass}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`}
              aria-hidden="true"
            />
            <span>{meta.label}</span>
          </span>

          {findings.length > 1 ? (
            <div className="flex items-center gap-1 text-[11px] font-mono tabular-nums text-slate-500">
              <button
                type="button"
                onClick={() => {
                  const prev =
                    findings[(activeIndex - 1 + findings.length) % findings.length];
                  if (prev) onSelectFindingId(prev.id);
                }}
                aria-label="Erro anterior"
                className="p-0.5 rounded hover:bg-slate-200 text-slate-600"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span>
                {activeIndex + 1}/{findings.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = findings[(activeIndex + 1) % findings.length];
                  if (next) onSelectFindingId(next.id);
                }}
                aria-label="Próximo erro"
                className="p-0.5 rounded hover:bg-slate-200 text-slate-600"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-[11px] font-mono text-slate-400">Esc</span>
          )}
        </div>

        <div className="flex items-baseline gap-1.5 text-xs">
          <span className="text-slate-500 shrink-0">Trecho:</span>
          <code className="font-mono font-semibold text-red-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded break-all">
            {finding.trecho}
          </code>
        </div>
        <p className="text-[11px] text-slate-600 leading-snug">
          {finding.orientacao}
        </p>
      </div>

      {/* Sugestões */}
      <div className="py-1.5">
        <div className="px-3.5 py-1 text-[11px] font-medium text-slate-500">
          Sugestões de correção
        </div>

        {suggestions.length > 0 ? (
          <div className="px-1.5 space-y-0.5 max-h-52 overflow-y-auto">
            {suggestions.map((alt, idx) => (
              <button
                key={alt}
                type="button"
                role="menuitem"
                data-menu-focusable="true"
                onClick={() => {
                  onApplyFix(finding, alt);
                  onClose();
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                  idx === 0
                    ? 'font-semibold text-slate-900 bg-emerald-50/70 hover:bg-emerald-100/80'
                    : 'font-medium text-slate-800 hover:bg-slate-100'
                }`}
              >
                <span className="inline-flex items-center gap-2 min-w-0 truncate">
                  {idx === 0 ? (
                    <Wand2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{alt}</span>
                </span>
                {idx === 0 && (
                  <span className="text-[11px] font-normal text-emerald-800 whitespace-nowrap shrink-0">
                    Aplicar
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3.5 py-2 text-xs text-slate-500 flex items-center gap-2">
            <SpellCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Edite manualmente o trecho conforme a orientação acima.</span>
          </div>
        )}
      </div>

      {/* Ações secundárias */}
      {(onIgnoreFinding || canAddWord) && (
        <div className="border-t border-slate-200 p-1.5 bg-slate-50/60 space-y-0.5">
          {canAddWord && onAddToDictionary && (
            <button
              type="button"
              role="menuitem"
              data-menu-focusable="true"
              onClick={() => {
                onAddToDictionary(finding.trecho);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <BookPlus className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="truncate">
                Adicionar &quot;{finding.trecho}&quot; ao dicionário
              </span>
            </button>
          )}
          {onIgnoreFinding && (
            <button
              type="button"
              role="menuitem"
              data-menu-focusable="true"
              onClick={() => {
                onIgnoreFinding(finding);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Ignorar ocorrência</span>
            </button>
          )}
        </div>
      )}
    </div>,
    document.body
  );
};
