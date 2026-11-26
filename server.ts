import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

interface FirebaseConfigFile {
  projectId?: string;
}

interface VerifiedUser {
  uid: string;
  email: string;
}

interface NormalizedArtigo {
  indice: number;
  titulo: string;
  capitulo: string;
  secao: string;
  subsecao: string;
  caput: string;
  paragrafos: string[];
  incisos: Array<{
    texto: string;
    alineas: string[];
  }>;
}

interface EmentaSuggestRequestBody {
  modelPreset: FreeModelPresetId;
  tipo: string;
  numero: string;
  esfera: string;
  autoridade: string;
  fundamentoLegal: string;
  ementaAtual: string;
  revogacoes: string[];
  artigos: NormalizedArtigo[];
}

interface EmentaSuggestionResponse {
  ementaSugerida: string;
  alternativas: string[];
  objetosIdentificados: string[];
  observacaoLegistica: string;
  modeloUtilizado: string;
}

interface AuditAnalyzeRequestBody {
  modelPreset: FreeModelPresetId;
  tipo: string;
  texto: string;
}

interface AuditFindingResponseItem {
  severidade: 'erro' | 'alerta' | 'info';
  regra: string;
  local: string;
  descricao: string;
  sugestao: string;
}

interface AuditAnalyzeResponse {
  resumoGeral: string;
  pontuacaoConformidade: number;
  apontamentos: AuditFindingResponseItem[];
  pontosPositivos: string[];
  modeloUtilizado: string;
}

type FreeModelPresetId = 'flash-lite' | 'flash-padrao' | 'flash-profundo';

interface ResolvedGeminiModelConfig {
  id: FreeModelPresetId;
  model: string;
  label: string;
  thinkingLevel?: ThinkingLevel;
}

const PAID_ONLY_PRESET_IDS = new Set<string>(['pro-neon', 'carbon-deep']);

const FREE_MODEL_PRESETS: Record<FreeModelPresetId, ResolvedGeminiModelConfig> = {
  'flash-lite': {
    id: 'flash-lite',
    model: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
  },
  'flash-padrao': {
    id: 'flash-padrao',
    model: 'gemini-4-hydrogen',
    label: 'Gemini 4 Flash (Hydrogen)',
    thinkingLevel: ThinkingLevel.LOW,
  },
  'flash-profundo': {
    id: 'flash-profundo',
    model: 'gemini-4-hydrogen',
    label: 'Gemini 4 Flash · Análise Profunda',
    thinkingLevel: ThinkingLevel.HIGH,
  },
};

function resolveModelPreset(
  rawPreset: unknown,
  defaultPreset: FreeModelPresetId
):
  | { ok: true; config: ResolvedGeminiModelConfig }
  | { ok: false; status: number; message: string } {
  if (rawPreset === undefined || rawPreset === null || rawPreset === '') {
    return { ok: true, config: FREE_MODEL_PRESETS[defaultPreset] };
  }
  if (typeof rawPreset !== 'string') {
    return { ok: false, status: 400, message: 'Identificador de modelo inválido.' };
  }
  const normalized = rawPreset.trim();
  if (PAID_ONLY_PRESET_IDS.has(normalized)) {
    return {
      ok: false,
      status: 403,
      message:
        'Os modelos Pro (Neon) e Carbon exigem uma chave Gemini com faturamento ativo. Selecione uma opção gratuita nas Configurações de Conta ou ative uma chave paga em Settings > Secrets.',
    };
  }
  if (
    normalized === 'flash-lite' ||
    normalized === 'flash-padrao' ||
    normalized === 'flash-profundo'
  ) {
    return { ok: true, config: FREE_MODEL_PRESETS[normalized] };
  }
  return {
    ok: false,
    status: 400,
    message: 'Modelo de linguagem selecionado não é reconhecido.',
  };
}

const VALID_NORMA_TIPOS = new Set<string>([
  'Lei',
  'Lei Complementar',
  'Projeto de Lei',
  'Decreto',
  'Resolução',
  'Instrução Normativa',
  'Portaria',
  'Deliberação',
  'Regimento Interno',
  'Estatuto',
  'Norma Interna',
  'Ordem de Serviço',
  'Instrução de Trabalho',
  'Procedimento Operacional Padrão',
]);

