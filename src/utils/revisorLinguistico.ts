import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  LinguisticCategory,
  LinguisticFieldRef,
  LinguisticFinding,
  LinguisticReviewSummary,
  NormaDocument,
} from '../types/norma';
import {
  formatArtigoNumero,
  formatParagrafoNumero,
  toLetter,
  toRoman,
} from './legistica';
import {
  computeProgressiveStructure,
  isTechnicalOperationalProfile,
} from './normaProfiles';

export interface PortugueseSpellChecker {
  hasWord: (word: string) => boolean;
  suggestWords: (word: string, max?: number) => string[];
}

const WB_L = '(?<![A-Za-zÀ-ÖØ-öø-ÿ0-9_])';
const WB_R = '(?![A-Za-zÀ-ÖØ-öø-ÿ0-9_])';

function preserveCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement;
  const letters = original.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (letters.length > 1 && letters === letters.toUpperCase()) {
    return replacement.toUpperCase();
  }
  const firstAlpha = original.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/);
  if (firstAlpha && firstAlpha[0] === firstAlpha[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export interface TextFieldContext {
  fieldKey: string;
  fieldRef: LinguisticFieldRef;
  fieldLabel: string;
  text: string;
  isNormativeDevice: boolean;
  isSubItemLowercaseStart?: boolean;
  isUpperHeading?: boolean;
  skipProperNounCaps?: boolean;
}

interface PlaceholderSpan {
  start: number;
  end: number;
}

function getPlaceholderSpans(text: string): PlaceholderSpan[] {
  const spans: PlaceholderSpan[] = [];
  const regex = /\[[^\]\n]{1,160}\]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

function overlapsPlaceholder(
  start: number,
  end: number,
  placeholders: PlaceholderSpan[]
): boolean {
  return placeholders.some((p) => start < p.end && end > p.start);
}

interface DictionaryEntry {
  wrong: string;
  correct: string;
  reason?: string;
}

// Erros ortográficos, acentuação ausente, cedilha, digitação comum e Novo Acordo Ortográfico
const ORTHO_DICTIONARY: DictionaryEntry[] = [
  // Digitação e ortografia comum em atos normativos
  { wrong: 'excessão', correct: 'exceção' },
  { wrong: 'exceçao', correct: 'exceção' },
  { wrong: 'exessão', correct: 'exceção' },
  { wrong: 'exçeção', correct: 'exceção' },
  { wrong: 'previlégio', correct: 'privilégio' },
  { wrong: 'previlegio', correct: 'privilégio' },
  { wrong: 'beneficiente', correct: 'beneficente' },
  { wrong: 'reinvindicação', correct: 'reivindicação' },
  { wrong: 'reinvindicacao', correct: 'reivindicação' },
  { wrong: 'reinvindicar', correct: 'reivindicar' },
  { wrong: 'impecilho', correct: 'empecilho' },
  { wrong: 'pertubar', correct: 'perturbar' },
  { wrong: 'frustar', correct: 'frustrar' },
  { wrong: 'prostar', correct: 'prostrar' },
  { wrong: 'paralização', correct: 'paralisação' },
  { wrong: 'paralisacao', correct: 'paralisação' },
  { wrong: 'pesquiza', correct: 'pesquisa' },
  { wrong: 'pesquizar', correct: 'pesquisar' },
  { wrong: 'analizar', correct: 'analisar' },
  { wrong: 'analize', correct: 'análise' },
  { wrong: 'análize', correct: 'análise' },
  { wrong: 'fiscalisação', correct: 'fiscalização' },
  { wrong: 'autorisação', correct: 'autorização' },
  { wrong: 'regularisação', correct: 'regularização' },
  { wrong: 'comercialisação', correct: 'comercialização' },
  { wrong: 'atrazo', correct: 'atraso' },
  { wrong: 'atrazado', correct: 'atrasado' },
  { wrong: 'atrazada', correct: 'atrasada' },
  { wrong: 'conciderando', correct: 'considerando' },
  { wrong: 'cosiderando', correct: 'considerando' },
  { wrong: 'adminstrativo', correct: 'administrativo' },
  { wrong: 'adminstrativa', correct: 'administrativa' },
  { wrong: 'admnistrativo', correct: 'administrativo' },
  { wrong: 'admnistrativa', correct: 'administrativa' },
  { wrong: 'admistração', correct: 'administração' },
  { wrong: 'adminstração', correct: 'administração' },
  { wrong: 'dispostivo', correct: 'dispositivo' },
  { wrong: 'dispostivos', correct: 'dispositivos' },
  { wrong: 'decretro', correct: 'decreto' },
  { wrong: 'municípo', correct: 'município' },
  { wrong: 'muncípio', correct: 'município' },
  { wrong: 'muncipal', correct: 'municipal' },
  { wrong: 'estadul', correct: 'estadual' },
  { wrong: 'fedeal', correct: 'federal' },
  { wrong: 'publciação', correct: 'publicação' },
  { wrong: 'pubilcação', correct: 'publicação' },
  { wrong: 'vigênca', correct: 'vigência' },
  { wrong: 'revogacão', correct: 'revogação' },
  { wrong: 'obrigatorimente', correct: 'obrigatoriamente' },
  { wrong: 'artgio', correct: 'artigo' },
  { wrong: 'parágrao', correct: 'parágrafo' },
  { wrong: 'alínia', correct: 'alínea' },
  { wrong: 'seje', correct: 'seja' },
  { wrong: 'sejem', correct: 'sejam' },
  { wrong: 'esteje', correct: 'esteja' },
  { wrong: 'estejem', correct: 'estejam' },
  { wrong: 'haje', correct: 'haja' },
  { wrong: 'menas', correct: 'menos' },
  { wrong: 'consesão', correct: 'concessão' },
  { wrong: 'conscessão', correct: 'concessão' },
  { wrong: 'conceção', correct: 'concessão' },
  { wrong: 'licensa', correct: 'licença' },
  { wrong: 'licensas', correct: 'licenças' },
  { wrong: 'suspenção', correct: 'suspensão' },
  { wrong: 'extenção', correct: 'extensão' },
  { wrong: 'compreenção', correct: 'compreensão' },
  { wrong: 'apreenção', correct: 'apreensão' },
  { wrong: 'pretenção', correct: 'pretensão' },
  { wrong: 'enchergar', correct: 'enxergar' },
  { wrong: 'geito', correct: 'jeito' },
  { wrong: 'puzer', correct: 'puser' },
  { wrong: 'quizer', correct: 'quiser' },
  { wrong: 'fizerão', correct: 'fizeram' },
  { wrong: 'estam', correct: 'estão' },
  { wrong: 'atravez', correct: 'através' },
  { wrong: 'atravéz', correct: 'através' },
  { wrong: 'atraves', correct: 'através' },
  // Palavras coladas ou separadas incorretamente
  { wrong: 'apartir', correct: 'a partir', reason: 'A locução prepositiva "a partir" escreve-se separada.' },
  { wrong: 'porisso', correct: 'por isso', reason: 'Escreve-se em duas palavras ("por isso").' },
  { wrong: 'comcerteza', correct: 'com certeza' },
  { wrong: 'concerteza', correct: 'com certeza' },
  { wrong: 'derepente', correct: 'de repente' },
  { wrong: 'emfim', correct: 'enfim' },
  { wrong: 'emquanto', correct: 'enquanto' },
  { wrong: 'comtudo', correct: 'contudo' },
  { wrong: 'porsua', correct: 'por sua' },
  { wrong: 'bem estar', correct: 'bem-estar', reason: 'Emprega-se hífen em "bem-estar".' },
  // Acentuação e cedilha faltantes de alta frequência jurídica
  { wrong: 'municipio', correct: 'município' },
  { wrong: 'municipios', correct: 'municípios' },
  { wrong: 'publico', correct: 'público' },
  { wrong: 'publicos', correct: 'públicos' },
  { wrong: 'publicas', correct: 'públicas' },
  { wrong: 'orgao', correct: 'órgão' },
  { wrong: 'orgaos', correct: 'órgãos' },
  { wrong: 'orgão', correct: 'órgão' },
  { wrong: 'orgãos', correct: 'órgãos' },
  { wrong: 'legislacao', correct: 'legislação' },
  { wrong: 'legislaçao', correct: 'legislação' },
  { wrong: 'competencia', correct: 'competência' },
  { wrong: 'competencias', correct: 'competências' },
  { wrong: 'vigencia', correct: 'vigência' },
  { wrong: 'revogacao', correct: 'revogação' },
  { wrong: 'revogaçao', correct: 'revogação' },
  { wrong: 'exercicio', correct: 'exercício' },
  { wrong: 'exercicios', correct: 'exercícios' },
  { wrong: 'ambito', correct: 'âmbito' },
  { wrong: 'criterio', correct: 'critério' },
  { wrong: 'criterios', correct: 'critérios' },
  { wrong: 'juridico', correct: 'jurídico' },
  { wrong: 'juridica', correct: 'jurídica' },
  { wrong: 'juridicos', correct: 'jurídicos' },
  { wrong: 'juridicas', correct: 'jurídicas' },
  { wrong: 'sanitario', correct: 'sanitário' },
  { wrong: 'sanitaria', correct: 'sanitária' },
  { wrong: 'sanitarios', correct: 'sanitários' },
  { wrong: 'sanitarias', correct: 'sanitárias' },
  { wrong: 'tecnico', correct: 'técnico' },
  { wrong: 'tecnica', correct: 'técnica' },
  { wrong: 'tecnicos', correct: 'técnicos' },
  { wrong: 'tecnicas', correct: 'técnicas' },
  { wrong: 'paragrafo', correct: 'parágrafo' },
  { wrong: 'paragrafos', correct: 'parágrafos' },
  { wrong: 'unico', correct: 'único' },
  { wrong: 'unica', correct: 'única' },
  { wrong: 'numero', correct: 'número' },
  { wrong: 'numeros', correct: 'números' },
  { wrong: 'acao', correct: 'ação' },
  { wrong: 'acoes', correct: 'ações' },
  { wrong: 'disposicao', correct: 'disposição' },
  { wrong: 'disposicoes', correct: 'disposições' },
  { wrong: 'disposiçao', correct: 'disposição' },
  { wrong: 'regulamentacao', correct: 'regulamentação' },
  { wrong: 'regulamentaçao', correct: 'regulamentação' },
  { wrong: 'aplicacao', correct: 'aplicação' },
  { wrong: 'aplicaçao', correct: 'aplicação' },
  { wrong: 'fiscalizacao', correct: 'fiscalização' },
  { wrong: 'fiscalizaçao', correct: 'fiscalização' },
  { wrong: 'execucao', correct: 'execução' },
  { wrong: 'execuçao', correct: 'execução' },
  { wrong: 'publicacao', correct: 'publicação' },
  { wrong: 'publicaçao', correct: 'publicação' },
  { wrong: 'observancia', correct: 'observância' },
  { wrong: 'providencia', correct: 'providência' },
  { wrong: 'providencias', correct: 'providências' },
  { wrong: 'decisao', correct: 'decisão' },
  { wrong: 'decisoes', correct: 'decisões' },
  { wrong: 'infracao', correct: 'infração' },
  { wrong: 'infracoes', correct: 'infrações' },
  { wrong: 'sancao', correct: 'sanção' },
  { wrong: 'sancoes', correct: 'sanções' },
  { wrong: 'obrigacao', correct: 'obrigação' },
  { wrong: 'obrigacoes', correct: 'obrigações' },
  { wrong: 'alteracao', correct: 'alteração' },
  { wrong: 'alteracoes', correct: 'alterações' },
  { wrong: 'referencia', correct: 'referência' },
  { wrong: 'exigencia', correct: 'exigência' },
  { wrong: 'exigencias', correct: 'exigências' },
  { wrong: 'urgencia', correct: 'urgência' },
  { wrong: 'emergencia', correct: 'emergência' },
  { wrong: 'transparencia', correct: 'transparência' },
  { wrong: 'eficiencia', correct: 'eficiência' },
  { wrong: 'seguranca', correct: 'segurança' },
  { wrong: 'cobranca', correct: 'cobrança' },
  { wrong: 'mudanca', correct: 'mudança' },
  { wrong: 'licenca', correct: 'licença' },
  { wrong: 'prejuizo', correct: 'prejuízo' },
  { wrong: 'prejuizos', correct: 'prejuízos' },
  { wrong: 'administracao', correct: 'administração' },
  { wrong: 'administraçao', correct: 'administração' },
  { wrong: 'autorizacao', correct: 'autorização' },
  { wrong: 'autorizaçao', correct: 'autorização' },
  { wrong: 'regularizacao', correct: 'regularização' },
  { wrong: 'constituicao', correct: 'Constituição' },
  { wrong: 'constituiçao', correct: 'Constituição' },
  // Novo Acordo Ortográfico
  { wrong: 'infra-estrutura', correct: 'infraestrutura', reason: 'Pelo Acordo Ortográfico, não se usa hífen entre prefixo terminado em vogal e palavra iniciada por vogal diferente.' },
  { wrong: 'auto-regulamentação', correct: 'autorregulamentação', reason: 'Pelo Acordo Ortográfico, dobra-se o "r" sem hífen.' },
  { wrong: 'auto-controle', correct: 'autocontrole', reason: 'Pelo Acordo Ortográfico, escreve-se junto sem hífen.' },
  { wrong: 'anti-corrupção', correct: 'anticorrupção', reason: 'Pelo Acordo Ortográfico, escreve-se sem hífen.' },
  { wrong: 'anti-ético', correct: 'antiético', reason: 'Pelo Acordo Ortográfico, escreve-se sem hífen.' },
  { wrong: 'contra-senso', correct: 'contrassenso', reason: 'Pelo Acordo Ortográfico, dobra-se o "s" sem hífen.' },
  { wrong: 'extra-oficial', correct: 'extraoficial', reason: 'Pelo Acordo Ortográfico, escreve-se sem hífen.' },
  { wrong: 'micro-região', correct: 'microrregião', reason: 'Pelo Acordo Ortográfico, dobra-se o "r" sem hífen.' },
  { wrong: 'dia-a-dia', correct: 'dia a dia', reason: 'Pelo Acordo Ortográfico, "dia a dia" não leva hífen.' },
  { wrong: 'seqüência', correct: 'sequência', reason: 'Trema abolido pelo Acordo Ortográfico.' },
  { wrong: 'freqüência', correct: 'frequência', reason: 'Trema abolido pelo Acordo Ortográfico.' },
  { wrong: 'conseqüência', correct: 'consequência', reason: 'Trema abolido pelo Acordo Ortográfico.' },
  { wrong: 'lingüística', correct: 'linguística', reason: 'Trema abolido pelo Acordo Ortográfico.' },
  { wrong: 'qüinqüênio', correct: 'quinquênio', reason: 'Trema abolido pelo Acordo Ortográfico.' },
  { wrong: 'idéia', correct: 'ideia', reason: 'Ditongo aberto "ei" em paroxítona perdeu o acento.' },
  { wrong: 'assembléia', correct: 'assembleia', reason: 'Ditongo aberto "ei" em paroxítona perdeu o acento.' },
  { wrong: 'vôo', correct: 'voo', reason: 'Hiato "oo" perdeu o acento circunflexo.' },
];

const ORTHO_MAP = new Map<string, DictionaryEntry>(
  ORTHO_DICTIONARY.map((d) => [d.wrong.toLowerCase(), d])
);

const ORTHO_WORDS_PATTERN = new RegExp(
  `${WB_L}(${ORTHO_DICTIONARY.map((d) =>
    d.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('|')})${WB_R}`,
  'gi'
);

interface PatternRule {
  idPrefix: string;
  categoria: LinguisticCategory;
  severidade: 'erro' | 'alerta' | 'info';
  pattern: RegExp;
  onlyInNormative?: boolean;
  skipIfUpperHeading?: boolean;
  titulo: string | ((m: RegExpExecArray) => string);
  explicacao: string | ((m: RegExpExecArray) => string);
  orientacao: string | ((m: RegExpExecArray) => string);
  buildSuggestion?: (m: RegExpExecArray, fullText: string) => string | undefined;
  guard?: (m: RegExpExecArray, fullText: string) => boolean;
}

const ONDE_PLACE_NOUNS =
  /(local|lugar|espaço|sede|município|território|estabelecimento|endereço|área|zona|setor|imóvel|prédio|edifício|unidade|ambiente|região|estado|cidade|sala|dependência|recinto|logradouro|via|parque|praça)\b[^.!?;:]{0,28}$/i;

const PATTERN_RULES: PatternRule[] = [
  // === ORTOGRAFIA & DIGITAÇÃO MECÂNICA ===
  {
    idPrefix: 'rep-palavra',
    categoria: 'ortografia',
    severidade: 'erro',
    pattern: new RegExp(`${WB_L}([A-Za-zÀ-ÖØ-öø-ÿ]{2,})\\s+\\1${WB_R}`, 'gi'),
    titulo: 'Palavra duplicada em sequência',
    explicacao: (m) => `A palavra "${m[1]}" aparece repetida consecutivamente.`,
    orientacao: 'Remova a repetição acidental.',
    buildSuggestion: (m) => m[1],
  },
  {
    idPrefix: 'espaco-duplo',
    categoria: 'ortografia',
    severidade: 'alerta',
    pattern: /[ \t]{2,}/g,
    titulo: 'Espaçamento duplo ou múltiplo',
    explicacao: 'Foram encontrados múltiplos espaços consecutivos entre termos.',
    orientacao: 'Padronize com apenas um espaço simples.',
    buildSuggestion: () => ' ',
  },
  {
    idPrefix: 'espaco-antes-pont',
    categoria: 'ortografia',
    severidade: 'alerta',
    pattern: /[ \t]+([,;:.!?])/g,
    guard: (m, full) => {
      const before = full.slice(Math.max(0, m.index - 2), m.index + m[0].length + 2);
      return !/\.{3}/.test(before);
    },
    titulo: 'Espaço antes da pontuação',
    explicacao: (m) => `Há espaço em branco imediatamente antes de "${m[1]}".`,
    orientacao: 'Aproxime o sinal de pontuação da palavra anterior.',
    buildSuggestion: (m) => m[1],
  },
  {
    idPrefix: 'sem-espaco-apos-pont',
    categoria: 'ortografia',
    severidade: 'alerta',
    pattern: /([,;])([A-Za-zÀ-ÖØ-öø-ÿ])/g,
    titulo: 'Falta de espaço após pontuação',
    explicacao: (m) => `Falta espaço após "${m[1]}" antes de "${m[2]}".`,
    orientacao: 'Insira um espaço após a vírgula ou o ponto e vírgula.',
    buildSuggestion: (m) => `${m[1]} ${m[2]}`,
  },
  {
    idPrefix: 'n-antes-pb',
    categoria: 'ortografia',
    severidade: 'erro',
    pattern: new RegExp(
      `${WB_L}([A-Za-zÀ-ÖØ-öø-ÿ]*[aeiouáéíóúâêôãõAEIOUÁÉÍÓÚÂÊÔÃÕ])n([pb][A-Za-zÀ-ÖØ-öø-ÿ]+)${WB_R}`,
      'g'
    ),
    guard: (m) => !/^(canberra|istanbul)$/i.test(m[0]),
    titulo: 'Grafia incorreta: uso de "n" antes de "p" ou "b"',
    explicacao: (m) => `Na ortografia do português, utiliza-se "m" (e não "n") antes de "p" e "b" em "${m[0]}".`,
    orientacao: (m) => `Substitua por "${m[1]}${m[0].charAt(m[1].length) === 'N' ? 'M' : 'm'}${m[2]}".`,
    buildSuggestion: (m) => {
      const nChar = m[0].charAt(m[1].length);
      const mChar = nChar === 'N' ? 'M' : 'm';
      return `${m[1]}${mChar}${m[2]}`;
    },
  },
  {
    idPrefix: 'cedilha-ei',
    categoria: 'ortografia',
    severidade: 'erro',
    pattern: new RegExp(`${WB_L}([A-Za-zÀ-ÖØ-öø-ÿ]*)([çÇ])([eiéíê][A-Za-zÀ-ÖØ-öø-ÿ]*)${WB_R}`, 'g'),
    guard: (m) => !ORTHO_MAP.has(m[0].toLowerCase()),
    titulo: 'Uso indevido de cedilha ("ç") antes de "e" ou "i"',
    explicacao: (m) => `Em português não se emprega "ç" antes das vogais "e" ou "i" ("${m[0]}").`,
    orientacao: (m) => `Substitua "ç" por "c": "${m[1]}${m[2] === 'Ç' ? 'C' : 'c'}${m[3]}".`,
    buildSuggestion: (m) => `${m[1]}${m[2] === 'Ç' ? 'C' : 'c'}${m[3]}`,
  },
  {
    idPrefix: 'letra-tripla',
    categoria: 'ortografia',
    severidade: 'erro',
    pattern: /([A-Za-zÀ-ÖØ-öø-ÿ])\1\1+/g,
    guard: (m) => !/^[IVXLCDM]+$/i.test(m[0]) && !/^(www|xxx)$/i.test(m[0]),
    titulo: 'Possível erro de digitação (caractere repetido)',
    explicacao: (m) => `Sequência incomum de três ou mais letras idênticas ("${m[0]}").`,
    orientacao: 'Verifique a grafia correta da palavra digitada.',
  },

  // === GRAMÁTICA, CRASE, REGÊNCIA E CONCORDÂNCIA ===
  {
    idPrefix: 'crase-proibida-masc-verbo',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(
      `${WB_L}([àÀ])\\s+(partir|contar|pagar|receber|ser|estar|fazer|cumprir|observar|fim|prazo|rigor|título|nível|respeito|critério|cargo|serviço|pedido|requerimento|protocolo|órgão|município|estado|decreto|artigo|inciso|parágrafo|termo|exemplo|preço|custo|tempo)${WB_R}`,
      'gi'
    ),
    titulo: 'Crase indevida antes de verbo ou palavra masculina',
    explicacao: (m) => `Não ocorre crase em "${m[0]}", pois não há artigo definido feminino antes de verbos ou substantivos masculinos.`,
    orientacao: (m) => `Substitua por "${m[1] === 'À' ? 'A' : 'a'} ${m[2]}".`,
    buildSuggestion: (m) => `${m[1] === 'À' ? 'A' : 'a'} ${m[2]}`,
  },
  {
    idPrefix: 'crase-proibida-pronome',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(
      `${WB_L}([àÀ])\\s+(cada|qualquer|toda|todo|nenhuma|nenhum|alguma|algum|esta|essa|vossa)${WB_R}`,
      'gi'
    ),
    titulo: 'Crase indevida antes de pronome indefinido ou demonstrativo',
    explicacao: (m) => `Não se emprega crase em "${m[0]}", pois esses pronomes repelem artigo feminino.`,
    orientacao: (m) => `Substitua por "${m[1] === 'À' ? 'A' : 'a'} ${m[2]}".`,
    buildSuggestion: (m) => `${m[1] === 'À' ? 'A' : 'a'} ${m[2]}`,
  },
  {
    idPrefix: 'crase-singular-plural',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(
      `${WB_L}([àÀ])\\s+(?!(?:através|após|menos|mais|trás|lápis|ônibus|cais|mês|país|vírus|jus)${WB_R})([a-záéíóúâêôãõç]{4,}s)${WB_R}`,
      'gi'
    ),
    titulo: 'Crase no singular ("à") antes de palavra no plural',
    explicacao: (m) => `Quando o termo regido está no plural ("${m[2]}"), usa-se "a" sem acento grave (sentido genérico) ou "às" (com artigo definido plural).`,
    orientacao: (m) => `Ajuste para "${m[1] === 'À' ? 'A' : 'a'} ${m[2]}" ou "às ${m[2]}".`,
  },
  {
    idPrefix: 'falta-crase-locucao',
    categoria: 'gramatica',
    severidade: 'alerta',
    pattern: new RegExp(
      `${WB_L}(a)\\s+(medida\\s+que|luz\\s+d[aoe]s?|vista\\s+d[aoe])${WB_R}`,
      'gi'
    ),
    titulo: 'Ausência de acento indicativo de crase em locução feminina',
    explicacao: (m) => `A locução "${m[0]}" exige acento grave indicativo de crase.`,
    orientacao: (m) => `Empregue "${m[1] === 'A' ? 'À' : 'à'} ${m[2]}".`,
    buildSuggestion: (m) => `${m[1] === 'A' ? 'À' : 'à'} ${m[2]}`,
  },
  {
    idPrefix: 'falta-crase-disposicao',
    categoria: 'gramatica',
    severidade: 'alerta',
    pattern: new RegExp(
      `${WB_L}(ficar|permanecer|estar|colocar|pôr|manter|disponibilizar)\\s+(a)\\s+(disposição)${WB_R}`,
      'gi'
    ),
    titulo: 'Ausência de crase em "à disposição"',
    explicacao: 'A locução adverbial feminina "à disposição" exige acento grave.',
    orientacao: (m) => `Substitua por "${m[1]} à ${m[3]}".`,
    buildSuggestion: (m) => `${m[1]} à ${m[3]}`,
  },
  {
    idPrefix: 'haver-impessoal-plural',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(
      `${WB_L}(houveram|haverão|devem\\s+haver|podem\\s+haver|costumam\\s+haver)${WB_R}`,
      'gi'
    ),
    titulo: 'Concordância verbal: verbo "haver" impessoal no plural',
    explicacao: (m) => `No sentido de existir, ocorrer ou acontecer, o verbo "haver" é impessoal e permanece no singular (detectado: "${m[0]}").`,
    orientacao: 'Conjugue o verbo "haver" (e eventual auxiliar) na 3ª pessoa do singular.',
    buildSuggestion: (m) => {
      const lower = m[0].toLowerCase();
      let rep = lower;
      if (lower === 'houveram') rep = 'houve';
      else if (lower === 'haverão') rep = 'haverá';
      else if (lower.startsWith('devem')) rep = 'deve haver';
      else if (lower.startsWith('podem')) rep = 'pode haver';
      else if (lower.startsWith('costumam')) rep = 'costuma haver';
      return preserveCase(m[0], rep);
    },
  },
  {
    idPrefix: 'fazer-tempo-plural',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(
      `${WB_L}(fazem)\\s+(\\d+|dois|três|quatro|cinco|dez|quinze|trinta|muitos|vários|alguns)\\s+(dias|meses|anos|horas|semanas)${WB_R}`,
      'gi'
    ),
    titulo: 'Concordância verbal: verbo "fazer" indicando tempo decorrido',
    explicacao: 'Indicando tempo decorrido, o verbo "fazer" é impessoal e deve permanecer no singular.',
    orientacao: (m) => `Substitua por "${preserveCase(m[1], 'faz')} ${m[2]} ${m[3]}".`,
    buildSuggestion: (m) => `${preserveCase(m[1], 'faz')} ${m[2]} ${m[3]}`,
  },
  {
    idPrefix: 'cujo-artigo',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(`${WB_L}(cujos?|cujas?)\\s+(os?|as?)${WB_R}`, 'gi'),
    titulo: 'Erro gramatical: artigo após o pronome "cujo"',
    explicacao: (m) => `O pronome relativo "${m[1]}" não admite artigo definido ("${m[2]}") após si.`,
    orientacao: (m) => `Remova o artigo: utilize apenas "${m[1]}".`,
    buildSuggestion: (m) => m[1],
  },
  {
    idPrefix: 'aonde-estatico',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(
      `${WB_L}(situad[oa]s?|localizad[oa]s?|previst[oa]s?|dispost[oa]s?|estabelecid[oa]s?|consta\\w*)\\s+aonde${WB_R}`,
      'gi'
    ),
    titulo: 'Emprego inadequado de "aonde" com ideia estática',
    explicacao: '"Aonde" exige verbo de movimento; em situação estática ou remissão normativa, utiliza-se "onde" (lugar físico) ou "em que".',
    orientacao: (m) => `Substitua por "${m[1]} em que" ou "${m[1]} onde".`,
    buildSuggestion: (m) => `${m[1]} em que`,
  },
  {
    idPrefix: 'onde-nao-espacial',
    categoria: 'gramatica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}onde${WB_R}`, 'gi'),
    guard: (m, full) => {
      const before = full.slice(Math.max(0, m.index - 45), m.index);
      return !ONDE_PLACE_NOUNS.test(before);
    },
    titulo: 'Uso de "onde" sem referência a lugar físico',
    explicacao: 'Na técnica legislativa e norma culta, "onde" deve restringir-se a espaço físico real. Para situações, hipóteses, prazos ou normas, use "em que", "no qual" ou "na qual".',
    orientacao: 'Substitua por "em que" (ou "no qual / na qual").',
    buildSuggestion: (m) => preserveCase(m[0], 'em que'),
  },
  {
    idPrefix: 'proclise-inicio-frase',
    categoria: 'gramatica',
    severidade: 'alerta',
    pattern: /(?:^|[.!?]\s+)(Se)\s+(trata|aplica|aplicam|observa|observam|proíbe|proíbem|veda|vedam|estabelece|estabelecem|considera|consideram|entende|entendem|verifica|verificam|exige|exigem)\b/g,
    titulo: 'Colocação pronominal: pronome oblíquo no início do período',
    explicacao: (m) => `A norma culta veda iniciar oração ou período com pronome oblíquo átono ("${m[0].trim()}").`,
    orientacao: (m) => `Empregue a ênclise: "${m[2].charAt(0).toUpperCase() + m[2].slice(1)}-se".`,
    buildSuggestion: (m) => {
      const lead = m[0].startsWith('Se') ? '' : m[0].slice(0, m[0].indexOf('Se'));
      const verb = m[2].charAt(0).toUpperCase() + m[2].slice(1);
      return `${lead}${verb}-se`;
    },
  },
  {
    idPrefix: 'o-mesmo-anaforico',
    categoria: 'gramatica',
    severidade: 'alerta',
    pattern: new RegExp(
      `${WB_L}(o|a|os|as)\\s+(mesm[oa]s?)\\s+(?=deverá|deverão|poderá|poderão|será|serão|fica|ficam|estará|estarão|terá|terão|é|são|foi|foram|possui|apresentará)`,
      'gi'
    ),
    titulo: 'Uso inadequado de "o mesmo / a mesma" como pronome',
    explicacao: 'O Manual de Redação Oficial desaconselha empregar "o mesmo" ou "a mesma" para retomar substantivos já mencionados.',
    orientacao: 'Repita o termo técnico preciso (ex.: "o órgão", "o requerente") ou reestruture a frase.',
  },
  {
    idPrefix: 'regencia-implicar-em',
    categoria: 'gramatica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}(implica|implicam|implicará|implicarão|implicando|implicar)\\s+em${WB_R}`, 'gi'),
    titulo: 'Regência verbal: "implicar em"',
    explicacao: 'No sentido de "acarretar" ou "resultar", o verbo "implicar" é transitivo direto na norma culta (dispensa a preposição "em").',
    orientacao: (m) => `Remova a preposição "em": use apenas "${m[1]}" ou "acarreta".`,
    buildSuggestion: (m) => m[1],
  },
  {
    idPrefix: 'regencia-de-acordo-a',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(`${WB_L}(de\\s+acordo)\\s+a${WB_R}`, 'gi'),
    titulo: 'Regência inadequada: "de acordo a"',
    explicacao: 'A locução prepositiva correta é "de acordo com".',
    orientacao: (m) => `Substitua por "${m[1]} com".`,
    buildSuggestion: (m) => `${m[1]} com`,
  },
  {
    idPrefix: 'a-nivel-de',
    categoria: 'gramatica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}(a|em)\\s+nível\\s+de${WB_R}`, 'gi'),
    titulo: 'Locução inadequada: "a nível de / em nível de"',
    explicacao: 'Expressão considerada vício de linguagem burocrática quando usada com sentido de esfera ou abrangência.',
    orientacao: 'Substitua por "no âmbito de" ou "na esfera de".',
    buildSuggestion: (m) => preserveCase(m[0], 'no âmbito de'),
  },
  {
    idPrefix: 'para-mim-verbo',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(
      `${WB_L}(para)\\s+mim\\s+(fazer|analisar|decidir|assinar|cumprir|elaborar|realizar|executar|publicar)${WB_R}`,
      'gi'
    ),
    titulo: 'Pronome oblíquo antes de verbo no infinitivo',
    explicacao: 'Antes de verbo no infinitivo funcionando como sujeito, deve-se usar o pronome reto "eu", nunca "mim".',
    orientacao: (m) => `Substitua por "${m[1]} eu ${m[2]}".`,
    buildSuggestion: (m) => `${m[1]} eu ${m[2]}`,
  },
  {
    idPrefix: 'afim-de-proposito',
    categoria: 'gramatica',
    severidade: 'erro',
    pattern: new RegExp(`${WB_L}afim\\s+de${WB_R}`, 'gi'),
    titulo: 'Confusão entre "afim de" e "a fim de"',
    explicacao: '"Afim" (junto) indica afinidade ou semelhança. Para expressar finalidade ou objetivo, escreve-se "a fim de" (separado).',
    orientacao: 'Substitua por "a fim de".',
    buildSuggestion: (m) => preserveCase(m[0], 'a fim de'),
  },

  // === LINGUAGEM JURÍDICA FORMAL E TÉCNICA LEGISLATIVA ===
  {
    idPrefix: 'coloquial-pra-pro',
    categoria: 'linguagem_juridica',
    severidade: 'erro',
    pattern: new RegExp(`${WB_L}(pra|pro|pros|pras)${WB_R}`, 'gi'),
    skipIfUpperHeading: true,
    titulo: 'Contração coloquial imprópria para texto normativo',
    explicacao: (m) => `A forma "${m[0]}" pertence à linguagem oral informal e é incompatível com a redação oficial.`,
    orientacao: 'Substitua pela preposição formal completa ("para", "para o", "para os", "para as").',
    buildSuggestion: (m) => {
      const lower = m[0].toLowerCase();
      const map: Record<string, string> = {
        pra: 'para',
        pro: 'para o',
        pros: 'para os',
        pras: 'para as',
      };
      return preserveCase(m[0], map[lower] || 'para');
    },
  },
  {
    idPrefix: 'coloquial-a-gente',
    categoria: 'linguagem_juridica',
    severidade: 'erro',
    pattern: new RegExp(`${WB_L}a\\s+gente${WB_R}`, 'gi'),
    titulo: 'Expressão coloquial ("a gente") em ato normativo',
    explicacao: 'A locução pronominal "a gente" é informal e fere o princípio da impessoalidade da redação jurídica.',
    orientacao: 'Substitua pelo sujeito institucional adequado (ex.: "a Administração Pública", "o órgão competente").',
  },
  {
    idPrefix: 'coloquial-giria',
    categoria: 'linguagem_juridica',
    severidade: 'erro',
    pattern: new RegExp(
      `${WB_L}(bacana|tá|tô|né|cadê|tipo\\s+assim|meio\\s+que|de\\s+jeito\\s+nenhum|com\\s+certeza|sem\\s+dúvida|na\\s+verdade|por\\s+conta\\s+própria)${WB_R}`,
      'gi'
    ),
    skipIfUpperHeading: true,
    titulo: 'Termo ou expressão informal / oralidade',
    explicacao: (m) => `A expressão "${m[0]}" não condiz com a sobriedade e precisão exigidas pela técnica legislativa (Art. 11 da LC nº 95/1998).`,
    orientacao: 'Reescreva utilizando vocabulário jurídico objetivo e impessoal.',
  },
  {
    idPrefix: 'coloquial-legal-intensificado',
    categoria: 'linguagem_juridica',
    severidade: 'erro',
    pattern: new RegExp(`${WB_L}(muito|bem|super|mega|bastante)\\s+legal${WB_R}`, 'gi'),
    titulo: 'Uso coloquial do adjetivo "legal"',
    explicacao: (m) => `Na norma jurídica, "legal" significa relativo à lei; o uso em "${m[0]}" é coloquial.`,
    orientacao: 'Substitua por termo técnico adequado ("adequado", "regular", "eficaz").',
  },
  {
    idPrefix: 'coloquial-coisa-algo',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}(coisa|coisas|alguma\\s+coisa|basicamente|praticamente|literalmente)${WB_R}`, 'gi'),
    titulo: 'Vocabulário impreciso ou coloquial',
    explicacao: (m) => `O termo "${m[0]}" é genérico ou típico da oralidade, prejudicando a determinabilidade normativa.`,
    orientacao: 'Substitua por conceito técnico específico (ex.: "objeto", "bem", "elemento", "providência").',
  },
  {
    idPrefix: 'deitico-temporal',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(
      `${WB_L}(hoje\\s+em\\s+dia|atualmente|ultimamente|antigamente|no\\s+dia\\s+de\\s+hoje|em\\s+breve|o\\s+quanto\\s+antes|o\\s+mais\\s+rápido\\s+possível)${WB_R}`,
      'gi'
    ),
    titulo: 'Referência temporal vaga ou dêitica',
    explicacao: (m) => `Atos normativos têm vocação atemporal e prazos objetivos; "${m[0]}" gera ambiguidade temporal.`,
    orientacao: 'Fixe prazo objetivo em dias/meses ou refira-se à "data de publicação deste ato".',
  },
  {
    idPrefix: 'impreciso-etc',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}etc\\.?`, 'gi'),
    titulo: 'Uso de "etc." em dispositivo normativo',
    explicacao: 'A abreviação "etc." deixa o comando normativo aberto e impreciso (Art. 11, I, "a", da LC nº 95/1998).',
    orientacao: 'Substitua por rol taxativo ou explicite o critério geral no texto.',
  },
  {
    idPrefix: 'impreciso-e-ou',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}e/ou${WB_R}`, 'gi'),
    titulo: 'Expressão ambígua "e/ou"',
    explicacao: 'A barra lógica "e/ou" prejudica a clareza jurídica sobre cumulatividade ou alternatividade.',
    orientacao: 'Redija "X, Y, ou ambos" ou desdobre as hipóteses em incisos.',
  },
  {
    idPrefix: 'impreciso-dentre-outros',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}(dentre|entre)\\s+outros${WB_R}`, 'gi'),
    titulo: 'Expressão vaga ("dentre outros / entre outros")',
    explicacao: 'Pode gerar dúvida quanto à natureza exemplificativa ou taxativa da norma.',
    orientacao: 'Se exemplificativo, empregue "inclusive" ou explicite o critério abrangente.',
  },
  {
    idPrefix: 'impreciso-conforme-o-caso',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}conforme\\s+o\\s+caso${WB_R}`, 'gi'),
    titulo: 'Cláusula aberta ("conforme o caso")',
    explicacao: 'Deixa indefinida a condição que aciona cada consequência jurídica.',
    orientacao: 'Especifique objetivamente qual circunstância acarreta cada medida.',
  },
  {
    idPrefix: 'impreciso-atraves-de',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}através\\s+(d[aoe]s?)${WB_R}`, 'gi'),
    titulo: 'Uso impróprio de "através de" para indicar meio',
    explicacao: 'Em redação oficial, "através de" indica travessia física; para instrumento ou meio, emprega-se "por meio de" ou "mediante".',
    orientacao: (m) => `Substitua por "por meio ${m[1]}".`,
    buildSuggestion: (m) => `${preserveCase(m[0].slice(0, 7), 'por meio')} ${m[1]}`,
  },
  {
    idPrefix: 'anglicismo',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(
      `${WB_L}(online|on-line|site|website|e-mail|email|link|feedback|deadline|checklist|workflow|layout|status|compliance|software)${WB_R}`,
      'gi'
    ),
    titulo: 'Estrangeirismo evitável em texto normativo',
    explicacao: (m) => `O Decreto nº 12.002/2024 e o Manual de Redação recomendam substituir o termo estrangeiro "${m[0]}" pelo equivalente em língua portuguesa.`,
    orientacao: (m) => {
      const map: Record<string, string> = {
        online: 'em meio eletrônico',
        'on-line': 'em meio eletrônico',
        site: 'sítio eletrônico',
        website: 'sítio eletrônico',
        'e-mail': 'correio eletrônico',
        email: 'correio eletrônico',
        link: 'endereço eletrônico',
        feedback: 'manifestação / retorno',
        deadline: 'prazo final',
        checklist: 'lista de verificação',
        workflow: 'fluxo de trabalho',
        layout: 'leiaute',
        status: 'situação',
        compliance: 'conformidade / integridade',
        software: 'programa de computador',
      };
      return `Prefira "${map[m[0].toLowerCase()] || 'termo equivalente em português'}".`;
    },
    buildSuggestion: (m) => {
      const map: Record<string, string> = {
        online: 'em meio eletrônico',
        'on-line': 'em meio eletrônico',
        site: 'sítio eletrônico',
        website: 'sítio eletrônico',
        'e-mail': 'correio eletrônico',
        email: 'correio eletrônico',
        link: 'endereço eletrônico',
        deadline: 'prazo final',
        checklist: 'lista de verificação',
        workflow: 'fluxo de trabalho',
        layout: 'leiaute',
        status: 'situação',
        compliance: 'conformidade',
        software: 'programa de computador',
      };
      const rep = map[m[0].toLowerCase()];
      return rep ? preserveCase(m[0], rep) : undefined;
    },
  },
  {
    idPrefix: 'latinismo',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(
      `${WB_L}(supra|retro|in\\s+fine|ab\\s+initio|a\\s+priori|a\\s+posteriori|data\\s+venia|ipsis\\s+litteris|mutatis\\s+mutandis)${WB_R}`,
      'gi'
    ),
    titulo: 'Latinismo evitável em técnica legislativa',
    explicacao: (m) => `Evite expressões em latim ("${m[0]}") na redação de decretos e normas (Art. 11, I, "a", da LC nº 95/1998).`,
    orientacao: 'Remeta expressamente ao dispositivo normativo (artigo, parágrafo ou inciso) ou redija em português claro.',
  },
  {
    idPrefix: 'pleonasmo-obrigatoriamente',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}(deverá|deverão|deve|devem)\\s+obrigatoriamente${WB_R}`, 'gi'),
    titulo: 'Redundância normativa ("deverá obrigatoriamente")',
    explicacao: 'O verbo "dever" já exprime obrigação jurídica; o advérbio "obrigatoriamente" é redundante.',
    orientacao: (m) => `Simplifique para "${m[1]}".`,
    buildSuggestion: (m) => m[1],
  },
  {
    idPrefix: 'pleonasmo-eventualmente',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(`${WB_L}(poderá|poderão|pode|podem)\\s+eventualmente${WB_R}`, 'gi'),
    titulo: 'Redundância ("poderá eventualmente")',
    explicacao: 'O verbo "poder" já traduz faculdade ou eventualidade.',
    orientacao: (m) => `Simplifique para "${m[1]}".`,
    buildSuggestion: (m) => m[1],
  },
  {
    idPrefix: 'pleonasmo-outros',
    categoria: 'linguagem_juridica',
    severidade: 'alerta',
    pattern: new RegExp(
      `${WB_L}(juntamente\\s+com|elo\\s+de\\s+ligação|consenso\\s+geral|ambos\\s+os\\s+dois|enquanto\\s+que|planejar\\s+antecipadamente|prever\\s+antecipadamente)${WB_R}`,
      'gi'
    ),
    titulo: 'Redundância ou pleonasmo vicioso',
    explicacao: (m) => `A construção "${m[0]}" contém redundância dispensável em textos legais concisos.`,
    orientacao: 'Elimine o termo redundante.',
    buildSuggestion: (m) => {
      const lower = m[0].toLowerCase();
      if (lower === 'juntamente com') return preserveCase(m[0], 'com');
      if (lower === 'elo de ligação') return preserveCase(m[0], 'elo');
      if (lower === 'consenso geral') return preserveCase(m[0], 'consenso');
      if (lower === 'ambos os dois') return preserveCase(m[0], 'ambos');
      if (lower === 'enquanto que') return preserveCase(m[0], 'enquanto');
      if (lower === 'planejar antecipadamente') return preserveCase(m[0], 'planejar');
      if (lower === 'prever antecipadamente') return preserveCase(m[0], 'prever');
      return undefined;
    },
  },
  {
    idPrefix: 'primeira-pessoa',
    categoria: 'linguagem_juridica',
    severidade: 'erro',
    onlyInNormative: true,
    pattern: new RegExp(
      `${WB_L}(eu|nós|meu|minha|meus|minhas|nosso|nossa|nossos|nossas|solicito|informo|determino|peço|entendemos|decidimos)${WB_R}`,
      'gi'
    ),
    titulo: 'Uso de 1ª pessoa em dispositivo normativo',
    explicacao: (m) => `Atos normativos devem observar o princípio da impessoalidade; o uso de "${m[0]}" em 1ª pessoa é impróprio.`,
    orientacao: 'Redija na 3ª pessoa ou em voz passiva institucional (ex.: "Compete ao órgão...", "Fica determinado...").',
  },
  {
    idPrefix: 'futuro-preterito-comando',
    categoria: 'linguagem_juridica',
    severidade: 'info',
    onlyInNormative: true,
    pattern: new RegExp(
      `${WB_L}(deveria|deveriam|poderia|poderiam|seria|seriam)${WB_R}`,
      'gi'
    ),
    titulo: 'Verbo no futuro do pretérito em comando normativo',
    explicacao: (m) => `O tempo verbal "${m[0]}" expressa dúvida ou hipótese, inadequado para comandos legais vinculantes (Art. 11, II, LC nº 95/1998).`,
    orientacao: 'Prefira o presente ou futuro do indicativo ("deve", "pode", "é", "deverá", "será").',
  },
];

function buildFieldContexts(doc: NormaDocument): TextFieldContext[] {
  const fields: TextFieldContext[] = [];
  const isTech = isTechnicalOperationalProfile(doc.tipo);
  const progressive = isTech ? computeProgressiveStructure(doc.artigos) : null;

  fields.push({
    fieldKey: 'ementa',
    fieldRef: { kind: 'ementa' },
    fieldLabel: isTech ? 'Objetivo / Escopo' : 'Ementa',
    text: doc.ementa,
    isNormativeDevice: false,
  });

  if (doc.autoridade.trim()) {
    fields.push({
      fieldKey: 'autoridade',
      fieldRef: { kind: 'autoridade' },
      fieldLabel: isTech ? 'Responsável Técnico' : 'Autoridade Signatária',
      text: doc.autoridade,
      isNormativeDevice: false,
      skipProperNounCaps: true,
    });
  }

  fields.push({
    fieldKey: 'fundamentoLegal',
    fieldRef: { kind: 'fundamentoLegal' },
    fieldLabel: isTech
      ? 'Normas e Documentos de Referência'
      : 'Preâmbulo / Fundamento Legal',
    text: doc.fundamentoLegal,
    isNormativeDevice: false,
  });

  doc.artigos.forEach((art, aIdx) => {
    const prog = progressive ? progressive[aIdx] : null;
    const artLabel = isTech && prog
      ? `Item ${prog.itemLabel.replace(/\.$/, '')}`
      : formatArtigoNumero(aIdx + 1, art.sufixo);

    if (art.titulo) {
      fields.push({
        fieldKey: `titulo:${art.id}`,
        fieldRef: { kind: 'titulo', artigoId: art.id },
        fieldLabel: `${isTech ? 'Seção Principal' : 'Título'} (${artLabel})`,
        text: art.titulo,
        isNormativeDevice: false,
        isUpperHeading: true,
      });
    }

    if (art.capitulo) {
      fields.push({
        fieldKey: `capitulo:${art.id}`,
        fieldRef: { kind: 'capitulo', artigoId: art.id },
        fieldLabel: `${isTech ? 'Seção' : 'Capítulo'} (${artLabel})`,
        text: art.capitulo,
        isNormativeDevice: false,
        isUpperHeading: true,
      });
    }

    if (art.secao) {
      fields.push({
        fieldKey: `secao:${art.id}`,
        fieldRef: { kind: 'secao', artigoId: art.id },
        fieldLabel: `${isTech ? 'Subseção' : 'Seção'} (${artLabel})`,
        text: art.secao,
        isNormativeDevice: false,
        isUpperHeading: true,
      });
    }

    if (art.subsecao) {
      fields.push({
        fieldKey: `subsecao:${art.id}`,
        fieldRef: { kind: 'subsecao', artigoId: art.id },
        fieldLabel: `${isTech ? 'Tópico' : 'Subseção'} (${artLabel})`,
        text: art.subsecao,
        isNormativeDevice: false,
        isUpperHeading: true,
      });
    }

    fields.push({
      fieldKey: `caput:${art.id}`,
      fieldRef: { kind: 'caput', artigoId: art.id },
      fieldLabel: isTech ? artLabel : `${artLabel} (caput)`,
      text: art.caput,
      isNormativeDevice: true,
    });

    art.incisos.forEach((inc, iIdx) => {
      const roman = isTech ? toLetter(iIdx) : toRoman(iIdx + 1);
      fields.push({
        fieldKey: `inciso:${art.id}:${inc.id}`,
        fieldRef: { kind: 'inciso', artigoId: art.id, incisoId: inc.id },
        fieldLabel: isTech
          ? `${artLabel}, alínea "${roman}"`
          : `${artLabel}, inciso ${roman}`,
        text: inc.texto,
        isNormativeDevice: true,
        isSubItemLowercaseStart: !isTech,
      });

      inc.alineas.forEach((al, alIdx) => {
        const letter = toLetter(alIdx);
        fields.push({
          fieldKey: `alinea:${art.id}:${inc.id}:${al.id}`,
          fieldRef: {
            kind: 'alinea',
            artigoId: art.id,
            incisoId: inc.id,
            alineaId: al.id,
          },
          fieldLabel: isTech
            ? `${artLabel}, alínea "${roman}", subitem ${alIdx + 1}`
            : `${artLabel}, inciso ${roman}, alínea "${letter}"`,
          text: al.texto,
          isNormativeDevice: true,
          isSubItemLowercaseStart: !isTech,
        });
      });
    });

    art.paragrafos.forEach((par, pIdx) => {
      const parLabel = isTech && prog
        ? `Subitem ${prog.subItemLabels[pIdx]}`
        : formatParagrafoNumero(
            pIdx,
            art.paragrafos.length,
            par.sufixo
          );
      const parLabelClean = parLabel.replace(/\.$/, '');
      fields.push({
        fieldKey: `paragrafo:${art.id}:${par.id}`,
        fieldRef: { kind: 'paragrafo', artigoId: art.id, paragrafoId: par.id },
        fieldLabel: isTech ? parLabelClean : `${artLabel}, ${parLabelClean}`,
        text: par.texto,
        isNormativeDevice: true,
      });

      (par.incisos || []).forEach((inc, iIdx) => {
        const roman = isTech ? toLetter(iIdx) : toRoman(iIdx + 1);
        fields.push({
          fieldKey: `par_inciso:${art.id}:${par.id}:${inc.id}`,
          fieldRef: {
            kind: 'paragrafo_inciso',
            artigoId: art.id,
            paragrafoId: par.id,
            incisoId: inc.id,
          },
          fieldLabel: isTech
            ? `${parLabelClean}, alínea "${roman}"`
            : `${artLabel}, ${parLabelClean}, inciso ${roman}`,
          text: inc.texto,
          isNormativeDevice: true,
          isSubItemLowercaseStart: !isTech,
        });

        inc.alineas.forEach((al, alIdx) => {
          const letter = toLetter(alIdx);
          fields.push({
            fieldKey: `par_alinea:${art.id}:${par.id}:${inc.id}:${al.id}`,
            fieldRef: {
              kind: 'paragrafo_alinea',
              artigoId: art.id,
              paragrafoId: par.id,
              incisoId: inc.id,
              alineaId: al.id,
            },
            fieldLabel: isTech
              ? `${parLabelClean}, alínea "${roman}", subitem ${alIdx + 1}`
              : `${artLabel}, ${parLabelClean}, inciso ${roman}, alínea "${letter}"`,
            text: al.texto,
            isNormativeDevice: true,
            isSubItemLowercaseStart: !isTech,
          });
        });
      });
    });
  });

  doc.revogacoes.forEach((rev, rIdx) => {
    fields.push({
      fieldKey: `revogacao:${rIdx}`,
      fieldRef: { kind: 'revogacao', index: rIdx },
      fieldLabel: `Revogação Expressa #${rIdx + 1}`,
      text: rev,
      isNormativeDevice: false,
    });
  });

  if (doc.vigenciaTipo === 'data_certa' && doc.vigenciaData) {
    fields.push({
      fieldKey: 'vigenciaData',
      fieldRef: { kind: 'vigenciaData' },
      fieldLabel: 'Data de Vigência',
      text: doc.vigenciaData,
      isNormativeDevice: false,
    });
  }

  if (doc.localAssinatura.trim()) {
    fields.push({
      fieldKey: 'localAssinatura',
      fieldRef: { kind: 'localAssinatura' },
      fieldLabel: 'Local e Data',
      text: doc.localAssinatura,
      isNormativeDevice: false,
      skipProperNounCaps: true,
    });
  }

  return fields;
}

