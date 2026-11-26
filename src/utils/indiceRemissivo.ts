import { ArtigoItem, NormaDocument } from '../types/norma';
import { formatArtigoNumero, formatParagrafoNumero, toLetter, toRoman } from './legistica';
import {
  computeProgressiveStructure,
  isTechnicalOperationalProfile,
} from './normaProfiles';

export type IndiceAssuntoOrigem =
  | 'divisao'
  | 'conceito'
  | 'termo'
  | 'disposicao_final';

export interface IndiceRemissivoRef {
  artId: string;
  artIndex: number;
  artLabel: string;
  fieldKey: string;
  detalhe: string;
  trecho: string;
}

export interface IndiceRemissivoEntry {
  id: string;
  assunto: string;
  letraInicial: string;
  origem: IndiceAssuntoOrigem;
  origemLabel: string;
  referencias: IndiceRemissivoRef[];
  ocorrenciasTotais: number;
}

export interface IndiceRemissivoResult {
  entries: IndiceRemissivoEntry[];
  totalAssuntos: number;
  totalArtigosIndexados: number;
  letrasDisponiveis: string[];
  isTech: boolean;
}

interface TextSegment {
  fieldKey: string;
  detalhe: string;
  text: string;
}

interface IndexedArtigoData {
  art: ArtigoItem;
  artIndex: number;
  artLabel: string;
  segments: TextSegment[];
  fullText: string;
  normalizedFullText: string;
}

interface ConceptRule {
  assunto: string;
  pattern: RegExp;
}

const STOPWORDS = new Set([
  'a', 'ao', 'aos', 'as', 'ate', 'com', 'como', 'contra', 'da', 'das', 'de',
  'dela', 'delas', 'dele', 'deles', 'desde', 'dessa', 'dessas', 'desse',
  'desses', 'desta', 'destas', 'deste', 'destes', 'disso', 'disto', 'do',
  'dos', 'e', 'em', 'entre', 'era', 'essa', 'essas', 'esse', 'esses', 'esta',
  'estas', 'este', 'estes', 'estiver', 'estiverem', 'foi', 'for', 'foram',
  'forem', 'ha', 'isso', 'isto', 'ja', 'lhe', 'lhes', 'mais', 'mas', 'mediante',
  'meio', 'menos', 'mesma', 'mesmas', 'mesmo', 'mesmos', 'muito', 'muitos',
  'na', 'nao', 'nas', 'nem', 'nenhum', 'nenhuma', 'nessa', 'nesse', 'nesta',
  'neste', 'no', 'nos', 'nossa', 'nosso', 'num', 'numa', 'o', 'os', 'ou',
  'outra', 'outras', 'outro', 'outros', 'para', 'pela', 'pelas', 'pelo',
  'pelos', 'perante', 'pode', 'podem', 'podera', 'poderao', 'pois', 'por',
  'porque', 'portanto', 'possa', 'possam', 'pouco', 'propria', 'proprio',
  'quais', 'quaisquer', 'qual', 'qualquer', 'quando', 'quanto', 'que', 'quem',
  'salvo', 'se', 'seja', 'sejam', 'sem', 'sendo', 'sera', 'serao', 'seu',
  'seus', 'sob', 'sobre', 'somente', 'sua', 'suas', 'tais', 'tal', 'tambem',
  'tanto', 'tem', 'tendo', 'ter', 'tera', 'terao', 'toda', 'todas', 'todo',
  'todos', 'trata', 'um', 'uma', 'umas', 'uns', 'vai', 'vao',
  // Termos estruturais e verbos/nomes legislativos genéricos
  'alinea', 'alineas', 'ambito', 'anexo', 'anexos', 'anterior', 'anteriores',
  'apenas', 'apos', 'art', 'artigo', 'artigos', 'assim', 'bem', 'cada',
  'caput', 'capitulo', 'caso', 'casos', 'comum', 'condicao', 'condicoes',
  'conforme', 'constante', 'constantes', 'contado', 'contados', 'contrario',
  'correspondente', 'correspondentes', 'cujo', 'cuja', 'cujos', 'cujas',
  'data', 'datas', 'decreto', 'demais', 'deve', 'devem', 'devera', 'deverao',
  'devido', 'devida', 'dias', 'dispoe', 'disposicao', 'disposicoes',
  'dispositivo', 'dispositivos', 'disposto', 'dispostos', 'efeito', 'efeitos',
  'elemento', 'elementos', 'especie', 'especies', 'especifico', 'especifica',
  'estabelece', 'estabelecem', 'estabelecido', 'estabelecida', 'estabelecidos',
  'estabelecidas', 'evento', 'eventos', 'exceto', 'exigencia', 'exigencias',
  'exigido', 'exigida', 'federal', 'fica', 'ficam', 'fim', 'fins', 'forma',
  'formas', 'geral', 'gerais', 'inclusive', 'inciso', 'incisos', 'inclui',
  'informacao', 'informacoes', 'instrumento', 'instrucao', 'item', 'itens',
  'lei', 'leis', 'local', 'maior', 'maneira', 'medida', 'medidas', 'menor',
  'mes', 'meses', 'modalidade', 'modo', 'motivo', 'municipal', 'nacional',
  'necessaria', 'necessarias', 'necessario', 'necessarios', 'neste', 'nesta',
  'norma', 'normas', 'normativa', 'normativo', 'nova', 'novas', 'novo',
  'novos', 'numero', 'objeto', 'ocorrencia', 'oficial', 'oficiais', 'ordem',
  'orgao', 'orgaos', 'paragrafo', 'paragrafos', 'parte', 'partes', 'partir',
  'passa', 'passam', 'periodo', 'pessoa', 'pessoas', 'portaria', 'possui',
  'prevista', 'previstas', 'previsto', 'previstos', 'presente', 'presentes',
  'primeiro', 'primeira', 'processo', 'publica', 'publico', 'quais',
  'quantidade', 'quinta', 'quarto', 'quaisquer', 'realizacao', 'realizar',
  'realizado', 'realizada', 'referente', 'referentes', 'referida', 'referido',
  'regimento', 'regra', 'regras', 'regulamento', 'relacao', 'relativo',
  'relativa', 'relativos', 'relativas', 'resolucao', 'respectiva',
  'respectivo', 'respectivos', 'respectivas', 'requisito', 'requisitos',
  'secao', 'segundo', 'segunda', 'seguinte', 'seguintes', 'sempre', 'sendo',
  'servico', 'servicos', 'setor', 'situacao', 'situacoes', 'subitem',
  'subsecao', 'tecnica', 'tecnicas', 'tecnico', 'tecnicos', 'terceiro',
  'termo', 'termos', 'texto', 'tipo', 'tipos', 'titulo', 'toda', 'todos',
  'total', 'unico', 'unica', 'uso', 'valor', 'valores', 'vigente', 'vigentes',
]);

