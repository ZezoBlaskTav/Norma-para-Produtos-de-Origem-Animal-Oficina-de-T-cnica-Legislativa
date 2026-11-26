import { ArtigoItem } from '../types/norma';
import { toRoman } from './legistica';

export type ReorderDirection = 'up' | 'down';
export type DivisionKind = 'titulo' | 'capitulo' | 'secao' | 'subsecao';

export interface DivisionGroupSlice {
  key: string;
  hasExplicitDivision: boolean;
  divisionText: string;
  leaderArtId: string;
  startIndex: number;
  endIndex: number;
  items: Array<{ art: ArtigoItem; globalIndex: number }>;
}

export function moveArrayItem<T>(
  items: T[],
  index: number,
  direction: ReorderDirection
): T[] {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (
    index < 0 ||
    index >= items.length ||
    targetIndex < 0 ||
    targetIndex >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const current = next[index];
  next[index] = next[targetIndex];
  next[targetIndex] = current;
  return next;
}

function replaceRomanPrefix(
  raw: string,
  keywordPattern: string,
  seqNumber: number
): string {
  const regex = new RegExp(
    `^(\\s*${keywordPattern}\\s+)([IVXLCDM]+)((?:\\s|$|[-–—:]).*)$`,
    'i'
  );
  const match = raw.match(regex);
  if (!match) return raw;
  return `${match[1]}${toRoman(seqNumber)}${match[3]}`;
}

function replaceTechNumericPrefix(raw: string, seqNumber: number): string {
  const match = raw.match(/^(\s*)(\d+)(\.?\s+[-–—]?\s*.*)$/);
  if (!match) return raw;
  return `${match[1]}${seqNumber}${match[3]}`;
}

/**
 * Re-sequencia numeração romana (TÍTULO I, CAPÍTULO I, SEÇÃO I, SUBSEÇÃO I)
 * ou numeração progressiva explícita após reordenação de blocos normativos.
 */
export function resequenceDivisions(
  artigos: ArtigoItem[],
  isTech: boolean
): ArtigoItem[] {
  let tituloCount = 0;
  let capCount = 0;
  let secaoCount = 0;
  let subsecaoCount = 0;

  let lastRawTitulo = '';
  let lastRawCap = '';
  let lastRawSecao = '';
  let lastRawSubsecao = '';

  let lastFormattedTitulo: string | undefined;
  let lastFormattedCap: string | undefined;
  let lastFormattedSecao: string | undefined;
  let lastFormattedSubsecao: string | undefined;

  return artigos.map((art) => {
    let changed = false;
    const next: ArtigoItem = { ...art };

    if (art.titulo !== undefined) {
      const trimmed = art.titulo.trim();
      if (trimmed.length > 0) {
        if (trimmed !== lastRawTitulo) {
          lastRawTitulo = trimmed;
          lastRawCap = '';
          lastRawSecao = '';
          lastRawSubsecao = '';
          tituloCount += 1;
          capCount = 0;
          secaoCount = 0;
          subsecaoCount = 0;
          lastFormattedTitulo = isTech
            ? replaceTechNumericPrefix(art.titulo, tituloCount)
            : replaceRomanPrefix(art.titulo, 'T[ÍI]TULO', tituloCount);
          lastFormattedCap = undefined;
          lastFormattedSecao = undefined;
          lastFormattedSubsecao = undefined;
        }
        if (
          lastFormattedTitulo !== undefined &&
          lastFormattedTitulo !== art.titulo
        ) {
          next.titulo = lastFormattedTitulo;
          changed = true;
        }
      }
    }

    if (art.capitulo !== undefined) {
      const trimmed = art.capitulo.trim();
      if (trimmed.length > 0) {
        if (trimmed !== lastRawCap) {
          lastRawCap = trimmed;
          lastRawSecao = '';
          lastRawSubsecao = '';
          capCount += 1;
          secaoCount = 0;
          subsecaoCount = 0;
          lastFormattedCap = isTech
            ? art.capitulo
            : replaceRomanPrefix(art.capitulo, 'CAP[ÍI]TULO', capCount);
          lastFormattedSecao = undefined;
          lastFormattedSubsecao = undefined;
        }
        if (
          lastFormattedCap !== undefined &&
          lastFormattedCap !== art.capitulo
        ) {
          next.capitulo = lastFormattedCap;
          changed = true;
        }
      }
    }

    if (art.secao !== undefined) {
      const trimmed = art.secao.trim();
      if (trimmed.length > 0) {
        if (trimmed !== lastRawSecao) {
          lastRawSecao = trimmed;
          lastRawSubsecao = '';
          secaoCount += 1;
          subsecaoCount = 0;
          lastFormattedSecao = isTech
            ? art.secao
            : replaceRomanPrefix(art.secao, 'SE[ÇC][ÃA]O', secaoCount);
          lastFormattedSubsecao = undefined;
        }
        if (
          lastFormattedSecao !== undefined &&
          lastFormattedSecao !== art.secao
        ) {
          next.secao = lastFormattedSecao;
          changed = true;
        }
      }
    }

    if (art.subsecao !== undefined) {
      const trimmed = art.subsecao.trim();
      if (trimmed.length > 0) {
        if (trimmed !== lastRawSubsecao) {
          lastRawSubsecao = trimmed;
          subsecaoCount += 1;
          lastFormattedSubsecao = isTech
            ? art.subsecao
            : replaceRomanPrefix(art.subsecao, 'SUBSE[ÇC][ÃA]O', subsecaoCount);
        }
        if (
          lastFormattedSubsecao !== undefined &&
          lastFormattedSubsecao !== art.subsecao
        ) {
          next.subsecao = lastFormattedSubsecao;
          changed = true;
        }
      }
    }

    return changed ? next : art;
  });
}

export function buildDivisionGroupSlices(
  artigos: ArtigoItem[],
  activeDivisionKind: DivisionKind | null
): DivisionGroupSlice[] {
  const groups: DivisionGroupSlice[] = [];
  for (let i = 0; i < artigos.length; i++) {
    const art = artigos[i];
    const divVal = activeDivisionKind ? art[activeDivisionKind] : undefined;
    if (activeDivisionKind && divVal !== undefined) {
      groups.push({
        key: `divgrp-${activeDivisionKind}-${art.id}`,
        hasExplicitDivision: true,
        divisionText: divVal,
        leaderArtId: art.id,
        startIndex: i,
        endIndex: i,
        items: [{ art, globalIndex: i }],
      });
    } else if (groups.length === 0) {
      groups.push({
        key: 'divgrp-inicial',
        hasExplicitDivision: false,
        divisionText: '',
        leaderArtId: art.id,
        startIndex: i,
        endIndex: i,
        items: [{ art, globalIndex: i }],
      });
    } else {
      const last = groups[groups.length - 1];
      last.endIndex = i;
      last.items.push({ art, globalIndex: i });
    }
  }
  return groups;
}

export function moveDivisionGroupInArtigos(
  artigos: ArtigoItem[],
  activeDivisionKind: DivisionKind | null,
  groupIndex: number,
  direction: ReorderDirection,
  isTech: boolean
): ArtigoItem[] {
  if (!activeDivisionKind) return artigos;
  const groups = buildDivisionGroupSlices(artigos, activeDivisionKind);
  const targetIndex = direction === 'up' ? groupIndex - 1 : groupIndex + 1;
  if (
    groupIndex < 0 ||
    groupIndex >= groups.length ||
    targetIndex < 0 ||
    targetIndex >= groups.length
  ) {
    return artigos;
  }

  const currentGroup = groups[groupIndex];
  const targetGroup = groups[targetIndex];
  if (!currentGroup.hasExplicitDivision || !targetGroup.hasExplicitDivision) {
    return artigos;
  }

  const reorderedGroups = moveArrayItem(groups, groupIndex, direction);
  const nextArtigos = reorderedGroups.flatMap((grp) =>
    grp.items.map((item) => item.art)
  );
  return resequenceDivisions(nextArtigos, isTech);
}

const DIVISION_ORDER: DivisionKind[] = [
  'titulo',
  'capitulo',
  'secao',
  'subsecao',
];

function getParentDivisionKinds(kind: DivisionKind): DivisionKind[] {
  const idx = DIVISION_ORDER.indexOf(kind);
  return idx > 0 ? DIVISION_ORDER.slice(0, idx) : [];
}

function getSubdivisionScopeAndSiblings(
  artigos: ArtigoItem[],
  artId: string,
  kind: DivisionKind
): {
  scopeStart: number;
  scopeEnd: number;
  blocks: Array<{ start: number; end: number; hasExplicit: boolean }>;
  targetBlockIndex: number;
} | null {
  const artIndex = artigos.findIndex((a) => a.id === artId);
  if (artIndex < 0 || artigos[artIndex][kind] === undefined) return null;

  const parents = getParentDivisionKinds(kind);
  const hasAnyParentHeading = (art: ArtigoItem) =>
    parents.some((p) => art[p] !== undefined);

  let scopeStart = 0;
  for (let i = artIndex; i >= 0; i--) {
    if (hasAnyParentHeading(artigos[i])) {
      scopeStart = i;
      break;
    }
  }

  let scopeEnd = artigos.length - 1;
  for (let i = artIndex + 1; i < artigos.length; i++) {
    if (hasAnyParentHeading(artigos[i])) {
      scopeEnd = i - 1;
      break;
    }
  }

  const blocks: Array<{ start: number; end: number; hasExplicit: boolean }> =
    [];
  for (let i = scopeStart; i <= scopeEnd; i++) {
    const hasHeading = artigos[i][kind] !== undefined;
    if (hasHeading) {
      blocks.push({ start: i, end: i, hasExplicit: true });
    } else if (blocks.length === 0) {
      blocks.push({ start: i, end: i, hasExplicit: false });
    } else {
      blocks[blocks.length - 1].end = i;
    }
  }

  const targetBlockIndex = blocks.findIndex(
    (b) => artIndex >= b.start && artIndex <= b.end
  );
  if (targetBlockIndex < 0) return null;

  return { scopeStart, scopeEnd, blocks, targetBlockIndex };
}

export function getSubdivisionMoveCapabilities(
  artigos: ArtigoItem[],
  artId: string,
  kind: DivisionKind
): { canMoveUp: boolean; canMoveDown: boolean } {
  const info = getSubdivisionScopeAndSiblings(artigos, artId, kind);
  if (!info) return { canMoveUp: false, canMoveDown: false };
  const { blocks, targetBlockIndex } = info;
  const current = blocks[targetBlockIndex];
  if (!current?.hasExplicit) return { canMoveUp: false, canMoveDown: false };

  const prev = blocks[targetBlockIndex - 1];
  const next = blocks[targetBlockIndex + 1];
  return {
    canMoveUp: Boolean(prev && prev.hasExplicit),
    canMoveDown: Boolean(next && next.hasExplicit),
  };
}

export function moveSubdivisionBlockInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  kind: DivisionKind,
  direction: ReorderDirection,
  isTech: boolean
): ArtigoItem[] {
  const info = getSubdivisionScopeAndSiblings(artigos, artId, kind);
  if (!info) return artigos;

  const { scopeStart, scopeEnd, blocks, targetBlockIndex } = info;
  const siblingIndex =
    direction === 'up' ? targetBlockIndex - 1 : targetBlockIndex + 1;
  if (siblingIndex < 0 || siblingIndex >= blocks.length) return artigos;

  const currentBlock = blocks[targetBlockIndex];
  const targetBlock = blocks[siblingIndex];
  if (!currentBlock.hasExplicit || !targetBlock.hasExplicit) return artigos;

  const parents = getParentDivisionKinds(kind);
  const anchoredParentHeaders: Partial<Record<DivisionKind, string>> = {};
  const firstInScope = artigos[scopeStart];
  for (const p of parents) {
    if (firstInScope[p] !== undefined) {
      anchoredParentHeaders[p] = firstInScope[p];
    }
  }

  const workingScope = artigos.slice(scopeStart, scopeEnd + 1).map((a, idx) => {
    if (idx !== 0 || parents.length === 0) return a;
    const stripped: ArtigoItem = { ...a };
    for (const p of parents) {
      delete stripped[p];
    }
    return stripped;
  });

  const relBlocks = blocks.map((b) =>
    workingScope.slice(b.start - scopeStart, b.end - scopeStart + 1)
  );
  const reorderedRelBlocks = moveArrayItem(
    relBlocks,
    targetBlockIndex,
    direction
  );
  const flatReorderedScope = reorderedRelBlocks.flat();

  if (flatReorderedScope.length > 0 && Object.keys(anchoredParentHeaders).length > 0) {
    flatReorderedScope[0] = {
      ...flatReorderedScope[0],
      ...anchoredParentHeaders,
    };
  }

  const nextArtigos = [
    ...artigos.slice(0, scopeStart),
    ...flatReorderedScope,
    ...artigos.slice(scopeEnd + 1),
  ];

  return resequenceDivisions(nextArtigos, isTech);
}