const PT_SEGMENTER =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('pt-BR', { granularity: 'word' })
    : null;

const LEGAL_ALLOWLIST = new Set([
  'art',
  'arts',
  'inc',
  'par',
  'al',
  'nr',
  'caput',
  'vacatio',
  'legis',
  'lindb',
  'lgpd',
  'anvisa',
  'ibama',
  'conama',
  'inss',
  'fgts',
  'cnpj',
  'cpf',
  'sefaz',
  'icms',
  'iptu',
  'issqn',
  'bndes',
  'sus',
  'sim',
  'api',
  'apis',
  'sei',
  'ldo',
  'loa',
  'ppa',
  'lrf',
  'tce',
  'tcu',
  'stf',
  'stj',
  'considerandos',
  'infralegal',
  'infralegais',
  'interoperabilidade',
  'interoperável',
  'interoperáveis',
  'desburocratização',
  'camaquã',
  'abnt',
  'nbr',
  'iso',
  'pop',
  'pops',
  'epi',
  'epis',
  'checklist',
  'rastreabilidade',
  'higienização',
  'sanitização',
]);

const ENCLITIC_PRONOUNS = new Set([
  'me',
  'te',
  'se',
  'lhe',
  'lhes',
  'nos',
  'vos',
  'o',
  'a',
  'os',
  'as',
  'lo',
  'la',
  'los',
  'las',
  'no',
  'na',
  'nas',
]);

