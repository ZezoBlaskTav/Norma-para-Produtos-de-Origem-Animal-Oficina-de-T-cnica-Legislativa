import { ArtigoItem, NormaDocument, NormaTipo } from '../types/norma';

export type NormaFormatProfile =
  | 'legislativo'
  | 'infralegal'
  | 'regimental'
  | 'tecnico_operacional';

export type NormaCategoryGroup =
  | 'legislativo'
  | 'executivo_colegiado'
  | 'organico_tecnico';

export interface NormaSpeciesSpec {
  tipo: NormaTipo;
  group: NormaCategoryGroup;
  profile: NormaFormatProfile;
  siglaCurta?: string;
  normaRegente: string;
  resumoFormatacao: string;
  defaultOrdemExecucao: string;
  defaultAutoridade: string;
  defaultFundamentoLegal: string;
  vigenciaPronomePrefix: string;
  feminino: boolean;
}

export const NORMA_SPECIES_GROUPS: Array<{
  id: NormaCategoryGroup;
  label: string;
  tipos: NormaTipo[];
}> = [
  {
    id: 'legislativo',
    label: 'Atos Legislativos (LC nº 95/1998)',
    tipos: ['Lei', 'Lei Complementar', 'Projeto de Lei'],
  },
  {
    id: 'executivo_colegiado',
    label: 'Atos Normativos do Executivo e Colegiados (Decreto nº 12.002/2024)',
    tipos: [
      'Decreto',
      'Resolução',
      'Instrução Normativa',
      'Portaria',
      'Deliberação',
    ],
  },
  {
    id: 'organico_tecnico',
    label: 'Atos Orgânicos, Internos e Técnicos (Regimentos e ABNT NBR 6024)',
    tipos: [
      'Regimento Interno',
      'Estatuto',
      'Norma Interna',
      'Ordem de Serviço',
      'Instrução de Trabalho',
      'Procedimento Operacional Padrão',
    ],
  },
];

