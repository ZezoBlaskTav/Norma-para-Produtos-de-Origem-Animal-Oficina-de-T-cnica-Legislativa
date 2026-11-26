import { NormaDocument } from '../types/norma';
import {
  DEFAULT_AI_MODEL_EMENTA,
  SelectableAiModelPresetId,
} from './aiModels';
import { auth } from './googleAuth';

export interface EmentaSuggestionResult {
  ementaSugerida: string;
  alternativas: string[];
  objetosIdentificados: string[];
  observacaoLegistica: string;
  modeloUtilizado?: string;
}

export function hasEmentaAnalysisContent(doc: NormaDocument): boolean {
  return doc.artigos.some(
    (art) =>
      art.caput.trim().length > 0 ||
      art.paragrafos.some((p) => p.texto.trim().length > 0) ||
      art.incisos.some(
        (inc) =>
          inc.texto.trim().length > 0 ||
          inc.alineas.some((al) => al.texto.trim().length > 0)
      )
  );
}

export async function requestEmentaSuggestion(
  doc: NormaDocument,
  modelPreset: SelectableAiModelPresetId = DEFAULT_AI_MODEL_EMENTA,
  signal?: AbortSignal
): Promise<EmentaSuggestionResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Faça login para utilizar o assistente de ementa com IA.');
  }

  const idToken = await currentUser.getIdToken();
  if (!idToken) {
    throw new Error('Não foi possível obter sua credencial de sessão.');
  }

  const payload = {
    modelPreset,
    tipo: doc.tipo,
    numero: doc.numero,
    esfera: doc.esfera,
    autoridade: doc.autoridade,
    fundamentoLegal: doc.fundamentoLegal,
    ementaAtual: doc.ementa,
    revogacoes: doc.revogacoes,
    artigos: doc.artigos.map((art) => ({
      titulo: art.titulo || '',
      capitulo: art.capitulo || '',
      secao: art.secao || '',
      subsecao: art.subsecao || '',
      caput: art.caput || '',
      paragrafos: art.paragrafos.map((p) => ({
        texto: p.texto || '',
      })),
      incisos: art.incisos.map((inc) => ({
        texto: inc.texto || '',
        alineas: inc.alineas.map((al) => ({
          texto: al.texto || '',
        })),
      })),
    })),
  };

  const response = await fetch('/api/ementa/sugerir', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  let data: Partial<EmentaSuggestionResult> & { error?: string } = {};
  try {
    data = (await response.json()) as Partial<EmentaSuggestionResult> & {
      error?: string;
    };
  } catch {
    // Resposta não JSON
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
        `Erro ao consultar o assistente de ementa (HTTP ${response.status}).`
    );
  }

  if (!data.ementaSugerida || typeof data.ementaSugerida !== 'string') {
    throw new Error('A resposta do assistente não trouxe uma ementa válida.');
  }

  return {
    ementaSugerida: data.ementaSugerida,
    alternativas: Array.isArray(data.alternativas) ? data.alternativas : [],
    objetosIdentificados: Array.isArray(data.objetosIdentificados)
      ? data.objetosIdentificados
      : [],
    observacaoLegistica:
      typeof data.observacaoLegistica === 'string'
        ? data.observacaoLegistica
        : '',
    modeloUtilizado:
      typeof data.modeloUtilizado === 'string'
        ? data.modeloUtilizado
        : undefined,
  };
}