const ROMAN_NUMERAL_REGEX =
  /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

interface WordToken {
  word: string;
  start: number;
  end: number;
}

function tokenizePortugueseWords(text: string): WordToken[] {
  const rawTokens: WordToken[] = [];

  if (PT_SEGMENTER) {
    for (const seg of PT_SEGMENTER.segment(text)) {
      if (!seg.isWordLike) continue;
      rawTokens.push({
        word: seg.segment,
        start: seg.index,
        end: seg.index + seg.segment.length,
      });
    }
  } else {
    const fallbackRegex = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g;
    let m: RegExpExecArray | null;
    while ((m = fallbackRegex.exec(text)) !== null) {
      rawTokens.push({
        word: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // Recompõe palavras hifenizadas (ex.: "aplicar-se", "decreto-lei", "bem-estar")
  const merged: WordToken[] = [];
  for (const tok of rawTokens) {
    const prev = merged[merged.length - 1];
    if (prev && tok.start === prev.end + 1 && text[prev.end] === '-') {
      prev.word = `${prev.word}-${tok.word}`;
      prev.end = tok.end;
    } else {
      merged.push({ ...tok });
    }
  }

  return merged;
}

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 4) return Math.max(m, n);
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
    }
  }
  return dp[m][n];
}

function isAtSentenceStart(text: string, index: number): boolean {
  if (index <= 0) return true;
  const before = text.slice(0, index);
  return /(?:^|[.!?:;\n])\s*["“'(\[]?\s*$/.test(before);
}

function isWordKnownInDictionary(
  token: string,
  spellChecker: PortugueseSpellChecker
): boolean {
  const lower = token.toLowerCase();
  if (LEGAL_ALLOWLIST.has(lower)) return true;
  if (spellChecker.hasWord(token) || spellChecker.hasWord(lower)) return true;

  if (token.includes('-')) {
    const parts = token.split('-').filter(Boolean);
    if (parts.length >= 2) {
      const allPartsValid = parts.every((part, idx) => {
        const pLower = part.toLowerCase();
        if (idx === parts.length - 1 && ENCLITIC_PRONOUNS.has(pLower)) {
          return true;
        }
        if (/^\d+[ºª]?$/.test(part) || /^[A-Za-z]$/.test(part)) {
          return true;
        }
        return (
          LEGAL_ALLOWLIST.has(pLower) ||
          spellChecker.hasWord(part) ||
          spellChecker.hasWord(pLower)
        );
      });
      if (allPartsValid) return true;
    }
  }

  return false;
}

function buildDictionarySuggestions(
  token: string,
  spellChecker: PortugueseSpellChecker
): { alternativas: string[]; bestDistance: number } {
  const lower = token.toLowerCase();
  const rawCandidates: Array<{ word: string; dist: number }> = [];
  const seen = new Set<string>();

  const addCandidate = (cand: string) => {
    const cLower = cand.toLowerCase();
    if (!cand || cLower === lower || seen.has(cLower)) return;
    if (!spellChecker.hasWord(cand) && !spellChecker.hasWord(cLower)) return;
    seen.add(cLower);
    rawCandidates.push({
      word: cLower,
      dist: damerauLevenshtein(lower, cLower),
    });
  };

  // Prefixos reduzidos (ex.: "instituises" -> "institui")
  if (lower.length >= 7) {
    for (let trim = 1; trim <= 3; trim++) {
      const prefix = lower.slice(0, lower.length - trim);
      if (prefix.length >= 5 && spellChecker.hasWord(prefix)) {
        addCandidate(prefix);
      }
    }
  }

  for (const s of spellChecker.suggestWords(lower, 6)) {
    addCandidate(s);
  }

  rawCandidates.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    return a.word.length - b.word.length;
  });

  const bestDistance = rawCandidates[0]?.dist ?? 99;
  const alternativas = rawCandidates
    .slice(0, 5)
    .map((c) => preserveCase(token, c.word));

  return { alternativas, bestDistance };
}