const CONCEPT_RULES: ConceptRule[] = [
  { assunto: 'Acesso à informação', pattern: /\bacesso\s+[àa]\s+informa[çc][ãa]o\b/i },
  { assunto: 'Alvará e licenciamento', pattern: /\b(?:alvar[áa]s?|licen[çc]as?|licenciamento)\b/i },
  { assunto: 'Ampla defesa e contraditório', pattern: /\b(?:ampla\s+defesa|contradit[óo]rio)\b/i },
  { assunto: 'Análise laboratorial', pattern: /\b(?:an[áa]lises?\s+laboratoriais?|laborat[óo]rios?|laboratorial)\b/i },
  { assunto: 'Apreensão e inutilização', pattern: /\b(?:apreens[ãa]o|apreender|inutiliza[çc][ãa]o|descarte)\b/i },
  { assunto: 'Armazenamento e conservação', pattern: /\b(?:armazenamento|conserva[çc][ãa]o|estocagem|refrigera[çc][ãa]o)\b/i },
  { assunto: 'Auditoria e vistoria', pattern: /\b(?:auditorias?|vistorias?)\b/i },
  { assunto: 'Auto de infração', pattern: /\bautos?\s+de\s+infra[çc][ãa]o\b/i },
  { assunto: 'Cadastro e credenciamento', pattern: /\b(?:cadastros?|cadastramento|credenciamento)\b/i },
  { assunto: 'Classificação e rotulagem', pattern: /\b(?:classifica[çc][ãa]o|rotulagem|r[óo]tulos?)\b/i },
  { assunto: 'Competência e atribuições', pattern: /\b(?:compet[êe]ncias?|atribui[çc][õo]es?)\b/i },
  { assunto: 'Comunicação e notificação', pattern: /\b(?:notifica[çc][ãa]o|notificar|intima[çc][ãa]o|comunica[çc][ãa]o)\b/i },
  { assunto: 'Controle de qualidade', pattern: /\b(?:controle\s+de\s+qualidade|garantia\s+da\s+qualidade|autocontrole)\b/i },
  { assunto: 'Dados pessoais e sigilo', pattern: /\b(?:dados\s+pessoais|sigilo|confidencialidade|\blgpd\b)\b/i },
  { assunto: 'Definições e conceitos', pattern: /\b(?:considera-se|entende-se|para\s+(?:os\s+)?fins\s+dest[ae]|defini[çc][õo]es)\b/i },
  { assunto: 'Delegação de competência', pattern: /\bdelega[çc][ãa]o\b/i },
  { assunto: 'Documentação e protocolo', pattern: /\b(?:documenta[çc][ãa]o|documentos?|protocolo|requerimento)\b/i },
  { assunto: 'Equipamentos de proteção (EPI)', pattern: /\b(?:equipamentos?\s+de\s+prote[çc][ãa]o|\bepi\b)\b/i },
  { assunto: 'Estabelecimentos e instalações', pattern: /\b(?:estabelecimentos?|instala[çc][õo]es)\b/i },
  { assunto: 'Fiscalização', pattern: /\b(?:fiscaliza[çc][ãa]o|fiscalizar|fiscais?)\b/i },
  { assunto: 'Higiene e sanitização', pattern: /\b(?:higiene|higieniza[çc][ãa]o|sanitiza[çc][ãa]o|limpeza)\b/i },
  { assunto: 'Infrações', pattern: /\b(?:infra[çc][õo]es|infra[çc][ãa]o|infrator(?:es)?)\b/i },
  { assunto: 'Inspeção e reinspeção', pattern: /\b(?:inspe[çc][ãa]o|reinspe[çc][ãa]o|inspecionar)\b/i },
  { assunto: 'Interdição e suspensão', pattern: /\b(?:interdi[çc][ãa]o|interditar|suspens[ãa]o|cassação|cassa[çc][ãa]o)\b/i },
  { assunto: 'Multas e valores pecuniários', pattern: /\bmultas?\b/i },
  { assunto: 'Obrigações e deveres', pattern: /\b(?:obriga[çc][õo]es|obriga[çc][ãa]o|deveres)\b/i },
  { assunto: 'Penalidades e sanções', pattern: /\b(?:penalidades?|san[çc][õo]es|san[çc][ãa]o|punibilidade|puni[çc][ãa]o)\b/i },
  { assunto: 'Prazos', pattern: /\bprazos?\b/i },
  { assunto: 'Prescrição e decadência', pattern: /\b(?:prescreve|prescri[çc][ãa]o|decad[êe]ncia)\b/i },
  { assunto: 'Processo administrativo', pattern: /\bprocessos?\s+administrativos?\b/i },
  { assunto: 'Publicidade e transparência', pattern: /\b(?:publicidade|transpar[êe]ncia|publica[çc][ãa]o|di[áa]rio\s+oficial)\b/i },
  { assunto: 'Rastreabilidade', pattern: /\brastreabilidade\b/i },
  { assunto: 'Recursos administrativos', pattern: /\b(?:recursos?\s+administrativos?|impugna[çc][ãa]o|reconsidera[çc][ãa]o)\b/i },
  { assunto: 'Registro', pattern: /\bregistros?\b/i },
  { assunto: 'Responsabilidade técnica', pattern: /\b(?:respons[áa]vel\s+t[ée]cnico|responsabilidade\s+t[ée]cnica)\b/i },
  { assunto: 'Trânsito e transporte', pattern: /\b(?:tr[âa]nsito|transporte|ve[íi]culos?)\b/i },
];