/**
 * Move um único artigo para cima ou para baixo preservando cabeçalhos de divisão
 * (Título, Capítulo, Seção, Subseção) ancorados às respectivas posições estruturais.
 */
export function moveArtigoInList(
  artigos: ArtigoItem[],
  artIndex: number,
  direction: ReorderDirection
): {
  nextArtigos: ArtigoItem[];
  oldIndex: number;
  newIndex: number;
  swappedLeaderIds: Array<{ oldId: string; newId: string }>;
} {
  const targetIndex = direction === 'up' ? artIndex - 1 : artIndex + 1;
  if (
    artIndex < 0 ||
    artIndex >= artigos.length ||
    targetIndex < 0 ||
    targetIndex >= artigos.length
  ) {
    return {
      nextArtigos: artigos,
      oldIndex: artIndex,
      newIndex: artIndex,
      swappedLeaderIds: [],
    };
  }

  const artA = artigos[artIndex];
  const artB = artigos[targetIndex];

  const mergeSlotDivisionWithBody = (
    slotHolder: ArtigoItem,
    bodySource: ArtigoItem
  ): ArtigoItem => {
    const merged: ArtigoItem = {
      id: bodySource.id,
      caput: bodySource.caput,
      paragrafos: bodySource.paragrafos,
      incisos: bodySource.incisos,
    };
    if (bodySource.sufixo !== undefined) merged.sufixo = bodySource.sufixo;
    if (slotHolder.titulo !== undefined) merged.titulo = slotHolder.titulo;
    if (slotHolder.capitulo !== undefined) merged.capitulo = slotHolder.capitulo;
    if (slotHolder.secao !== undefined) merged.secao = slotHolder.secao;
    if (slotHolder.subsecao !== undefined) merged.subsecao = slotHolder.subsecao;
    return merged;
  };

  const nextArtigos = [...artigos];
  nextArtigos[artIndex] = mergeSlotDivisionWithBody(artA, artB);
  nextArtigos[targetIndex] = mergeSlotDivisionWithBody(artB, artA);

  const swappedLeaderIds: Array<{ oldId: string; newId: string }> = [];
  if (artA.id !== nextArtigos[artIndex].id) {
    swappedLeaderIds.push({ oldId: artA.id, newId: nextArtigos[artIndex].id });
  }
  if (artB.id !== nextArtigos[targetIndex].id) {
    swappedLeaderIds.push({ oldId: artB.id, newId: nextArtigos[targetIndex].id });
  }

  return {
    nextArtigos,
    oldIndex: artIndex,
    newIndex: targetIndex,
    swappedLeaderIds,
  };
}