export function isPortugueseErrorFinding(finding: LinguisticFinding): boolean {
  if (finding.categoria === 'ortografia') {
    return !finding.id.includes('-espaco-duplo-');
  }
  return finding.categoria === 'gramatica';
}

export function analyzeTextFieldLinguistics(
  ctx: TextFieldContext,
  ignoredSignatures?: Set<string>,
  spellChecker?: PortugueseSpellChecker | null
): LinguisticFinding[] {
  const raw = ctx.text;
  if (!raw || !raw.trim()) return [];

  const placeholders = getPlaceholderSpans(raw);
  const candidates: LinguisticFinding[] = [];
  const signatureCounts = new Map<string, number>();

  const nextSignature = (ruleKey: string, tokenText: string): string => {
    const base = `${ctx.fieldKey}|${ruleKey}|${tokenText.toLowerCase()}`;
    const occ = (signatureCounts.get(base) || 0) + 1;
    signatureCounts.set(base, occ);
    return `${base}|#${occ}`;
  };

  // 1. Dicionário ortográfico e de acentuação
  ORTHO_WORDS_PATTERN.lastIndex = 0;
  let dictMatch: RegExpExecArray | null;
  while ((dictMatch = ORTHO_WORDS_PATTERN.exec(raw)) !== null) {
    const start = dictMatch.index;
    const end = start + dictMatch[0].length;
    if (overlapsPlaceholder(start, end, placeholders)) continue;

    const entry = ORTHO_MAP.get(dictMatch[0].toLowerCase());
    if (!entry) continue;

    const suggested = preserveCase(dictMatch[0], entry.correct);
    const sig = nextSignature(`ortho-${entry.wrong}`, dictMatch[0]);
    if (ignoredSignatures?.has(sig)) continue;

    candidates.push({
      id: `${ctx.fieldKey}-ortho-${start}`,
      signature: sig,
      fieldKey: ctx.fieldKey,
      fieldRef: ctx.fieldRef,
      fieldLabel: ctx.fieldLabel,
      categoria: 'ortografia',
      severidade: 'erro',
      start,
      end,
      trecho: dictMatch[0],
      titulo: 'Possível erro ortográfico ou de acentuação',
      explicacao:
        entry.reason ||
        `A grafia "${dictMatch[0]}" apresenta desvio ortográfico ou falta de acento/cedilha.`,
      sugestaoTexto: suggested,
      alternativas: [suggested],
      orientacao: `Substitua por "${suggested}".`,
    });
  }

  // 2. Regras baseadas em padrões (ortografia mecânica, gramática, linguagem jurídica)
  for (const rule of PATTERN_RULES) {
    if (rule.onlyInNormative && !ctx.isNormativeDevice) continue;
    if (rule.skipIfUpperHeading && ctx.isUpperHeading) continue;

    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(raw)) !== null) {
      if (!m[0]) break;
      const start = m.index;
      const end = start + m[0].length;
      if (overlapsPlaceholder(start, end, placeholders)) continue;
      if (rule.guard && !rule.guard(m, raw)) continue;

      const sig = nextSignature(rule.idPrefix, m[0]);
      if (ignoredSignatures?.has(sig)) continue;

      const sugestaoTexto = rule.buildSuggestion
        ? rule.buildSuggestion(m, raw)
        : undefined;

      candidates.push({
        id: `${ctx.fieldKey}-${rule.idPrefix}-${start}`,
        signature: sig,
        fieldKey: ctx.fieldKey,
        fieldRef: ctx.fieldRef,
        fieldLabel: ctx.fieldLabel,
        categoria: rule.categoria,
        severidade: rule.severidade,
        start,
        end,
        trecho: m[0],
        titulo: typeof rule.titulo === 'function' ? rule.titulo(m) : rule.titulo,
        explicacao:
          typeof rule.explicacao === 'function'
            ? rule.explicacao(m)
            : rule.explicacao,
        sugestaoTexto,
        orientacao:
          typeof rule.orientacao === 'function'
            ? rule.orientacao(m)
            : rule.orientacao,
      });
    }
  }

  // 3. Incisos e alíneas iniciando com letra maiúscula (Art. 10, II e IV, LC 95/98 — técnica legislativa)
  if (ctx.isSubItemLowercaseStart) {
    const firstWordMatch = raw.match(
      /^\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{2,})/
    );
    if (firstWordMatch && firstWordMatch.index !== undefined) {
      const leadingWs = raw.match(/^\s*/)?.[0].length || 0;
      const word = firstWordMatch[1];
      const afterFirstWord = raw.slice(leadingWs + word.length);
      const startsProperTitlePhrase =
        /^(?:[-–]\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ]|\s+(?:(?:d[aeo]s?|e|ou|em|para|com)\s+){0,2}[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçA-ZÁÉÍÓÚÂÊÔÃÕÇ]{1,})/.test(
          afterFirstWord
        );
      const isProperLikely =
        startsProperTitlePhrase ||
        /^(Brasil|União|Estado|Município|Constituição|Lei|Decreto|Portaria|Secretaria|Ministério|Sistema\s+Único)$/.test(
          word
        );
      if (
        !isProperLikely &&
        !overlapsPlaceholder(leadingWs, leadingWs + word.length, placeholders)
      ) {
        const lowerWord = word.charAt(0).toLowerCase() + word.slice(1);
        const sig = nextSignature('inciso-minuscula', word);
        if (!ignoredSignatures?.has(sig)) {
          candidates.push({
            id: `${ctx.fieldKey}-inciso-minuscula-${leadingWs}`,
            signature: sig,
            fieldKey: ctx.fieldKey,
            fieldRef: ctx.fieldRef,
            fieldLabel: ctx.fieldLabel,
            categoria: 'linguagem_juridica',
            severidade: 'info',
            start: leadingWs,
            end: leadingWs + word.length,
            trecho: word,
            titulo: 'Inciso ou alínea iniciado com letra maiúscula',
            explicacao: `Pela LC nº 95/1998 (Art. 10, II e IV), incisos e alíneas costumam iniciar-se com letra minúscula (salvo nome próprio ou título de documento): "${word}".`,
            sugestaoTexto: lowerWord,
            orientacao: `Se não for nome próprio ou título oficial, prefira inicial minúscula: "${lowerWord}".`,
          });
        }
      }
    }
  }

  // 4. Verificação vocabular completa em Português (Trie pt-BR + Intl.Segmenter)
  if (spellChecker) {
    const tokens = tokenizePortugueseWords(raw);
    for (const tok of tokens) {
      const token = tok.word;
      if (token.length <= 2) continue;
      if (overlapsPlaceholder(tok.start, tok.end, placeholders)) continue;
      if (
        candidates.some((c) => tok.start < c.end && tok.end > c.start)
      ) {
        continue;
      }

      // Ignorar números, códigos, decimais, ordinais e numerais romanos
      if (/^\d+(?:[.,:/-]\d+)*[ºª]?$/.test(token)) continue;
      if (/\d/.test(token)) continue;
      if (
        token === token.toUpperCase() &&
        ROMAN_NUMERAL_REGEX.test(token)
      ) {
        continue;
      }
      // Ignorar siglas curtas/médias puramente maiúsculas sem acento (ex.: LGPD, CNPJ, APIs)
      if (/^[A-Z]{2,6}s?$/.test(token)) continue;
      // Ignorar se não contém letras portuguesas
      if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(token)) continue;

      // Ignorar campos de nomes próprios/locais quando em caixa alta ou título sem acento errado
      if (isWordKnownInDictionary(token, spellChecker)) continue;

      const sentenceStart = isAtSentenceStart(raw, tok.start);
      const isTitleCase =
        /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{2,}$/.test(token);

      if (ctx.skipProperNounCaps && (isTitleCase || token === token.toUpperCase())) {
        continue;
      }

      const { alternativas, bestDistance } = buildDictionarySuggestions(
        token,
        spellChecker
      );

      // Para nomes próprios no meio da frase (Title Case), só aponta se houver
      // correção muito próxima (distância 1, ex.: "Interoperasbilidade" -> "Interoperabilidade")
      if (!ctx.isUpperHeading && !sentenceStart && isTitleCase && bestDistance > 1) {
        continue;
      }

      const sig = nextSignature(`dict-${token.toLowerCase()}`, token);
      if (ignoredSignatures?.has(sig)) continue;

      const autoSugestao =
        bestDistance === 1 && alternativas.length > 0
          ? alternativas[0]
          : undefined;

      candidates.push({
        id: `${ctx.fieldKey}-dict-${tok.start}`,
        signature: sig,
        fieldKey: ctx.fieldKey,
        fieldRef: ctx.fieldRef,
        fieldLabel: ctx.fieldLabel,
        categoria: 'ortografia',
        severidade: 'erro',
        start: tok.start,
        end: tok.end,
        trecho: token,
        titulo: 'Palavra não reconhecida no vocabulário oficial (pt-BR)',
        explicacao: `O termo "${token}" não consta no dicionário de língua portuguesa e pode conter erro de digitação ou grafia.`,
        sugestaoTexto: autoSugestao,
        alternativas: alternativas.length > 0 ? alternativas : undefined,
        orientacao:
          alternativas.length > 0
            ? `Sugestões: ${alternativas.map((a) => `"${a}"`).join(', ')}.`
            : 'Verifique a grafia correta da palavra.',
      });
    }
  }

  // Ordenar e remover sobreposições mantendo a ocorrência mais severa/longa
  const severityWeight = { erro: 3, alerta: 2, info: 1 };
  candidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const sw = severityWeight[b.severidade] - severityWeight[a.severidade];
    if (sw !== 0) return sw;
    return b.end - b.start - (a.end - a.start);
  });

  const nonOverlapping: LinguisticFinding[] = [];
  for (const cand of candidates) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (last && cand.start < last.end) {
      continue;
    }
    nonOverlapping.push(cand);
  }

  return nonOverlapping;
}

