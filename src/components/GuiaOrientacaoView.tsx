import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileDiff,
  FilePlus2,
  Scale,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  ANALISE_IMPACTO_CATEGORIAS,
  GLOSSARIO_JURIDICO,
  GUIA_ORIENTACAO_ETAPAS,
  GlossarioTermo,
} from '../data/templates';

interface GuiaOrientacaoViewProps {
  onNavigate: (tab: 'guia' | 'editor' | 'ajuste' | 'auditor') => void;
  onLoadModeloDecreto: () => void;
}

type CenarioAjuste = 'pontual' | 'extensa' | 'nova';
type SubSecaoGuia = 'roteiro' | 'glossario' | 'impacto';

export const GuiaOrientacaoView: React.FC<GuiaOrientacaoViewProps> = ({
  onNavigate,
  onLoadModeloDecreto,
}) => {
  const [subSecao, setSubSecao] = useState<SubSecaoGuia>('roteiro');
  const [etapaAtiva, setEtapaAtiva] = useState<string>(
    GUIA_ORIENTACAO_ETAPAS[0].numero
  );
  const [cenario, setCenario] = useState<CenarioAjuste>('pontual');

  // Glossário state
  const [buscaTermo, setBuscaTermo] = useState('');
  const [categoriaTermo, setCategoriaTermo] = useState<
    'Todas' | GlossarioTermo['categoria']
  >('Todas');

  // Checklist Análise de Impacto (AIR)
  const [impactoMarcados, setImpactoMarcados] = useState<Record<string, boolean>>({});

  const termosFiltrados = useMemo(() => {
    const q = buscaTermo.trim().toLowerCase();
    return GLOSSARIO_JURIDICO.filter((item) => {
      const matchCat =
        categoriaTermo === 'Todas' || item.categoria === categoriaTermo;
      const matchText =
        !q ||
        item.termo.toLowerCase().includes(q) ||
        item.definicao.toLowerCase().includes(q) ||
        item.exemploUso.toLowerCase().includes(q);
      return matchCat && matchText;
    });
  }, [buscaTermo, categoriaTermo]);

  const totalItensImpacto = useMemo(
    () =>
      ANALISE_IMPACTO_CATEGORIAS.reduce(
        (acc, cat) => acc + cat.itens.length,
        0
      ),
    []
  );

  const totalMarcados = useMemo(
    () => Object.values(impactoMarcados).filter(Boolean).length,
    [impactoMarcados]
  );

  const toggleImpacto = (id: string) => {
    setImpactoMarcados((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const etapaSelecionada =
    GUIA_ORIENTACAO_ETAPAS.find((e) => e.numero === etapaAtiva) ||
    GUIA_ORIENTACAO_ETAPAS[0];

  return (
    <div className="space-y-6">
      {/* Introdução e Ações Rápidas */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-3">
            <p className="text-xs font-medium text-slate-500">
              Técnica Legislativa e Normativa · LC nº 95/1998 · Decreto nº 12.002/2024 · ABNT NBR 6024
            </p>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900">
              Como criar, revisar e ajustar leis, decretos, regimentos e normas técnicas
            </h1>
            <p className="text-sm lg:text-base text-slate-600 leading-relaxed max-w-3xl">
              Consulte o roteiro prático, o glossário jurídico e o checklist de análise
              de impacto, ou abra no editor modelos prontos de Lei, Decreto, Regimento
              Interno, Instrução de Trabalho (IT) e Procedimento Operacional Padrão (POP),
              cada um com sua formatação oficial.
            </p>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-2.5 lg:items-end justify-center">
            <button
              type="button"
              onClick={onLoadModeloDecreto}
              className="w-full lg:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>Abrir modelo de decreto</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('ajuste')}
              className="w-full lg:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <FileDiff className="w-4 h-4" />
              <span>Ajustar norma existente (NR)</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('auditor')}
              className="w-full lg:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Auditar minuta atual</span>
            </button>
          </div>
        </div>

        {/* Navegação Interna da Guia */}
        <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setSubSecao('roteiro')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                subSecao === 'roteiro'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Roteiro Prático (5 Etapas)
            </button>
            <button
              type="button"
              onClick={() => setSubSecao('glossario')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                subSecao === 'glossario'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Glossário Jurídico ({GLOSSARIO_JURIDICO.length})
            </button>
            <button
              type="button"
              onClick={() => setSubSecao('impacto')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                subSecao === 'impacto'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Análise de Impacto (AIR)
            </button>
          </div>
        </div>
      </section>

      {subSecao === 'roteiro' && (
        <>
          {/* Roteiro em 5 Etapas */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Roteiro de Elaboração e Ajuste
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Selecione uma etapa para consultar regras e exemplos práticos
                </p>
              </div>
              <nav
                aria-label="Etapas de técnica legislativa"
                className="divide-y divide-slate-100"
              >
                {GUIA_ORIENTACAO_ETAPAS.map((etapa) => {
                  const active = etapa.numero === etapaAtiva;
                  return (
                    <button
                      key={etapa.numero}
                      type="button"
                      onClick={() => setEtapaAtiva(etapa.numero)}
                      className={`w-full text-left px-5 py-3.5 transition-colors flex items-start gap-3 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-slate-900 ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`font-mono text-xs tabular-nums pt-0.5 shrink-0 ${
                          active ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {etapa.numero}.
                      </span>
                      <span className="text-sm font-medium leading-snug">
                        {etapa.titulo}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-6 lg:p-8 space-y-6">
              <div className="space-y-2 border-b border-slate-200 pb-5">
                <div className="text-xs font-mono tabular-nums text-slate-500">
                  Etapa {etapaSelecionada.numero} de 05
                </div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {etapaSelecionada.titulo}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {etapaSelecionada.resumo}
                </p>
              </div>

              <div className="space-y-4">
                {etapaSelecionada.regrasChave.map((regra) => (
                  <div
                    key={regra.titulo}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-1"
                  >
                    <h3 className="text-sm font-semibold text-slate-900">
                      {regra.titulo}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {regra.detalhe}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 border border-emerald-200 bg-emerald-50/40 rounded-md space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Prática recomendada</span>
                  </div>
                  <p className="font-serif text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                    {etapaSelecionada.exemploBom}
                  </p>
                </div>

                <div className="p-4 border border-red-200 bg-red-50/40 rounded-md space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>Erro comum a evitar</span>
                  </div>
                  <p className="font-serif text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                    {etapaSelecionada.exemploEvitar}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Matriz de Decisão: Alterar vs Revogar vs Criar */}
          <section className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Decisão Estratégica: Criar Norma Nova ou Ajustar a Existente?
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Baseado no art. 12 da LC nº 95/1998 e nos critérios de consolidação normativa
                </p>
              </div>
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-md shrink-0">
                <button
                  type="button"
                  onClick={() => setCenario('pontual')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    cenario === 'pontual'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mudança Pontual
                </button>
                <button
                  type="button"
                  onClick={() => setCenario('extensa')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    cenario === 'extensa'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Reforma Extensa (&gt;50%)
                </button>
                <button
                  type="button"
                  onClick={() => setCenario('nova')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    cenario === 'nova'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tema Inédito
                </button>
              </div>
            </div>

            {cenario === 'pontual' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-8 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileDiff className="w-4 h-4 text-slate-700" />
                    <span>Edite um Ato Alterador mantendo a numeração original</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Quando a alteração atinge menos da metade dos artigos e preserva a
                    estrutura lógica da norma original, publique um ato específico que
                    altera apenas os dispositivos necessários. Use aspas, linhas
                    pontilhadas para trechos mantidos, sufixos alfabéticos (Art. 4º-A)
                    para inclusões e a marcação <strong className="font-mono">(NR)</strong> ao final.
                  </p>
                </div>
                <div className="lg:col-span-4 flex lg:justify-end">
                  <button
                    type="button"
                    onClick={() => onNavigate('ajuste')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Abrir Oficina de Ajuste (NR)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {cenario === 'extensa' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-8 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Scale className="w-4 h-4 text-slate-700" />
                    <span>Revogue integralmente a norma antiga e edite um novo texto consolidado</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Quando a revisão altera mais de 50% do texto, muda conceitos centrais
                    ou a norma original já acumulou múltiplas alterações anteriores
                    (&quot;colcha de retalhos&quot;), a boa técnica determina editar um
                    decreto ou norma integralmente novo, incluindo ao final a revogação
                    expressa de todos os atos anteriores sobre a matéria.
                  </p>
                </div>
                <div className="lg:col-span-4 flex lg:justify-end">
                  <button
                    type="button"
                    onClick={onLoadModeloDecreto}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Carregar Modelo Consolidado</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {cenario === 'nova' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-8 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <BookOpen className="w-4 h-4 text-slate-700" />
                    <span>Verifique primeiro se não basta um ato infralegal menor</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Antes de propor um Decreto para tema inédito, confirme se há
                    fundamento legal (Constituição, Lei Orgânica, Estatuto ou Lei
                    ordinária) e se o assunto não pode ser resolvido por Portaria ou
                    Instrução Normativa. Estruture o texto começando pelo objeto e âmbito
                    de aplicação no Art. 1º.
                  </p>
                </div>
                <div className="lg:col-span-4 flex lg:justify-end">
                  <button
                    type="button"
                    onClick={onLoadModeloDecreto}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Iniciar com Modelo Estruturado</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Tabela de Hierarquia de Dispositivos */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">
                Referência Rápida: Hierarquia e Pontuação do Articulado
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-6">Elemento</th>
                    <th className="py-2.5 px-4">Notação</th>
                    <th className="py-2.5 px-4">Regra de Numeração</th>
                    <th className="py-2.5 px-6">Pontuação Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-medium text-slate-900">
                      Artigo (Caput)
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      Art. 1º / Art. 10
                    </td>
                    <td className="py-3 px-4">
                      Ordinal até 9º; cardinal de 10 em diante
                    </td>
                    <td className="py-3 px-6">
                      Ponto final (.) ou dois-pontos (:) se houver incisos
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-medium text-slate-900">
                      Parágrafo
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      Parágrafo único / § 1º
                    </td>
                    <td className="py-3 px-4">
                      Único por extenso; plural em ordinal até 9º, depois cardinal
                    </td>
                    <td className="py-3 px-6">
                      Ponto final (.) ou dois-pontos (:) se houver incisos
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-medium text-slate-900">
                      Inciso
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      I, II, III, IV
                    </td>
                    <td className="py-3 px-4">
                      Algarismos romanos seguidos de hífen (I -)
                    </td>
                    <td className="py-3 px-6">
                      Ponto e vírgula (;), dois-pontos (:) se houver alíneas, ponto (.) no último
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-medium text-slate-900">
                      Alínea
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      a), b), c)
                    </td>
                    <td className="py-3 px-4">
                      Letras minúsculas seguidas de parêntese de fechamento
                    </td>
                    <td className="py-3 px-6">
                      Ponto e vírgula (;), ou ponto (.) ao encerrar o último inciso
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-medium text-slate-900">
                      Item
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      1., 2., 3.
                    </td>
                    <td className="py-3 px-4">
                      Algarismos arábicos seguidos de ponto
                    </td>
                    <td className="py-3 px-6">
                      Ponto e vírgula (;), ou ponto (.) ao final da enumeração
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {subSecao === 'glossario' && (
        <section className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={buscaTermo}
                onChange={(e) => setBuscaTermo(e.target.value)}
                placeholder="Buscar termo jurídico ou exemplo..."
                className="w-full text-sm bg-slate-50 border border-slate-300 rounded-md pl-9 pr-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
              {(
                [
                  'Todas',
                  'Estrutura',
                  'Articulado',
                  'Vigência e Alteração',
                  'Técnica Jurídica',
                ] as const
              ).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoriaTermo(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    categoriaTermo === cat
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {termosFiltrados.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Nenhum termo encontrado para &quot;{buscaTermo}&quot;.
              </div>
            ) : (
              termosFiltrados.map((item) => (
                <div key={item.termo} className="p-6 space-y-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {item.termo}
                    </h3>
                    <span className="text-xs font-medium text-slate-500">
                      {item.categoria}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {item.definicao}
                  </p>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="text-xs font-medium text-slate-500 mb-1">
                      Exemplo de uso
                    </div>
                    <p className="font-serif text-sm text-slate-900 leading-relaxed">
                      {item.exemploUso}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {subSecao === 'impacto' && (
        <section className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">
                Análise de Impacto Normativo (AIR)
              </h2>
              <p className="text-sm text-slate-600">
                Verifique os aspectos legais, econômicos, sociais e ambientais antes de
                submeter o decreto ou norma à assinatura.
              </p>
            </div>
            <div className="text-sm font-mono tabular-nums text-slate-700 shrink-0">
              {totalMarcados} / {totalItensImpacto} verificados
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {ANALISE_IMPACTO_CATEGORIAS.map((cat) => (
              <div
                key={cat.id}
                className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
              >
                <div className="border-b border-slate-200 pb-3">
                  <h3 className="text-base font-semibold text-slate-900">
                    {cat.titulo}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{cat.subtitulo}</p>
                </div>

                <div className="space-y-3">
                  {cat.itens.map((item) => {
                    const checked = Boolean(impactoMarcados[item.id]);
                    return (
                      <label
                        key={item.id}
                        className="flex items-start gap-3 p-3 rounded-md border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleImpacto(item.id)}
                          className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                        />
                        <div className="space-y-1">
                          <div
                            className={`text-sm font-medium ${
                              checked
                                ? 'text-slate-500 line-through'
                                : 'text-slate-900'
                            }`}
                          >
                            {item.pergunta}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {item.orientacao}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