export const NORMA_SPECIES_CATALOG: Record<NormaTipo, NormaSpeciesSpec> = {
  Lei: {
    tipo: 'Lei',
    group: 'legislativo',
    profile: 'legislativo',
    normaRegente: 'LC nº 95/1998 e Decreto nº 12.002/2024',
    resumoFormatacao:
      'Epígrafe centralizada, ementa recuada a 75 mm à direita, cláusula de sanção/promulgação e articulado em Art. 1º..9º / Art. 10.',
    defaultOrdemExecucao:
      'Faço saber que o Poder Legislativo aprovou e eu sanciono a seguinte Lei:',
    defaultAutoridade: 'O PREFEITO MUNICIPAL',
    defaultFundamentoLegal: '',
    vigenciaPronomePrefix: 'Esta Lei',
    feminino: true,
  },
  'Lei Complementar': {
    tipo: 'Lei Complementar',
    group: 'legislativo',
    profile: 'legislativo',
    siglaCurta: 'LC',
    normaRegente: 'LC nº 95/1998 (Art. 4º a 11)',
    resumoFormatacao:
      'Epígrafe como Lei Complementar, ementa recuada a 75 mm, preâmbulo de sanção legislativa e articulado estrito da LC nº 95/1998.',
    defaultOrdemExecucao:
      'Faço saber que o Poder Legislativo aprovou e eu sanciono a seguinte Lei Complementar:',
    defaultAutoridade: 'O PREFEITO MUNICIPAL',
    defaultFundamentoLegal: '',
    vigenciaPronomePrefix: 'Esta Lei Complementar',
    feminino: true,
  },
  'Projeto de Lei': {
    tipo: 'Projeto de Lei',
    group: 'legislativo',
    profile: 'legislativo',
    siglaCurta: 'PL',
    normaRegente: 'LC nº 95/1998 e Regimento Legislativo',
    resumoFormatacao:
      'Epígrafe de proposição legislativa, ementa à direita (75 mm), preâmbulo propositivo e cláusula final redigida como "Esta Lei entra em vigor...".',
    defaultOrdemExecucao: 'DECRETA:',
    defaultAutoridade: 'A CÂMARA MUNICIPAL',
    defaultFundamentoLegal:
      'no uso de suas atribuições constitucionais e orgânicas',
    vigenciaPronomePrefix: 'Esta Lei',
    feminino: false,
  },
  Decreto: {
    tipo: 'Decreto',
    group: 'executivo_colegiado',
    profile: 'infralegal',
    normaRegente: 'Decreto nº 12.002/2024 e LC nº 95/1998',
    resumoFormatacao:
      'Padrão regulamentar do Executivo: epígrafe centralizada, ementa recuada a 75 mm, preâmbulo com competência legal, "DECRETA:" e artigos.',
    defaultOrdemExecucao: 'DECRETA:',
    defaultAutoridade: 'O PREFEITO MUNICIPAL',
    defaultFundamentoLegal:
      'no uso da atribuição que lhe confere a Lei Orgânica do Município',
    vigenciaPronomePrefix: 'Este Decreto',
    feminino: false,
  },
  Resolução: {
    tipo: 'Resolução',
    group: 'executivo_colegiado',
    profile: 'infralegal',
    normaRegente: 'LC nº 95/1998 e Decreto nº 12.002/2024',
    resumoFormatacao:
      'Ato de órgão colegiado/deliberativo com ementa à direita (75 mm), fundamento regimental, ordem "RESOLVE:" e articulado numerado.',
    defaultOrdemExecucao: 'RESOLVE:',
    defaultAutoridade: 'O CONSELHO DELIBERATIVO',
    defaultFundamentoLegal:
      'no uso das atribuições que lhe confere seu Regimento Interno e tendo em vista deliberação em plenário',
    vigenciaPronomePrefix: 'Esta Resolução',
    feminino: true,
  },
  'Instrução Normativa': {
    tipo: 'Instrução Normativa',
    group: 'executivo_colegiado',
    profile: 'infralegal',
    siglaCurta: 'IN',
    normaRegente: 'Decreto nº 12.002/2024 e LC nº 95/1998',
    resumoFormatacao:
      'Padronização procedimental setorial: epígrafe oficial, ementa à direita (75 mm), preâmbulo de competência, "RESOLVE:" e artigos.',
    defaultOrdemExecucao: 'RESOLVE:',
    defaultAutoridade: 'O SECRETÁRIO MUNICIPAL',
    defaultFundamentoLegal:
      'no uso de suas atribuições regulamentares e regimentais',
    vigenciaPronomePrefix: 'Esta Instrução Normativa',
    feminino: true,
  },
  Portaria: {
    tipo: 'Portaria',
    group: 'executivo_colegiado',
    profile: 'infralegal',
    normaRegente: 'Decreto nº 12.002/2024 e Manual de Redação Oficial',
    resumoFormatacao:
      'Ato ordinatório administrativo: epígrafe centralizada, ementa recuada a 75 mm, autoridade signatária, "RESOLVE:" e artigos.',
    defaultOrdemExecucao: 'RESOLVE:',
    defaultAutoridade: 'A AUTORIDADE COMPETENTE',
    defaultFundamentoLegal: 'no uso de suas atribuições legais e regimentais',
    vigenciaPronomePrefix: 'Esta Portaria',
    feminino: true,
  },
  Deliberação: {
    tipo: 'Deliberação',
    group: 'executivo_colegiado',
    profile: 'infralegal',
    normaRegente: 'LC nº 95/1998 e Decreto nº 12.002/2024',
    resumoFormatacao:
      'Ato decisório colegiado: epígrafe centralizada, ementa recuada a 75 mm, referência à sessão plenária, "DELIBERA:" e artigos.',
    defaultOrdemExecucao: 'DELIBERA:',
    defaultAutoridade: 'O PLENÁRIO DO COLEGIADO',
    defaultFundamentoLegal:
      'no uso de suas atribuições regimentais e conforme decisão aprovada em reunião ordinária',
    vigenciaPronomePrefix: 'Esta Deliberação',
    feminino: true,
  },
  'Regimento Interno': {
    tipo: 'Regimento Interno',
    group: 'organico_tecnico',
    profile: 'regimental',
    normaRegente: 'LC nº 95/1998 (Estrutura Orgânica em Títulos e Capítulos)',
    resumoFormatacao:
      'Formatação orgânica institucional: epígrafe ampla, objeto em bloco centralizado/delimitado (largura total), Títulos, Capítulos e Artigos.',
    defaultOrdemExecucao: 'APROVA E ESTABELECE:',
    defaultAutoridade: 'O ÓRGÃO COLEGIADO / DIRETORIA',
    defaultFundamentoLegal:
      'no uso da competência prevista no estatuto ou ato constitutivo',
    vigenciaPronomePrefix: 'Este Regimento Interno',
    feminino: false,
  },
  Estatuto: {
    tipo: 'Estatuto',
    group: 'organico_tecnico',
    profile: 'regimental',
    normaRegente: 'Código Civil / LC nº 95/1998 (Organização Institucional)',
    resumoFormatacao:
      'Formatação estatutária: título institucional centralizado, sumário de objeto em bloco largo delimitado, Títulos/Capítulos e Artigos.',
    defaultOrdemExecucao: 'ESTABELECE:',
    defaultAutoridade: 'A ASSEMBLEIA GERAL',
    defaultFundamentoLegal:
      'reunida na forma da legislação aplicável e de seu ato constitutivo',
    vigenciaPronomePrefix: 'Este Estatuto',
    feminino: false,
  },
  'Norma Interna': {
    tipo: 'Norma Interna',
    group: 'organico_tecnico',
    profile: 'regimental',
    siglaCurta: 'NI',
    normaRegente: 'Redação Oficial e Governança Corporativa',
    resumoFormatacao:
      'Formatação normativa interna: epígrafe oficial, ementa à direita (75 mm), preâmbulo administrativo, "ESTABELECE:" e articulado.',
    defaultOrdemExecucao: 'ESTABELECE:',
    defaultAutoridade: 'A DIRETORIA EXECUTIVA',
    defaultFundamentoLegal: 'no uso de suas atribuições regimentais',
    vigenciaPronomePrefix: 'Esta Norma Interna',
    feminino: true,
  },
  'Ordem de Serviço': {
    tipo: 'Ordem de Serviço',
    group: 'organico_tecnico',
    profile: 'regimental',
    siglaCurta: 'OS',
    normaRegente: 'Manual de Redação Oficial e Normas Administrativas',
    resumoFormatacao:
      'Determinação executiva direta: epígrafe oficial, ementa objetiva à direita (75 mm), comando "DETERMINA:" e dispositivos operacionais.',
    defaultOrdemExecucao: 'DETERMINA:',
    defaultAutoridade: 'A CHEFIA / COORDENAÇÃO',
    defaultFundamentoLegal:
      'no exercício do poder hierárquico e das atribuições regimentais',
    vigenciaPronomePrefix: 'Esta Ordem de Serviço',
    feminino: true,
  },
  'Instrução de Trabalho': {
    tipo: 'Instrução de Trabalho',
    group: 'organico_tecnico',
    profile: 'tecnico_operacional',
    siglaCurta: 'IT',
    normaRegente: 'ABNT NBR 6024 e Gestão da Qualidade (ISO 9001)',
    resumoFormatacao:
      'Quadro técnico de identificação (sigla IT, setor emitente, normas de referência e objetivo em largura total) + numeração progressiva (1., 1.1, 1.1.1, a)).',
    defaultOrdemExecucao: 'APROVAÇÃO E CUMPRIMENTO:',
    defaultAutoridade: 'COORDINADOR TÉCNICO / GESTOR DA ÁREA',
    defaultFundamentoLegal:
      'ABNT NBR 6024; ISO 9001; Legislação sanitária e administrativa vigente',
    vigenciaPronomePrefix: 'Esta Instrução de Trabalho',
    feminino: true,
  },
  'Procedimento Operacional Padrão': {
    tipo: 'Procedimento Operacional Padrão',
    group: 'organico_tecnico',
    profile: 'tecnico_operacional',
    siglaCurta: 'POP',
    normaRegente: 'ABNT NBR 6024 e Boas Práticas Operacionais / Sanitárias',
    resumoFormatacao:
      'Quadro técnico controlado de POP (área emitente, responsável, referências e objetivo) + seções e etapas em numeração progressiva (1., 1.1, 1.1.1, a)).',
    defaultOrdemExecucao: 'PADRONIZAÇÃO E EXECUÇÃO OBRIGATÓRIA:',
    defaultAutoridade: 'RESPONSÁVEL TÉCNICO / CHEFIA DE SETOR',
    defaultFundamentoLegal:
      'ABNT NBR 6024; Manual de Boas Práticas e Normas Técnicas Aplicáveis',
    vigenciaPronomePrefix: 'Este Procedimento Operacional Padrão',
    feminino: false,
  },
};

