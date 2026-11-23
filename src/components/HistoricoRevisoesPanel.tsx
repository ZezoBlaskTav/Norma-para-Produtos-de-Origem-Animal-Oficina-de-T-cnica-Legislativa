import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileDiff,
  History,
  MessageSquareText,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { NormaDocument, NormaRevision } from '../types/norma';
import { LocalRecoveryPoint } from '../utils/localPersistence';
import {
  ArtigoDiffItem,
  DiffSegment,
  FieldDiffItem,
  buildUnifiedPlainDiff,
  compareNormaDocuments,
} from '../utils/normaDiff';

interface HistoricoRevisoesPanelProps {
  currentDoc: NormaDocument;
  revisions: NormaRevision[];
  localSnapshots: LocalRecoveryPoint[];
  revisionsLoading: boolean;
  revisionsError: string | null;
  onChangeDocObservacoes: (value: string) => void;
  onCreateRevision: (titulo: string, observacao: string) => Promise<void>;
  onUpdateRevisionNote: (
    revisaoId: string,
    titulo: string,
    observacao: string
  ) => Promise<void>;
  onDeleteRevision: (revisaoId: string) => Promise<void>;
  onRestoreWholeDoc: (
    snapshotDoc: NormaDocument,
    sourceLabel: string
  ) => Promise<void>;
  onRestoreSingleField: (
    fieldKey: FieldDiffItem['key'],
    snapshotDoc: NormaDocument
  ) => void;
  onRestoreSingleArtigo: (artDiff: ArtigoDiffItem) => void;
}

type SourceTab = 'revisoes' | 'automaticos';
type DiffViewMode = 'estruturado' | 'corrido';

interface ComparableEntry {
  kind: 'revision' | 'snapshot';
  id: string;
  title: string;
  subtitle: string;
  observacao: string;
  createdAtIso: string;
  docSnapshot: NormaDocument;
  revisionRef?: NormaRevision;
}

function formatDateTimePt(iso?: string): string {
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
}

const DiffSegmentsInline: React.FC<{ segments: DiffSegment[] }> = ({
  segments,
}) => {
  if (segments.length === 0) {
    return <span className="text-slate-400 italic">(vazio)</span>;
  }
  return (
    <span className="whitespace-pre-wrap break-words">
      {segments.map((seg, idx) => {
        if (seg.type === 'added') {
          return (
            <ins
              key={idx}
              className="bg-emerald-100 text-emerald-950 no-underline rounded-xs px-0.5"
            >
              {seg.text}
            </ins>
          );
        }
        if (seg.type === 'removed') {
          return (
            <del
              key={idx}
              className="bg-rose-100 text-rose-900 line-through rounded-xs px-0.5"
            >
              {seg.text}
            </del>
          );
        }
        return <React.Fragment key={idx}>{seg.text}</React.Fragment>;
      })}
    </span>
  );
};

