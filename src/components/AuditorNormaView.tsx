import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  Wand2,
  XCircle,
} from 'lucide-react';
import { auditNormaText } from '../utils/legistica';

export type AuditSourceMode = 'editor' | 'ajuste' | 'avulso';

interface AuditorNormaViewProps {
  source: AuditSourceMode;
  onChangeSource: (next: AuditSourceMode) => void;
  text: string;
  onChangeCustomText: (next: string) => void;
  editorDocTitle: string;
  ajusteDocTitle: string;
}

const EXEMPLO_COM_ERROS = `Regulamento de Uso de Espaços Públicos

Dispõe sobre a utilização de espaços públicos e revoga disposições.

Art. 1 O uso dos espaços públicos depende de autorização prévia, observando critérios de segurança, limpeza, etc.
§ 1º O requerimento deve ser protocolado com antecedência de 15 dias e/ou mediante justificativa.

Art. 10º O descumprimento acarretará advertência, multa, conforme o caso.

Art. 11º Revogam-se as disposições em contrário.`;

export const AuditorNormaView: React.FC<AuditorNormaViewProps> = ({
  source,
  onChangeSource,
  text,
  onChangeCustomText,
  editorDocTitle,
  ajusteDocTitle,
}) => {
  const summary = useMemo(() => auditNormaText(text), [text]);

  const applyAutomaticFixes = () => {
    let fixed = text;
    fixed = fixed.replace(/\bArt\.\s*([1-9]\d+)º/g, 'Art. $1');
    fixed = fixed.replace(/§\s*([1-9]\d+)º/g, '§ $1');
    fixed = fixed.replace(/^(\s*Art\.\s*)([1-9])(\s+)/gm, '$1$2º$3');
    onChangeCustomText(fixed);
  };

  const hasAutoFixable = useMemo(() => {
    return (
      /\bArt\.\s*[1-9]\d+º/.test(text) ||
      /§\s*[1-9]\d+º/.test(text) ||
      /^\s*Art\.\s*[1-9]\s+/m.test(text)
    );
  }, [text]);

  return (
    <div className="space-y-6">
      {/* Barra de Fonte Auditada e Métricas */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Auditor de Conformidade Formal (LC nº 95/1998 e Decreto nº 12.002/2024)
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Analisa automaticamente a minuta atual do Editor, o Ato Alterador (NR) ou
              qualquer texto colado manualmente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => onChangeSource('editor')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  source === 'editor'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Minuta do Editor
              </button>
              <button
                type="button"
                onClick={() => onChangeSource('ajuste')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  source === 'ajuste'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ato Alterador (NR)
              </button>
              <button
                type="button"
                onClick={() => onChangeSource('avulso')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  source === 'avulso'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Texto Colado
              </button>
            </div>

            <button
              type="button"
              onClick={() => onChangeCustomText(EXEMPLO_COM_ERROS)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Testar exemplo com falhas</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Fonte ativa:{' '}
            <strong className="text-slate-900">
              {source === 'editor'
                ? `${editorDocTitle} (sincronizada em tempo real com o Editor Estruturado)`
                : source === 'ajuste'
                  ? `${ajusteDocTitle} (sincronizada em tempo real com Ajuste e Redação)`
                  : 'Texto colado / editado manualmente neste painel'}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
          <div>
            <div className="text-xs text-slate-500">Artigos detectados</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
              {summary.totalArtigos}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total de palavras</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
              {summary.totalPalavras}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Erros formais</div>
            <div
              className={`text-xl font-semibold font-mono tabular-nums mt-0.5 ${
                summary.erros > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {summary.erros}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Alertas redacionais</div>
            <div
              className={`text-xl font-semibold font-mono tabular-nums mt-0.5 ${
                summary.alertas > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {summary.alertas}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Área de Texto da Minuta */}
        <div className="xl:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="auditor-textarea"
              className="text-xs font-semibold text-slate-700"
            >
              Texto da Minuta Analisada
            </label>
            {hasAutoFixable && (
              <button
                type="button"
                onClick={applyAutomaticFixes}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Corrigir numeração ordinal/cardinal</span>
              </button>
            )}
          </div>
          <textarea
            id="auditor-textarea"
            rows={22}
            value={text}
            onChange={(e) => onChangeCustomText(e.target.value)}
            placeholder="Cole aqui o texto integral do decreto, portaria ou norma para análise automática..."
            className="w-full font-serif text-sm bg-slate-50 border border-slate-300 rounded-md p-4 text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          {source !== 'avulso' && (
            <p className="text-xs text-slate-500">
              Este texto é atualizado automaticamente conforme suas alterações na aba{' '}
              {source === 'editor' ? 'Editor Estruturado' : 'Ajuste e Redação (NR)'}. Se
              editar diretamente aqui, o modo alternará para Texto Colado.
            </p>
          )}
        </div>

        {/* Relatório de Apontamentos */}
        <div className="xl:col-span-6 space-y-4">
          {!text.trim() ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">
                Aguardando texto para auditoria
              </p>
              <p className="text-xs text-slate-500">
                Selecione Minuta do Editor, Ato Alterador ou cole o texto ao lado.
              </p>
            </div>
          ) : (
            <>
              {summary.findings.length === 0 ? (
                <div className="bg-white border border-emerald-200 rounded-lg p-6 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Minuta aprovada na verificação formal automatizada</span>
                  </div>
                  <p className="text-sm text-slate-600">
                    Nenhum erro de numeração, revogação genérica ou omissão de
                    cláusula essencial foi encontrado no texto atual.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
                  <div className="px-5 py-3.5">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Apontamentos e Ajustes Recomendados ({summary.findings.length})
                    </h3>
                  </div>

                  {summary.findings.map((finding) => {
                    const isError = finding.severidade === 'erro';
                    const isAlert = finding.severidade === 'alerta';
                    return (
                      <div key={finding.id} className="p-5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 font-semibold">
                            {isError ? (
                              <span className="inline-flex items-center gap-1.5 text-red-700">
                                <XCircle className="w-4 h-4 shrink-0" />
                                Erro Formal
                              </span>
                            ) : isAlert ? (
                              <span className="inline-flex items-center gap-1.5 text-amber-700">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                Alerta Redacional
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-slate-700">
                                <Info className="w-4 h-4 shrink-0" />
                                Recomendação
                              </span>
                            )}
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="font-mono text-slate-600">
                              {finding.local}
                            </span>
                          </div>
                          <span className="text-slate-500">{finding.regra}</span>
                        </div>

                        <p className="text-sm font-medium text-slate-900">
                          {finding.descricao}
                        </p>
                        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5 leading-relaxed">
                          <strong className="text-slate-800">Como corrigir:</strong>{' '}
                          {finding.sugestao}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {summary.conformes.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-700">
                    Itens em conformidade verificados
                  </h3>
                  <ul className="space-y-1.5">
                    {summary.conformes.map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 text-xs text-slate-700"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
