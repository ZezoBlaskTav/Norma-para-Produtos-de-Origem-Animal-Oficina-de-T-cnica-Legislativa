import {
  AlineaItem,
  ArtigoItem,
  IncisoItem,
  NormaDocument,
  NormaImagemItem,
  ParagrafoItem,
} from '../types/norma';
import {
  formatArtigoNumero,
  formatParagrafoNumero,
  renderNormaPlainText,
  renderVigenciaClause,
  toLetter,
  toRoman,
} from './legistica';

export type DiffStatus = 'equal' | 'added' | 'removed' | 'modified';

export interface DiffSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

export interface LineDiffItem {
  type: 'equal' | 'added' | 'removed' | 'modified';
  oldText: string;
  newText: string;
  segments?: DiffSegment[];
}

export interface FieldDiffItem {
  key:
    | 'epigrafe'
    | 'ementa'
    | 'autoridade'
    | 'ordemExecucao'
    | 'fundamentoLegal'
    | 'vigencia'
    | 'revogacoes'
    | 'localAssinatura'
    | 'assinante'
    | 'imagens'
    | 'observacoes';
  label: string;
  status: 'equal' | 'modified';
  oldValue: string;
  newValue: string;
  segments: DiffSegment[];
  canRestore: boolean;
}

export interface AlineaDiffItem {
  id: string;
  status: DiffStatus;
  oldLabel: string;
  newLabel: string;
  oldText: string;
  newText: string;
  segments: DiffSegment[];
}

export interface IncisoDiffItem {
  id: string;
  status: DiffStatus;
  oldLabel: string;
  newLabel: string;
  oldText: string;
  newText: string;
  textChanged: boolean;
  segments: DiffSegment[];
  alineas: AlineaDiffItem[];
}

export interface ParagrafoDiffItem {
  id: string;
  status: DiffStatus;
  oldLabel: string;
  newLabel: string;
  oldText: string;
  newText: string;
  textChanged: boolean;
  segments: DiffSegment[];
  incisos: IncisoDiffItem[];
}

export interface DivisionDiffItem {
  kind: 'titulo' | 'capitulo' | 'secao' | 'subsecao';
  label: string;
  oldValue: string;
  newValue: string;
  segments: DiffSegment[];
}

export interface ArtigoDiffItem {
  id: string;
  status: DiffStatus;
  oldIndex: number | null;
  newIndex: number | null;
  oldLabel: string;
  newLabel: string;
  renumbered: boolean;
  oldArt?: ArtigoItem;
  newArt?: ArtigoItem;
  divisionDiffs: DivisionDiffItem[];
  caputChanged: boolean;
  caputSegments: DiffSegment[];
  incisos: IncisoDiffItem[];
  paragrafos: ParagrafoDiffItem[];
}

export interface NormaDiffResult {
  hasChanges: boolean;
  fieldDiffs: FieldDiffItem[];
  artigoDiffs: ArtigoDiffItem[];
  stats: {
    changedFields: number;
    addedArtigos: number;
    removedArtigos: number;
    modifiedArtigos: number;
    unchangedArtigos: number;
    totalChanges: number;
  };
}

function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.match(/\S+|\s+/g) || [text];
}

function mergeDiffSegments(raw: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of raw) {
    if (!seg.text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.type === seg.type) {
      prev.text += seg.text;
    } else {
      out.push({ type: seg.type, text: seg.text });
    }
  }
  return out;
}