export function moveIncisoInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  incisoIndex: number,
  direction: ReorderDirection
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? { ...a, incisos: moveArrayItem(a.incisos, incisoIndex, direction) }
      : a
  );
}

export function moveAlineaInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  incId: string,
  alineaIndex: number,
  direction: ReorderDirection
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? {
          ...a,
          incisos: a.incisos.map((i) =>
            i.id === incId
              ? { ...i, alineas: moveArrayItem(i.alineas, alineaIndex, direction) }
              : i
          ),
        }
      : a
  );
}

export function moveParagrafoInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  paragrafoIndex: number,
  direction: ReorderDirection
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? {
          ...a,
          paragrafos: moveArrayItem(a.paragrafos, paragrafoIndex, direction),
        }
      : a
  );
}

export function moveParagrafoIncisoInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  parId: string,
  incisoIndex: number,
  direction: ReorderDirection
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? {
          ...a,
          paragrafos: a.paragrafos.map((p) =>
            p.id === parId
              ? {
                  ...p,
                  incisos: moveArrayItem(p.incisos || [], incisoIndex, direction),
                }
              : p
          ),
        }
      : a
  );
}

export function moveParagrafoAlineaInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  parId: string,
  incId: string,
  alineaIndex: number,
  direction: ReorderDirection
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? {
          ...a,
          paragrafos: a.paragrafos.map((p) =>
            p.id === parId
              ? {
                  ...p,
                  incisos: (p.incisos || []).map((i) =>
                    i.id === incId
                      ? {
                          ...i,
                          alineas: moveArrayItem(i.alineas, alineaIndex, direction),
                        }
                      : i
                  ),
                }
              : p
          ),
        }
      : a
  );
}

