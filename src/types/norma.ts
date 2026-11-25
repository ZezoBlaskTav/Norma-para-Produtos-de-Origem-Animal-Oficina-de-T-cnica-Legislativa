export type NormaTipo =
  | 'Lei'
  | 'Lei Complementar'
  | 'Projeto de Lei'
  | 'Decreto'
  | 'Resolução'
  | 'Instrução Normativa'
  | 'Portaria'
  | 'Deliberação'
  | 'Regimento Interno'
  | 'Estatuto'
  | 'Norma Interna'
  | 'Ordem de Serviço'
  | 'Instrução de Trabalho'
  | 'Procedimento Operacional Padrão';

export type VigenciaTipo = 'imediata' | 'dias' | 'data_certa';

export interface AlineaItem {
  id: string;
  texto: string;
}

export interface IncisoItem {
  id: string;
  texto: string;
  alineas: AlineaItem[];
}

export interface ParagrafoItem {
  id: string;
  texto: string;
  sufixo?: string;
  incisos?: IncisoItem[];
}

export interface ArtigoItem {
  id: string;
  titulo?: string;
  capitulo?: string;
  secao?: string;
  subsecao?: string;
  caput: string;
  sufixo?: string;
  paragrafos: ParagrafoItem[];
  incisos: IncisoItem[];
}

export type NormaImagemPosicao = 'cabecalho' | 'pos_artigo' | 'anexo';

export type NormaImagemAlinhamento = 'left' | 'center' | 'right';

export interface NormaImagemItem {
  id: string;
  titulo: string;
  legenda: string;
  dataUrl: string;
  mimeType: 'image/png' | 'image/jpeg';
  widthPx: number;
  heightPx: number;
  larguraMm: number;
  alinhamento: NormaImagemAlinhamento;
  posicao: NormaImagemPosicao;
  artigoId?: string;
}

export interface NormaDocument {
  id: string;
  tipo: NormaTipo;
  numero: string;
  data: string;
  esfera: string;
  autoridade: string;
  fundamentoLegal: string;
  ementa: string;
  ordemExecucao: string;
  artigos: ArtigoItem[];
  vigenciaTipo: VigenciaTipo;
  vigenciaDias: number;
  vigenciaData: string;
  revogacoes: string[];
  localAssinatura: string;
  assinante: string;
  cargoAssinante: string;
  imagens?: NormaImagemItem[];
  observacoes?: string;
  updatedAt: string;
}

export type NormaRevisionOrigin = 'manual' | 'salvamento' | 'restauracao';

export interface NormaRevision {
  id: string;
  normaId: string;
  numeroRevisao: number;
  titulo: string;
  observacao: string;
  autorNome: string;
  autorEmail: string;
  origem: NormaRevisionOrigin;
  signature: string;
  resumoAlteracoes: string;
  docSnapshot: NormaDocument;
  createdAtIso: string;
  updatedAtIso?: string;
}

export type TipoAcaoAlteracao = 'alterar' | 'acrescer' | 'revogar';

export interface AlteracaoDispositivo {
  id: string;
  tipoAcao: TipoAcaoAlteracao;
  dispositivoAlvo: string;
  textoOriginal: string;
  textoNovo: string;
  incluirPontilhadoAntes: boolean;
  incluirPontilhadoDepois: boolean;
  justificativa: string;
}

export interface AlteracaoMetadata {
  atoAlteradorTipo: NormaTipo;
  atoAlteradorNumero: string;
  atoAlteradorData: string;
  normaAlvoNome: string;
  normaAlvoEmentaResumo: string;
  autoridade: string;
  fundamentoLegal: string;
  ordemExecucao: string;
  vigenciaTexto: string;
  localAssinatura: string;
  assinante: string;
  cargoAssinante: string;
}

export type AuditSeverity = 'erro' | 'alerta' | 'info';

export interface AuditFinding {
  id: string;
  severidade: AuditSeverity;
  regra: string;
  local: string;
  descricao: string;
  sugestao: string;
}

export interface AuditSummary {
  findings: AuditFinding[];
  totalArtigos: number;
  totalPalavras: number;
  erros: number;
  alertas: number;
  conformes: string[];
}

export type LinguisticCategory =
  | 'ortografia'
  | 'gramatica'
  | 'linguagem_juridica';

export type LinguisticFieldRef =
  | { kind: 'ementa' }
  | { kind: 'fundamentoLegal' }
  | { kind: 'autoridade' }
  | { kind: 'titulo'; artigoId: string }
  | { kind: 'capitulo'; artigoId: string }
  | { kind: 'secao'; artigoId: string }
  | { kind: 'subsecao'; artigoId: string }
  | { kind: 'caput'; artigoId: string }
  | { kind: 'inciso'; artigoId: string; incisoId: string }
  | { kind: 'alinea'; artigoId: string; incisoId: string; alineaId: string }
  | { kind: 'paragrafo'; artigoId: string; paragrafoId: string }
  | {
      kind: 'paragrafo_inciso';
      artigoId: string;
      paragrafoId: string;
      incisoId: string;
    }
  | {
      kind: 'paragrafo_alinea';
      artigoId: string;
      paragrafoId: string;
      incisoId: string;
      alineaId: string;
    }
  | { kind: 'revogacao'; index: number }
  | { kind: 'vigenciaData' }
  | { kind: 'localAssinatura' }
  | { kind: 'alt_normaAlvoNome' }
  | { kind: 'alt_normaAlvoEmentaResumo' }
  | { kind: 'alt_autoridade' }
  | { kind: 'alt_fundamentoLegal' }
  | { kind: 'alt_vigenciaTexto' }
  | { kind: 'alt_dispositivoAlvo'; itemId: string }
  | { kind: 'alt_textoOriginal'; itemId: string }
  | { kind: 'alt_textoNovo'; itemId: string }
  | { kind: 'alt_justificativa'; itemId: string };

export interface LinguisticFinding {
  id: string;
  signature: string;
  fieldKey: string;
  fieldRef: LinguisticFieldRef;
  fieldLabel: string;
  categoria: LinguisticCategory;
  severidade: AuditSeverity;
  start: number;
  end: number;
  trecho: string;
  titulo: string;
  explicacao: string;
  sugestaoTexto?: string;
  alternativas?: string[];
  orientacao: string;
}

export interface LinguisticReviewSummary {
  findings: LinguisticFinding[];
  byField: Record<string, LinguisticFinding[]>;
  totalOrtografia: number;
  totalGramatica: number;
  totalLinguagemJuridica: number;
  totalAutoCorrigiveis: number;
}