export function analyzeNormaLinguistics(
  doc: NormaDocument,
  ignoredSignatures?: Set<string>,
  spellChecker?: PortugueseSpellChecker | null
): LinguisticReviewSummary {
  const contexts = buildFieldContexts(doc);
  const findings: LinguisticFinding[] = [];
  const byField: Record<string, LinguisticFinding[]> = {};

  for (const ctx of contexts) {
    const fieldFindings = analyzeTextFieldLinguistics(
      ctx,
      ignoredSignatures,
      spellChecker
    );
    if (fieldFindings.length > 0) {
      byField[ctx.fieldKey] = fieldFindings;
      findings.push(...fieldFindings);
    }
  }

  return {
    findings,
    byField,
    totalOrtografia: findings.filter((f) => f.categoria === 'ortografia')
      .length,
    totalGramatica: findings.filter((f) => f.categoria === 'gramatica').length,
    totalLinguagemJuridica: findings.filter(
      (f) => f.categoria === 'linguagem_juridica'
    ).length,
    totalAutoCorrigiveis: findings.filter((f) => f.sugestaoTexto !== undefined)
      .length,
  };
}

function buildAlteracaoFieldContexts(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): TextFieldContext[] {
  const fields: TextFieldContext[] = [];

  fields.push({
    fieldKey: 'alt_normaAlvoNome',
    fieldRef: { kind: 'alt_normaAlvoNome' },
    fieldLabel: 'Norma Alvo',
    text: meta.normaAlvoNome,
    isNormativeDevice: false,
  });

  fields.push({
    fieldKey: 'alt_normaAlvoEmentaResumo',
    fieldRef: { kind: 'alt_normaAlvoEmentaResumo' },
    fieldLabel: 'Complemento da Ementa',
    text: meta.normaAlvoEmentaResumo,
    isNormativeDevice: false,
  });

  fields.push({
    fieldKey: 'alt_autoridade',
    fieldRef: { kind: 'alt_autoridade' },
    fieldLabel: 'Autoridade',
    text: meta.autoridade,
    isNormativeDevice: false,
    skipProperNounCaps: true,
  });

  fields.push({
    fieldKey: 'alt_vigenciaTexto',
    fieldRef: { kind: 'alt_vigenciaTexto' },
    fieldLabel: 'Cláusula de Vigência',
    text: meta.vigenciaTexto,
    isNormativeDevice: true,
  });

  alteracoes.forEach((item, idx) => {
    const labelBase = `Ajuste #${idx + 1} (${item.dispositivoAlvo || 'Dispositivo'})`;

    if (item.tipoAcao !== 'acrescer' && item.textoOriginal.trim()) {
      fields.push({
        fieldKey: `alt_textoOriginal:${item.id}`,
        fieldRef: { kind: 'alt_textoOriginal', itemId: item.id },
        fieldLabel: `${labelBase} — Redação Vigente`,
        text: item.textoOriginal,
        isNormativeDevice: false,
      });
    }

    if (item.tipoAcao !== 'revogar' && item.textoNovo.trim()) {
      fields.push({
        fieldKey: `alt_textoNovo:${item.id}`,
        fieldRef: { kind: 'alt_textoNovo', itemId: item.id },
        fieldLabel: `${labelBase} — Nova Redação Proposta`,
        text: item.textoNovo,
        isNormativeDevice: true,
      });
    }

    if (item.justificativa.trim()) {
      fields.push({
        fieldKey: `alt_justificativa:${item.id}`,
        fieldRef: { kind: 'alt_justificativa', itemId: item.id },
        fieldLabel: `${labelBase} — Justificativa Técnica`,
        text: item.justificativa,
        isNormativeDevice: false,
      });
    }
  });

  return fields;
}