export const ALL_NORMA_TIPOS: NormaTipo[] = NORMA_SPECIES_GROUPS.flatMap(
  (g) => g.tipos
);

export function getNormaSpec(tipo: NormaTipo): NormaSpeciesSpec {
  return NORMA_SPECIES_CATALOG[tipo] || NORMA_SPECIES_CATALOG.Decreto;
}

export function getNormaFormatProfile(tipo: NormaTipo): NormaFormatProfile {
  return getNormaSpec(tipo).profile;
}

export function isTechnicalOperationalProfile(tipo: NormaTipo): boolean {
  return getNormaSpec(tipo).profile === 'tecnico_operacional';
}

export function isRegimentalWideEmenta(tipo: NormaTipo): boolean {
  return tipo === 'Regimento Interno' || tipo === 'Estatuto';
}

export function getOrdemExecucaoPadrao(tipo: NormaTipo): string {
  return getNormaSpec(tipo).defaultOrdemExecucao;
}

export function getVigenciaPronomePrefix(tipo: NormaTipo): string {
  return getNormaSpec(tipo).vigenciaPronomePrefix;
}

export function formatNormaEpigrafe(
  doc: Pick<NormaDocument, 'tipo' | 'numero' | 'data'>
): string {
  const spec = getNormaSpec(doc.tipo);
  const tipoUpper = doc.tipo.toUpperCase();
  const numeroTrim = doc.numero.trim();
  const dataTrim = doc.data.trim().toUpperCase();

  // Regimentos e Estatutos podem trazer título descritivo (ex.: "DO CONSELHO MUNICIPAL") sem Nº
  if (
    (doc.tipo === 'Regimento Interno' || doc.tipo === 'Estatuto') &&
    numeroTrim &&
    /^(D[OA]S?|DE|—|–|-)\b/i.test(numeroTrim)
  ) {
    const cleanData = dataTrim ? `, ${dataTrim}` : '';
    return `${tipoUpper} ${numeroTrim.toUpperCase()}${cleanData}`;
  }

  const numLabel = numeroTrim || '___';
  const dataLabel = dataTrim || 'DE ___ DE __________ DE _____';

  if (spec.profile === 'tecnico_operacional' && spec.siglaCurta) {
    return `${tipoUpper} (${spec.siglaCurta}) Nº ${numLabel}${dataTrim ? `, ${dataTrim}` : ''}`;
  }

  return `${tipoUpper} Nº ${numLabel}, ${dataLabel}`;
}