export function reorderArrayByIdOrder<T extends { id: string }>(
  items: T[],
  reorderedIds: string[]
): T[] {
  if (items.length !== reorderedIds.length) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const result: T[] = [];
  for (const id of reorderedIds) {
    const found = byId.get(id);
    if (!found) return items;
    result.push(found);
  }
  const unchanged = result.every((item, idx) => item === items[idx]);
  return unchanged ? items : result;
}

export function reorderExplicitDivisionGroupsInArtigos(
  artigos: ArtigoItem[],
  activeDivisionKind: DivisionKind | null,
  reorderedExplicitLeaderIds: string[],
  isTech: boolean
): ArtigoItem[] {
  if (!activeDivisionKind) return artigos;
  const groups = buildDivisionGroupSlices(artigos, activeDivisionKind);
  const leadingNoDivGroups = groups.filter((g) => !g.hasExplicitDivision);
  const explicitGroups = groups.filter((g) => g.hasExplicitDivision);

  if (explicitGroups.length !== reorderedExplicitLeaderIds.length) {
    return artigos;
  }

  const byLeader = new Map(explicitGroups.map((g) => [g.leaderArtId, g]));
  const orderedExplicit: DivisionGroupSlice[] = [];
  for (const leaderId of reorderedExplicitLeaderIds) {
    const grp = byLeader.get(leaderId);
    if (!grp) return artigos;
    orderedExplicit.push(grp);
  }

  const unchanged = orderedExplicit.every(
    (g, idx) => g === explicitGroups[idx]
  );
  if (unchanged) return artigos;

  const nextArtigos = [...leadingNoDivGroups, ...orderedExplicit].flatMap(
    (grp) => grp.items.map((item) => item.art)
  );
  return resequenceDivisions(nextArtigos, isTech);
}