export function normalizeLookupKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getInitialLetter(text: string): string {
  const clean = normalizeLookupKey(text);
  const first = clean.charAt(0).toUpperCase();
  if (first >= 'A' && first <= 'Z') return first;
  return '#';
}

function formatSentenceCaseAssunto(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function cleanDivisionHeadingToAssunto(raw: string, isTech: boolean): string {
  let cleaned = raw.trim();
  if (!cleaned) return '';

  if (isTech) {
    cleaned = cleaned.replace(/^\d+(?:\.\d+)*\.?(?:\s*[-–—:]\s*|\s+)/, '');
  } else {
    cleaned = cleaned.replace(
      /^(?:T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+[IVXLCDM]+\s*(?:[-–—:]\s*|\s+)?/i,
      ''
    );
  }

  cleaned = cleaned
    .replace(/^(?:DA|DO|DAS|DOS|DE)\s+/i, '')
    .replace(/[.:\s]+$/, '')
    .trim();

  if (!cleaned) return '';
  return formatSentenceCaseAssunto(cleaned);
}

function buildExcerpt(text: string, matchStart = 0): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= 120) return compact;
  const start = Math.max(0, matchStart - 28);
  const slice = compact.slice(start, start + 115).trim();
  return `${start > 0 ? '...' : ''}${slice}...`;
}

