import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FileDiff,
  Highlighter,
  Plus,
  Printer,
  ShieldCheck,
  SpellCheck,
  Trash2,
} from 'lucide-react';
import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  LinguisticFinding,
  NormaTipo,
  TipoAcaoAlteracao,
} from '../types/norma';
import {
  getOrdemExecucaoPadrao,
  renderAlteracaoDecreeText,
} from '../utils/legistica';
import { getVigenciaPronomePrefix } from '../utils/normaProfiles';
import {
  analyzeAlteracaoLinguistics,
  applyAllAutoFixesToAlteracao,
  applyLinguisticFixToAlteracao,
  isPortugueseErrorFinding,
} from '../utils/revisorLinguistico';
import { useSpellcheck } from '../hooks/useSpellcheck';
import { NormaTipoSelect } from './NormaTipoSelect';
import { ReviewedInput, ReviewedTextarea } from './ReviewedTextFields';
import {
  FieldReviewHints,
  HighlightedLegalText,
  RevisorLinguisticoPanel,
} from './RevisorLinguisticoPanel';

interface AjusteNormaViewProps {
  meta: AlteracaoMetadata;
  alteracoes: AlteracaoDispositivo[];
  onChangeMeta: (next: AlteracaoMetadata) => void;
  onChangeAlteracoes: (next: AlteracaoDispositivo[]) => void;
  onAuditDraft: (plainText: string) => void;
}

const AJUSTE_IGNORED_KEY = 'norma_ajuste_ignored_review_signatures_v1';

function readStoredAjusteIgnored(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(AJUSTE_IGNORED_KEY);
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

function writeStoredAjusteIgnored(sigs: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AJUSTE_IGNORED_KEY,
      JSON.stringify(Array.from(sigs))
    );
  } catch {
    // Ignora falha de armazenamento em modo privado/restrito
  }
}

function uid(): string {
  return `alt-${Math.random().toString(36).slice(2, 8)}`;
}