export interface FormattedPreambuloParts {
  autoridade: string;
  separadorAutoridade: string;
  linhasFundamento: string[];
  ordem: string;
  needsCommaBeforeOrdem: boolean;
  ordemInlineAfterAutoridade: boolean;
}

export function formatPreambuloParts(
  doc: Pick<
    NormaDocument,
    'tipo' | 'autoridade' | 'fundamentoLegal' | 'ordemExecucao'
  >
): FormattedPreambuloParts {
  const autoridade = doc.autoridade.trim();
  const ordem = doc.ordemExecucao.trim() || getOrdemExecucaoPadrao(doc.tipo);
  const linhasFundamento = doc.fundamentoLegal
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (linhasFundamento.length === 0) {
    // Ex.: "O PREFEITO MUNICIPAL Faço saber..." ou "O PREFEITO MUNICIPAL DECRETA:"
    const needsComma =
      autoridade.length > 0 &&
      !/^Faço saber/i.test(ordem) &&
      !/[,:;]$/.test(autoridade);
    return {
      autoridade,
      separadorAutoridade: needsComma ? ', ' : ' ',
      linhasFundamento: [],
      ordem,
      needsCommaBeforeOrdem: false,
      ordemInlineAfterAutoridade: true,
    };
  }

  const lastFund = linhasFundamento[linhasFundamento.length - 1];
  const hasOrdemInside =
    /(DECRETA:|RESOLVE:|ESTABELECE:|PROMULGA:|DELIBERA:|DETERMINA:|seguinte Lei:|seguinte Lei Complementar:)\s*$/i.test(
      lastFund
    );
  const needsCommaBeforeOrdem =
    !hasOrdemInside &&
    !/[,:;]$/.test(lastFund) &&
    !/^Faço saber/i.test(ordem);

  return {
    autoridade,
    separadorAutoridade: autoridade ? ', ' : '',
    linhasFundamento,
    ordem: hasOrdemInside ? '' : ordem,
    needsCommaBeforeOrdem,
    ordemInlineAfterAutoridade: false,
  };
}

