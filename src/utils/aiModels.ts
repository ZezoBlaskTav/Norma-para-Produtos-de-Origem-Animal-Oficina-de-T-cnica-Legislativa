export type SelectableAiModelPresetId =
  | 'flash-lite'
  | 'flash-padrao'
  | 'flash-profundo';

export type AiModelPresetId =
  | SelectableAiModelPresetId
  | 'pro-neon'
  | 'carbon-deep';

export interface AiModelOptionSpec {
  id: AiModelPresetId;
  modelApiId: string;
  nome: string;
  subtitulo: string;
  categoriaTag: string;
  complexidadeLabel: string;
  complexidadeNivel: 1 | 2 | 3 | 4 | 5;
  custoEstimadoLabel: string;
  velocidadeLabel: string;
  descricao: string;
  recomendadoPara: string;
  disponivelNoPlanoAtual: boolean;
  motivoIndisponibilidade?: string;
}

export const DEFAULT_AI_MODEL_EMENTA: SelectableAiModelPresetId = 'flash-padrao';
export const DEFAULT_AI_MODEL_AUDITORIA: SelectableAiModelPresetId =
  'flash-profundo';

export const SELECTABLE_AI_MODEL_IDS: SelectableAiModelPresetId[] = [
  'flash-lite',
  'flash-padrao',
  'flash-profundo',
];

export const AI_MODEL_CATALOG: AiModelOptionSpec[] = [
  {
    id: 'flash-lite',
    modelApiId: 'gemini-3.1-flash-lite',
    nome: 'Gemini 3.1 Flash Lite',
    subtitulo: 'Econômico e instantâneo',
    categoriaTag: 'Econômico',
    complexidadeLabel: 'Baixa',
    complexidadeNivel: 1,
    custoEstimadoLabel: 'Muito baixo · Nível gratuito',
    velocidadeLabel: 'Ultra-rápido',
    descricao:
      'Menor latência e consumo mínimo de tokens, focado em síntese direta sem raciocínio estendido.',
    recomendadoPara: 'Portarias curtas, avisos simples e triagem rápida.',
    disponivelNoPlanoAtual: true,
  },
  {
    id: 'flash-padrao',
    modelApiId: 'gemini-4-hydrogen',
    nome: 'Gemini 4 Flash (Hydrogen)',
    subtitulo: 'Equilíbrio diário recomendado',
    categoriaTag: 'Padrão',
    complexidadeLabel: 'Média',
    complexidadeNivel: 2,
    custoEstimadoLabel: 'Baixo · Nível gratuito',
    velocidadeLabel: 'Rápido',
    descricao:
      'Combina agilidade com precisão jurídica na aplicação da LC nº 95/1998 e do Decreto nº 12.002/2024.',
    recomendadoPara: 'Ementas de decretos, resoluções, leis e IT/POP.',
    disponivelNoPlanoAtual: true,
  },
  {
    id: 'flash-profundo',
    modelApiId: 'gemini-4-hydrogen',
    nome: 'Gemini 4 Flash · Análise Profunda',
    subtitulo: 'Raciocínio estendido no plano gratuito',
    categoriaTag: 'Avançado',
    complexidadeLabel: 'Alta (Raciocínio estendido)',
    complexidadeNivel: 3,
    custoEstimadoLabel: 'Moderado em tokens · Nível gratuito',
    velocidadeLabel: 'Analítico',
    descricao:
      'Ativa nível máximo de raciocínio do Gemini 4 Flash para correlacionar múltiplos capítulos, remissões e revogações.',
    recomendadoPara:
      'Auditoria normativa detalhada, regimentos internos e leis extensas.',
    disponivelNoPlanoAtual: true,
  },
  {
    id: 'pro-neon',
    modelApiId: 'gemini-4-neon',
    nome: 'Gemini 4 Pro (Neon)',
    subtitulo: 'Alta capacidade contextual',
    categoriaTag: 'Plano Pago',
    complexidadeLabel: 'Muito Alta',
    complexidadeNivel: 4,
    custoEstimadoLabel: 'Alto · Requer chave com faturamento',
    velocidadeLabel: 'Detalhado',
    descricao:
      'Modelo Pro especializado em raciocínio jurídico complexo e interpretação sistêmica de textos extensos.',
    recomendadoPara: 'Códigos municipais, estatutos e reformas amplas.',
    disponivelNoPlanoAtual: false,
    motivoIndisponibilidade:
      'Exige chave Gemini com faturamento ativo (Settings > Secrets).',
  },
  {
    id: 'carbon-deep',
    modelApiId: 'gemini-4-carbon',
    nome: 'Gemini 4 Carbon',
    subtitulo: 'Profundidade analítica máxima',
    categoriaTag: 'Plano Pago',
    complexidadeLabel: 'Máxima',
    complexidadeNivel: 5,
    custoEstimadoLabel: 'Premium · Requer chave com faturamento',
    velocidadeLabel: 'Profundo',
    descricao:
      'Maior profundidade de raciocínio para auditoria jurídica crítica, antinomias e técnica legislativa avançada.',
    recomendadoPara: 'Revisão final de projetos de lei estruturantes.',
    disponivelNoPlanoAtual: false,
    motivoIndisponibilidade:
      'Exige chave Gemini com faturamento ativo (Settings > Secrets).',
  },
];

export function normalizeSelectableAiPreset(
  raw: unknown,
  fallback: SelectableAiModelPresetId
): SelectableAiModelPresetId {
  if (
    typeof raw === 'string' &&
    (SELECTABLE_AI_MODEL_IDS as string[]).includes(raw)
  ) {
    return raw as SelectableAiModelPresetId;
  }
  return fallback;
}

export function getAiModelSpec(id: AiModelPresetId): AiModelOptionSpec {
  return (
    AI_MODEL_CATALOG.find((item) => item.id === id) ||
    AI_MODEL_CATALOG.find((item) => item.id === DEFAULT_AI_MODEL_EMENTA)!
  );
}