function stemPortugueseWord(normalized: string): string {
  if (normalized.length <= 4) return normalized;
  if (normalized.endsWith('coes')) return `${normalized.slice(0, -4)}cao`;
  if (normalized.endsWith('soes')) return `${normalized.slice(0, -4)}sao`;
  if (normalized.endsWith('oes')) return `${normalized.slice(0, -3)}ao`;
  if (normalized.endsWith('ais') && normalized.length > 5) {
    return `${normalized.slice(0, -3)}al`;
  }
  if (normalized.endsWith('eis') && normalized.length > 5) {
    return `${normalized.slice(0, -3)}el`;
  }
  if (normalized.endsWith('res') && normalized.length > 5) {
    return normalized.slice(0, -2);
  }
  if (normalized.endsWith('es') && normalized.length > 5) {
    return normalized.slice(0, -1);
  }
  if (normalized.endsWith('s') && normalized.length > 4 && !normalized.endsWith('ss')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function collectArtigoSegments(
  art: ArtigoItem,
  aIdx: number,
  isTech: boolean,
  subItemLabels: string[]
): TextSegment[] {
  const segments: TextSegment[] = [];

  if (art.caput.trim()) {
    segments.push({
      fieldKey: `caput:${art.id}`,
      detalhe: isTech ? 'texto principal' : 'caput',
      text: art.caput.trim(),
    });
  }

  art.incisos.forEach((inc, iIdx) => {
    if (inc.texto.trim()) {
      segments.push({
        fieldKey: `inciso:${art.id}:${inc.id}`,
        detalhe: isTech ? `alínea ${toLetter(iIdx)})` : `inc. ${toRoman(iIdx + 1)}`,
        text: inc.texto.trim(),
      });
    }
    inc.alineas.forEach((al, alIdx) => {
      if (al.texto.trim()) {
        segments.push({
          fieldKey: `alinea:${art.id}:${inc.id}:${al.id}`,
          detalhe: isTech
            ? `alínea ${toLetter(iIdx)}), item ${toLetter(alIdx)})`
            : `inc. ${toRoman(iIdx + 1)}, alínea "${toLetter(alIdx)}"`,
          text: al.texto.trim(),
        });
      }
    });
  });

  art.paragrafos.forEach((par, pIdx) => {
    const parLabel = isTech
      ? `subitem ${subItemLabels[pIdx] || `${aIdx + 1}.${pIdx + 1}`}`
      : formatParagrafoNumero(pIdx, art.paragrafos.length, par.sufixo).replace(
          /\.$/,
          ''
        );

    if (par.texto.trim()) {
      segments.push({
        fieldKey: `paragrafo:${art.id}:${par.id}`,
        detalhe: parLabel,
        text: par.texto.trim(),
      });
    }

    (par.incisos || []).forEach((inc, iIdx) => {
      if (inc.texto.trim()) {
        segments.push({
          fieldKey: `par_inciso:${art.id}:${par.id}:${inc.id}`,
          detalhe: `${parLabel}, inc. ${toRoman(iIdx + 1)}`,
          text: inc.texto.trim(),
        });
      }
      inc.alineas.forEach((al, alIdx) => {
        if (al.texto.trim()) {
          segments.push({
            fieldKey: `par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`,
            detalhe: `${parLabel}, inc. ${toRoman(iIdx + 1)}, alínea "${toLetter(alIdx)}"`,
            text: al.texto.trim(),
          });
        }
      });
    });
  });

  return segments;
}

export function generateIndiceRemissivo(
  doc: NormaDocument
): IndiceRemissivoResult {
  const isTech = isTechnicalOperationalProfile(doc.tipo);
  const progressiveLayout = isTech
    ? computeProgressiveStructure(doc.artigos)
    : null;

  const indexedArtigos: IndexedArtigoData[] = doc.artigos.map((art, aIdx) => {
    const prog = progressiveLayout?.[aIdx];
    const artLabel = prog
      ? `${prog.hasSections ? 'Item' : 'Etapa'} ${prog.itemLabel.replace(/\.$/, '')}`
      : formatArtigoNumero(aIdx + 1, art.sufixo).replace(/\.$/, '');
    const segments = collectArtigoSegments(
      art,
      aIdx,
      isTech,
      prog?.subItemLabels || []
    );
    const fullText = segments.map((s) => s.text).join(' ');
    return {
      art,
      artIndex: aIdx,
      artLabel,
      segments,
      fullText,
      normalizedFullText: normalizeLookupKey(fullText),
    };
  });

  const entryMap = new Map<string, IndiceRemissivoEntry>();

  const registerMatch = (
    key: string,
    assunto: string,
    origem: IndiceAssuntoOrigem,
    origemLabel: string,
    ref: IndiceRemissivoRef
  ) => {
    const cleanAssunto = assunto.trim();
    if (!cleanAssunto) return;
    let entry = entryMap.get(key);
    if (!entry) {
      entry = {
        id: `idx-${key.replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${entryMap.size}`,
        assunto: cleanAssunto,
        letraInicial: getInitialLetter(cleanAssunto),
        origem,
        origemLabel,
        referencias: [],
        ocorrenciasTotais: 0,
      };
      entryMap.set(key, entry);
    }
    entry.ocorrenciasTotais += 1;
    if (!entry.referencias.some((r) => r.artId === ref.artId)) {
      entry.referencias.push(ref);
    }
  };

  // 1. Divisões estruturais (Títulos, Capítulos, Seções, Subseções)
  const divisionKinds: Array<{
    field: 'titulo' | 'capitulo' | 'secao' | 'subsecao';
    label: string;
  }> = isTech
    ? [
        { field: 'titulo', label: 'Seção técnica' },
        { field: 'capitulo', label: 'Subseção técnica' },
        { field: 'secao', label: 'Tópico técnico' },
        { field: 'subsecao', label: 'Subtópico' },
      ]
    : [
        { field: 'titulo', label: 'Título' },
        { field: 'capitulo', label: 'Capítulo' },
        { field: 'secao', label: 'Seção' },
        { field: 'subsecao', label: 'Subseção' },
      ];

  for (const divKind of divisionKinds) {
    let currentHeading = '';
    let currentNormKey = '';
    let currentAssunto = '';

    for (const item of indexedArtigos) {
      const rawVal = item.art[divKind.field]?.trim();
      if (rawVal) {
        currentHeading = rawVal;
        const assunto = cleanDivisionHeadingToAssunto(rawVal, isTech);
        if (assunto) {
          currentAssunto = assunto;
          currentNormKey = `div:${normalizeLookupKey(assunto)}`;
        } else {
          currentAssunto = '';
          currentNormKey = '';
        }
      } else if (
        divKind.field === 'capitulo' &&
        item.art.titulo?.trim()
      ) {
        currentHeading = '';
        currentAssunto = '';
        currentNormKey = '';
      } else if (
        divKind.field === 'secao' &&
        (item.art.titulo?.trim() || item.art.capitulo?.trim())
      ) {
        currentHeading = '';
        currentAssunto = '';
        currentNormKey = '';
      } else if (
        divKind.field === 'subsecao' &&
        (item.art.titulo?.trim() ||
          item.art.capitulo?.trim() ||
          item.art.secao?.trim())
      ) {
        currentHeading = '';
        currentAssunto = '';
        currentNormKey = '';
      }

      if (currentAssunto && currentNormKey) {
        const firstSeg = item.segments[0];
        registerMatch(
          currentNormKey,
          currentAssunto,
          'divisao',
          divKind.label,
          {
            artId: item.art.id,
            artIndex: item.artIndex,
            artLabel: item.artLabel,
            fieldKey: firstSeg ? firstSeg.fieldKey : `caput:${item.art.id}`,
            detalhe: currentHeading,
            trecho: firstSeg ? buildExcerpt(firstSeg.text) : '',
          }
        );
      }
    }
  }

  // 2. Conceitos jurídicos e regulatórios recorrentes
  const coveredTermKeys = new Set<string>();
  for (const existing of entryMap.values()) {
    coveredTermKeys.add(normalizeLookupKey(existing.assunto));
  }

  for (const rule of CONCEPT_RULES) {
    const ruleKey = `concept:${normalizeLookupKey(rule.assunto)}`;
    for (const item of indexedArtigos) {
      for (const seg of item.segments) {
        const m = seg.text.match(rule.pattern);
        if (m) {
          registerMatch(
            ruleKey,
            rule.assunto,
            'conceito',
            'Tema jurídico / técnico',
            {
              artId: item.art.id,
              artIndex: item.artIndex,
              artLabel: item.artLabel,
              fieldKey: seg.fieldKey,
              detalhe: seg.detalhe,
              trecho: buildExcerpt(seg.text, m.index || 0),
            }
          );
          coveredTermKeys.add(normalizeLookupKey(rule.assunto));
          const normalizedParts = normalizeLookupKey(rule.assunto).split(' ');
          for (const part of normalizedParts) {
            if (part.length >= 4 && !STOPWORDS.has(part)) {
              coveredTermKeys.add(stemPortugueseWord(part));
            }
          }
          break;
        }
      }
    }
  }

  // 3. Termos dinâmicos relevantes específicos do tema da norma
  interface DynamicCandidate {
    stem: string;
    surfaceCounts: Map<string, number>;
    refsByArt: Map<string, IndiceRemissivoRef>;
    totalHits: number;
  }

  const dynamicMap = new Map<string, DynamicCandidate>();
  const minArtigosForDynamic = indexedArtigos.length <= 4 ? 1 : 2;

  for (const item of indexedArtigos) {
    for (const seg of item.segments) {
      const wordRegex = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]{3,}/g;
      let match: RegExpExecArray | null;
      while ((match = wordRegex.exec(seg.text)) !== null) {
        const rawWord = match[0].replace(/^-+|-+$/g, '');
        const normWord = normalizeLookupKey(rawWord);
        if (normWord.length < 4 || STOPWORDS.has(normWord)) continue;
        const stem = stemPortugueseWord(normWord);
        if (coveredTermKeys.has(normWord) || coveredTermKeys.has(stem)) {
          continue;
        }

        let cand = dynamicMap.get(stem);
        if (!cand) {
          cand = {
            stem,
            surfaceCounts: new Map(),
            refsByArt: new Map(),
            totalHits: 0,
          };
          dynamicMap.set(stem, cand);
        }
        cand.totalHits += 1;
        const surfaceLower = rawWord.toLowerCase();
        cand.surfaceCounts.set(
          surfaceLower,
          (cand.surfaceCounts.get(surfaceLower) || 0) + 1
        );
        if (!cand.refsByArt.has(item.art.id)) {
          cand.refsByArt.set(item.art.id, {
            artId: item.art.id,
            artIndex: item.artIndex,
            artLabel: item.artLabel,
            fieldKey: seg.fieldKey,
            detalhe: seg.detalhe,
            trecho: buildExcerpt(seg.text, match.index),
          });
        }
      }
    }
  }

  const dynamicSorted = Array.from(dynamicMap.values())
    .filter((c) => c.refsByArt.size >= minArtigosForDynamic)
    .sort((a, b) => {
      if (b.refsByArt.size !== a.refsByArt.size) {
        return b.refsByArt.size - a.refsByArt.size;
      }
      return b.totalHits - a.totalHits;
    })
    .slice(0, 28);

  for (const cand of dynamicSorted) {
    let bestSurface = cand.stem;
    let bestScore = -1;
    for (const [surf, count] of cand.surfaceCounts.entries()) {
      // Prefere forma mais frequente e ligeiramente mais curta (singular) em empates
      const score = count * 10 - surf.length * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestSurface = surf;
      }
    }
    const assunto = formatSentenceCaseAssunto(bestSurface);
    const normAssunto = normalizeLookupKey(assunto);
    if (coveredTermKeys.has(normAssunto)) continue;
    coveredTermKeys.add(normAssunto);

    const refs = Array.from(cand.refsByArt.values()).sort(
      (a, b) => a.artIndex - b.artIndex
    );
    entryMap.set(`term:${cand.stem}`, {
      id: `idx-term-${cand.stem}`,
      assunto,
      letraInicial: getInitialLetter(assunto),
      origem: 'termo',
      origemLabel: 'Termo recorrente',
      referencias: refs,
      ocorrenciasTotais: cand.totalHits,
    });
  }

  // 4. Disposições finais (Revogações e Vigência)
  const revogacoesValidas = doc.revogacoes.map((r) => r.trim()).filter(Boolean);
  let nextArtNumber = doc.artigos.length;
  if (revogacoesValidas.length > 0) {
    nextArtNumber += 1;
    const revLabel = isTech
      ? 'Cláusula de revogação'
      : formatArtigoNumero(nextArtNumber).replace(/\.$/, '');
    registerMatch(
      'final:revogacao',
      'Revogação de atos anteriores',
      'disposicao_final',
      'Parte final',
      {
        artId: '__revogacao__',
        artIndex: nextArtNumber - 1,
        artLabel: revLabel,
        fieldKey: 'revogacao:0',
        detalhe: 'Cláusula revogatória',
        trecho: revogacoesValidas.join('; '),
      }
    );
  }

  nextArtNumber += 1;
  const vigLabel = isTech
    ? 'Cláusula de vigência'
    : formatArtigoNumero(nextArtNumber).replace(/\.$/, '');
  registerMatch('final:vigencia', 'Vigência da norma', 'disposicao_final', 'Parte final', {
    artId: '__vigencia__',
    artIndex: nextArtNumber - 1,
    artLabel: vigLabel,
    fieldKey: 'vigencia',
    detalhe: 'Cláusula de vigência',
    trecho:
      doc.vigenciaTipo === 'imediata'
        ? 'Entra em vigor na data de sua publicação.'
        : doc.vigenciaTipo === 'dias'
          ? `Entra em vigor após ${doc.vigenciaDias} dias.`
          : `Entra em vigor em ${doc.vigenciaData || 'data definida'}.`,
  });

  // Ordenação alfabética A–Z em português e ordenação interna das referências
  const entries = Array.from(entryMap.values())
    .map((e) => ({
      ...e,
      referencias: [...e.referencias].sort((a, b) => a.artIndex - b.artIndex),
    }))
    .sort((a, b) =>
      a.assunto.localeCompare(b.assunto, 'pt-BR', { sensitivity: 'base' })
    );

  const artIdsIndexados = new Set<string>();
  const letrasSet = new Set<string>();
  for (const e of entries) {
    letrasSet.add(e.letraInicial);
    for (const r of e.referencias) {
      if (!r.artId.startsWith('__')) {
        artIdsIndexados.add(r.artId);
      }
    }
  }

  const letrasDisponiveis = Array.from(letrasSet).sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );

  return {
    entries,
    totalAssuntos: entries.length,
    totalArtigosIndexados: artIdsIndexados.size,
    letrasDisponiveis,
    isTech,
  };
}

export function formatIndiceRemissivoPlainText(
  doc: NormaDocument,
  indexResult: IndiceRemissivoResult
): string {
  const titulo = `${doc.tipo.toUpperCase()} Nº ${doc.numero.trim() || '___'}`;
  const lines: string[] = [
    `ÍNDICE REMISSIVO — ${titulo}`,
    '='.repeat(60),
    '',
  ];

  let currentLetter = '';
  for (const entry of indexResult.entries) {
    if (entry.letraInicial !== currentLetter) {
      if (currentLetter) lines.push('');
      currentLetter = entry.letraInicial;
      lines.push(`[ ${currentLetter} ]`);
    }
    const refsStr = entry.referencias.map((r) => r.artLabel).join(', ');
    lines.push(`• ${entry.assunto} — ${refsStr}`);
  }

  return lines.join('\n');
}