export function analyzeAlteracaoLinguistics(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[],
  ignoredSignatures?: Set<string>,
  spellChecker?: PortugueseSpellChecker | null
): LinguisticReviewSummary {
  const contexts = buildAlteracaoFieldContexts(meta, alteracoes);
  const findings: LinguisticFinding[] = [];
  const byField: Record<string, LinguisticFinding[]> = {};

  for (const ctx of contexts) {
    const fieldFindings = analyzeTextFieldLinguistics(
      ctx,
      ignoredSignatures,
      spellChecker
    );
    if (fieldFindings.length > 0) {
      byField[ctx.fieldKey] = fieldFindings;
      findings.push(...fieldFindings);
    }
  }

  return {
    findings,
    byField,
    totalOrtografia: findings.filter((f) => f.categoria === 'ortografia')
      .length,
    totalGramatica: findings.filter((f) => f.categoria === 'gramatica').length,
    totalLinguagemJuridica: findings.filter(
      (f) => f.categoria === 'linguagem_juridica'
    ).length,
    totalAutoCorrigiveis: findings.filter((f) => f.sugestaoTexto !== undefined)
      .length,
  };
}

function getFieldText(doc: NormaDocument, ref: LinguisticFieldRef): string {
  switch (ref.kind) {
    case 'ementa':
      return doc.ementa;
    case 'fundamentoLegal':
      return doc.fundamentoLegal;
    case 'autoridade':
      return doc.autoridade;
    case 'vigenciaData':
      return doc.vigenciaData;
    case 'localAssinatura':
      return doc.localAssinatura;
    case 'revogacao':
      return doc.revogacoes[ref.index] ?? '';
    case 'titulo':
      return doc.artigos.find((a) => a.id === ref.artigoId)?.titulo ?? '';
    case 'capitulo':
      return doc.artigos.find((a) => a.id === ref.artigoId)?.capitulo ?? '';
    case 'secao':
      return doc.artigos.find((a) => a.id === ref.artigoId)?.secao ?? '';
    case 'subsecao':
      return doc.artigos.find((a) => a.id === ref.artigoId)?.subsecao ?? '';
    case 'caput':
      return doc.artigos.find((a) => a.id === ref.artigoId)?.caput ?? '';
    case 'inciso':
      return (
        doc.artigos
          .find((a) => a.id === ref.artigoId)
          ?.incisos.find((i) => i.id === ref.incisoId)?.texto ?? ''
      );
    case 'alinea':
      return (
        doc.artigos
          .find((a) => a.id === ref.artigoId)
          ?.incisos.find((i) => i.id === ref.incisoId)
          ?.alineas.find((al) => al.id === ref.alineaId)?.texto ?? ''
      );
    case 'paragrafo':
      return (
        doc.artigos
          .find((a) => a.id === ref.artigoId)
          ?.paragrafos.find((p) => p.id === ref.paragrafoId)?.texto ?? ''
      );
    case 'paragrafo_inciso':
      return (
        doc.artigos
          .find((a) => a.id === ref.artigoId)
          ?.paragrafos.find((p) => p.id === ref.paragrafoId)
          ?.incisos?.find((i) => i.id === ref.incisoId)?.texto ?? ''
      );
    case 'paragrafo_alinea':
      return (
        doc.artigos
          .find((a) => a.id === ref.artigoId)
          ?.paragrafos.find((p) => p.id === ref.paragrafoId)
          ?.incisos?.find((i) => i.id === ref.incisoId)
          ?.alineas.find((al) => al.id === ref.alineaId)?.texto ?? ''
      );
    default:
      return '';
  }
}