export function reorderArtigosSubsetInList(
  artigos: ArtigoItem[],
  startIndex: number,
  endIndex: number,
  reorderedArtIds: string[]
): {
  nextArtigos: ArtigoItem[];
  swappedLeaderIds: Array<{ oldId: string; newId: string }>;
} {
  const sliceLen = endIndex - startIndex + 1;
  if (
    startIndex < 0 ||
    endIndex >= artigos.length ||
    sliceLen <= 1 ||
    reorderedArtIds.length !== sliceLen
  ) {
    return { nextArtigos: artigos, swappedLeaderIds: [] };
  }

  const slice = artigos.slice(startIndex, endIndex + 1);
  const byId = new Map(slice.map((art) => [art.id, art]));
  const reorderedBodies: ArtigoItem[] = [];
  for (const id of reorderedArtIds) {
    const found = byId.get(id);
    if (!found) return { nextArtigos: artigos, swappedLeaderIds: [] };
    reorderedBodies.push(found);
  }

  const unchanged = reorderedBodies.every((art, idx) => art === slice[idx]);
  if (unchanged) {
    return { nextArtigos: artigos, swappedLeaderIds: [] };
  }

  const nextArtigos = [...artigos];
  const swappedLeaderIds: Array<{ oldId: string; newId: string }> = [];

  for (let offset = 0; offset < sliceLen; offset++) {
    const slotHolder = slice[offset];
    const bodySource = reorderedBodies[offset];
    const merged: ArtigoItem = {
      id: bodySource.id,
      caput: bodySource.caput,
      paragrafos: bodySource.paragrafos,
      incisos: bodySource.incisos,
    };
    if (bodySource.sufixo !== undefined) merged.sufixo = bodySource.sufixo;
    if (slotHolder.titulo !== undefined) merged.titulo = slotHolder.titulo;
    if (slotHolder.capitulo !== undefined) merged.capitulo = slotHolder.capitulo;
    if (slotHolder.secao !== undefined) merged.secao = slotHolder.secao;
    if (slotHolder.subsecao !== undefined) merged.subsecao = slotHolder.subsecao;

    nextArtigos[startIndex + offset] = merged;
    if (slotHolder.id !== bodySource.id) {
      swappedLeaderIds.push({ oldId: slotHolder.id, newId: bodySource.id });
    }
  }

  return { nextArtigos, swappedLeaderIds };
}

