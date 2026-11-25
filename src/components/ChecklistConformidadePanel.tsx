import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  LocateFixed,
} from 'lucide-react';
import { ComplianceChecklistSummary } from '../utils/normaChecklist';

interface ChecklistConformidadePanelProps {
  summary: ComplianceChecklistSummary;
  onLocateField: (fieldSelector: string) => void;
  onRunFullAudit?: () => void;
}

export const ChecklistConformidadePanel: React.FC<
  ChecklistConformidadePanelProps
> = ({ summary, onLocateField, onRunFullAudit }) => {
  const [filterMode, setFilterMode] = useState<'todos' | 'pendentes'>('todos');

  const pendingOrPartialCount =
    summary.totalParciais + summary.totalPendentes;

  const visibleItems =
    filterMode === 'pendentes'
      ? summary.items.filter((item) => item.status !== 'conforme')
      : summary.items;

  return (
    <div className="no-print bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Cabeçalho e Progresso */}
      <div className="px-5 py-4 border-b border-slate-200 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <ClipboardCheck className="w-4 h-4 text-slate-800 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">
                Checklist de Conformidade — {summary.tipo}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhamento automático conforme {summary.normaBase}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-slate-900 tabular-nums">
              {summary.totalConformes}/{summary.totalItems} conformes
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums">
              {summary.percentual}% concluído
            </div>
          </div>
        </div>

        {/* Barra de Progresso */}
        <div className="space-y-1.5">
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                summary.totalPendentes === 0 && summary.totalParciais === 0
                  ? 'bg-emerald-600'
                  : summary.totalPendentes > 0
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${summary.percentual}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-slate-600 tabular-nums">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{summary.totalConformes} marcados</span>
              </span>
              {summary.totalParciais > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{summary.totalParciais} parciais</span>
                </span>
              )}
              {summary.totalPendentes > 0 && (
                <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                  <Circle className="w-3.5 h-3.5" />
                  <span>{summary.totalPendentes} pendentes</span>
                </span>
              )}
            </div>

            <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setFilterMode('todos')}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  filterMode === 'todos'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({summary.totalItems})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('pendentes')}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  filterMode === 'pendentes'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pendências ({pendingOrPartialCount})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Itens do Checklist */}
      <div className="divide-y divide-slate-200">
        {visibleItems.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-900">
              Todos os itens do checklist estão marcados como conformes
            </div>
            <p className="text-xs text-slate-500">
              Os requisitos estruturais da LC nº 95/1998 aplicáveis a {summary.tipo} foram preenchidos.
            </p>
            {onRunFullAudit && (
              <button
                type="button"
                onClick={onRunFullAudit}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
              >
                Abrir Auditoria Completa
              </button>
            )}
          </div>
        ) : (
          visibleItems.map((item) => {
            const isOk = item.status === 'conforme';
            const isPartial = item.status === 'parcial';

            return (
              <div
                key={item.id}
                className={`px-5 py-3.5 transition-colors ${
                  isOk
                    ? 'bg-white'
                    : isPartial
                      ? 'bg-amber-50/35'
                      : 'bg-red-50/25'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Caixa de Marcação Automática */}
                    <div
                      aria-label={
                        isOk
                          ? `${item.titulo}: conforme`
                          : isPartial
                            ? `${item.titulo}: atenção parcial`
                            : `${item.titulo}: pendente`
                      }
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isOk
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : isPartial
                            ? 'bg-amber-100 border-amber-400 text-amber-800'
                            : 'bg-white border-red-400 text-red-600'
                      }`}
                    >
                      {isOk ? (
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : isPartial ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      )}
                    </div>

                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            isOk ? 'text-slate-900' : 'text-slate-900'
                          }`}
                        >
                          {item.ordem}. {item.titulo}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          · {item.artigoLc95}
                        </span>
                        {item.opcional && (
                          <span className="text-[11px] font-medium text-emerald-700">
                            · Opcional
                          </span>
                        )}
                      </div>

                      <p
                        className={`text-xs leading-relaxed ${
                          isOk
                            ? 'text-slate-600'
                            : isPartial
                              ? 'text-amber-900'
                              : 'text-red-800'
                        }`}
                      >
                        {item.resumo}
                      </p>

                      {/* Sub-itens verificados automaticamente */}
                      <ul className="space-y-1 pt-0.5">
                        {item.detalhes.map((sub, idx) => (
                          <li
                            key={idx}
                            className="flex items-center gap-1.5 text-[11px] text-slate-600"
                          >
                            {sub.ok ? (
                              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                            ) : (
                              <Circle className="w-2.5 h-2.5 text-slate-400 shrink-0 mx-0.5" />
                            )}
                            <span
                              className={
                                sub.ok ? 'text-slate-700' : 'text-slate-500'
                              }
                            >
                              {sub.label}
                            </span>
                            {sub.nota && (
                              <span className="text-[10px] text-slate-400">
                                ({sub.nota})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onLocateField(item.fieldSelector)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <LocateFixed className="w-3 h-3" />
                    <span>{isOk ? 'Ver campo' : 'Preencher'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