function setFieldText(
  doc: NormaDocument,
  ref: LinguisticFieldRef,
  nextValue: string
): NormaDocument {
  const stamp = new Date().toISOString();
  switch (ref.kind) {
    case 'ementa':
      return { ...doc, ementa: nextValue, updatedAt: stamp };
    case 'fundamentoLegal':
      return { ...doc, fundamentoLegal: nextValue, updatedAt: stamp };
    case 'autoridade':
      return { ...doc, autoridade: nextValue, updatedAt: stamp };
    case 'vigenciaData':
      return { ...doc, vigenciaData: nextValue, updatedAt: stamp };
    case 'localAssinatura':
      return { ...doc, localAssinatura: nextValue, updatedAt: stamp };
    case 'revogacao':
      return {
        ...doc,
        revogacoes: doc.revogacoes.map((r, idx) =>
          idx === ref.index ? nextValue : r
        ),
        updatedAt: stamp,
      };
    case 'titulo':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId ? { ...a, titulo: nextValue } : a
        ),
        updatedAt: stamp,
      };
    case 'capitulo':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId ? { ...a, capitulo: nextValue } : a
        ),
        updatedAt: stamp,
      };
    case 'secao':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId ? { ...a, secao: nextValue } : a
        ),
        updatedAt: stamp,
      };
    case 'subsecao':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId ? { ...a, subsecao: nextValue } : a
        ),
        updatedAt: stamp,
      };
    case 'caput':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId ? { ...a, caput: nextValue } : a
        ),
        updatedAt: stamp,
      };
    case 'inciso':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId
            ? {
                ...a,
                incisos: a.incisos.map((i) =>
                  i.id === ref.incisoId ? { ...i, texto: nextValue } : i
                ),
              }
            : a
        ),
        updatedAt: stamp,
      };
    case 'alinea':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId
            ? {
                ...a,
                incisos: a.incisos.map((i) =>
                  i.id === ref.incisoId
                    ? {
                        ...i,
                        alineas: i.alineas.map((al) =>
                          al.id === ref.alineaId
                            ? { ...al, texto: nextValue }
                            : al
                        ),
                      }
                    : i
                ),
              }
            : a
        ),
        updatedAt: stamp,
      };
    case 'paragrafo':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId
            ? {
                ...a,
                paragrafos: a.paragrafos.map((p) =>
                  p.id === ref.paragrafoId ? { ...p, texto: nextValue } : p
                ),
              }
            : a
        ),
        updatedAt: stamp,
      };
    case 'paragrafo_inciso':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId
            ? {
                ...a,
                paragrafos: a.paragrafos.map((p) =>
                  p.id === ref.paragrafoId
                    ? {
                        ...p,
                        incisos: (p.incisos || []).map((i) =>
                          i.id === ref.incisoId ? { ...i, texto: nextValue } : i
                        ),
                      }
                    : p
                ),
              }
            : a
        ),
        updatedAt: stamp,
      };
    case 'paragrafo_alinea':
      return {
        ...doc,
        artigos: doc.artigos.map((a) =>
          a.id === ref.artigoId
            ? {
                ...a,
                paragrafos: a.paragrafos.map((p) =>
                  p.id === ref.paragrafoId
                    ? {
                        ...p,
                        incisos: (p.incisos || []).map((i) =>
                          i.id === ref.incisoId
                            ? {
                                ...i,
                                alineas: i.alineas.map((al) =>
                                  al.id === ref.alineaId
                                    ? { ...al, texto: nextValue }
                                    : al
                                ),
                              }
                            : i
                        ),
                      }
                    : p
                ),
              }
            : a
        ),
        updatedAt: stamp,
      };
    default:
      return doc;
  }
}

