import { AuditSeverity, NormaTipo } from '../types/norma';
import {
  DEFAULT_AI_MODEL_AUDITORIA,
  SelectableAiModelPresetId,
} from './aiModels';
import { auth } from './googleAuth';

export interface AiAuditFindingItem {
  severidade: AuditSeverity;
  regra: string;
  local: string;
  descricao: string;
  sugestao: string;
}

export interface AiAuditResult {
  resumoGeral: string;
  pontuacaoConformidade: number;
  apontamentos: AiAuditFindingItem[];
  pontosPositivos: string[];
  modeloUtilizado: string;
}

export async function requestAiNormaAudit(
  texto: string,
  tipo?: NormaTipo,
  modelPreset: SelectableAiModelPresetId = DEFAULT_AI_MODEL_AUDITORIA,
  signal?: AbortSignal
): Promise<AiAuditResult> {
  const cleaned = texto.trim();
  if (cleaned.length < 10) {
    throw new Error(
      'Informe um texto normativo mínimo antes de executar a auditoria com IA.'
    );
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Faça login para utilizar a auditoria normativa com IA.');
  }

  const idToken = await currentUser.getIdToken();
  if (!idToken) {
    throw new Error('Não foi possível obter sua credencial de sessão.');
  }

  const response = await fetch('/api/auditoria/analisar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      texto: cleaned,
      ...(tipo ? { tipo } : {}),
      modelPreset,
    }),
    signal,
  });

  let data: Partial<AiAuditResult> & { error?: string } = {};
  try {
    data = (await response.json()) as Partial<AiAuditResult> & {
      error?: string;
    };
  } catch {
    // Resposta não JSON
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
        `Erro ao consultar a auditoria com IA (HTTP ${response.status}).`
    );
  }

  if (typeof data.resumoGeral !== 'string' || !data.resumoGeral.trim()) {
    throw new Error('A auditoria com IA não retornou um resumo válido.');
  }

  return {
    resumoGeral: data.resumoGeral,
    pontuacaoConformidade:
      typeof data.pontuacaoConformidade === 'number'
        ? Math.max(0, Math.min(100, Math.round(data.pontuacaoConformidade)))
        : 0,
    apontamentos: Array.isArray(data.apontamentos) ? data.apontamentos : [],
    pontosPositivos: Array.isArray(data.pontosPositivos)
      ? data.pontosPositivos
      : [],
    modeloUtilizado:
      typeof data.modeloUtilizado === 'string' ? data.modeloUtilizado : '',
  };
}
