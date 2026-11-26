import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  LocateFixed,
  Search,
  X,
} from 'lucide-react';
import { NormaDocument } from '../types/norma';
import {
  IndiceAssuntoOrigem,
  IndiceRemissivoResult,
  formatIndiceRemissivoPlainText,
  normalizeLookupKey,
} from '../utils/indiceRemissivo';

interface IndiceRemissivoPanelProps {
  doc: NormaDocument;
  indexResult: IndiceRemissivoResult;
  onLocateField: (fieldKey: string) => void;
}

type OriginFilter = 'todos' | IndiceAssuntoOrigem;

export const IndiceRemissivoPanel: React.FC<IndiceRemissivoPanelProps> = ({
  doc,
  indexResult,
  onLocateField,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('todos');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [expandedEntryIds, setExpandedEntryIds] = useState<
    Record<string, boolean>
  >({});
  const [copied, setCopied] = useState(false);

  const filteredEntries = useMemo(() => {
    const qNorm = normalizeLookupKey(searchQuery);
    return indexResult.entries.filter((entry) => {
      if (originFilter !== 'todos' && entry.origem !== originFilter) {
        return false;
      }
      if (selectedLetter && entry.letraInicial !== selectedLetter) {
        return false;
      }
      if (!qNorm) return true;
      if (normalizeLookupKey(entry.assunto).includes(qNorm)) {
        return true;
      }
      return entry.referencias.some(
        (ref) =>
          normalizeLookupKey(ref.artLabel).includes(qNorm) ||
          normalizeLookupKey(ref.detalhe).includes(qNorm) ||
          normalizeLookupKey(ref.trecho).includes(qNorm)
      );
    });
  }, [indexResult.entries, originFilter, selectedLetter, searchQuery]);

  const countsByOrigin = useMemo(() => {
    let divisao = 0;
    let conceito = 0;
    let termo = 0;
    let disposicao_final = 0;
    for (const e of indexResult.entries) {
      if (e.origem === 'divisao') divisao += 1;
      else if (e.origem === 'conceito') conceito += 1;
      else if (e.origem === 'termo') termo += 1;
      else if (e.origem === 'disposicao_final') disposicao_final += 1;
    }
    return { divisao, conceito, termo, disposicao_final };
  }, [indexResult.entries]);

  const groupedByLetter = useMemo(() => {
    const groups: Array<{
      letter: string;
      entries: typeof filteredEntries;
    }> = [];
    for (const entry of filteredEntries) {
      const last = groups[groups.length - 1];
      if (!last || last.letter !== entry.letraInicial) {
        groups.push({ letter: entry.letraInicial, entries: [entry] });
      } else {
        last.entries.push(entry);
      }
    }
    return groups;
  }, [filteredEntries]);

  const toggleExpandEntry = (id: string) => {
    setExpandedEntryIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyIndice = async () => {
    const formatted = formatIndiceRemissivoPlainText(doc, indexResult);
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadIndice = () => {
    const formatted = formatIndiceRemissivoPlainText(doc, indexResult);
    const blob = new Blob([formatted], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `indice-remissivo-${doc.tipo.toLowerCase().replace(/\s+/g, '-')}-${doc.numero || 'minuta'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Cabeçalho do Índice Remissivo */}
      <div className="px-5 py-4 border-b border-slate-200 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-700 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-900">
                Índice Remissivo Automático
              </h3>
            </div>
            <p className="text-xs text-slate-500 tabular-nums">
              {indexResult.totalAssuntos}{' '}
              {indexResult.totalAssuntos === 1 ? 'assunto' : 'assuntos'} em
              ordem alfabética · {indexResult.totalArtigosIndexados} de{' '}
              {doc.artigos.length}{' '}
              {indexResult.isTech
                ? doc.artigos.length === 1
                  ? 'item mapeado'
                  : 'itens mapeados'
                : doc.artigos.length === 1
                  ? 'artigo mapeado'
                  : 'artigos mapeados'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyIndice()}
              disabled={indexResult.entries.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Índice copiado' : 'Copiar índice'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadIndice}
              disabled={indexResult.entries.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar .txt</span>
            </button>
          </div>
        </div>

        {/* Busca e Filtros por Origem */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar assunto, palavra-chave ou artigo (ex.: Art. 144, prazo)..."
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md pl-8 pr-7 py-1.5 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar busca do índice"
                className="p-0.5 text-slate-400 hover:text-slate-700 absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-md overflow-x-auto max-w-full shrink-0">
            <button
              type="button"
              onClick={() => setOriginFilter('todos')}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                originFilter === 'todos'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({indexResult.totalAssuntos})
            </button>
            <button
              type="button"
              onClick={() => setOriginFilter('divisao')}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                originFilter === 'divisao'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Divisões ({countsByOrigin.divisao})
            </button>
            <button
              type="button"
              onClick={() => setOriginFilter('conceito')}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                originFilter === 'conceito'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Temas ({countsByOrigin.conceito})
            </button>
            <button
              type="button"
              onClick={() => setOriginFilter('termo')}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                originFilter === 'termo'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Termos ({countsByOrigin.termo})
            </button>
          </div>
        </div>

        {/* Barra alfabética A-Z */}
        {indexResult.letrasDisponiveis.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={() => setSelectedLetter(null)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                selectedLetter === null
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              A–Z
            </button>
            {indexResult.letrasDisponiveis.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() =>
                  setSelectedLetter((prev) => (prev === letter ? null : letter))
                }
                className={`min-w-[24px] px-1.5 py-0.5 text-[11px] font-mono font-medium rounded border transition-colors ${
                  selectedLetter === letter
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista de Verbetes */}
      {filteredEntries.length === 0 ? (
        <div className="px-5 py-10 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800">
            Nenhum assunto encontrado para o filtro atual.
          </p>
          <p className="text-xs text-slate-500">
            Redija os artigos ou divisões da norma, ou limpe a busca para
            visualizar todo o índice remissivo.
          </p>
          {(searchQuery || originFilter !== 'todos' || selectedLetter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setOriginFilter('todos');
                setSelectedLetter(null);
              }}
              className="mt-1 inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {groupedByLetter.map((group) => (
            <div key={group.letter}>
              <div className="bg-slate-50 px-5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-800">
                  {group.letter}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {group.entries.length}{' '}
                  {group.entries.length === 1 ? 'verbete' : 'verbetes'}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {group.entries.map((entry) => {
                  const isExpanded = Boolean(expandedEntryIds[entry.id]);
                  const visibleRefs =
                    entry.referencias.length > 10 && !isExpanded
                      ? entry.referencias.slice(0, 8)
                      : entry.referencias;
                  const hiddenCount =
                    entry.referencias.length - visibleRefs.length;

                  return (
                    <div key={entry.id} className="px-5 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 leading-snug">
                            {entry.assunto}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                            <span>{entry.origemLabel}</span>
                            <span aria-hidden="true"> · </span>
                            <span>
                              {entry.referencias.length}{' '}
                              {entry.referencias.length === 1
                                ? indexResult.isTech
                                  ? 'item'
                                  : 'artigo'
                                : indexResult.isTech
                                  ? 'itens'
                                  : 'artigos'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleExpandEntry(entry.id)}
                          aria-expanded={isExpanded}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isExpanded ? 'Ocultar trechos' : 'Ver trechos'}
                          </span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {visibleRefs.map((ref) => (
                          <button
                            key={`${entry.id}-${ref.artId}`}
                            type="button"
                            onClick={() => onLocateField(ref.fieldKey)}
                            title={`Ir para ${ref.artLabel} (${ref.detalhe})`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-medium tabular-nums text-slate-800 bg-slate-50 hover:bg-slate-900 hover:text-white border border-slate-200 hover:border-slate-900 rounded transition-colors whitespace-nowrap"
                          >
                            <span>{ref.artLabel}</span>
                          </button>
                        ))}
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleExpandEntry(entry.id)}
                            className="px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2 whitespace-nowrap"
                          >
                            + {hiddenCount} mais
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="pt-1.5 space-y-1.5 border-t border-slate-100">
                          {entry.referencias.map((ref) => (
                            <div
                              key={`${entry.id}-detail-${ref.artId}`}
                              className="flex items-start justify-between gap-2 text-xs bg-slate-50/80 border border-slate-200/80 rounded-md px-2.5 py-2"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="font-medium text-slate-800">
                                  <span className="font-mono tabular-nums">
                                    {ref.artLabel}
                                  </span>{' '}
                                  <span className="text-slate-500 font-normal">
                                    ({ref.detalhe})
                                  </span>
                                </div>
                                {ref.trecho && (
                                  <p className="text-slate-600 leading-relaxed">
                                    {ref.trecho}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => onLocateField(ref.fieldKey)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded whitespace-nowrap shrink-0"
                              >
                                <LocateFixed className="w-3 h-3" />
                                <span>Ir</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