export function diffWords(oldText: string, newText: string): DiffSegment[] {
  const a = oldText || '';
  const b = newText || '';
  if (a === b) return a ? [{ type: 'equal', text: a }] : [];
  if (!a) return [{ type: 'added', text: b }];
  if (!b) return [{ type: 'removed', text: a }];

  const tokensA = tokenizeWords(a);
  const tokensB = tokenizeWords(b);

  // Limite de segurança para textos muito longos: recai em diff por linha/bloco
  if (tokensA.length * tokensB.length > 90_000) {
    const linesA = a.split('\n');
    const linesB = b.split('\n');
    if (linesA.length * linesB.length <= 25_000) {
      const lcs = alignByKey(
        linesA.map((l, idx) => ({ key: l, idx, l })),
        linesB.map((l, idx) => ({ key: l, idx, l })),
        (item) => item.key
      );
      const raw: DiffSegment[] = [];
      for (const pair of lcs) {
        if (pair.oldItem && pair.newItem) {
          raw.push({ type: 'equal', text: `${pair.newItem.l}\n` });
        } else if (pair.oldItem) {
          raw.push({ type: 'removed', text: `${pair.oldItem.l}\n` });
        } else if (pair.newItem) {
          raw.push({ type: 'added', text: `${pair.newItem.l}\n` });
        }
      }
      return mergeDiffSegments(raw);
    }
    return [
      { type: 'removed', text: a },
      { type: 'added', text: b },
    ];
  }

  const m = tokensA.length;
  const n = tokensB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (tokensA[i] === tokensB[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  const raw: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (tokensA[i] === tokensB[j]) {
      raw.push({ type: 'equal', text: tokensA[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'removed', text: tokensA[i] });
      i++;
    } else {
      raw.push({ type: 'added', text: tokensB[j] });
      j++;
    }
  }
  while (i < m) {
    raw.push({ type: 'removed', text: tokensA[i] });
    i++;
  }
  while (j < n) {
    raw.push({ type: 'added', text: tokensB[j] });
    j++;
  }

  return mergeDiffSegments(raw);
}

interface AlignedPair<T> {
  oldItem: T | null;
  newItem: T | null;
  oldIndex: number | null;
  newIndex: number | null;
}

function alignByKey<T>(
  oldList: T[],
  newList: T[],
  getKey: (item: T, idx: number) => string
): AlignedPair<T>[] {
  const m = oldList.length;
  const n = newList.length;
  const oldKeys = oldList.map(getKey);
  const newKeys = newList.map(getKey);

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldKeys[i] === newKeys[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  const out: AlignedPair<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldKeys[i] === newKeys[j]) {
      out.push({
        oldItem: oldList[i],
        newItem: newList[j],
        oldIndex: i,
        newIndex: j,
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ oldItem: oldList[i], newItem: null, oldIndex: i, newIndex: null });
      i++;
    } else {
      out.push({ oldItem: null, newItem: newList[j], oldIndex: null, newIndex: j });
      j++;
    }
  }
  while (i < m) {
    out.push({ oldItem: oldList[i], newItem: null, oldIndex: i, newIndex: null });
    i++;
  }
  while (j < n) {
    out.push({ oldItem: null, newItem: newList[j], oldIndex: null, newIndex: j });
    j++;
  }
  return out;
}

export function diffPlainLines(oldText: string, newText: string): LineDiffItem[] {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');

  const aligned = alignByKey(
    oldLines.map((text, idx) => ({ text, idx })),
    newLines.map((text, idx) => ({ text, idx })),
    (item) => item.text
  );

  // Agrupa pares adjacentes removed + added como linha modificada quando possível
  const result: LineDiffItem[] = [];
  let k = 0;
  while (k < aligned.length) {
    const curr = aligned[k];
    if (curr.oldItem && curr.newItem) {
      result.push({
        type: 'equal',
        oldText: curr.oldItem.text,
        newText: curr.newItem.text,
      });
      k++;
      continue;
    }

    const removedRun: string[] = [];
    const addedRun: string[] = [];
    while (k < aligned.length && !(aligned[k].oldItem && aligned[k].newItem)) {
      const item = aligned[k];
      if (item.oldItem) removedRun.push(item.oldItem.text);
      if (item.newItem) addedRun.push(item.newItem.text);
      k++;
    }

    const pairCount = Math.min(removedRun.length, addedRun.length);
    for (let p = 0; p < pairCount; p++) {
      const oldLine = removedRun[p];
      const newLine = addedRun[p];
      if (oldLine.trim() === '' && newLine.trim() === '') {
        result.push({ type: 'equal', oldText: oldLine, newText: newLine });
      } else {
        result.push({
          type: 'modified',
          oldText: oldLine,
          newText: newLine,
          segments: diffWords(oldLine, newLine),
        });
      }
    }
    for (let r = pairCount; r < removedRun.length; r++) {
      result.push({
        type: 'removed',
        oldText: removedRun[r],
        newText: '',
      });
    }
    for (let a = pairCount; a < addedRun.length; a++) {
      result.push({
        type: 'added',
        oldText: '',
        newText: addedRun[a],
      });
    }
  }

  return result;
}

function compareAlineas(
  oldList: AlineaItem[],
  newList: AlineaItem[]
): AlineaDiffItem[] {
  const aligned = alignByKey(oldList, newList, (al) => al.id);
  return aligned.map((pair) => {
    const oldLabel =
      pair.oldIndex !== null ? `${toLetter(pair.oldIndex)})` : '';
    const newLabel =
      pair.newIndex !== null ? `${toLetter(pair.newIndex)})` : '';
    const oldText = pair.oldItem?.texto ?? '';
    const newText = pair.newItem?.texto ?? '';

    let status: DiffStatus = 'equal';
    if (!pair.oldItem) status = 'added';
    else if (!pair.newItem) status = 'removed';
    else if (oldText !== newText) status = 'modified';

    return {
      id: pair.newItem?.id || pair.oldItem?.id || `al_${oldLabel}_${newLabel}`,
      status,
      oldLabel,
      newLabel,
      oldText,
      newText,
      segments: diffWords(oldText, newText),
    };
  });
}

function compareIncisos(
  oldList: IncisoItem[],
  newList: IncisoItem[]
): IncisoDiffItem[] {
  const aligned = alignByKey(oldList, newList, (inc) => inc.id);
  return aligned.map((pair) => {
    const oldLabel =
      pair.oldIndex !== null ? `${toRoman(pair.oldIndex + 1)} -` : '';
    const newLabel =
      pair.newIndex !== null ? `${toRoman(pair.newIndex + 1)} -` : '';
    const oldText = pair.oldItem?.texto ?? '';
    const newText = pair.newItem?.texto ?? '';
    const textChanged = oldText !== newText;
    const alineas = compareAlineas(
      pair.oldItem?.alineas || [],
      pair.newItem?.alineas || []
    );
    const hasAlineaChanges = alineas.some((al) => al.status !== 'equal');

    let status: DiffStatus = 'equal';
    if (!pair.oldItem) status = 'added';
    else if (!pair.newItem) status = 'removed';
    else if (textChanged || hasAlineaChanges) status = 'modified';

    return {
      id: pair.newItem?.id || pair.oldItem?.id || `inc_${oldLabel}_${newLabel}`,
      status,
      oldLabel,
      newLabel,
      oldText,
      newText,
      textChanged,
      segments: diffWords(oldText, newText),
      alineas,
    };
  });
}

function compareParagrafos(
  oldList: ParagrafoItem[],
  newList: ParagrafoItem[]
): ParagrafoDiffItem[] {
  const aligned = alignByKey(oldList, newList, (par) => par.id);
  return aligned.map((pair) => {
    const oldLabel =
      pair.oldIndex !== null
        ? formatParagrafoNumero(
            pair.oldIndex,
            oldList.length,
            pair.oldItem?.sufixo
          )
        : '';
    const newLabel =
      pair.newIndex !== null
        ? formatParagrafoNumero(
            pair.newIndex,
            newList.length,
            pair.newItem?.sufixo
          )
        : '';
    const oldText = pair.oldItem?.texto ?? '';
    const newText = pair.newItem?.texto ?? '';
    const textChanged = oldText !== newText;
    const incisos = compareIncisos(
      pair.oldItem?.incisos || [],
      pair.newItem?.incisos || []
    );
    const hasIncChanges = incisos.some((inc) => inc.status !== 'equal');

    let status: DiffStatus = 'equal';
    if (!pair.oldItem) status = 'added';
    else if (!pair.newItem) status = 'removed';
    else if (textChanged || hasIncChanges) status = 'modified';

    return {
      id: pair.newItem?.id || pair.oldItem?.id || `par_${oldLabel}_${newLabel}`,
      status,
      oldLabel,
      newLabel,
      oldText,
      newText,
      textChanged,
      segments: diffWords(oldText, newText),
      incisos,
    };
  });
}

function summarizeImagens(imagens?: NormaImagemItem[]): string {
  if (!imagens || imagens.length === 0) return 'Nenhuma imagem ou carimbo';
  return imagens
    .map((img, i) => {
      const posLabel =
        img.posicao === 'cabecalho'
          ? 'Cabeçalho'
          : img.posicao === 'pos_artigo'
            ? 'Após artigo'
            : 'Anexo';
      const title = img.titulo.trim() || `Imagem #${i + 1}`;
      return `${title} [${posLabel}, ${img.larguraMm}mm, ${img.alinhamento}]${
        img.legenda.trim() ? ` — ${img.legenda.trim()}` : ''
      }`;
    })
    .join('\n');
}

function makeFieldDiff(
  key: FieldDiffItem['key'],
  label: string,
  oldValue: string,
  newValue: string,
  canRestore = true
): FieldDiffItem {
  const a = oldValue || '';
  const b = newValue || '';
  return {
    key,
    label,
    status: a === b ? 'equal' : 'modified',
    oldValue: a,
    newValue: b,
    segments: diffWords(a, b),
    canRestore,
  };
}

export function compareNormaDocuments(
  baseDoc: NormaDocument,
  currentDoc: NormaDocument
): NormaDiffResult {
  const oldEpigrafe = `${baseDoc.tipo} nº ${baseDoc.numero || '___'}, ${baseDoc.data || ''} (${baseDoc.esfera})`;
  const newEpigrafe = `${currentDoc.tipo} nº ${currentDoc.numero || '___'}, ${currentDoc.data || ''} (${currentDoc.esfera})`;

  const oldVigencia = renderVigenciaClause(baseDoc);
  const newVigencia = renderVigenciaClause(currentDoc);

  const oldRevogacoes = (baseDoc.revogacoes || []).filter((r) => r.trim()).join('\n');
  const newRevogacoes = (currentDoc.revogacoes || []).filter((r) => r.trim()).join('\n');

  const oldAssinante = [baseDoc.assinante, baseDoc.cargoAssinante]
    .filter(Boolean)
    .join(' — ');
  const newAssinante = [currentDoc.assinante, currentDoc.cargoAssinante]
    .filter(Boolean)
    .join(' — ');

  const fieldDiffs: FieldDiffItem[] = [
    makeFieldDiff('epigrafe', 'Epígrafe e Identificação', oldEpigrafe, newEpigrafe),
    makeFieldDiff('ementa', 'Ementa', baseDoc.ementa, currentDoc.ementa),
    makeFieldDiff(
      'autoridade',
      'Autoridade Signatária',
      baseDoc.autoridade,
      currentDoc.autoridade
    ),
    makeFieldDiff(
      'ordemExecucao',
      'Ordem de Execução',
      baseDoc.ordemExecucao,
      currentDoc.ordemExecucao
    ),
    makeFieldDiff(
      'fundamentoLegal',
      'Preâmbulo / Fundamento Legal',
      baseDoc.fundamentoLegal,
      currentDoc.fundamentoLegal
    ),
    makeFieldDiff('vigencia', 'Cláusula de Vigência', oldVigencia, newVigencia),
    makeFieldDiff(
      'revogacoes',
      'Revogações Expressas',
      oldRevogacoes,
      newRevogacoes
    ),
    makeFieldDiff(
      'localAssinatura',
      'Local e Data de Assinatura',
      baseDoc.localAssinatura,
      currentDoc.localAssinatura
    ),
    makeFieldDiff('assinante', 'Assinante e Cargo', oldAssinante, newAssinante),
    makeFieldDiff(
      'imagens',
      'Imagens e Carimbos',
      summarizeImagens(baseDoc.imagens),
      summarizeImagens(currentDoc.imagens),
      false
    ),
    makeFieldDiff(
      'observacoes',
      'Observações da Minuta',
      baseDoc.observacoes || '',
      currentDoc.observacoes || ''
    ),
  ];

  const alignedArtigos = alignByKey(
    baseDoc.artigos || [],
    currentDoc.artigos || [],
    (art) => art.id
  );

  const artigoDiffs: ArtigoDiffItem[] = alignedArtigos.map((pair) => {
    const oldLabel =
      pair.oldIndex !== null && pair.oldItem
        ? formatArtigoNumero(pair.oldIndex + 1, pair.oldItem.sufixo).replace(
            /\.$/,
            ''
          )
        : '';
    const newLabel =
      pair.newIndex !== null && pair.newItem
        ? formatArtigoNumero(pair.newIndex + 1, pair.newItem.sufixo).replace(
            /\.$/,
            ''
          )
        : '';

    const renumbered = Boolean(
      pair.oldItem && pair.newItem && oldLabel !== newLabel
    );

    const divisionKinds: Array<{
      kind: DivisionDiffItem['kind'];
      label: string;
    }> = [
      { kind: 'titulo', label: 'Título' },
      { kind: 'capitulo', label: 'Capítulo' },
      { kind: 'secao', label: 'Seção' },
      { kind: 'subsecao', label: 'Subseção' },
    ];

    const divisionDiffs: DivisionDiffItem[] = [];
    if (pair.oldItem && pair.newItem) {
      for (const dk of divisionKinds) {
        const ov = pair.oldItem[dk.kind] || '';
        const nv = pair.newItem[dk.kind] || '';
        if (ov !== nv) {
          divisionDiffs.push({
            kind: dk.kind,
            label: dk.label,
            oldValue: ov,
            newValue: nv,
            segments: diffWords(ov, nv),
          });
        }
      }
    }

    const oldCaput = pair.oldItem?.caput ?? '';
    const newCaput = pair.newItem?.caput ?? '';
    const caputChanged = Boolean(pair.oldItem && pair.newItem && oldCaput !== newCaput);

    const incisos = compareIncisos(
      pair.oldItem?.incisos || [],
      pair.newItem?.incisos || []
    );
    const paragrafos = compareParagrafos(
      pair.oldItem?.paragrafos || [],
      pair.newItem?.paragrafos || []
    );

    const hasSubChanges =
      divisionDiffs.length > 0 ||
      caputChanged ||
      incisos.some((inc) => inc.status !== 'equal') ||
      paragrafos.some((par) => par.status !== 'equal');

    let status: DiffStatus = 'equal';
    if (!pair.oldItem) status = 'added';
    else if (!pair.newItem) status = 'removed';
    else if (hasSubChanges || renumbered) status = 'modified';

    return {
      id: pair.newItem?.id || pair.oldItem?.id || `art_${oldLabel}_${newLabel}`,
      status,
      oldIndex: pair.oldIndex,
      newIndex: pair.newIndex,
      oldLabel,
      newLabel,
      renumbered,
      oldArt: pair.oldItem || undefined,
      newArt: pair.newItem || undefined,
      divisionDiffs,
      caputChanged,
      caputSegments: diffWords(oldCaput, newCaput),
      incisos,
      paragrafos,
    };
  });

  const changedFields = fieldDiffs.filter((f) => f.status === 'modified').length;
  const addedArtigos = artigoDiffs.filter((a) => a.status === 'added').length;
  const removedArtigos = artigoDiffs.filter((a) => a.status === 'removed').length;
  const modifiedArtigos = artigoDiffs.filter((a) => a.status === 'modified').length;
  const unchangedArtigos = artigoDiffs.filter((a) => a.status === 'equal').length;
  const totalChanges =
    changedFields + addedArtigos + removedArtigos + modifiedArtigos;

  return {
    hasChanges: totalChanges > 0,
    fieldDiffs,
    artigoDiffs,
    stats: {
      changedFields,
      addedArtigos,
      removedArtigos,
      modifiedArtigos,
      unchangedArtigos,
      totalChanges,
    },
  };
}

export function summarizeNormaChanges(
  previousDoc: NormaDocument | null,
  currentDoc: NormaDocument
): string {
  const baseCount = `${currentDoc.artigos.length} ${
    currentDoc.artigos.length === 1 ? 'artigo' : 'artigos'
  }`;
  if (!previousDoc) {
    return `${baseCount} · Versão inicial registrada`;
  }
  const diff = compareNormaDocuments(previousDoc, currentDoc);
  if (!diff.hasChanges) {
    return `${baseCount} · Sem alterações estruturais`;
  }

  const parts: string[] = [];
  const changedFieldLabels = diff.fieldDiffs
    .filter((f) => f.status === 'modified' && f.key !== 'observacoes')
    .map((f) => {
      if (f.key === 'epigrafe') return 'Epígrafe';
      if (f.key === 'ementa') return 'Ementa';
      if (f.key === 'fundamentoLegal') return 'Preâmbulo';
      if (f.key === 'vigencia') return 'Vigência';
      if (f.key === 'revogacoes') return 'Revogações';
      return f.label.split(' ')[0];
    });
  if (changedFieldLabels.length > 0) {
    parts.push(changedFieldLabels.slice(0, 2).join(', '));
  }
  if (diff.stats.addedArtigos > 0) {
    parts.push(`+${diff.stats.addedArtigos} art.`);
  }
  if (diff.stats.removedArtigos > 0) {
    parts.push(`-${diff.stats.removedArtigos} art.`);
  }
  if (diff.stats.modifiedArtigos > 0) {
    parts.push(`${diff.stats.modifiedArtigos} art. alterado(s)`);
  }
  if (parts.length === 0) {
    return `${baseCount} · Observações atualizadas`;
  }
  return `${baseCount} · ${parts.join(' · ')}`.slice(0, 235);
}

export function buildUnifiedPlainDiff(
  baseDoc: NormaDocument,
  currentDoc: NormaDocument
): LineDiffItem[] {
  return diffPlainLines(
    renderNormaPlainText(baseDoc),
    renderNormaPlainText(currentDoc)
  );
}