const TECH_NORMA_TIPOS = new Set<string>([
  'Instrução de Trabalho',
  'Procedimento Operacional Padrão',
]);

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

function resolveFirebaseProjectId(): string {
  const envProjectId = process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (envProjectId) return envProjectId;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as FirebaseConfigFile;
    if (parsed.projectId?.trim()) {
      return parsed.projectId.trim();
    }
  } catch {
    // Fallback para variável padrão do ambiente
  }
  return process.env.GOOGLE_CLOUD_PROJECT?.trim() || '';
}

const FIREBASE_PROJECT_ID = resolveFirebaseProjectId();

function decodeBase64UrlJson<T>(segment: string): T {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const json = Buffer.from(base64, 'base64').toString('utf8');
  return JSON.parse(json) as T;
}

function decodeBase64UrlBuffer(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

async function fetchGooglePublicCerts(
  forceRefresh = false
): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && certsExpiresAt > now && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Falha ao obter certificados públicos (${res.status}).`);
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;
  const certs = (await res.json()) as Record<string, string>;

  cachedCerts = certs;
  certsExpiresAt = now + maxAgeSec * 1000;
  return cachedCerts;
}

async function verifyFirebaseIdToken(token: string): Promise<VerifiedUser> {
  if (!FIREBASE_PROJECT_ID) {
    throw new Error('Projeto Firebase não configurado no servidor.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token JWT malformado.');
  }

  const [headerSeg, payloadSeg, sigSeg] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerSeg);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Cabeçalho JWT inválido.');
  }

  let certs = await fetchGooglePublicCerts(false);
  let pemCert = certs[header.kid];
  if (!pemCert) {
    certs = await fetchGooglePublicCerts(true);
    pemCert = certs[header.kid];
  }
  if (!pemCert) {
    throw new Error('Chave pública de assinatura não encontrada.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerSeg}.${payloadSeg}`);
  verifier.end();
  const signatureValid = verifier.verify(pemCert, decodeBase64UrlBuffer(sigSeg));
  if (!signatureValid) {
    throw new Error('Assinatura do token inválida.');
  }

  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
  }>(payloadSeg);

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('Audience do token inválida.');
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Issuer do token inválido.');
  }
  if (
    typeof payload.sub !== 'string' ||
    payload.sub.length === 0 ||
    payload.sub.length > 128
  ) {
    throw new Error('Subject do token inválido.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Token emitido no futuro.');
  }
  if (
    typeof payload.auth_time === 'number' &&
    payload.auth_time > nowSec + 300
  ) {
    throw new Error('Tempo de autenticação inválido.');
  }
  if (payload.email_verified !== true) {
    throw new Error('E-mail da conta ainda não verificado.');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
  };
}

const rateBuckets = new Map<string, number[]>();