export function applyLinguisticFixToDoc(
  doc: NormaDocument,
  finding: LinguisticFinding,
  replacementOverride?: string
): NormaDocument {
  const replacement = replacementOverride ?? finding.sugestaoTexto;
  if (replacement === undefined) return doc;
  const current = getFieldText(doc, finding.fieldRef);
  if (current.slice(finding.start, finding.end) !== finding.trecho) {
    return doc;
  }
  const updated =
    current.slice(0, finding.start) + replacement + current.slice(finding.end);
  return setFieldText(doc, finding.fieldRef, updated);
}

export function applyAllAutoFixesToDoc(
  doc: NormaDocument,
  findings: LinguisticFinding[]
): NormaDocument {
  const fixable = findings.filter((f) => f.sugestaoTexto !== undefined);
  if (fixable.length === 0) return doc;

  const grouped = new Map<string, LinguisticFinding[]>();
  for (const f of fixable) {
    const list = grouped.get(f.fieldKey) || [];
    list.push(f);
    grouped.set(f.fieldKey, list);
  }

  let nextDoc = doc;
  for (const list of grouped.values()) {
    const ref = list[0].fieldRef;
    let text = getFieldText(nextDoc, ref);
    const sorted = [...list].sort((a, b) => b.start - a.start);
    for (const item of sorted) {
      if (
        item.sugestaoTexto !== undefined &&
        text.slice(item.start, item.end) === item.trecho
      ) {
        text =
          text.slice(0, item.start) +
          item.sugestaoTexto +
          text.slice(item.end);
      }
    }
    nextDoc = setFieldText(nextDoc, ref, text);
  }

  return nextDoc;
}

function getAlteracaoFieldText(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[],
  ref: LinguisticFieldRef
): string {
  switch (ref.kind) {
    case 'alt_normaAlvoNome':
      return meta.normaAlvoNome;
    case 'alt_normaAlvoEmentaResumo':
      return meta.normaAlvoEmentaResumo;
    case 'alt_autoridade':
      return meta.autoridade;
    case 'alt_fundamentoLegal':
      return meta.fundamentoLegal;
    case 'alt_vigenciaTexto':
      return meta.vigenciaTexto;
    case 'alt_dispositivoAlvo':
      return alteracoes.find((a) => a.id === ref.itemId)?.dispositivoAlvo ?? '';
    case 'alt_textoOriginal':
      return alteracoes.find((a) => a.id === ref.itemId)?.textoOriginal ?? '';
    case 'alt_textoNovo':
      return alteracoes.find((a) => a.id === ref.itemId)?.textoNovo ?? '';
    case 'alt_justificativa':
      return alteracoes.find((a) => a.id === ref.itemId)?.justificativa ?? '';
    default:
      return '';
  }
}

function setAlteracaoFieldText(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[],
  ref: LinguisticFieldRef,
  nextValue: string
): { meta: AlteracaoMetadata; alteracoes: AlteracaoDispositivo[] } {
  switch (ref.kind) {
    case 'alt_normaAlvoNome':
      return { meta: { ...meta, normaAlvoNome: nextValue }, alteracoes };
    case 'alt_normaAlvoEmentaResumo':
      return {
        meta: { ...meta, normaAlvoEmentaResumo: nextValue },
        alteracoes,
      };
    case 'alt_autoridade':
      return { meta: { ...meta, autoridade: nextValue }, alteracoes };
    case 'alt_fundamentoLegal':
      return { meta: { ...meta, fundamentoLegal: nextValue }, alteracoes };
    case 'alt_vigenciaTexto':
      return { meta: { ...meta, vigenciaTexto: nextValue }, alteracoes };
    case 'alt_dispositivoAlvo':
      return {
        meta,
        alteracoes: alteracoes.map((a) =>
          a.id === ref.itemId ? { ...a, dispositivoAlvo: nextValue } : a
        ),
      };
    case 'alt_textoOriginal':
      return {
        meta,
        alteracoes: alteracoes.map((a) =>
          a.id === ref.itemId ? { ...a, textoOriginal: nextValue } : a
        ),
      };
    case 'alt_textoNovo':
      return {
        meta,
        alteracoes: alteracoes.map((a) =>
          a.id === ref.itemId ? { ...a, textoNovo: nextValue } : a
        ),
      };
    case 'alt_justificativa':
      return {
        meta,
        alteracoes: alteracoes.map((a) =>
          a.id === ref.itemId ? { ...a, justificativa: nextValue } : a
        ),
      };
    default:
      return { meta, alteracoes };
  }
}

export function applyLinguisticFixToAlteracao(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[],
  finding: LinguisticFinding,
  replacementOverride?: string
): { meta: AlteracaoMetadata; alteracoes: AlteracaoDispositivo[] } {
  const replacement = replacementOverride ?? finding.sugestaoTexto;
  if (replacement === undefined) return { meta, alteracoes };
  const current = getAlteracaoFieldText(meta, alteracoes, finding.fieldRef);
  if (current.slice(finding.start, finding.end) !== finding.trecho) {
    return { meta, alteracoes };
  }
  const updated =
    current.slice(0, finding.start) + replacement + current.slice(finding.end);
  return setAlteracaoFieldText(meta, alteracoes, finding.fieldRef, updated);
}

export function applyAllAutoFixesToAlteracao(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[],
  findings: LinguisticFinding[]
): { meta: AlteracaoMetadata; alteracoes: AlteracaoDispositivo[] } {
  const fixable = findings.filter((f) => f.sugestaoTexto !== undefined);
  if (fixable.length === 0) return { meta, alteracoes };

  const grouped = new Map<string, LinguisticFinding[]>();
  for (const f of fixable) {
    const list = grouped.get(f.fieldKey) || [];
    list.push(f);
    grouped.set(f.fieldKey, list);
  }

  let nextMeta = meta;
  let nextAlteracoes = alteracoes;

  for (const list of grouped.values()) {
    const ref = list[0].fieldRef;
    let text = getAlteracaoFieldText(nextMeta, nextAlteracoes, ref);
    const sorted = [...list].sort((a, b) => b.start - a.start);
    for (const item of sorted) {
      if (
        item.sugestaoTexto !== undefined &&
        text.slice(item.start, item.end) === item.trecho
      ) {
        text =
          text.slice(0, item.start) +
          item.sugestaoTexto +
          text.slice(item.end);
      }
    }
    const updated = setAlteracaoFieldText(nextMeta, nextAlteracoes, ref, text);
    nextMeta = updated.meta;
    nextAlteracoes = updated.alteracoes;
  }

  return { meta: nextMeta, alteracoes: nextAlteracoes };
}