export interface ProgressiveSectionHeading {
  kind: 'titulo' | 'capitulo' | 'secao' | 'subsecao';
  fieldKey: string;
  rawText: string;
  formattedText: string;
  baseOffset: number;
}

export interface ProgressiveItemLayout {
  artId: string;
  headings: ProgressiveSectionHeading[];
  itemLabel: string;
  subItemLabels: string[];
  nextPrimarySectionNum: number;
  nextFlatItemNum: number;
  hasSections: boolean;
}

function formatTechnicalHeading(raw: string, sectionNum: number): string {
  const trimmed = raw.trim();
  if (!trimmed) return `${sectionNum}.`;
  // Se já começa com numeração explícita (ex.: "1. OBJETIVO" ou "1 - OBJETIVO")
  if (/^\d+(?:\.\d+)*\.?(?:\s+[-–]\s*|\s+)/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return `${sectionNum}. ${trimmed.toUpperCase()}`;
}

export function computeProgressiveStructure(
  artigos: ArtigoItem[]
): ProgressiveItemLayout[] {
  const hasAnySection = artigos.some(
    (a) =>
      Boolean(a.titulo?.trim()) ||
      Boolean(a.capitulo?.trim()) ||
      Boolean(a.secao?.trim())
  );

  let primarySectionCounter = 0;
  let subSectionCounter = 0;
  let itemInSectionCounter = 0;
  let flatItemCounter = 0;

  let lastTitulo = '';
  let lastCap = '';
  let lastSecao = '';
  let lastSubsecao = '';

  const layouts: ProgressiveItemLayout[] = [];

  for (const art of artigos) {
    const headings: ProgressiveSectionHeading[] = [];

    const tit = art.titulo?.trim() || '';
    if (tit && tit !== lastTitulo) {
      lastTitulo = tit;
      lastCap = '';
      lastSecao = '';
      lastSubsecao = '';
      primarySectionCounter += 1;
      subSectionCounter = 0;
      itemInSectionCounter = 0;
      headings.push({
        kind: 'titulo',
        fieldKey: `titulo:${art.id}`,
        rawText: tit,
        formattedText: formatTechnicalHeading(tit, primarySectionCounter),
        baseOffset: (art.titulo?.length || 0) - (art.titulo?.trimStart().length || 0),
      });
    }

    const cap = art.capitulo?.trim() || '';
    if (cap && cap !== lastCap) {
      lastCap = cap;
      lastSecao = '';
      lastSubsecao = '';
      if (!tit) {
        primarySectionCounter += 1;
        subSectionCounter = 0;
        itemInSectionCounter = 0;
        headings.push({
          kind: 'capitulo',
          fieldKey: `capitulo:${art.id}`,
          rawText: cap,
          formattedText: formatTechnicalHeading(cap, primarySectionCounter),
          baseOffset:
            (art.capitulo?.length || 0) - (art.capitulo?.trimStart().length || 0),
        });
      } else {
        subSectionCounter += 1;
        itemInSectionCounter = 0;
        const alreadyNum = /^\d+(?:\.\d+)+/.test(cap);
        headings.push({
          kind: 'capitulo',
          fieldKey: `capitulo:${art.id}`,
          rawText: cap,
          formattedText: alreadyNum
            ? cap.toUpperCase()
            : `${primarySectionCounter}.${subSectionCounter} ${cap.toUpperCase()}`,
          baseOffset:
            (art.capitulo?.length || 0) - (art.capitulo?.trimStart().length || 0),
        });
      }
    }

    const sec = art.secao?.trim() || '';
    if (sec && sec !== lastSecao) {
      lastSecao = sec;
      lastSubsecao = '';
      if (!tit && !cap && primarySectionCounter === 0) {
        primarySectionCounter += 1;
        itemInSectionCounter = 0;
        headings.push({
          kind: 'secao',
          fieldKey: `secao:${art.id}`,
          rawText: sec,
          formattedText: formatTechnicalHeading(sec, primarySectionCounter),
          baseOffset:
            (art.secao?.length || 0) - (art.secao?.trimStart().length || 0),
        });
      } else if (!tit && !cap) {
        primarySectionCounter += 1;
        itemInSectionCounter = 0;
        headings.push({
          kind: 'secao',
          fieldKey: `secao:${art.id}`,
          rawText: sec,
          formattedText: formatTechnicalHeading(sec, primarySectionCounter),
          baseOffset:
            (art.secao?.length || 0) - (art.secao?.trimStart().length || 0),
        });
      } else {
        headings.push({
          kind: 'secao',
          fieldKey: `secao:${art.id}`,
          rawText: sec,
          formattedText: sec.toUpperCase(),
          baseOffset:
            (art.secao?.length || 0) - (art.secao?.trimStart().length || 0),
        });
      }
    }

    const sub = art.subsecao?.trim() || '';
    if (sub && sub !== lastSubsecao) {
      lastSubsecao = sub;
      headings.push({
        kind: 'subsecao',
        fieldKey: `subsecao:${art.id}`,
        rawText: sub,
        formattedText: sub,
        baseOffset:
          (art.subsecao?.length || 0) - (art.subsecao?.trimStart().length || 0),
      });
    }

    flatItemCounter += 1;
    itemInSectionCounter += 1;

    const itemLabel = hasAnySection
      ? subSectionCounter > 0
        ? `${Math.max(1, primarySectionCounter)}.${subSectionCounter}.${itemInSectionCounter}`
        : `${Math.max(1, primarySectionCounter)}.${itemInSectionCounter}`
      : `${flatItemCounter}.`;

    const subItemLabels = art.paragrafos.map(
      (_, pIdx) => `${itemLabel.replace(/\.$/, '')}.${pIdx + 1}`
    );

    layouts.push({
      artId: art.id,
      headings,
      itemLabel,
      subItemLabels,
      nextPrimarySectionNum: primarySectionCounter + 1,
      nextFlatItemNum: flatItemCounter + 1,
      hasSections: hasAnySection,
    });
  }

  return layouts;
}