function checkRateLimit(uid: string): boolean {
  const now = Date.now();
  const tenMinAgo = now - 10 * 60 * 1000;
  const oneMinAgo = now - 60 * 1000;
  const prev = (rateBuckets.get(uid) || []).filter((ts) => ts > tenMinAgo);
  const lastMinuteCount = prev.filter((ts) => ts > oneMinAgo).length;

  if (lastMinuteCount >= 8 || prev.length >= 25) {
    rateBuckets.set(uid, prev);
    return false;
  }

  prev.push(now);
  rateBuckets.set(uid, prev);
  if (rateBuckets.size > 500) {
    for (const [key, timestamps] of rateBuckets.entries()) {
      const fresh = timestamps.filter((ts) => ts > tenMinAgo);
      if (fresh.length === 0) {
        rateBuckets.delete(key);
      } else {
        rateBuckets.set(key, fresh);
      }
    }
  }
  return true;
}

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function sanitizeEmentaRequest(raw: unknown): {
  ok: true;
  data: EmentaSuggestRequestBody;
} | {
  ok: false;
  message: string;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'Corpo da requisição inválido.' };
  }

  const obj = raw as Record<string, unknown>;
  const tipo = cleanText(obj.tipo, 80);
  if (!VALID_NORMA_TIPOS.has(tipo)) {
    return { ok: false, message: 'Espécie normativa inválida ou não informada.' };
  }

  if (!Array.isArray(obj.artigos) || obj.artigos.length === 0) {
    return {
      ok: false,
      message: 'Inclua ao menos um artigo ou item com texto antes de solicitar a ementa.',
    };
  }

  const artigos: NormalizedArtigo[] = obj.artigos
    .slice(0, 120)
    .map((item, idx): NormalizedArtigo | null => {
      if (!item || typeof item !== 'object') return null;
      const art = item as Record<string, unknown>;

      const paragrafos = Array.isArray(art.paragrafos)
        ? art.paragrafos
            .slice(0, 25)
            .map((p) => {
              if (typeof p === 'string') return cleanText(p, 1000);
              if (p && typeof p === 'object') {
                return cleanText((p as Record<string, unknown>).texto, 1000);
              }
              return '';
            })
            .filter(Boolean)
        : [];

      const incisos = Array.isArray(art.incisos)
        ? art.incisos
            .slice(0, 30)
            .map((inc) => {
              if (!inc || typeof inc !== 'object') return null;
              const incObj = inc as Record<string, unknown>;
              const texto = cleanText(incObj.texto, 600);
              const alineas = Array.isArray(incObj.alineas)
                ? incObj.alineas
                    .slice(0, 20)
                    .map((al) => {
                      if (typeof al === 'string') return cleanText(al, 400);
                      if (al && typeof al === 'object') {
                        return cleanText((al as Record<string, unknown>).texto, 400);
                      }
                      return '';
                    })
                    .filter(Boolean)
                : [];
              if (!texto && alineas.length === 0) return null;
              return { texto, alineas };
            })
            .filter((v): v is { texto: string; alineas: string[] } => v !== null)
        : [];

      const caput = cleanText(art.caput, 2000);
      const titulo = cleanText(art.titulo, 220);
      const capitulo = cleanText(art.capitulo, 220);
      const secao = cleanText(art.secao, 220);
      const subsecao = cleanText(art.subsecao, 220);

      if (!caput && paragrafos.length === 0 && incisos.length === 0) {
        return null;
      }

      return {
        indice: idx + 1,
        titulo,
        capitulo,
        secao,
        subsecao,
        caput,
        paragrafos,
        incisos,
      };
    })
    .filter((v): v is NormalizedArtigo => v !== null);

  if (artigos.length === 0) {
    return {
      ok: false,
      message: 'Redija o texto de pelo menos um artigo ou dispositivo antes de gerar a ementa.',
    };
  }

  const revogacoes = Array.isArray(obj.revogacoes)
    ? obj.revogacoes
        .slice(0, 25)
        .map((r) => cleanText(r, 240))
        .filter((r) => Boolean(r) && !/^\[.*\]$/.test(r))
    : [];

  const modelResolution = resolveModelPreset(obj.modelPreset, 'flash-padrao');
  if (!modelResolution.ok) {
    return { ok: false, message: modelResolution.message };
  }

  return {
    ok: true,
    data: {
      modelPreset: modelResolution.config.id,
      tipo,
      numero: cleanText(obj.numero, 60),
      esfera: cleanText(obj.esfera, 200),
      autoridade: cleanText(obj.autoridade, 200),
      fundamentoLegal: cleanText(obj.fundamentoLegal, 600),
      ementaAtual: cleanText(obj.ementaAtual, 800),
      revogacoes,
      artigos,
    },
  };
}