export function reorderIncisosInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  reorderedIds: string[]
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? { ...a, incisos: reorderArrayByIdOrder(a.incisos, reorderedIds) }
      : a
  );
}

export function reorderAlineasInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  incId: string,
  reorderedIds: string[]
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? {
          ...a,
          incisos: a.incisos.map((i) =>
            i.id === incId
              ? { ...i, alineas: reorderArrayByIdOrder(i.alineas, reorderedIds) }
              : i
          ),
        }
      : a
  );
}

export function reorderParagrafosInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  reorderedIds: string[]
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? {
          ...a,
          paragrafos: reorderArrayByIdOrder(a.paragrafos, reorderedIds),
        }
      : a
  );
}

export function reorderParagrafoIncisosInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  parId: string,
  reorderedIds: string[]
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? {
          ...a,
          paragrafos: a.paragrafos.map((p) =>
            p.id === parId
              ? {
                  ...p,
                  incisos: reorderArrayByIdOrder(p.incisos || [], reorderedIds),
                }
              : p
          ),
        }
      : a
  );
}

export function reorderParagrafoAlineasInArtigos(
  artigos: ArtigoItem[],
  artId: string,
  parId: string,
  incId: string,
  reorderedIds: string[]
): ArtigoItem[] {
  return artigos.map((a) =>
    a.id === artId
      ? {
          ...a,
          paragrafos: a.paragrafos.map((p) =>
            p.id === parId
              ? {
                  ...p,
                  incisos: (p.incisos || []).map((i) =>
                    i.id === incId
                      ? {
                          ...i,
                          alineas: reorderArrayByIdOrder(i.alineas, reorderedIds),
                        }
                      : i
                  ),
                }
              : p
          ),
        }
      : a
  );
}