export const HistoricoRevisoesPanel: React.FC<HistoricoRevisoesPanelProps> = ({
  currentDoc,
  revisions,
  localSnapshots,
  revisionsLoading,
  revisionsError,
  onChangeDocObservacoes,
  onCreateRevision,
  onUpdateRevisionNote,
  onDeleteRevision,
  onRestoreWholeDoc,
  onRestoreSingleField,
  onRestoreSingleArtigo,
}) => {
  const [sourceTab, setSourceTab] = useState<SourceTab>('revisoes');
  const [selectedId, setSelectedId] = useState<string | null>(
    () => revisions[0]?.id || null
  );
  const [targetCompareId, setTargetCompareId] = useState<string>('__current__');
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('estruturado');
  const [onlyChanges, setOnlyChanges] = useState(true);

  const [newTitulo, setNewTitulo] = useState('');
  const [newObservacao, setNewObservacao] = useState('');
  const [savingRev, setSavingRev] = useState(false);
  const [revSavedFeedback, setRevSavedFeedback] = useState(false);
  const [revActionError, setRevActionError] = useState<string | null>(null);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteTitulo, setEditNoteTitulo] = useState('');
  const [editNoteObs, setEditNoteObs] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmRestoreWhole, setConfirmRestoreWhole] = useState(false);
  const [restoringWhole, setRestoringWhole] = useState(false);
  const [docNotesOpen, setDocNotesOpen] = useState(
    Boolean((currentDoc.observacoes || '').trim())
  );

  const comparableEntries = useMemo<ComparableEntry[]>(() => {
    if (sourceTab === 'revisoes') {
      return revisions.map((rev) => ({
        kind: 'revision',
        id: rev.id,
        title: `v${rev.numeroRevisao} · ${rev.titulo}`,
        subtitle: [
          rev.autorNome || rev.autorEmail || 'Usuário',
          formatDateTimePt(rev.createdAtIso),
          rev.resumoAlteracoes,
        ]
          .filter(Boolean)
          .join(' · '),
        observacao: rev.observacao,
        createdAtIso: rev.createdAtIso,
        docSnapshot: rev.docSnapshot,
        revisionRef: rev,
      }));
    }
    return localSnapshots.map((snap) => ({
      kind: 'snapshot',
      id: snap.id,
      title: snap.label,
      subtitle: `${snap.subLabel} · ${formatDateTimePt(snap.savedAt)}`,
      observacao: '',
      createdAtIso: snap.savedAt,
      docSnapshot: snap.doc,
    }));
  }, [sourceTab, revisions, localSnapshots]);

  // Mantém seleção válida ao alternar entre abas ou documentos
  useEffect(() => {
    if (comparableEntries.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !comparableEntries.some((e) => e.id === selectedId)) {
      setSelectedId(comparableEntries[0].id);
    }
  }, [comparableEntries, selectedId]);

  useEffect(() => {
    setConfirmRestoreWhole(false);
    setEditingNoteId(null);
  }, [selectedId, targetCompareId]);

  const selectedEntry = useMemo(
    () => comparableEntries.find((e) => e.id === selectedId) || null,
    [comparableEntries, selectedId]
  );

  const targetDocInfo = useMemo(() => {
    if (targetCompareId === '__current__') {
      return {
        label: 'Versão atual no editor',
        doc: currentDoc,
        isCurrent: true,
      };
    }
    const foundRev = revisions.find((r) => r.id === targetCompareId);
    if (foundRev) {
      return {
        label: `v${foundRev.numeroRevisao} · ${foundRev.titulo}`,
        doc: foundRev.docSnapshot,
        isCurrent: false,
      };
    }
    return {
      label: 'Versão atual no editor',
      doc: currentDoc,
      isCurrent: true,
    };
  }, [targetCompareId, currentDoc, revisions]);

  const structuredDiff = useMemo(() => {
    if (!selectedEntry) return null;
    return compareNormaDocuments(selectedEntry.docSnapshot, targetDocInfo.doc);
  }, [selectedEntry, targetDocInfo.doc]);

  const plainDiffLines = useMemo(() => {
    if (!selectedEntry || diffViewMode !== 'corrido') return [];
    const lines = buildUnifiedPlainDiff(
      selectedEntry.docSnapshot,
      targetDocInfo.doc
    );
    return onlyChanges ? lines.filter((l) => l.type !== 'equal') : lines;
  }, [selectedEntry, targetDocInfo.doc, diffViewMode, onlyChanges]);

  const handleSubmitRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRev) return;
    setSavingRev(true);
    setRevActionError(null);
    try {
      await onCreateRevision(newTitulo, newObservacao);
      setNewTitulo('');
      setNewObservacao('');
      setSourceTab('revisoes');
      setRevSavedFeedback(true);
      window.setTimeout(() => setRevSavedFeedback(false), 2200);
    } catch (err) {
      setRevActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível registrar a revisão.'
      );
    } finally {
      setSavingRev(false);
    }
  };

  const handleSaveEditedNote = async (rev: NormaRevision) => {
    if (savingNote) return;
    setSavingNote(true);
    setRevActionError(null);
    try {
      await onUpdateRevisionNote(rev.id, editNoteTitulo, editNoteObs);
      setEditingNoteId(null);
    } catch (err) {
      setRevActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar a observação.'
      );
    } finally {
      setSavingNote(false);
    }
  };

  const handleConfirmDelete = async (revId: string) => {
    if (deletingId) return;
    setDeletingId(revId);
    setRevActionError(null);
    try {
      await onDeleteRevision(revId);
      setConfirmDeleteId(null);
      if (selectedId === revId) {
        setSelectedId(null);
      }
    } catch (err) {
      setRevActionError(
        err instanceof Error ? err.message : 'Erro ao excluir revisão.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirmRestoreWhole = async () => {
    if (!selectedEntry || restoringWhole) return;
    setRestoringWhole(true);
    setRevActionError(null);
    try {
      await onRestoreWholeDoc(selectedEntry.docSnapshot, selectedEntry.title);
      setConfirmRestoreWhole(false);
    } catch (err) {
      setRevActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível restaurar a versão selecionada.'
      );
    } finally {
      setRestoringWhole(false);
    }
  };

  const visibleFieldDiffs = useMemo(() => {
    if (!structuredDiff) return [];
    return onlyChanges
      ? structuredDiff.fieldDiffs.filter((f) => f.status === 'modified')
      : structuredDiff.fieldDiffs;
  }, [structuredDiff, onlyChanges]);

  const visibleArtigoDiffs = useMemo(() => {
    if (!structuredDiff) return [];
    return onlyChanges
      ? structuredDiff.artigoDiffs.filter((a) => a.status !== 'equal')
      : structuredDiff.artigoDiffs;
  }, [structuredDiff, onlyChanges]);

  return (
    <div className="no-print space-y-4">
      {/* Caixa de Observações Gerais da Minuta */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setDocNotesOpen((v) => !v)}
          aria-expanded={docNotesOpen}
          className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquareText className="w-4 h-4 text-slate-700 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900">
                Caixa de Observações da Minuta
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Anotações internas de redação (não saem na prévia oficial nem na exportação)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(currentDoc.observacoes || '').trim().length > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {(currentDoc.observacoes || '').trim().length} car.
              </span>
            )}
            {docNotesOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )}
          </div>
        </button>

        {docNotesOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-2">
            <textarea
              rows={3}
              value={currentDoc.observacoes || ''}
              onChange={(e) => onChangeDocObservacoes(e.target.value)}
              maxLength={4000}
              placeholder="Anote aqui pendências jurídicas, artigos a conferir, prazos, pareceres ou observações sobre esta minuta..."
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-slate-900 leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Salva automaticamente junto com a minuta.</span>
              <span className="font-mono tabular-nums">
                {(currentDoc.observacoes || '').length}/4000
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Registrar Nova Revisão com Caixa de Observações */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-800 shrink-0" />
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                Registrar Nova Revisão
              </h3>
              <p className="text-[11px] text-slate-500">
                Congela uma cópia da versão atual para comparação futura e registro de observações
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmitRevision(e)} className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-8">
              <label
                htmlFor="rev-titulo-input"
                className="block text-[11px] font-medium text-slate-700 mb-1"
              >
                Identificação da versão (opcional)
              </label>
              <input
                id="rev-titulo-input"
                type="text"
                value={newTitulo}
                onChange={(e) => setNewTitulo(e.target.value)}
                maxLength={140}
                placeholder={`Ex.: Revisão #${(revisions[0]?.numeroRevisao || 0) + 1} — Após parecer jurídico`}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div className="sm:col-span-4 flex items-end">
              <button
                type="submit"
                disabled={savingRev}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
              >
                {revSavedFeedback ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {savingRev
                    ? 'Registrando...'
                    : revSavedFeedback
                      ? 'Revisão salva'
                      : 'Salvar revisão'}
                </span>
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="rev-observacao-input"
              className="block text-[11px] font-medium text-slate-700 mb-1"
            >
              Observações da revisão
            </label>
            <textarea
              id="rev-observacao-input"
              rows={2}
              value={newObservacao}
              onChange={(e) => setNewObservacao(e.target.value)}
              maxLength={2000}
              placeholder="Descreva o motivo desta revisão, os dispositivos alterados ou instruções para quem for revisar..."
              className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </form>

        {(revisionsError || revActionError) && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800">
            {revActionError || revisionsError}
          </div>
        )}
      </section>

      {/* Linha do Tempo de Versões */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setSourceTab('revisoes')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                sourceTab === 'revisoes'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Revisões salvas ({revisions.length})
            </button>
            <button
              type="button"
              onClick={() => setSourceTab('automaticos')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                sourceTab === 'automaticos'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pontos automáticos ({localSnapshots.length})
            </button>
          </div>
          {revisionsLoading && (
            <span className="text-[11px] text-slate-500">
              Sincronizando histórico...
            </span>
          )}
        </div>

        {comparableEntries.length === 0 ? (
          <div className="p-5 text-center space-y-1.5">
            <p className="text-xs font-medium text-slate-700">
              {sourceTab === 'revisoes'
                ? 'Nenhuma revisão registrada para esta norma ainda.'
                : 'Nenhum ponto automático capturado nesta sessão ainda.'}
            </p>
            <p className="text-xs text-slate-500">
              {sourceTab === 'revisoes'
                ? 'Use o formulário acima para registrar a primeira versão com suas observações e comparar alterações futuras.'
                : 'Edite o texto normalmente; pontos automáticos de recuperação são criados em segundo plano.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 max-h-64 overflow-y-auto">
            {comparableEntries.map((entry) => {
              const isSelected = entry.id === selectedId;
              const isConfirmingDel =
                entry.kind === 'revision' && confirmDeleteId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`px-4 py-2.5 flex items-start justify-between gap-2 transition-colors ${
                    isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className="flex-1 min-w-0 text-left space-y-0.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold truncate ${
                          isSelected ? 'text-slate-950' : 'text-slate-800'
                        }`}
                      >
                        {entry.title}
                      </span>
                      {isSelected && (
                        <span className="text-[11px] font-medium text-slate-700 shrink-0">
                          · Comparando
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums truncate">
                      {entry.subtitle}
                    </div>
                    {entry.observacao && (
                      <p className="text-xs text-slate-700 pt-0.5 line-clamp-2 leading-relaxed">
                        Obs.: {entry.observacao}
                      </p>
                    )}
                  </button>

                  {entry.kind === 'revision' && (
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      {isConfirmingDel ? (
                        <>
                          <button
                            type="button"
                            disabled={deletingId === entry.id}
                            onClick={() => void handleConfirmDelete(entry.id)}
                            className="px-2 py-1 text-[11px] font-medium text-white bg-red-700 hover:bg-red-800 rounded whitespace-nowrap"
                          >
                            {deletingId === entry.id ? '...' : 'Excluir'}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === entry.id}
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-[11px] text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded whitespace-nowrap"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(entry.id)}
                          aria-label={`Remover ${entry.title}`}
                          title="Excluir revisão"
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Painel de Comparação entre Versão Selecionada e Versão Atual */}
      {selectedEntry && structuredDiff && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <FileDiff className="w-4 h-4 text-slate-700 shrink-0" />
                  <span className="truncate">
                    Comparação: {selectedEntry.title} → {targetDocInfo.label}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums">
                  {structuredDiff.hasChanges ? (
                    <>
                      {structuredDiff.stats.changedFields}{' '}
                      {structuredDiff.stats.changedFields === 1
                        ? 'campo alterado'
                        : 'campos alterados'}{' '}
                      · {structuredDiff.stats.modifiedArtigos} art. alterado(s) ·{' '}
                      +{structuredDiff.stats.addedArtigos} adicionado(s) · -
                      {structuredDiff.stats.removedArtigos} removido(s)
                    </>
                  ) : (
                    'Sem diferenças entre a versão selecionada e o destino comparado'
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!confirmRestoreWhole ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreWhole(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar versão inteira</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={restoringWhole}
                      onClick={() => void handleConfirmRestoreWhole()}
                      className="px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap"
                    >
                      {restoringWhole
                        ? 'Restaurando...'
                        : 'Confirmar restauração'}
                    </button>
                    <button
                      type="button"
                      disabled={restoringWhole}
                      onClick={() => setConfirmRestoreWhole(false)}
                      className="px-2 py-1 text-xs text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Observação da revisão selecionada (com edição inline) */}
            {selectedEntry.kind === 'revision' && selectedEntry.revisionRef && (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
                {editingNoteId === selectedEntry.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editNoteTitulo}
                      onChange={(e) => setEditNoteTitulo(e.target.value)}
                      maxLength={140}
                      placeholder="Título da revisão"
                      className="w-full text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                    <textarea
                      rows={2}
                      value={editNoteObs}
                      onChange={(e) => setEditNoteObs(e.target.value)}
                      maxLength={2000}
                      placeholder="Observações desta revisão..."
                      className="w-full text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 leading-relaxed focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingNoteId(null)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded whitespace-nowrap"
                      >
                        <X className="w-3 h-3" />
                        <span>Cancelar</span>
                      </button>
                      <button
                        type="button"
                        disabled={savingNote}
                        onClick={() =>
                          void handleSaveEditedNote(selectedEntry.revisionRef!)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded whitespace-nowrap"
                      >
                        <Check className="w-3 h-3" />
                        <span>{savingNote ? 'Salvando...' : 'Salvar nota'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs text-slate-700 leading-relaxed min-w-0">
                      <span className="font-semibold text-slate-900">
                        Observação da versão:{' '}
                      </span>
                      {selectedEntry.observacao ? (
                        <span>{selectedEntry.observacao}</span>
                      ) : (
                        <span className="text-slate-400 italic">
                          Sem observação registrada.
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const rev = selectedEntry.revisionRef!;
                        setEditingNoteId(rev.id);
                        setEditNoteTitulo(rev.titulo);
                        setEditNoteObs(rev.observacao);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded whitespace-nowrap shrink-0"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Editar obs.</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Controles do Comparador */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => setDiffViewMode('estruturado')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    diffViewMode === 'estruturado'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Por dispositivos
                </button>
                <button
                  type="button"
                  onClick={() => setDiffViewMode('corrido')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    diffViewMode === 'corrido'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Texto corrido
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {revisions.length > 1 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <label
                      htmlFor="target-compare-select"
                      className="text-slate-500 whitespace-nowrap"
                    >
                      Comparar com:
                    </label>
                    <select
                      id="target-compare-select"
                      value={targetCompareId}
                      onChange={(e) => setTargetCompareId(e.target.value)}
                      className="text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 max-w-[190px] focus:outline-none focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="__current__">Versão atual no editor</option>
                      {revisions
                        .filter((r) => r.id !== selectedEntry.id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            v{r.numeroRevisao} · {r.titulo}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={onlyChanges}
                    onChange={(e) => setOnlyChanges(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>Apenas alterações</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <del className="bg-rose-100 text-rose-900 px-1 rounded-xs">
                  removido
                </del>
                <span>Texto da versão anterior</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ins className="bg-emerald-100 text-emerald-950 no-underline px-1 rounded-xs">
                  incluído
                </ins>
                <span>Texto na versão comparada</span>
              </span>
            </div>
          </div>

          {/* Corpo da Comparação */}
          <div className="p-4 space-y-4 max-h-[680px] overflow-y-auto">
            {!structuredDiff.hasChanges ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Nenhuma diferença encontrada entre esta revisão e{' '}
                <strong>{targetDocInfo.label}</strong>.
              </div>
            ) : diffViewMode === 'corrido' ? (
              <div className="space-y-1.5 font-serif text-xs leading-relaxed">
                {plainDiffLines.length === 0 ? (
                  <div className="py-6 text-center font-sans text-xs text-slate-500">
                    Nenhuma linha alterada no texto corrido oficial.
                  </div>
                ) : (
                  plainDiffLines.map((line, idx) => {
                    if (line.type === 'equal') {
                      return (
                        <div
                          key={idx}
                          className="px-2.5 py-1 text-slate-600 whitespace-pre-wrap"
                        >
                          {line.newText || '\u00A0'}
                        </div>
                      );
                    }
                    if (line.type === 'added') {
                      return (
                        <div
                          key={idx}
                          className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded text-emerald-950 whitespace-pre-wrap"
                        >
                          <span className="font-mono text-[11px] font-semibold mr-1.5">
                            +
                          </span>
                          {line.newText}
                        </div>
                      );
                    }
                    if (line.type === 'removed') {
                      return (
                        <div
                          key={idx}
                          className="px-2.5 py-1 bg-rose-50 border border-rose-200 rounded text-rose-900 line-through whitespace-pre-wrap"
                        >
                          <span className="font-mono text-[11px] font-semibold mr-1.5 no-underline">
                            -
                          </span>
                          {line.oldText}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={idx}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900"
                      >
                        <DiffSegmentsInline segments={line.segments || []} />
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {visibleFieldDiffs.map((fDiff) => (
                  <div
                    key={fDiff.key}
                    className="border border-slate-200 rounded-md p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-900">
                        {fDiff.label}
                      </div>
                      {targetDocInfo.isCurrent &&
                        fDiff.status === 'modified' &&
                        fDiff.canRestore && (
                          <button
                            type="button"
                            onClick={() =>
                              onRestoreSingleField(
                                fDiff.key,
                                selectedEntry.docSnapshot
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded whitespace-nowrap"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restaurar campo</span>
                          </button>
                        )}
                    </div>
                    <div className="text-xs text-slate-800 leading-relaxed">
                      <DiffSegmentsInline segments={fDiff.segments} />
                    </div>
                  </div>
                ))}

                {visibleArtigoDiffs.map((artDiff) => {
                  const statusLabel =
                    artDiff.status === 'added'
                      ? 'Adicionado'
                      : artDiff.status === 'removed'
                        ? 'Removido na versão comparada'
                        : artDiff.status === 'modified'
                          ? 'Alterado'
                          : 'Sem alterações';

                  const titleLabel =
                    artDiff.status === 'added'
                      ? artDiff.newLabel
                      : artDiff.status === 'removed'
                        ? artDiff.oldLabel
                        : artDiff.renumbered
                          ? `${artDiff.oldLabel} → ${artDiff.newLabel}`
                          : artDiff.newLabel || artDiff.oldLabel;

                  return (
                    <div
                      key={artDiff.id}
                      className="border border-slate-200 rounded-md p-3 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {titleLabel}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span
                            className={
                              artDiff.status === 'added'
                                ? 'font-medium text-emerald-700'
                                : artDiff.status === 'removed'
                                  ? 'font-medium text-rose-700'
                                  : artDiff.status === 'modified'
                                    ? 'font-medium text-amber-700'
                                    : 'text-slate-500'
                            }
                          >
                            {statusLabel}
                          </span>
                        </div>

                        {targetDocInfo.isCurrent &&
                          artDiff.status !== 'equal' && (
                            <button
                              type="button"
                              onClick={() => onRestoreSingleArtigo(artDiff)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded whitespace-nowrap"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>
                                {artDiff.status === 'removed'
                                  ? 'Reincluir artigo'
                                  : artDiff.status === 'added'
                                    ? 'Remover artigo adicionado'
                                    : 'Restaurar artigo'}
                              </span>
                            </button>
                          )}
                      </div>

                      {artDiff.status === 'added' && artDiff.newArt && (
                        <div className="text-xs text-emerald-950 bg-emerald-50/70 rounded p-2.5 space-y-1">
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {artDiff.newArt.caput || '(caput vazio)'}
                          </div>
                          {artDiff.newArt.incisos.map((inc, idx) => (
                            <div key={inc.id} className="pl-4 text-emerald-900">
                              Inciso {idx + 1}: {inc.texto}
                            </div>
                          ))}
                          {artDiff.newArt.paragrafos.map((par, idx) => (
                            <div key={par.id} className="pl-4 text-emerald-900">
                              § {idx + 1}: {par.texto}
                            </div>
                          ))}
                        </div>
                      )}

                      {artDiff.status === 'removed' && artDiff.oldArt && (
                        <div className="text-xs text-rose-900 bg-rose-50/70 rounded p-2.5 space-y-1 line-through">
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {artDiff.oldArt.caput || '(caput vazio)'}
                          </div>
                          {artDiff.oldArt.incisos.map((inc, idx) => (
                            <div key={inc.id} className="pl-4">
                              Inciso {idx + 1}: {inc.texto}
                            </div>
                          ))}
                          {artDiff.oldArt.paragrafos.map((par, idx) => (
                            <div key={par.id} className="pl-4">
                              § {idx + 1}: {par.texto}
                            </div>
                          ))}
                        </div>
                      )}

                      {(artDiff.status === 'modified' ||
                        artDiff.status === 'equal') && (
                        <div className="space-y-2 text-xs leading-relaxed">
                          {artDiff.divisionDiffs.map((divD) => (
                            <div
                              key={divD.kind}
                              className="bg-slate-50 rounded px-2.5 py-1.5 text-slate-800"
                            >
                              <span className="font-semibold text-slate-700 mr-1">
                                {divD.label}:
                              </span>
                              <DiffSegmentsInline segments={divD.segments} />
                            </div>
                          ))}

                          <div className="text-slate-900">
                            <DiffSegmentsInline
                              segments={artDiff.caputSegments}
                            />
                          </div>

                          {artDiff.incisos
                            .filter((inc) =>
                              onlyChanges ? inc.status !== 'equal' : true
                            )
                            .map((inc) => (
                              <div
                                key={inc.id}
                                className="pl-4 border-l border-slate-200 space-y-1"
                              >
                                <div className="text-slate-800">
                                  <span className="font-mono text-[11px] font-medium text-slate-600 mr-1.5">
                                    {inc.newLabel || inc.oldLabel}
                                  </span>
                                  <DiffSegmentsInline segments={inc.segments} />
                                </div>
                                {inc.alineas
                                  .filter((al) =>
                                    onlyChanges ? al.status !== 'equal' : true
                                  )
                                  .map((al) => (
                                    <div
                                      key={al.id}
                                      className="pl-4 text-slate-700"
                                    >
                                      <span className="font-mono text-[11px] text-slate-500 mr-1">
                                        {al.newLabel || al.oldLabel}
                                      </span>
                                      <DiffSegmentsInline
                                        segments={al.segments}
                                      />
                                    </div>
                                  ))}
                              </div>
                            ))}

                          {artDiff.paragrafos
                            .filter((par) =>
                              onlyChanges ? par.status !== 'equal' : true
                            )
                            .map((par) => (
                              <div
                                key={par.id}
                                className="pl-4 border-l border-slate-200 space-y-1"
                              >
                                <div className="text-slate-800">
                                  <span className="font-mono text-[11px] font-semibold text-slate-700 mr-1.5">
                                    {par.newLabel || par.oldLabel}
                                  </span>
                                  <DiffSegmentsInline segments={par.segments} />
                                </div>
                                {par.incisos
                                  .filter((inc) =>
                                    onlyChanges ? inc.status !== 'equal' : true
                                  )
                                  .map((inc) => (
                                    <div
                                      key={inc.id}
                                      className="pl-4 border-l border-slate-200 space-y-1"
                                    >
                                      <div className="text-slate-700">
                                        <span className="font-mono text-[11px] text-slate-500 mr-1">
                                          {inc.newLabel || inc.oldLabel}
                                        </span>
                                        <DiffSegmentsInline
                                          segments={inc.segments}
                                        />
                                      </div>
                                      {inc.alineas
                                        .filter((al) =>
                                          onlyChanges
                                            ? al.status !== 'equal'
                                            : true
                                        )
                                        .map((al) => (
                                          <div
                                            key={al.id}
                                            className="pl-4 text-slate-700"
                                          >
                                            <span className="font-mono text-[11px] text-slate-500 mr-1">
                                              {al.newLabel || al.oldLabel}
                                            </span>
                                            <DiffSegmentsInline
                                              segments={al.segments}
                                            />
                                          </div>
                                        ))}
                                    </div>
                                  ))}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