function sanitizeAuditRequest(raw: unknown):
  | { ok: true; data: AuditAnalyzeRequestBody }
  | { ok: false; status: number; message: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, status: 400, message: 'Corpo da requisição inválido.' };
  }

  const obj = raw as Record<string, unknown>;
  const modelResolution = resolveModelPreset(obj.modelPreset, 'flash-profundo');
  if (!modelResolution.ok) {
    return {
      ok: false,
      status: modelResolution.status,
      message: modelResolution.message,
    };
  }

  const rawTipo = cleanText(obj.tipo, 80);
  const tipo = rawTipo && VALID_NORMA_TIPOS.has(rawTipo) ? rawTipo : '';

  if (typeof obj.texto !== 'string') {
    return {
      ok: false,
      status: 400,
      message: 'Informe o texto da minuta para executar a auditoria.',
    };
  }

  const texto = obj.texto.replace(/\r\n/g, '\n').trim().slice(0, 32000);
  if (texto.length < 10) {
    return {
      ok: false,
      status: 400,
      message: 'O texto normativo precisa ter ao menos 10 caracteres para auditoria.',
    };
  }

  return {
    ok: true,
    data: {
      modelPreset: modelResolution.config.id,
      tipo,
      texto,
    },
  };
}

function buildArticleOutlinePrompt(body: EmentaSuggestRequestBody): string {
  const isTech = TECH_NORMA_TIPOS.has(body.tipo);
  const lines: string[] = [
    `Espécie documental selecionada: ${body.tipo}`,
    isTech
      ? 'Perfil normativo: Documento Técnico/Operacional (ABNT NBR 6024 / ISO 9001 — campo Objetivo / Escopo).'
      : 'Perfil normativo: Ato Normativo regido pela Lei Complementar nº 95/1998 (Art. 5º) e Decreto nº 12.002/2024.',
  ];

  if (body.esfera) {
    lines.push(`Órgão / Esfera emitente: ${body.esfera}`);
  }
  if (body.autoridade) {
    lines.push(`Autoridade / Responsável: ${body.autoridade}`);
  }
  if (body.fundamentoLegal) {
    lines.push(`Fundamento / Referência: ${body.fundamentoLegal}`);
  }
  if (body.ementaAtual) {
    lines.push(`Rascunho atual de ementa (se útil como contexto): ${body.ementaAtual}`);
  }
  if (body.revogacoes.length > 0) {
    lines.push(`Revogações / Substituições expressas: ${body.revogacoes.join('; ')}`);
  }

  lines.push('');
  lines.push('CONTEÚDO ARTICULADO DA NORMA:');

  for (const art of body.artigos) {
    if (art.titulo) lines.push(`[Título] ${art.titulo}`);
    if (art.capitulo) lines.push(`[Capítulo] ${art.capitulo}`);
    if (art.secao) lines.push(`[Seção] ${art.secao}`);
    if (art.subsecao) lines.push(`[Subseção] ${art.subsecao}`);

    const prefix = isTech ? `Item ${art.indice}` : `Art. ${art.indice}${art.indice <= 9 ? 'º' : ''}`;
    lines.push(`${prefix}: ${art.caput || '(sem caput explícito)'}`);

    for (let i = 0; i < art.incisos.length; i++) {
      const inc = art.incisos[i];
      if (inc.texto) {
        lines.push(`  - Inciso ${i + 1}: ${inc.texto}`);
      }
      for (let j = 0; j < inc.alineas.length; j++) {
        lines.push(`    * Alínea ${j + 1}: ${inc.alineas[j]}`);
      }
    }

    for (let p = 0; p < art.paragrafos.length; p++) {
      lines.push(`  - § ${p + 1}: ${art.paragrafos[p]}`);
    }
  }

  return lines.join('\n').slice(0, 28000);
}

function normalizeSentence(raw: string): string {
  let cleaned = raw
    .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (!/[.!?]$/.test(cleaned)) {
    cleaned = `${cleaned}.`;
  }
  return cleaned;
}

function isRetryableGeminiError(error: unknown): boolean {
  const errObj = error as { status?: number; code?: string; message?: string } | null;
  const status = errObj?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg = (errObj?.message || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed') ||
    msg.includes('unavailable')
  );
}