export const AjusteNormaView: React.FC<AjusteNormaViewProps> = ({
  meta,
  alteracoes,
  onChangeMeta,
  onChangeAlteracoes,
  onAuditDraft,
}) => {
  const [subTab, setSubTab] = useState<'minuta' | 'comparativo' | 'revisor'>(
    'minuta'
  );
  const [copiedMinuta, setCopiedMinuta] = useState(false);
  const [highlightReview, setHighlightReview] = useState(true);
  const [showInlineHints, setShowInlineHints] = useState(true);
  const [ignoredSignatures, setIgnoredSignatures] = useState<Set<string>>(() =>
    readStoredAjusteIgnored()
  );
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    null
  );

  const { spellChecker, addToDictionary, nativeFieldProps } = useSpellcheck();

  const minutaAlteradora = useMemo(
    () => renderAlteracaoDecreeText(meta, alteracoes),
    [meta, alteracoes]
  );

  const review = useMemo(
    () =>
      analyzeAlteracaoLinguistics(
        meta,
        alteracoes,
        ignoredSignatures,
        spellChecker
      ),
    [meta, alteracoes, ignoredSignatures, spellChecker]
  );

  const updateMeta = <K extends keyof AlteracaoMetadata>(
    key: K,
    value: AlteracaoMetadata[K]
  ) => {
    onChangeMeta({ ...meta, [key]: value });
  };

  const addAlteracao = (tipoAcao: TipoAcaoAlteracao) => {
    const novo: AlteracaoDispositivo = {
      id: uid(),
      tipoAcao,
      dispositivoAlvo:
        tipoAcao === 'acrescer'
          ? 'Art. 5º-A'
          : tipoAcao === 'revogar'
            ? 'o inciso II do art. 6º'
            : 'Art. 5º',
      textoOriginal:
        tipoAcao === 'acrescer' ? '(Dispositivo inexistente na norma vigente)' : '',
      textoNovo:
        tipoAcao === 'revogar'
          ? ''
          : tipoAcao === 'acrescer'
            ? 'Art. 5º-A Novo dispositivo inserido sem renumerar os seguintes.'
            : 'Art. 5º Nova redação do dispositivo alterado.',
      incluirPontilhadoAntes: false,
      incluirPontilhadoDepois: false,
      justificativa: '',
    };
    onChangeAlteracoes([...alteracoes, novo]);
  };

  const updateItem = (id: string, patch: Partial<AlteracaoDispositivo>) => {
    onChangeAlteracoes(
      alteracoes.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeItem = (id: string) => {
    onChangeAlteracoes(alteracoes.filter((item) => item.id !== id));
  };

  const handleCopyMinuta = async () => {
    await navigator.clipboard.writeText(minutaAlteradora);
    setCopiedMinuta(true);
    setTimeout(() => setCopiedMinuta(false), 1800);
  };

  const handleApplyFix = (finding: LinguisticFinding, replacement?: string) => {
    const next = applyLinguisticFixToAlteracao(
      meta,
      alteracoes,
      finding,
      replacement
    );
    onChangeMeta(next.meta);
    onChangeAlteracoes(next.alteracoes);
    if (selectedFindingId === finding.id) {
      setSelectedFindingId(null);
    }
  };

  const handleApplyAllAutoFixes = () => {
    const next = applyAllAutoFixesToAlteracao(
      meta,
      alteracoes,
      review.findings
    );
    onChangeMeta(next.meta);
    onChangeAlteracoes(next.alteracoes);
    setSelectedFindingId(null);
  };

  const handleIgnoreFinding = (finding: LinguisticFinding) => {
    setIgnoredSignatures((prev) => {
      const next = new Set(prev);
      next.add(finding.signature);
      writeStoredAjusteIgnored(next);
      return next;
    });
    if (selectedFindingId === finding.id) {
      setSelectedFindingId(null);
    }
  };

  const handleRestoreIgnored = () => {
    const empty = new Set<string>();
    writeStoredAjusteIgnored(empty);
    setIgnoredSignatures(empty);
  };

  const handleLocateField = (fieldKey: string) => {
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
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho Explicativo */}
      <section className="no-print bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">
            Oficina de Ajuste de Normas Existentes (Art. 12 da LC nº 95/1998)
          </h2>
          <p className="text-sm text-slate-600">
            Configure os dispositivos alterados, acrescidos ou revogados. O sistema
            aplica automaticamente aspas, linha pontilhada, sufixos sem renumeração e
            a marcação <span className="font-mono">(NR)</span>, com revisão
            ortográfica e gramatical em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start lg:self-center shrink-0">
          <button
            type="button"
            onClick={() => setSubTab('revisor')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors whitespace-nowrap ${
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

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-md shrink-0">
            <button
              type="button"
              onClick={() => setSubTab('minuta')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'minuta'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Minuta do Ato Alterador
            </button>
            <button
              type="button"
              onClick={() => setSubTab('comparativo')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'comparativo'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Quadro Comparativo (De → Para)
            </button>
            <button
              type="button"
              onClick={() => setSubTab('revisor')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'revisor'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SpellCheck className="w-3.5 h-3.5" />
              <span>Revisor ({review.findings.length})</span>
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Configuração da Alteração */}
        <div className="no-print xl:col-span-6 space-y-6">
          {/* Metadados da Norma Alvo e Ato Alterador */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                1. Identificação do Ato Alterador e da Norma Alvo
              </h3>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInlineHints}
                  onChange={(e) => setShowInlineHints(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span>Sugestões nos campos</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Espécie do Ato Alterador
                </label>
                <NormaTipoSelect
                  value={meta.atoAlteradorTipo}
                  onChange={(t: NormaTipo) => {
                    const prevDefaultVig = `${getVigenciaPronomePrefix(meta.atoAlteradorTipo)} entra em vigor na data de sua publicação.`;
                    const isDefaultVig =
                      !meta.vigenciaTexto.trim() ||
                      meta.vigenciaTexto.trim() === prevDefaultVig ||
                      /^(Este|Esta)\s+.+\s+entra em vigor na data de sua publicação\.$/i.test(
                        meta.vigenciaTexto.trim()
                      );
                    onChangeMeta({
                      ...meta,
                      atoAlteradorTipo: t,
                      ordemExecucao: getOrdemExecucaoPadrao(t),
                      vigenciaTexto: isDefaultVig
                        ? `${getVigenciaPronomePrefix(t)} entra em vigor na data de sua publicação.`
                        : meta.vigenciaTexto,
                    });
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Número
                </label>
                <input
                  type="text"
                  value={meta.atoAlteradorNumero}
                  onChange={(e) => updateMeta('atoAlteradorNumero', e.target.value)}
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Data
                </label>
                <input
                  type="text"
                  value={meta.atoAlteradorData}
                  onChange={(e) => updateMeta('atoAlteradorData', e.target.value)}
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2"
                />
              </div>
            </div>

            <div data-review-field="alt_normaAlvoNome" className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Norma que está sendo ajustada
              </label>
              <ReviewedInput
                type="text"
                value={meta.normaAlvoNome}
                onChange={(e) => updateMeta('normaAlvoNome', e.target.value)}
                placeholder="Ex.: Decreto nº 1.420, de 15 de março de 2022"
                findings={review.byField['alt_normaAlvoNome'] || []}
                highlightEnabled={highlightReview}
                onApplyFix={handleApplyFix}
                onIgnoreFinding={handleIgnoreFinding}
                onAddToDictionary={addToDictionary}
                {...nativeFieldProps}
                className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              {showInlineHints && (
                <FieldReviewHints
                  findings={review.byField['alt_normaAlvoNome'] || []}
                  onApplyFix={handleApplyFix}
                  onIgnore={handleIgnoreFinding}
                />
              )}
            </div>

            <div
              data-review-field="alt_normaAlvoEmentaResumo"
              className="space-y-1.5"
            >
              <label className="block text-xs font-medium text-slate-700">
                Complemento da Ementa (Assunto da norma alvo)
              </label>
              <ReviewedTextarea
                rows={2}
                value={meta.normaAlvoEmentaResumo}
                onChange={(e) =>
                  updateMeta('normaAlvoEmentaResumo', e.target.value)
                }
                placeholder="Ex.: que dispõe sobre o regime de teletrabalho"
                findings={review.byField['alt_normaAlvoEmentaResumo'] || []}
                highlightEnabled={highlightReview}
                onApplyFix={handleApplyFix}
                onIgnoreFinding={handleIgnoreFinding}
                onAddToDictionary={addToDictionary}
                {...nativeFieldProps}
              />
              {showInlineHints && (
                <FieldReviewHints
                  findings={review.byField['alt_normaAlvoEmentaResumo'] || []}
                  onApplyFix={handleApplyFix}
                  onIgnore={handleIgnoreFinding}
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div data-review-field="alt_autoridade" className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Autoridade
                </label>
                <ReviewedInput
                  type="text"
                  value={meta.autoridade}
                  onChange={(e) => updateMeta('autoridade', e.target.value)}
                  findings={review.byField['alt_autoridade'] || []}
                  highlightEnabled={highlightReview}
                  onApplyFix={handleApplyFix}
                  onIgnoreFinding={handleIgnoreFinding}
                  onAddToDictionary={addToDictionary}
                  {...nativeFieldProps}
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                {showInlineHints && (
                  <FieldReviewHints
                    findings={review.byField['alt_autoridade'] || []}
                    onApplyFix={handleApplyFix}
                    onIgnore={handleIgnoreFinding}
                  />
                )}
              </div>
              <div data-review-field="alt_vigenciaTexto" className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Cláusula de Vigência
                </label>
                <ReviewedInput
                  type="text"
                  value={meta.vigenciaTexto}
                  onChange={(e) => updateMeta('vigenciaTexto', e.target.value)}
                  findings={review.byField['alt_vigenciaTexto'] || []}
                  highlightEnabled={highlightReview}
                  onApplyFix={handleApplyFix}
                  onIgnoreFinding={handleIgnoreFinding}
                  onAddToDictionary={addToDictionary}
                  {...nativeFieldProps}
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                {showInlineHints && (
                  <FieldReviewHints
                    findings={review.byField['alt_vigenciaTexto'] || []}
                    onApplyFix={handleApplyFix}
                    onIgnore={handleIgnoreFinding}
                  />
                )}
              </div>
            </div>
          </section>

          {/* Lista de Dispositivos Ajustados */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                2. Dispositivos Alterados, Acrescidos ou Revogados
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => addAlteracao('alterar')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Alterar
                </button>
                <button
                  type="button"
                  onClick={() => addAlteracao('acrescer')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Acrescer (-A)
                </button>
                <button
                  type="button"
                  onClick={() => addAlteracao('revogar')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Revogar
                </button>
              </div>
            </div>

            {alteracoes.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-500 border border-dashed border-slate-300 rounded-md">
                Nenhum ajuste adicionado. Escolha Alterar, Acrescer ou Revogar acima.
              </div>
            )}

            <div className="space-y-5 divide-y divide-slate-200">
              {alteracoes.map((item, idx) => {
                const origKey = `alt_textoOriginal:${item.id}`;
                const novoKey = `alt_textoNovo:${item.id}`;
                const justKey = `alt_justificativa:${item.id}`;

                return (
                  <div
                    key={item.id}
                    className={idx > 0 ? 'pt-5 space-y-3' : 'space-y-3'}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs tabular-nums text-slate-500">
                          #{idx + 1}
                        </span>
                        <select
                          value={item.tipoAcao}
                          onChange={(e) =>
                            updateItem(item.id, {
                              tipoAcao: e.target.value as TipoAcaoAlteracao,
                            })
                          }
                          className="text-xs font-medium bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-slate-800"
                        >
                          <option value="alterar">Alteração de redação (NR)</option>
                          <option value="acrescer">Acréscimo de dispositivo (NR)</option>
                          <option value="revogar">Revogação expressa</option>
                        </select>
                        <input
                          type="text"
                          value={item.dispositivoAlvo}
                          onChange={(e) =>
                            updateItem(item.id, { dispositivoAlvo: e.target.value })
                          }
                          placeholder="Ex.: Art. 4º / inciso II do art. 6º"
                          className="text-xs font-mono bg-white border border-slate-300 rounded px-2.5 py-1 w-44 text-slate-900"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label="Remover alteração"
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {item.tipoAcao !== 'acrescer' && (
                      <div data-review-field={origKey} className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-600">
                          Redação Vigente (para Quadro Comparativo)
                        </label>
                        <ReviewedTextarea
                          rows={2}
                          value={item.textoOriginal}
                          onChange={(e) =>
                            updateItem(item.id, { textoOriginal: e.target.value })
                          }
                          placeholder="Cole aqui o texto atual do artigo ou parágrafo..."
                          findings={review.byField[origKey] || []}
                          highlightEnabled={highlightReview}
                          onApplyFix={handleApplyFix}
                          onIgnoreFinding={handleIgnoreFinding}
                          onAddToDictionary={addToDictionary}
                          surfaceClassName="bg-slate-50 border-slate-300"
                          textStyleClassName="text-sm text-slate-800 leading-relaxed px-3 py-2"
                          {...nativeFieldProps}
                        />
                        {showInlineHints && (
                          <FieldReviewHints
                            findings={review.byField[origKey] || []}
                            onApplyFix={handleApplyFix}
                            onIgnore={handleIgnoreFinding}
                          />
                        )}
                      </div>
                    )}

                    {item.tipoAcao !== 'revogar' && (
                      <>
                        <div data-review-field={novoKey} className="space-y-1.5">
                          <label className="block text-xs font-medium text-slate-700">
                            Nova Redação Proposta (a marcação &quot;(NR)&quot; é incluída automaticamente)
                          </label>
                          <ReviewedTextarea
                            rows={3}
                            value={item.textoNovo}
                            onChange={(e) =>
                              updateItem(item.id, { textoNovo: e.target.value })
                            }
                            placeholder="Ex.: Art. 4º ..."
                            findings={review.byField[novoKey] || []}
                            highlightEnabled={highlightReview}
                            onApplyFix={handleApplyFix}
                            onIgnoreFinding={handleIgnoreFinding}
                            onAddToDictionary={addToDictionary}
                            {...nativeFieldProps}
                          />
                          {showInlineHints && (
                            <FieldReviewHints
                              findings={review.byField[novoKey] || []}
                              onApplyFix={handleApplyFix}
                              onIgnore={handleIgnoreFinding}
                            />
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.incluirPontilhadoAntes}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  incluirPontilhadoAntes: e.target.checked,
                                })
                              }
                              className="rounded border-slate-300 text-slate-900"
                            />
                            <span>Omitir caput/trecho anterior com pontilhado</span>
                          </label>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.incluirPontilhadoDepois}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  incluirPontilhadoDepois: e.target.checked,
                                })
                              }
                              className="rounded border-slate-300 text-slate-900"
                            />
                            <span>Manter parágrafos seguintes com pontilhado</span>
                          </label>
                        </div>
                      </>
                    )}

                    <div data-review-field={justKey} className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-600">
                        Justificativa Técnica (para nota técnica / quadro comparativo)
                      </label>
                      <ReviewedInput
                        type="text"
                        value={item.justificativa}
                        onChange={(e) =>
                          updateItem(item.id, { justificativa: e.target.value })
                        }
                        placeholder="Motivo jurídico ou operacional do ajuste..."
                        findings={review.byField[justKey] || []}
                        highlightEnabled={highlightReview}
                        onApplyFix={handleApplyFix}
                        onIgnoreFinding={handleIgnoreFinding}
                        onAddToDictionary={addToDictionary}
                        {...nativeFieldProps}
                        className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                      {showInlineHints && (
                        <FieldReviewHints
                          findings={review.byField[justKey] || []}
                          onApplyFix={handleApplyFix}
                          onIgnore={handleIgnoreFinding}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Coluna Direita: Minuta do Ato Alterador OU Quadro Comparativo OU Revisor */}
        <div className="xl:col-span-6 xl:sticky xl:top-6 space-y-3">
          <div className="no-print flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-4 py-3">
            <span className="text-xs font-semibold text-slate-700">
              {subTab === 'minuta'
                ? 'Minuta do Ato Alterador (Art. 12 LC 95/98)'
                : subTab === 'comparativo'
                  ? 'Quadro Comparativo (De → Para)'
                  : 'Revisor Ortográfico e Gramatical'}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {subTab !== 'revisor' && (
                <button
                  type="button"
                  onClick={() => setHighlightReview((v) => !v)}
                  title="Ativar/desativar realce em tempo real nos campos"
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
                onClick={handleCopyMinuta}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
              >
                {copiedMinuta ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedMinuta ? 'Copiado' : 'Copiar Minuta'}</span>
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
                onClick={() => onAuditDraft(minutaAlteradora)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Auditar</span>
              </button>
            </div>
          </div>

          {subTab === 'revisor' ? (
            <RevisorLinguisticoPanel
              summary={review}
              ignoredCount={ignoredSignatures.size}
              selectedFindingId={selectedFindingId}
              onSelectFinding={(f) => setSelectedFindingId(f.id)}
              onApplyFix={handleApplyFix}
              onApplyAllAutoFixes={handleApplyAllAutoFixes}
              onIgnore={handleIgnoreFinding}
              onRestoreIgnored={handleRestoreIgnored}
              onLocateField={handleLocateField}
            />
          ) : subTab === 'minuta' ? (
            <article className="print-sheet bg-white border border-slate-200 rounded-lg p-8 sm:p-10 font-serif text-sm text-slate-900 leading-relaxed whitespace-pre-wrap">
              {minutaAlteradora}
            </article>
          ) : (
            <div className="print-sheet bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <FileDiff className="w-4 h-4 text-slate-600" />
                  <span>Quadro Comparativo — {meta.normaAlvoNome}</span>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {alteracoes.length} dispositivo(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-600">
                      <th className="py-2.5 px-4 w-28">Dispositivo</th>
                      <th className="py-2.5 px-4">Redação Vigente</th>
                      <th className="py-2.5 px-4">Redação Proposta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {alteracoes.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="py-3 px-4 space-y-1">
                          <div className="font-mono font-semibold text-slate-900">
                            {item.dispositivoAlvo}
                          </div>
                          <div className="text-slate-500">
                            {item.tipoAcao === 'alterar'
                              ? 'Alterado'
                              : item.tipoAcao === 'acrescer'
                                ? 'Acrescido'
                                : 'Revogado'}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-serif text-slate-600 leading-relaxed">
                          {item.tipoAcao === 'acrescer' ? (
                            <span className="italic text-slate-400">
                              (Não constava na norma original)
                            </span>
                          ) : (
                            <span className="bg-red-50/70 text-slate-800">
                              <HighlightedLegalText
                                displayText={item.textoOriginal || '—'}
                                findings={(
                                  review.byField[
                                    `alt_textoOriginal:${item.id}`
                                  ] || []
                                ).filter(isPortugueseErrorFinding)}
                                enabled={highlightReview}
                                selectedFindingId={selectedFindingId}
                                onSelectFinding={(f) => {
                                  setSelectedFindingId(f.id);
                                  setSubTab('revisor');
                                }}
                              />
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-serif text-slate-900 leading-relaxed space-y-2">
                          {item.tipoAcao === 'revogar' ? (
                            <span className="font-semibold text-red-700">
                              (Revogado expressamente)
                            </span>
                          ) : (
                            <div className="bg-emerald-50/70 text-slate-900">
                              <HighlightedLegalText
                                displayText={item.textoNovo}
                                findings={(
                                  review.byField[`alt_textoNovo:${item.id}`] ||
                                  []
                                ).filter(isPortugueseErrorFinding)}
                                enabled={highlightReview}
                                selectedFindingId={selectedFindingId}
                                onSelectFinding={(f) => {
                                  setSelectedFindingId(f.id);
                                  setSubTab('revisor');
                                }}
                              />{' '}
                              (NR)
                            </div>
                          )}
                          {item.justificativa && (
                            <p className="font-sans text-xs text-slate-500">
                              Justificativa:{' '}
                              <HighlightedLegalText
                                displayText={item.justificativa}
                                findings={(
                                  review.byField[
                                    `alt_justificativa:${item.id}`
                                  ] || []
                                ).filter(isPortugueseErrorFinding)}
                                enabled={highlightReview}
                                selectedFindingId={selectedFindingId}
                                onSelectFinding={(f) => {
                                  setSelectedFindingId(f.id);
                                  setSubTab('revisor');
                                }}
                              />
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