async function callGeminiWithRetry(
  ai: GoogleGenAI,
  payload: EmentaSuggestRequestBody
): Promise<EmentaSuggestionResponse> {
  const isTech = TECH_NORMA_TIPOS.has(payload.tipo);
  const systemInstruction = isTech
    ? [
        'Você é um especialista sênior em normalização técnica (ABNT NBR 6024 e ISO 9001) e redação oficial brasileira.',
        'Analise todos os itens e seções do procedimento técnico enviado e redija o campo "Objetivo / Escopo" de forma precisa, clara e concisa.',
        'Regras obrigatórias:',
        '1. Inicie com verbo na 3ª pessoa do singular do presente do indicativo (ex.: "Estabelece...", "Padroniza...", "Define...", "Disciplina...").',
        '2. Sintetize o objeto central, os requisitos/etapas principais e a área ou processo abrangido.',
        '3. Mantenha entre 12 e 40 palavras (máximo 50 palavras), em período único, sem colchetes "[...]" e terminado com ponto final (".").',
        '4. Não repita o nome do documento na abertura (ex.: não escreva "Instrução de Trabalho que estabelece...").',
        '5. Forneça também 2 alternativas igualmente válidas, os principais objetos extraídos dos itens e uma observação técnica breve em português.',
      ].join('\n')
    : [
        'Você é um especialista sênior em Técnica Legislativa e Legística brasileira (Lei Complementar nº 95/1998, art. 5º, Decreto nº 12.002/2024 e Manual de Redação da Presidência da República).',
        'Analise todos os artigos, parágrafos, incisos, alíneas, capítulos e eventuais revogações expressas enviados para redigir uma sugestão de Ementa em estrita conformidade com o art. 5º da LC nº 95/1998.',
        'Regras obrigatórias da LC nº 95/1998 e da validação formal:',
        '1. A ementa deve explicitar, de modo conciso e sob a forma de título, o objeto real da norma e sua abrangência.',
        '2. Inicie com verbo adequado na 3ª pessoa do singular do presente do indicativo (ex.: "Institui...", "Dispõe sobre...", "Regulamenta...", "Altera...", "Estabelece...", "Aprova...", "Disciplina...").',
        '3. NUNCA repita a espécie normativa no início da frase (ex.: não escreva "Decreto que institui..." nem "Esta Lei dispõe sobre...").',
        '4. Mantenha estilo impessoal, claro e direto, entre 12 e 42 palavras (máximo 50 palavras), sem marcadores modelo entre colchetes "[...]", sem aspas externas e SEMPRE encerrada com ponto final (".").',
        '5. Mencione revogação ao final apenas se houver revogações expressas informadas no contexto (ex.: "...e revoga dispositivo que especifica." ou citando o ato curto), e nunca mencione cláusula de vigência ou fórmula genérica proibida.',
        '6. Gere 1 sugestão principal (ementaSugerida), 2 alternativas distintas e concisas (alternativas), de 2 a 5 tópicos resumindo o objeto extraído dos artigos (objetosIdentificados) e 1 justificativa legística curta referenciando o art. 5º da LC nº 95/1998 (observacaoLegistica).',
      ].join('\n');

  const prompt = buildArticleOutlinePrompt(payload);

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      ementaSugerida: {
        type: Type.STRING,
        description:
          'Texto principal sugerido para a ementa, conciso, iniciado com verbo no presente do indicativo e encerrado com ponto final.',
      },
      alternativas: {
        type: Type.ARRAY,
        description:
          'Duas variações concisas e formalmente corretas para a mesma ementa.',
        items: { type: Type.STRING },
      },
      objetosIdentificados: {
        type: Type.ARRAY,
        description:
          'Lista curta (2 a 5 itens) dos núcleos temáticos identificados na análise dos artigos.',
        items: { type: Type.STRING },
      },
      observacaoLegistica: {
        type: Type.STRING,
        description:
          'Explicação objetiva em 1 ou 2 frases sobre a adequação da ementa à LC nº 95/1998 (ou ABNT NBR 6024).',
      },
    },
    required: [
      'ementaSugerida',
      'alternativas',
      'objetosIdentificados',
      'observacaoLegistica',
    ],
  };

  const modelSpec = FREE_MODEL_PRESETS[payload.modelPreset];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelSpec.model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
          ...(modelSpec.thinkingLevel
            ? {
                thinkingConfig: {
                  thinkingLevel: modelSpec.thinkingLevel,
                },
              }
            : {}),
        },
      });

      const rawText = response.text?.trim() || '';
      if (!rawText) {
        throw new Error('O modelo retornou uma resposta vazia.');
      }

      const parsed = JSON.parse(rawText) as Partial<EmentaSuggestionResponse>;
      const ementaSugerida = normalizeSentence(parsed.ementaSugerida || '');
      if (!ementaSugerida) {
        throw new Error('Não foi possível extrair uma ementa válida da resposta.');
      }

      const seen = new Set<string>([ementaSugerida.toLowerCase()]);
      const alternativas = (Array.isArray(parsed.alternativas) ? parsed.alternativas : [])
        .map((item) => normalizeSentence(typeof item === 'string' ? item : ''))
        .filter((item) => {
          if (!item) return false;
          const key = item.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 2);

      const objetosIdentificados = (
        Array.isArray(parsed.objetosIdentificados) ? parsed.objetosIdentificados : []
      )
        .map((item) => cleanText(item, 140))
        .filter(Boolean)
        .slice(0, 5);

      const observacaoLegistica =
        cleanText(parsed.observacaoLegistica, 400) ||
        (isTech
          ? 'Redação elaborada para sintetizar objetivamente o escopo operacional conforme a ABNT NBR 6024.'
          : 'Ementa formulada de forma concisa em atendimento ao art. 5º da Lei Complementar nº 95/1998.');

      return {
        ementaSugerida,
        alternativas,
        objetosIdentificados,
        observacaoLegistica,
        modeloUtilizado: modelSpec.label,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2 && isRetryableGeminiError(error)) {
        const delayMs = 450 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

async function callGeminiAuditWithRetry(
  ai: GoogleGenAI,
  payload: AuditAnalyzeRequestBody
): Promise<AuditAnalyzeResponse> {
  const isTech = Boolean(payload.tipo && TECH_NORMA_TIPOS.has(payload.tipo));
  const modelSpec = FREE_MODEL_PRESETS[payload.modelPreset];

  const systemInstruction = isTech
    ? [
        'Você é um auditor sênior de documentação técnica (ABNT NBR 6024, ISO 9001 e redação técnica brasileira).',
        'Realize uma auditoria semântica e estrutural do texto técnico enviado.',
        'Avalie: clareza de objetivo e escopo, numeração progressiva (1., 1.1, 1.1.1), definição inequívoca de responsabilidades/prazos, consistência terminológica e ausência de ambiguidades operacionais.',
        'Retorne JSON estrito com: resumoGeral (2 a 3 frases objetivas), pontuacaoConformidade (inteiro de 0 a 100), apontamentos (até 8 itens prioritários com severidade erro|alerta|info, regra, local, descricao e sugestao prática) e pontosPositivos (até 5 itens).',
      ].join('\n')
    : [
        'Você é um auditor sênior de Técnica Legislativa e Legística brasileira (Lei Complementar nº 95/1998, Decreto nº 12.002/2024 e Manual de Redação da Presidência da República).',
        'Realize uma auditoria semântica, estrutural e redacional aprofundada do ato normativo enviado.',
        'Verifique especialmente:',
        '1. Epígrafe e ementa (art. 4º e 5º da LC 95/98): precisão do objeto e ausência de repetição da espécie na ementa.',
        '2. Preâmbulo e ordem de execução (art. 6º da LC 95/98 e art. 14 do Decreto 12.002/2024): pertinência do fundamento de competência e ausência de considerandos prolixos.',
        '3. Articulação, ordem lógica e clareza (art. 10 e art. 11 da LC 95/98): frase única por caput/inciso, coerência entre caput e incisos, remissões corretas, prazos e competências claros, ausência de ambiguidades ou siglas não definidas.',
        '4. Vigência e revogação expressa (art. 8º e art. 9º da LC 95/98): vedação a revogação genérica e clareza da entrada em vigor.',
        'Retorne JSON estrito com: resumoGeral (2 a 3 frases objetivas), pontuacaoConformidade (inteiro de 0 a 100), apontamentos (até 8 achados relevantes com severidade erro|alerta|info, regra, local, descricao e sugestao prática) e pontosPositivos (até 5 pontos). Não invente dispositivos ausentes do texto.',
      ].join('\n');

  const prompt = [
    payload.tipo
      ? `Espécie documental informada: ${payload.tipo}`
      : 'Espécie documental: identificar a partir do texto enviado.',
    '',
    'TEXTO INTEGRAL PARA AUDITORIA:',
    payload.texto,
  ].join('\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      resumoGeral: {
        type: Type.STRING,
        description:
          'Diagnóstico sintético em 2 a 3 frases sobre a qualidade formal e material do texto.',
      },
      pontuacaoConformidade: {
        type: Type.INTEGER,
        description: 'Nota estimada de conformidade legística de 0 a 100.',
      },
      apontamentos: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            severidade: {
              type: Type.STRING,
              description: 'Deve ser exatamente "erro", "alerta" ou "info".',
            },
            regra: {
              type: Type.STRING,
              description: 'Referência normativa (ex.: Art. 11, I, da LC nº 95/1998).',
            },
            local: {
              type: Type.STRING,
              description: 'Dispositivo ou seção afetada (ex.: Ementa, Art. 2º, § 1º).',
            },
            descricao: {
              type: Type.STRING,
              description: 'Descrição objetiva do problema ou oportunidade de melhoria.',
            },
            sugestao: {
              type: Type.STRING,
              description: 'Orientação concreta de correção ou redação recomendada.',
            },
          },
          required: ['severidade', 'regra', 'local', 'descricao', 'sugestao'],
        },
      },
      pontosPositivos: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
    required: [
      'resumoGeral',
      'pontuacaoConformidade',
      'apontamentos',
      'pontosPositivos',
    ],
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelSpec.model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
          ...(modelSpec.thinkingLevel
            ? {
                thinkingConfig: {
                  thinkingLevel: modelSpec.thinkingLevel,
                },
              }
            : {}),
        },
      });

      const rawText = response.text?.trim() || '';
      if (!rawText) {
        throw new Error('O modelo retornou uma resposta vazia.');
      }

      const parsed = JSON.parse(rawText) as Partial<AuditAnalyzeResponse>;
      const resumoGeral = cleanText(parsed.resumoGeral, 900);
      if (!resumoGeral) {
        throw new Error('Não foi possível extrair o diagnóstico da auditoria.');
      }

      const scoreRaw = Number(parsed.pontuacaoConformidade);
      const pontuacaoConformidade = Number.isFinite(scoreRaw)
        ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
        : 75;

      const apontamentos: AuditFindingResponseItem[] = (
        Array.isArray(parsed.apontamentos) ? parsed.apontamentos : []
      )
        .slice(0, 8)
        .map((item): AuditFindingResponseItem | null => {
          if (!item || typeof item !== 'object') return null;
          const rec = item as unknown as Record<string, unknown>;
          const sevRaw = cleanText(rec.severidade, 20).toLowerCase();
          const severidade: 'erro' | 'alerta' | 'info' =
            sevRaw === 'erro'
              ? 'erro'
              : sevRaw === 'alerta'
                ? 'alerta'
                : 'info';
          const descricao = cleanText(rec.descricao, 450);
          const sugestao = cleanText(rec.sugestao, 450);
          if (!descricao) return null;
          return {
            severidade,
            regra: cleanText(rec.regra, 120) || 'LC nº 95/1998',
            local: cleanText(rec.local, 80) || 'Texto geral',
            descricao,
            sugestao: sugestao || 'Revise o trecho conforme a técnica legislativa.',
          };
        })
        .filter((v): v is AuditFindingResponseItem => v !== null);

      const pontosPositivos = (
        Array.isArray(parsed.pontosPositivos) ? parsed.pontosPositivos : []
      )
        .map((item) => cleanText(item, 220))
        .filter(Boolean)
        .slice(0, 5);

      return {
        resumoGeral,
        pontuacaoConformidade,
        apontamentos,
        pontosPositivos,
        modeloUtilizado: modelSpec.label,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2 && isRetryableGeminiError(error)) {
        const delayMs = 450 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/ementa/sugerir', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch?.[1]) {
      res.status(401).json({
        error: 'Autenticação necessária para utilizar o assistente de ementa.',
      });
      return;
    }

    let verifiedUser: VerifiedUser;
    try {
      verifiedUser = await verifyFirebaseIdToken(bearerMatch[1].trim());
    } catch (authError) {
      const msg =
        authError instanceof Error
          ? authError.message
          : 'Sessão inválida ou expirada.';
      res.status(401).json({ error: msg });
      return;
    }

    if (!checkRateLimit(verifiedUser.uid)) {
      res.status(429).json({
        error:
          'Muitas solicitações em sequência. Aguarde alguns instantes antes de gerar outra sugestão.',
      });
      return;
    }

    const validation = sanitizeEmentaRequest(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.message });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'O serviço de IA ainda não está configurado no servidor (variável GEMINI_API_KEY ausente).',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const result = await callGeminiWithRetry(ai, validation.data);
      res.json(result);
    } catch (error) {
      const errObj = error as { status?: number; message?: string } | null;
      const status = errObj?.status;
      const rawMessage = errObj?.message || '';
      console.error('Erro ao gerar sugestão de ementa:', status ?? '', rawMessage);

      if (status === 400 || status === 403 || /api key/i.test(rawMessage)) {
        res.status(502).json({
          error:
            'Falha de autenticação com o serviço de IA. Verifique a configuração da chave GEMINI_API_KEY no servidor.',
        });
        return;
      }

      if (status === 429) {
        res.status(429).json({
          error:
            'Limite temporário de requisições da IA atingido. Tente novamente em instantes.',
        });
        return;
      }

      res.status(500).json({
        error:
          'Não foi possível gerar a sugestão de ementa no momento. Tente novamente em alguns segundos.',
      });
    }
  });

  app.post('/api/auditoria/analisar', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch?.[1]) {
      res.status(401).json({
        error: 'Autenticação necessária para utilizar a auditoria com IA.',
      });
      return;
    }

    let verifiedUser: VerifiedUser;
    try {
      verifiedUser = await verifyFirebaseIdToken(bearerMatch[1].trim());
    } catch (authError) {
      const msg =
        authError instanceof Error
          ? authError.message
          : 'Sessão inválida ou expirada.';
      res.status(401).json({ error: msg });
      return;
    }

    if (!checkRateLimit(verifiedUser.uid)) {
      res.status(429).json({
        error:
          'Muitas solicitações em sequência. Aguarde alguns instantes antes de executar outra auditoria.',
      });
      return;
    }

    const validation = sanitizeAuditRequest(req.body);
    if (!validation.ok) {
      res.status(validation.status).json({ error: validation.message });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'O serviço de IA ainda não está configurado no servidor (variável GEMINI_API_KEY ausente).',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const result = await callGeminiAuditWithRetry(ai, validation.data);
      res.json(result);
    } catch (error) {
      const errObj = error as { status?: number; message?: string } | null;
      const status = errObj?.status;
      const rawMessage = errObj?.message || '';
      console.error('Erro na auditoria com IA:', status ?? '', rawMessage);

      if (status === 400 || status === 403 || /api key/i.test(rawMessage)) {
        res.status(502).json({
          error:
            'Falha de autenticação com o serviço de IA. Verifique a configuração da chave GEMINI_API_KEY no servidor.',
        });
        return;
      }

      if (status === 429) {
        res.status(429).json({
          error:
            'Limite temporário de requisições da IA atingido. Tente novamente em instantes.',
        });
        return;
      }

      res.status(500).json({
        error:
          'Não foi possível concluir a auditoria com IA no momento. Tente novamente em alguns segundos.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor Norma em execução na porta ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor:', err);
  process.exit(1);
});
