import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';
import { jsPDF } from 'jspdf';
import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  NormaDocument,
  NormaImagemAlinhamento,
  NormaImagemItem,
} from '../types/norma';
import {
  dataUrlToUint8Array,
  getDocxImageType,
  getPdfImageFormat,
} from './imageProcessing';
import {
  formatArtigoNumero,
  formatParagrafoNumero,
  getOrdemExecucaoPadrao,
  renderVigenciaClause,
  toLetter,
  toRoman,
} from './legistica';
import {
  NormaFormatProfile,
  computeProgressiveStructure,
  formatNormaEpigrafe,
  formatPreambuloParts,
  getNormaFormatProfile,
  getNormaSpec,
  getVigenciaPronomePrefix,
  isRegimentalWideEmenta,
} from './normaProfiles';

interface TechHeaderInfo {
  epigrafe: string;
  sigla: string;
  setorEmitente: string;
  dataEmissao: string;
  responsavel: string;
  vigenciaResumo: string;
  referencias: string;
  objetivo: string;
}

interface NormaSegment {
  kind:
    | 'epigrafe'
    | 'ementa'
    | 'ementa_larga'
    | 'tech_box'
    | 'tech_ordem'
    | 'tech_secao'
    | 'tech_subsecao'
    | 'tech_item'
    | 'tech_subitem'
    | 'tech_alinea'
    | 'tech_bullet'
    | 'preambulo'
    | 'titulo'
    | 'capitulo'
    | 'secao'
    | 'subsecao'
    | 'artigo'
    | 'paragrafo'
    | 'inciso'
    | 'alinea'
    | 'fecho'
    | 'assinatura_nome'
    | 'assinatura_cargo'
    | 'citacao'
    | 'anexo_titulo'
    | 'imagem'
    | 'imagem_legenda';
  boldPrefix?: string;
  text: string;
  trailingBold?: string;
  imagem?: NormaImagemItem;
  align?: NormaImagemAlinhamento;
  techHeader?: TechHeaderInfo;
}

function pushImageSegments(
  segments: NormaSegment[],
  img: NormaImagemItem
): void {
  if (img.titulo.trim()) {
    segments.push({
      kind: 'anexo_titulo',
      text: img.titulo.trim().toUpperCase(),
      align: img.alinhamento,
    });
  }
  segments.push({
    kind: 'imagem',
    text: '',
    imagem: img,
    align: img.alinhamento,
  });
  if (img.legenda.trim()) {
    segments.push({
      kind: 'imagem_legenda',
      text: img.legenda.trim(),
      align: img.alinhamento,
    });
  }
}

function buildTecnicoOperacionalSegments(doc: NormaDocument): NormaSegment[] {
  const segments: NormaSegment[] = [];
  const spec = getNormaSpec(doc.tipo);
  const imagens = Array.isArray(doc.imagens) ? doc.imagens : [];
  const cabecalhoImagens = imagens.filter((img) => img.posicao === 'cabecalho');
  for (const img of cabecalhoImagens) {
    pushImageSegments(segments, img);
  }

  const vigenciaResumo =
    doc.vigenciaTipo === 'imediata'
      ? 'Imediata na publicação/emissão'
      : doc.vigenciaTipo === 'dias'
        ? `${Math.max(1, doc.vigenciaDias || 30)} dias após emissão`
        : doc.vigenciaData.trim() || 'A definir';

  segments.push({
    kind: 'tech_box',
    text: formatNormaEpigrafe(doc),
    techHeader: {
      epigrafe: formatNormaEpigrafe(doc),
      sigla: spec.siglaCurta || doc.tipo.toUpperCase(),
      setorEmitente: doc.esfera.trim() || 'Não especificado',
      dataEmissao: doc.data.trim() || 'Não informada',
      responsavel: doc.autoridade.trim() || 'Responsável Técnico',
      vigenciaResumo,
      referencias: doc.fundamentoLegal.replace(/\n+/g, '; ').trim() || '—',
      objetivo: doc.ementa.trim() || '—',
    },
  });

  const ordem = doc.ordemExecucao.trim() || getOrdemExecucaoPadrao(doc.tipo);
  if (ordem) {
    segments.push({
      kind: 'tech_ordem',
      text: ordem,
    });
  }

  const progressive = computeProgressiveStructure(doc.artigos);
  let nextPrimarySec = 1;
  let nextFlatNum = 1;
  let hasSections = false;

  doc.artigos.forEach((artigo, idx) => {
    const layout = progressive[idx];
    nextPrimarySec = layout.nextPrimarySectionNum;
    nextFlatNum = layout.nextFlatItemNum;
    hasSections = layout.hasSections;

    for (const h of layout.headings) {
      segments.push({
        kind:
          h.kind === 'titulo' || h.kind === 'capitulo'
            ? 'tech_secao'
            : 'tech_subsecao',
        text: h.formattedText,
      });
    }

    const hasIncisos = artigo.incisos.length > 0;
    let caput = artigo.caput.trim();
    if (hasIncisos && !caput.endsWith(':')) {
      caput = `${caput.replace(/[.;]+$/, '')}:`;
    } else if (!hasIncisos && caput && !/[.!?]$/.test(caput)) {
      caput = `${caput}.`;
    }

    segments.push({
      kind: 'tech_item',
      boldPrefix: `${layout.itemLabel} `,
      text: caput,
    });

    artigo.incisos.forEach((inc, iIdx) => {
      const isLastInc = iIdx === artigo.incisos.length - 1;
      const letter = toLetter(iIdx);
      const hasAlineas = inc.alineas.length > 0;
      let incText = inc.texto.trim();
      if (hasAlineas) {
        incText = `${incText.replace(/[.;:]+$/, '')}:`;
      } else if (isLastInc) {
        incText = `${incText.replace(/[.;:]+$/, '')}.`;
      } else {
        incText = `${incText.replace(/[.;:]+$/, '')};`;
      }
      segments.push({
        kind: 'tech_alinea',
        boldPrefix: `${letter}) `,
        text: incText,
      });

      inc.alineas.forEach((al, alIdx) => {
        const isLastAl = alIdx === inc.alineas.length - 1;
        const alText = `${al.texto.trim().replace(/[.;:]+$/, '')}${isLastAl && isLastInc ? '.' : ';'}`;
        segments.push({
          kind: 'tech_bullet',
          text: `• ${alText}`,
        });
      });
    });

    artigo.paragrafos.forEach((par, pIdx) => {
      const subLabel = layout.subItemLabels[pIdx];
      const parIncisos = par.incisos || [];
      let parText = par.texto.trim();
      if (parIncisos.length > 0 && !parText.endsWith(':')) {
        parText = `${parText.replace(/[.;]+$/, '')}:`;
      } else if (parIncisos.length === 0 && parText && !/[.!?]$/.test(parText)) {
        parText = `${parText}.`;
      }

      segments.push({
        kind: 'tech_subitem',
        boldPrefix: `${subLabel} `,
        text: parText,
      });

      parIncisos.forEach((inc, iIdx) => {
        const isLastInc = iIdx === parIncisos.length - 1;
        const letter = toLetter(iIdx);
        const hasAlineas = inc.alineas.length > 0;
        let incText = inc.texto.trim();
        if (hasAlineas) {
          incText = `${incText.replace(/[.;:]+$/, '')}:`;
        } else if (isLastInc) {
          incText = `${incText.replace(/[.;:]+$/, '')}.`;
        } else {
          incText = `${incText.replace(/[.;:]+$/, '')};`;
        }
        segments.push({
          kind: 'tech_alinea',
          boldPrefix: `${letter}) `,
          text: incText,
        });

        inc.alineas.forEach((al, alIdx) => {
          const isLastAl = alIdx === inc.alineas.length - 1;
          const alText = `${al.texto.trim().replace(/[.;:]+$/, '')}${isLastAl && isLastInc ? '.' : ';'}`;
          segments.push({
            kind: 'tech_bullet',
            text: `• ${alText}`,
          });
        });
      });
    });

    const posArtigoImgs = imagens.filter(
      (img) => img.posicao === 'pos_artigo' && img.artigoId === artigo.id
    );
    for (const img of posArtigoImgs) {
      pushImageSegments(segments, img);
    }
  });

  const revogacoesValidas = doc.revogacoes.map((r) => r.trim()).filter(Boolean);
  if (revogacoesValidas.length > 0) {
    if (hasSections) {
      segments.push({
        kind: 'tech_secao',
        text: `${nextPrimarySec}. DISPOSIÇÕES SUBSTITUÍDAS`,
      });
      if (revogacoesValidas.length === 1) {
        segments.push({
          kind: 'tech_item',
          boldPrefix: `${nextPrimarySec}.1 `,
          text: `Fica substituído/revogado o documento ${revogacoesValidas[0].replace(/\.$/, '')}.`,
        });
      } else {
        segments.push({
          kind: 'tech_item',
          boldPrefix: `${nextPrimarySec}.1 `,
          text: 'Ficam substituídos ou revogados:',
        });
        revogacoesValidas.forEach((rev, rIdx) => {
          const sep = rIdx === revogacoesValidas.length - 1 ? '.' : ';';
          segments.push({
            kind: 'tech_alinea',
            boldPrefix: `${toLetter(rIdx)}) `,
            text: `${rev.replace(/[.;]+$/, '')}${sep}`,
          });
        });
      }
      nextPrimarySec += 1;
    } else {
      if (revogacoesValidas.length === 1) {
        segments.push({
          kind: 'tech_item',
          boldPrefix: `${nextFlatNum}. `,
          text: `Fica substituído/revogado o documento ${revogacoesValidas[0].replace(/\.$/, '')}.`,
        });
      } else {
        segments.push({
          kind: 'tech_item',
          boldPrefix: `${nextFlatNum}. `,
          text: 'Ficam substituídos ou revogados:',
        });
        revogacoesValidas.forEach((rev, rIdx) => {
          const sep = rIdx === revogacoesValidas.length - 1 ? '.' : ';';
          segments.push({
            kind: 'tech_alinea',
            boldPrefix: `${toLetter(rIdx)}) `,
            text: `${rev.replace(/[.;]+$/, '')}${sep}`,
          });
        });
      }
      nextFlatNum += 1;
    }
  }

  const vigText = renderVigenciaClause(doc);
  if (hasSections) {
    segments.push({
      kind: 'tech_secao',
      text: `${nextPrimarySec}. VIGÊNCIA E CONTROLE DE REVISÃO`,
    });
    segments.push({
      kind: 'tech_item',
      boldPrefix: `${nextPrimarySec}.1 `,
      text: vigText,
    });
  } else {
    segments.push({
      kind: 'tech_item',
      boldPrefix: `${nextFlatNum}. `,
      text: vigText,
    });
  }

  if (doc.localAssinatura.trim()) {
    segments.push({
      kind: 'fecho',
      text: doc.localAssinatura.trim(),
    });
  }

  if (doc.assinante.trim()) {
    segments.push({
      kind: 'assinatura_nome',
      text: doc.assinante.trim().toUpperCase(),
    });
    if (doc.cargoAssinante.trim()) {
      segments.push({
        kind: 'assinatura_cargo',
        text: doc.cargoAssinante.trim(),
      });
    }
  }

  const artigoIds = new Set(doc.artigos.map((a) => a.id));
  const anexoImagens = imagens.filter(
    (img) =>
      img.posicao === 'anexo' ||
      (img.posicao === 'pos_artigo' &&
        (!img.artigoId || !artigoIds.has(img.artigoId)))
  );
  for (const img of anexoImagens) {
    pushImageSegments(segments, img);
  }

  return segments;
}

function buildNormaSegments(doc: NormaDocument): NormaSegment[] {
  const profile = getNormaFormatProfile(doc.tipo);
  if (profile === 'tecnico_operacional') {
    return buildTecnicoOperacionalSegments(doc);
  }

  const segments: NormaSegment[] = [];
  const imagens = Array.isArray(doc.imagens) ? doc.imagens : [];
  const cabecalhoImagens = imagens.filter((img) => img.posicao === 'cabecalho');
  for (const img of cabecalhoImagens) {
    pushImageSegments(segments, img);
  }

  segments.push({
    kind: 'epigrafe',
    text: formatNormaEpigrafe(doc),
  });

  if (doc.ementa.trim()) {
    segments.push({
      kind: isRegimentalWideEmenta(doc.tipo) ? 'ementa_larga' : 'ementa',
      text: doc.ementa.trim(),
    });
  }

  const pre = formatPreambuloParts(doc);
  if (pre.ordemInlineAfterAutoridade) {
    segments.push({
      kind: 'preambulo',
      boldPrefix: pre.autoridade ? `${pre.autoridade}${pre.separadorAutoridade}` : undefined,
      text: '',
      trailingBold: pre.ordem,
    });
  } else if (pre.linhasFundamento.length === 1) {
    const f = pre.linhasFundamento[0];
    const sep = pre.needsCommaBeforeOrdem ? ', ' : ' ';
    segments.push({
      kind: 'preambulo',
      boldPrefix: pre.autoridade ? `${pre.autoridade}${pre.separadorAutoridade}` : undefined,
      text: pre.ordem ? `${f}${sep}` : f,
      trailingBold: pre.ordem || undefined,
    });
  } else {
    segments.push({
      kind: 'preambulo',
      boldPrefix: pre.autoridade ? `${pre.autoridade}${pre.separadorAutoridade}` : undefined,
      text: pre.linhasFundamento[0],
    });
    for (let i = 1; i < pre.linhasFundamento.length - 1; i++) {
      segments.push({
        kind: 'preambulo',
        text: pre.linhasFundamento[i],
      });
    }
    const lastFund = pre.linhasFundamento[pre.linhasFundamento.length - 1];
    if (pre.ordem) {
      const sep = pre.needsCommaBeforeOrdem ? ', ' : ' ';
      segments.push({
        kind: 'preambulo',
        text: `${lastFund}${sep}`,
        trailingBold: pre.ordem,
      });
    } else {
      segments.push({
        kind: 'preambulo',
        text: lastFund,
      });
    }
  }

  let lastTitulo = '';
  let lastCapitulo = '';
  let lastSecao = '';
  let lastSubsecao = '';
  let artCounter = 0;

  for (const artigo of doc.artigos) {
    if (artigo.titulo && artigo.titulo.trim() !== lastTitulo) {
      lastTitulo = artigo.titulo.trim();
      lastCapitulo = '';
      lastSecao = '';
      lastSubsecao = '';
      segments.push({
        kind: 'titulo',
        text: lastTitulo.toUpperCase(),
      });
    }
    if (artigo.capitulo && artigo.capitulo.trim() !== lastCapitulo) {
      lastCapitulo = artigo.capitulo.trim();
      lastSecao = '';
      lastSubsecao = '';
      segments.push({
        kind: 'capitulo',
        text: lastCapitulo.toUpperCase(),
      });
    }
    if (artigo.secao && artigo.secao.trim() !== lastSecao) {
      lastSecao = artigo.secao.trim();
      lastSubsecao = '';
      segments.push({
        kind: 'secao',
        text: lastSecao.toUpperCase(),
      });
    }
    if (artigo.subsecao && artigo.subsecao.trim() !== lastSubsecao) {
      lastSubsecao = artigo.subsecao.trim();
      segments.push({
        kind: 'subsecao',
        text: lastSubsecao,
      });
    }

    artCounter += 1;
    const artLabel = formatArtigoNumero(artCounter, artigo.sufixo);
    const hasIncisos = artigo.incisos.length > 0;
    let caput = artigo.caput.trim();
    if (hasIncisos && !caput.endsWith(':')) {
      caput = `${caput.replace(/[.;]+$/, '')}:`;
    } else if (!hasIncisos && caput && !/[.!?]$/.test(caput)) {
      caput = `${caput}.`;
    }

    segments.push({
      kind: 'artigo',
      boldPrefix: `${artLabel} `,
      text: caput,
    });

    artigo.incisos.forEach((inc, idx) => {
      const isLastInciso = idx === artigo.incisos.length - 1;
      const roman = toRoman(idx + 1);
      const hasAlineas = inc.alineas.length > 0;
      let incText = inc.texto.trim();

      if (hasAlineas) {
        incText = `${incText.replace(/[.;:]+$/, '')}:`;
      } else if (isLastInciso) {
        incText = `${incText.replace(/[.;:]+$/, '')}.`;
      } else {
        incText = `${incText.replace(/[.;:]+$/, '')};`;
      }

      segments.push({
        kind: 'inciso',
        text: `${roman} - ${incText}`,
      });

      inc.alineas.forEach((al, alIdx) => {
        const isLastAlinea = alIdx === inc.alineas.length - 1;
        const letter = toLetter(alIdx);
        const sep = isLastAlinea && isLastInciso ? '.' : ';';
        const alText = `${al.texto.trim().replace(/[.;:]+$/, '')}${sep}`;
        segments.push({
          kind: 'alinea',
          text: `${letter}) ${alText}`,
        });
      });
    });

    artigo.paragrafos.forEach((par, pIdx) => {
      const parLabel = formatParagrafoNumero(
        pIdx,
        artigo.paragrafos.length,
        par.sufixo
      );
      const parIncisos = par.incisos || [];
      let parText = par.texto.trim();
      if (parIncisos.length > 0 && !parText.endsWith(':')) {
        parText = `${parText.replace(/[.;]+$/, '')}:`;
      } else if (parIncisos.length === 0 && parText && !/[.!?]$/.test(parText)) {
        parText = `${parText}.`;
      }
      segments.push({
        kind: 'paragrafo',
        boldPrefix: `${parLabel} `,
        text: parText,
      });

      parIncisos.forEach((inc, idx) => {
        const isLastInciso = idx === parIncisos.length - 1;
        const roman = toRoman(idx + 1);
        const hasAlineas = inc.alineas.length > 0;
        let incText = inc.texto.trim();

        if (hasAlineas) {
          incText = `${incText.replace(/[.;:]+$/, '')}:`;
        } else if (isLastInciso) {
          incText = `${incText.replace(/[.;:]+$/, '')}.`;
        } else {
          incText = `${incText.replace(/[.;:]+$/, '')};`;
        }

        segments.push({
          kind: 'inciso',
          text: `${roman} - ${incText}`,
        });

        inc.alineas.forEach((al, alIdx) => {
          const isLastAlinea = alIdx === inc.alineas.length - 1;
          const letter = toLetter(alIdx);
          const sep = isLastAlinea && isLastInciso ? '.' : ';';
          const alText = `${al.texto.trim().replace(/[.;:]+$/, '')}${sep}`;
          segments.push({
            kind: 'alinea',
            text: `${letter}) ${alText}`,
          });
        });
      });
    });

    const posArtigoImgs = imagens.filter(
      (img) => img.posicao === 'pos_artigo' && img.artigoId === artigo.id
    );
    for (const img of posArtigoImgs) {
      pushImageSegments(segments, img);
    }
  }

  const revogacoesValidas = doc.revogacoes.map((r) => r.trim()).filter(Boolean);
  if (revogacoesValidas.length > 0) {
    artCounter += 1;
    const revArtLabel = formatArtigoNumero(artCounter);
    if (revogacoesValidas.length === 1) {
      segments.push({
        kind: 'artigo',
        boldPrefix: `${revArtLabel} `,
        text: `Fica revogado o ${revogacoesValidas[0].replace(/\.$/, '')}.`,
      });
    } else {
      segments.push({
        kind: 'artigo',
        boldPrefix: `${revArtLabel} `,
        text: 'Ficam revogados:',
      });
      revogacoesValidas.forEach((rev, rIdx) => {
        const sep = rIdx === revogacoesValidas.length - 1 ? '.' : ';';
        segments.push({
          kind: 'inciso',
          text: `${toRoman(rIdx + 1)} - ${rev.replace(/[.;]+$/, '')}${sep}`,
        });
      });
    }
  }

  artCounter += 1;
  const vigArtLabel = formatArtigoNumero(artCounter);
  const vigText = renderVigenciaClause(doc);

  segments.push({
    kind: 'artigo',
    boldPrefix: `${vigArtLabel} `,
    text: vigText,
  });

  if (doc.localAssinatura.trim()) {
    segments.push({
      kind: 'fecho',
      text: doc.localAssinatura.trim(),
    });
  }

  if (doc.assinante.trim()) {
    segments.push({
      kind: 'assinatura_nome',
      text: doc.assinante.trim().toUpperCase(),
    });
    if (doc.cargoAssinante.trim()) {
      segments.push({
        kind: 'assinatura_cargo',
        text: doc.cargoAssinante.trim(),
      });
    }
  }

  const artigoIds = new Set(doc.artigos.map((a) => a.id));
  const anexoImagens = imagens.filter(
    (img) =>
      img.posicao === 'anexo' ||
      (img.posicao === 'pos_artigo' &&
        (!img.artigoId || !artigoIds.has(img.artigoId)))
  );
  for (const img of anexoImagens) {
    pushImageSegments(segments, img);
  }

  return segments;
}

function buildAlteracaoSegments(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): NormaSegment[] {
  const segments: NormaSegment[] = [];

  segments.push({
    kind: 'epigrafe',
    text: formatNormaEpigrafe({
      tipo: meta.atoAlteradorTipo,
      numero: meta.atoAlteradorNumero,
      data: meta.atoAlteradorData,
    }),
  });

  segments.push({
    kind: 'ementa',
    text: `Altera ${meta.normaAlvoNome.trim()}, ${meta.normaAlvoEmentaResumo.trim().replace(/\.$/, '')}.`,
  });

  const pre = formatPreambuloParts({
    tipo: meta.atoAlteradorTipo,
    autoridade: meta.autoridade,
    fundamentoLegal: meta.fundamentoLegal,
    ordemExecucao: meta.ordemExecucao,
  });

  if (pre.ordemInlineAfterAutoridade) {
    segments.push({
      kind: 'preambulo',
      boldPrefix: pre.autoridade ? `${pre.autoridade}${pre.separadorAutoridade}` : undefined,
      text: '',
      trailingBold: pre.ordem,
    });
  } else {
    const f = pre.linhasFundamento.join(' ');
    const sep = pre.needsCommaBeforeOrdem ? ', ' : ' ';
    segments.push({
      kind: 'preambulo',
      boldPrefix: pre.autoridade ? `${pre.autoridade}${pre.separadorAutoridade}` : undefined,
      text: pre.ordem ? `${f}${sep}` : f,
      trailingBold: pre.ordem || undefined,
    });
  }

  const alteracoesOuAcrescimos = alteracoes.filter(
    (a) => a.tipoAcao === 'alterar' || a.tipoAcao === 'acrescer'
  );
  const revogacoes = alteracoes.filter((a) => a.tipoAcao === 'revogar');

  let artCounter = 0;

  if (alteracoesOuAcrescimos.length > 0) {
    artCounter += 1;
    segments.push({
      kind: 'artigo',
      boldPrefix: `${formatArtigoNumero(artCounter)} `,
      text: `${meta.normaAlvoNome.trim()} passa a vigorar com as seguintes alterações:`,
    });

    alteracoesOuAcrescimos.forEach((item, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === alteracoesOuAcrescimos.length - 1;
      const openQuote = isFirst ? '"' : '';
      const closeQuote = isLast ? '"' : '';

      if (item.incluirPontilhadoAntes) {
        segments.push({
          kind: 'citacao',
          text: `${openQuote}...........................................................................`,
        });
      }

      const corpo = item.textoNovo.trim();
      const comNR = corpo.endsWith('(NR)') ? corpo : `${corpo} (NR)`;
      const prefix = !item.incluirPontilhadoAntes ? openQuote : '';
      const suffix = !item.incluirPontilhadoDepois ? closeQuote : '';
      segments.push({
        kind: 'citacao',
        text: `${prefix}${comNR}${suffix}`,
      });

      if (item.incluirPontilhadoDepois) {
        segments.push({
          kind: 'citacao',
          text: `...........................................................................${closeQuote}`,
        });
      }
    });
  }

  if (revogacoes.length > 0) {
    artCounter += 1;
    if (revogacoes.length === 1) {
      segments.push({
        kind: 'artigo',
        boldPrefix: `${formatArtigoNumero(artCounter)} `,
        text: `Fica revogado ${revogacoes[0].dispositivoAlvo.trim()} do ${meta.normaAlvoNome.trim()}.`,
      });
    } else {
      segments.push({
        kind: 'artigo',
        boldPrefix: `${formatArtigoNumero(artCounter)} `,
        text: `Ficam revogados os seguintes dispositivos do ${meta.normaAlvoNome.trim()}:`,
      });
      revogacoes.forEach((rev, rIdx) => {
        const sep = rIdx === revogacoes.length - 1 ? '.' : ';';
        segments.push({
          kind: 'inciso',
          text: `${toRoman(rIdx + 1)} - ${rev.dispositivoAlvo.trim()}${sep}`,
        });
      });
    }
  }

  artCounter += 1;
  const defaultVig = `${getVigenciaPronomePrefix(meta.atoAlteradorTipo)} entra em vigor na data de sua publicação.`;
  segments.push({
    kind: 'artigo',
    boldPrefix: `${formatArtigoNumero(artCounter)} `,
    text: meta.vigenciaTexto.trim() || defaultVig,
  });

  if (meta.localAssinatura.trim()) {
    segments.push({
      kind: 'fecho',
      text: meta.localAssinatura.trim(),
    });
  }

  if (meta.assinante.trim()) {
    segments.push({
      kind: 'assinatura_nome',
      text: meta.assinante.trim().toUpperCase(),
    });
    if (meta.cargoAssinante.trim()) {
      segments.push({
        kind: 'assinatura_cargo',
        text: meta.cargoAssinante.trim(),
      });
    }
  }

  return segments;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFileName(base: string): string {
  return base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildDocxTechTable(info: TechHeaderInfo, font: string): Table {
  const borderSpec = {
    style: BorderStyle.SINGLE,
    size: 6,
    color: 'CBD5E1',
  };
  const cellBorders = {
    top: borderSpec,
    bottom: borderSpec,
    left: borderSpec,
    right: borderSpec,
  };
  const cellMargins = {
    top: 100,
    bottom: 100,
    left: 140,
    right: 140,
  };

  const makeMetaCell = (
    label: string,
    value: string,
    columnSpan?: number,
    widthPct?: number
  ) =>
    new TableCell({
      columnSpan,
      width: widthPct
        ? { size: widthPct, type: WidthType.PERCENTAGE }
        : undefined,
      borders: cellBorders,
      margins: cellMargins,
      children: [
        new Paragraph({
          spacing: { after: 0, line: 260 },
          children: [
            new TextRun({
              text: `${label}: `,
              bold: true,
              font,
              size: 20,
              color: '334155',
            }),
            new TextRun({
              text: value,
              font,
              size: 20,
              color: '0F172A',
            }),
          ],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            borders: cellBorders,
            margins: { top: 130, bottom: 130, left: 140, right: 140 },
            shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0, line: 280 },
                children: [
                  new TextRun({
                    text: info.epigrafe,
                    bold: true,
                    font,
                    size: 24,
                    color: '0F172A',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          makeMetaCell('Área / Setor Emitente', info.setorEmitente, 1, 55),
          makeMetaCell('Data / Emissão', info.dataEmissao, 1, 45),
        ],
      }),
      new TableRow({
        children: [
          makeMetaCell('Responsável Técnico', info.responsavel, 1, 55),
          makeMetaCell('Vigência', info.vigenciaResumo, 1, 45),
        ],
      }),
      new TableRow({
        children: [
          makeMetaCell('Normas de Referência', info.referencias, 2),
        ],
      }),
      new TableRow({
        children: [
          makeMetaCell('Objetivo / Escopo', info.objetivo, 2),
        ],
      }),
    ],
  });
}

function segmentsToDocx(
  segments: NormaSegment[],
  profile: NormaFormatProfile
): Document {
  const isTech = profile === 'tecnico_operacional';
  const FONT = isTech ? 'Arial' : 'Times New Roman';
  const SIZE_BODY = isTech ? 22 : 24; // 11pt para IT/POP (ABNT), 12pt para atos normativos
  const SIZE_11 = 22;

  const children: Array<Paragraph | Table> = [];

  for (const seg of segments) {
    switch (seg.kind) {
      case 'tech_box':
        if (seg.techHeader) {
          children.push(buildDocxTechTable(seg.techHeader, FONT));
          children.push(
            new Paragraph({
              spacing: { after: 160 },
              children: [],
            })
          );
        }
        break;

      case 'tech_ordem':
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 180, line: 280 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_11,
              }),
            ],
          })
        );
        break;

      case 'tech_secao':
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 240, after: 120, line: 280 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'tech_subsecao':
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 160, after: 100, line: 280 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'tech_item':
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 120, line: 320 },
            children: [
              ...(seg.boldPrefix
                ? [
                    new TextRun({
                      text: seg.boldPrefix,
                      bold: true,
                      font: FONT,
                      size: SIZE_BODY,
                    }),
                  ]
                : []),
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'tech_subitem':
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: convertMillimetersToTwip(8) },
            spacing: { after: 100, line: 320 },
            children: [
              ...(seg.boldPrefix
                ? [
                    new TextRun({
                      text: seg.boldPrefix,
                      bold: true,
                      font: FONT,
                      size: SIZE_BODY,
                    }),
                  ]
                : []),
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'tech_alinea':
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: convertMillimetersToTwip(14) },
            spacing: { after: 80, line: 300 },
            children: [
              ...(seg.boldPrefix
                ? [
                    new TextRun({
                      text: seg.boldPrefix,
                      bold: true,
                      font: FONT,
                      size: SIZE_BODY,
                    }),
                  ]
                : []),
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'tech_bullet':
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: convertMillimetersToTwip(22) },
            spacing: { after: 70, line: 300 },
            children: [
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'epigrafe':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 280, line: 300 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'ementa':
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: convertMillimetersToTwip(75) },
            spacing: { after: 280, line: 276 },
            children: [
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_11,
              }),
            ],
          })
        );
        break;

      case 'ementa_larga':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
            },
            spacing: { before: 80, after: 280, line: 280 },
            children: [
              new TextRun({
                text: seg.text,
                italics: true,
                font: FONT,
                size: SIZE_11,
              }),
            ],
          })
        );
        break;

      case 'preambulo':
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: convertMillimetersToTwip(25) },
            spacing: { after: 240, line: 360 },
            children: [
              ...(seg.boldPrefix
                ? [
                    new TextRun({
                      text: seg.boldPrefix,
                      bold: true,
                      font: FONT,
                      size: SIZE_BODY,
                    }),
                  ]
                : []),
              ...(seg.text
                ? [
                    new TextRun({
                      text: seg.text,
                      font: FONT,
                      size: SIZE_BODY,
                    }),
                  ]
                : []),
              ...(seg.trailingBold
                ? [
                    new TextRun({
                      text: seg.trailingBold,
                      bold: true,
                      font: FONT,
                      size: SIZE_BODY,
                    }),
                  ]
                : []),
            ],
          })
        );
        break;

      case 'titulo':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 320, after: 200, line: 300 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'capitulo':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 180, line: 300 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'secao':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 140, line: 300 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'subsecao':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 160, after: 120, line: 300 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'artigo':
      case 'paragrafo':
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: convertMillimetersToTwip(25) },
            spacing: { after: 160, line: 360 },
            children: [
              ...(seg.boldPrefix
                ? [
                    new TextRun({
                      text: seg.boldPrefix,
                      bold: true,
                      font: FONT,
                      size: SIZE_BODY,
                    }),
                  ]
                : []),
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'inciso':
      case 'citacao':
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: convertMillimetersToTwip(25) },
            spacing: { after: 120, line: 360 },
            children: [
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'alinea':
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: convertMillimetersToTwip(35) },
            spacing: { after: 100, line: 360 },
            children: [
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'fecho':
        children.push(
          new Paragraph({
            alignment: isTech ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
            indent: isTech
              ? undefined
              : { firstLine: convertMillimetersToTwip(25) },
            spacing: { before: 240, after: 360, line: 360 },
            children: [
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'assinatura_nome':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 40, line: 280 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'assinatura_cargo':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120, line: 280 },
            children: [
              new TextRun({
                text: seg.text,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;

      case 'anexo_titulo': {
        const align =
          seg.align === 'left'
            ? AlignmentType.LEFT
            : seg.align === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.CENTER;
        children.push(
          new Paragraph({
            alignment: align,
            spacing: { before: 320, after: 140, line: 300 },
            children: [
              new TextRun({
                text: seg.text,
                bold: true,
                font: FONT,
                size: SIZE_BODY,
              }),
            ],
          })
        );
        break;
      }

      case 'imagem': {
        const img = seg.imagem;
        if (!img) break;
        const widthMm = Math.min(155, Math.max(20, img.larguraMm || 55));
        const widthPx = Math.round((widthMm / 25.4) * 96);
        const ratio = (img.heightPx || 1) / Math.max(1, img.widthPx || 1);
        const heightPx = Math.max(12, Math.round(widthPx * ratio));
        const align =
          img.alinhamento === 'left'
            ? AlignmentType.LEFT
            : img.alinhamento === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.CENTER;
        children.push(
          new Paragraph({
            alignment: align,
            spacing: { before: 120, after: 100 },
            children: [
              new ImageRun({
                type: getDocxImageType(img.mimeType, img.dataUrl),
                data: dataUrlToUint8Array(img.dataUrl),
                transformation: {
                  width: widthPx,
                  height: heightPx,
                },
              }),
            ],
          })
        );
        break;
      }

      case 'imagem_legenda': {
        const align =
          seg.align === 'left'
            ? AlignmentType.LEFT
            : seg.align === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.CENTER;
        children.push(
          new Paragraph({
            alignment: align,
            spacing: { after: 200, line: 260 },
            children: [
              new TextRun({
                text: seg.text,
                italics: true,
                font: FONT,
                size: 20,
              }),
            ],
          })
        );
        break;
      }
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(30),
              left: convertMillimetersToTwip(30),
              bottom: convertMillimetersToTwip(20),
              right: convertMillimetersToTwip(20),
            },
          },
        },
        children,
      },
    ],
  });
}

interface RichToken {
  word: string;
  bold: boolean;
  italic?: boolean;
}

function tokenizeRich(
  boldPrefix: string | undefined,
  text: string,
  trailingBold: string | undefined,
  italicText?: boolean
): RichToken[] {
  const tokens: RichToken[] = [];
  const pushWords = (str: string, bold: boolean, italic?: boolean) => {
    const words = str.trim().split(/\s+/).filter(Boolean);
    for (const w of words) {
      tokens.push({ word: w, bold, italic });
    }
  };
  if (boldPrefix) pushWords(boldPrefix, true);
  if (text) pushWords(text, false, italicText);
  if (trailingBold) pushWords(trailingBold, true);
  return tokens;
}

function segmentsToPdf(
  segments: NormaSegment[],
  profile: NormaFormatProfile
): jsPDF {
  const isTech = profile === 'tecnico_operacional';
  const pdfFont = isTech ? 'helvetica' : 'times';
  const baseBodyPt = isTech ? 11 : 12;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const LEFT_MARGIN = 30;
  const RIGHT_MARGIN = 20;
  const TOP_MARGIN = 30;
  const BOTTOM_LIMIT = 277;
  const CONTENT_WIDTH = 210 - LEFT_MARGIN - RIGHT_MARGIN; // 160mm

  let cursorY = TOP_MARGIN;

  const ensureSpace = (heightNeeded: number) => {
    if (cursorY + heightNeeded > BOTTOM_LIMIT) {
      pdf.addPage();
      cursorY = TOP_MARGIN;
    }
  };

  const drawTechIdentificationBox = (info: TechHeaderInfo) => {
    const padX = 3;
    const lineH = 4.6;
    const titleH = 9;
    pdf.setFont(pdfFont, 'normal');
    pdf.setFontSize(9.5);

    const refLines = pdf.splitTextToSize(
      `Normas de Referência: ${info.referencias}`,
      CONTENT_WIDTH - padX * 2
    ) as string[];
    const objLines = pdf.splitTextToSize(
      `Objetivo / Escopo: ${info.objetivo}`,
      CONTENT_WIDTH - padX * 2
    ) as string[];

    const halfW = CONTENT_WIDTH / 2;
    const col1Row2 = pdf.splitTextToSize(
      `Área / Setor Emitente: ${info.setorEmitente}`,
      halfW - padX * 2
    ) as string[];
    const col2Row2 = pdf.splitTextToSize(
      `Data / Emissão: ${info.dataEmissao}`,
      halfW - padX * 2
    ) as string[];
    const row2H = Math.max(col1Row2.length, col2Row2.length) * lineH + 4;

    const col1Row3 = pdf.splitTextToSize(
      `Responsável Técnico: ${info.responsavel}`,
      halfW - padX * 2
    ) as string[];
    const col2Row3 = pdf.splitTextToSize(
      `Vigência: ${info.vigenciaResumo}`,
      halfW - padX * 2
    ) as string[];
    const row3H = Math.max(col1Row3.length, col2Row3.length) * lineH + 4;

    const row4H = refLines.length * lineH + 4;
    const row5H = objLines.length * lineH + 4;
    const totalH = titleH + row2H + row3H + row4H + row5H;

    ensureSpace(totalH + 6);

    const startY = cursorY;
    pdf.setDrawColor(148, 163, 184);
    pdf.setFillColor(241, 245, 249);
    pdf.rect(LEFT_MARGIN, startY, CONTENT_WIDTH, titleH, 'FD');

    pdf.setFont(pdfFont, 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text(info.epigrafe, LEFT_MARGIN + CONTENT_WIDTH / 2, startY + 6, {
      align: 'center',
    });

    let y = startY + titleH;
    pdf.setFontSize(9.5);

    // Row 2
    pdf.rect(LEFT_MARGIN, y, halfW, row2H);
    pdf.rect(LEFT_MARGIN + halfW, y, halfW, row2H);
    pdf.setFont(pdfFont, 'normal');
    col1Row2.forEach((ln, i) =>
      pdf.text(ln, LEFT_MARGIN + padX, y + 4.5 + i * lineH)
    );
    col2Row2.forEach((ln, i) =>
      pdf.text(ln, LEFT_MARGIN + halfW + padX, y + 4.5 + i * lineH)
    );
    y += row2H;

    // Row 3
    pdf.rect(LEFT_MARGIN, y, halfW, row3H);
    pdf.rect(LEFT_MARGIN + halfW, y, halfW, row3H);
    col1Row3.forEach((ln, i) =>
      pdf.text(ln, LEFT_MARGIN + padX, y + 4.5 + i * lineH)
    );
    col2Row3.forEach((ln, i) =>
      pdf.text(ln, LEFT_MARGIN + halfW + padX, y + 4.5 + i * lineH)
    );
    y += row3H;

    // Row 4
    pdf.rect(LEFT_MARGIN, y, CONTENT_WIDTH, row4H);
    refLines.forEach((ln, i) =>
      pdf.text(ln, LEFT_MARGIN + padX, y + 4.5 + i * lineH)
    );
    y += row4H;

    // Row 5
    pdf.rect(LEFT_MARGIN, y, CONTENT_WIDTH, row5H);
    objLines.forEach((ln, i) =>
      pdf.text(ln, LEFT_MARGIN + padX, y + 4.5 + i * lineH)
    );
    y += row5H;

    pdf.setTextColor(0, 0, 0);
    cursorY = y + 6;
  };

  const drawParagraph = (opts: {
    tokens: RichToken[];
    align: 'left' | 'center' | 'justify';
    leftIndentMm?: number;
    firstLineIndentMm?: number;
    fontSizePt?: number;
    lineHeightMm?: number;
    spaceBeforeMm?: number;
    spaceAfterMm?: number;
    withTopBottomBorder?: boolean;
  }) => {
    const {
      tokens,
      align,
      leftIndentMm = 0,
      firstLineIndentMm = 0,
      fontSizePt = baseBodyPt,
      lineHeightMm = 6.0,
      spaceBeforeMm = 0,
      spaceAfterMm = 3.5,
      withTopBottomBorder = false,
    } = opts;

    if (tokens.length === 0) return;

    cursorY += spaceBeforeMm;
    pdf.setFontSize(fontSizePt);

    const fontStyle = (tok: RichToken) =>
      tok.bold ? 'bold' : tok.italic ? 'italic' : 'normal';

    const measureToken = (tok: RichToken): number => {
      pdf.setFont(pdfFont, fontStyle(tok));
      return pdf.getTextWidth(tok.word);
    };

    pdf.setFont(pdfFont, 'normal');
    const spaceWidth = pdf.getTextWidth(' ');

    const lines: RichToken[][] = [];
    let currentLine: RichToken[] = [];
    let currentWidth = 0;

    const getMaxWidth = (lineIndex: number) =>
      CONTENT_WIDTH - leftIndentMm - (lineIndex === 0 ? firstLineIndentMm : 0);

    for (const tok of tokens) {
      const tokWidth = measureToken(tok);
      const maxW = getMaxWidth(lines.length);
      const needed =
        currentLine.length === 0 ? tokWidth : currentWidth + spaceWidth + tokWidth;

      if (needed > maxW && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [tok];
        currentWidth = tokWidth;
      } else {
        currentLine.push(tok);
        currentWidth = needed;
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    if (withTopBottomBorder) {
      ensureSpace(lines.length * lineHeightMm + 4);
      pdf.setDrawColor(203, 213, 225);
      pdf.line(LEFT_MARGIN, cursorY - 3, LEFT_MARGIN + CONTENT_WIDTH, cursorY - 3);
    }

    lines.forEach((lineTokens, lIdx) => {
      ensureSpace(lineHeightMm);
      const isLastLine = lIdx === lines.length - 1;
      const maxW = getMaxWidth(lIdx);
      const startX =
        LEFT_MARGIN + leftIndentMm + (lIdx === 0 ? firstLineIndentMm : 0);

      const wordsTotalWidth = lineTokens.reduce(
        (acc, t) => acc + measureToken(t),
        0
      );

      if (align === 'center') {
        const lineTotalWidth =
          wordsTotalWidth + spaceWidth * Math.max(0, lineTokens.length - 1);
        let x = LEFT_MARGIN + (CONTENT_WIDTH - lineTotalWidth) / 2;
        for (const t of lineTokens) {
          pdf.setFont(pdfFont, fontStyle(t));
          pdf.text(t.word, x, cursorY);
          x += measureToken(t) + spaceWidth;
        }
      } else if (align === 'justify' && !isLastLine && lineTokens.length > 1) {
        const extraSpace = Math.max(0, maxW - wordsTotalWidth);
        const gap = extraSpace / (lineTokens.length - 1);
        let x = startX;
        for (const t of lineTokens) {
          pdf.setFont(pdfFont, fontStyle(t));
          pdf.text(t.word, x, cursorY);
          x += measureToken(t) + gap;
        }
      } else {
        let x = startX;
        for (const t of lineTokens) {
          pdf.setFont(pdfFont, fontStyle(t));
          pdf.text(t.word, x, cursorY);
          x += measureToken(t) + spaceWidth;
        }
      }

      cursorY += lineHeightMm;
    });

    if (withTopBottomBorder) {
      pdf.setDrawColor(203, 213, 225);
      pdf.line(
        LEFT_MARGIN,
        cursorY - 1.5,
        LEFT_MARGIN + CONTENT_WIDTH,
        cursorY - 1.5
      );
      cursorY += 2;
    }

    cursorY += spaceAfterMm;
  };

  for (const seg of segments) {
    switch (seg.kind) {
      case 'tech_box':
        if (seg.techHeader) {
          drawTechIdentificationBox(seg.techHeader);
        }
        break;

      case 'tech_ordem':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: 'left',
          fontSizePt: 10.5,
          lineHeightMm: 5.2,
          spaceAfterMm: 4,
        });
        break;

      case 'tech_secao':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: 'left',
          fontSizePt: 11,
          lineHeightMm: 5.5,
          spaceBeforeMm: 4,
          spaceAfterMm: 2.5,
        });
        break;

      case 'tech_subsecao':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: 'left',
          fontSizePt: 11,
          lineHeightMm: 5.3,
          spaceBeforeMm: 2.5,
          spaceAfterMm: 2,
        });
        break;

      case 'tech_item':
        drawParagraph({
          tokens: tokenizeRich(seg.boldPrefix, seg.text, undefined),
          align: 'justify',
          fontSizePt: 11,
          lineHeightMm: 5.5,
          spaceAfterMm: 2.5,
        });
        break;

      case 'tech_subitem':
        drawParagraph({
          tokens: tokenizeRich(seg.boldPrefix, seg.text, undefined),
          align: 'justify',
          leftIndentMm: 8,
          fontSizePt: 11,
          lineHeightMm: 5.5,
          spaceAfterMm: 2.2,
        });
        break;

      case 'tech_alinea':
        drawParagraph({
          tokens: tokenizeRich(seg.boldPrefix, seg.text, undefined),
          align: 'justify',
          leftIndentMm: 14,
          fontSizePt: 11,
          lineHeightMm: 5.4,
          spaceAfterMm: 1.8,
        });
        break;

      case 'tech_bullet':
        drawParagraph({
          tokens: tokenizeRich(undefined, seg.text, undefined),
          align: 'justify',
          leftIndentMm: 22,
          fontSizePt: 11,
          lineHeightMm: 5.4,
          spaceAfterMm: 1.6,
        });
        break;

      case 'epigrafe':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: 'center',
          fontSizePt: 12,
          lineHeightMm: 5.5,
          spaceAfterMm: 6,
        });
        break;

      case 'ementa':
        drawParagraph({
          tokens: tokenizeRich(undefined, seg.text, undefined),
          align: 'justify',
          leftIndentMm: 75,
          fontSizePt: 11,
          lineHeightMm: 4.8,
          spaceAfterMm: 6,
        });
        break;

      case 'ementa_larga':
        drawParagraph({
          tokens: tokenizeRich(undefined, seg.text, undefined, true),
          align: 'center',
          fontSizePt: 11,
          lineHeightMm: 5.0,
          spaceBeforeMm: 2,
          spaceAfterMm: 6,
          withTopBottomBorder: true,
        });
        break;

      case 'preambulo':
        drawParagraph({
          tokens: tokenizeRich(seg.boldPrefix, seg.text, seg.trailingBold),
          align: 'justify',
          firstLineIndentMm: 25,
          fontSizePt: 12,
          lineHeightMm: 6.2,
          spaceAfterMm: 5,
        });
        break;

      case 'titulo':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: 'center',
          fontSizePt: 12,
          lineHeightMm: 5.8,
          spaceBeforeMm: 6,
          spaceAfterMm: 4,
        });
        break;

      case 'capitulo':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: 'center',
          fontSizePt: 12,
          lineHeightMm: 5.5,
          spaceBeforeMm: 4,
          spaceAfterMm: 4,
        });
        break;

      case 'secao':
      case 'subsecao':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: 'center',
          fontSizePt: 12,
          lineHeightMm: 5.4,
          spaceBeforeMm: 3,
          spaceAfterMm: 3,
        });
        break;

      case 'artigo':
      case 'paragrafo':
        drawParagraph({
          tokens: tokenizeRich(seg.boldPrefix, seg.text, undefined),
          align: 'justify',
          firstLineIndentMm: 25,
          fontSizePt: 12,
          lineHeightMm: 6.2,
          spaceAfterMm: 3.2,
        });
        break;

      case 'inciso':
      case 'citacao':
        drawParagraph({
          tokens: tokenizeRich(undefined, seg.text, undefined),
          align: 'justify',
          firstLineIndentMm: 25,
          fontSizePt: 12,
          lineHeightMm: 6.2,
          spaceAfterMm: 2.5,
        });
        break;

      case 'alinea':
        drawParagraph({
          tokens: tokenizeRich(undefined, seg.text, undefined),
          align: 'justify',
          leftIndentMm: 35,
          fontSizePt: 12,
          lineHeightMm: 6.2,
          spaceAfterMm: 2.2,
        });
        break;

      case 'fecho':
        drawParagraph({
          tokens: tokenizeRich(undefined, seg.text, undefined),
          align: isTech ? 'left' : 'justify',
          firstLineIndentMm: isTech ? 0 : 25,
          fontSizePt: baseBodyPt,
          lineHeightMm: 6.0,
          spaceBeforeMm: 5,
          spaceAfterMm: 10,
        });
        break;

      case 'assinatura_nome':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: 'center',
          fontSizePt: baseBodyPt,
          lineHeightMm: 5.5,
          spaceBeforeMm: 4,
          spaceAfterMm: 1,
        });
        break;

      case 'assinatura_cargo':
        drawParagraph({
          tokens: tokenizeRich(undefined, seg.text, undefined),
          align: 'center',
          fontSizePt: baseBodyPt,
          lineHeightMm: 5.5,
          spaceAfterMm: 3,
        });
        break;

      case 'anexo_titulo':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: seg.align === 'left' ? 'left' : 'center',
          fontSizePt: 11,
          lineHeightMm: 5.2,
          spaceBeforeMm: 6,
          spaceAfterMm: 3,
        });
        break;

      case 'imagem': {
        const img = seg.imagem;
        if (!img) break;
        let widthMm = Math.min(155, Math.max(20, img.larguraMm || 55));
        const ratio = (img.heightPx || 1) / Math.max(1, img.widthPx || 1);
        let heightMm = widthMm * ratio;
        if (heightMm > 230) {
          heightMm = 230;
          widthMm = heightMm / Math.max(0.01, ratio);
        }
        ensureSpace(heightMm + 6);
        const xMm =
          img.alinhamento === 'left'
            ? LEFT_MARGIN
            : img.alinhamento === 'right'
              ? LEFT_MARGIN + CONTENT_WIDTH - widthMm
              : LEFT_MARGIN + (CONTENT_WIDTH - widthMm) / 2;
        try {
          pdf.addImage(
            img.dataUrl,
            getPdfImageFormat(img.mimeType, img.dataUrl),
            xMm,
            cursorY,
            widthMm,
            heightMm
          );
          cursorY += heightMm + 3;
        } catch {
          // Fallback silencioso caso a imagem esteja corrompida
        }
        break;
      }

      case 'imagem_legenda':
        drawParagraph({
          tokens: tokenizeRich(undefined, seg.text, undefined),
          align: seg.align === 'left' ? 'left' : 'center',
          fontSizePt: 10,
          lineHeightMm: 4.5,
          spaceAfterMm: 5,
        });
        break;
    }
  }

  // Numeração discreta de páginas se houver mais de 1 página
  const totalPages = pdf.getNumberOfPages();
  if (totalPages > 1) {
    pdf.setFont(pdfFont, 'normal');
    pdf.setFontSize(9);
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.text(`${i} / ${totalPages}`, 190, 288, { align: 'right' });
    }
  }

  return pdf;
}

export async function buildNormaDocxBlob(doc: NormaDocument): Promise<Blob> {
  const segments = buildNormaSegments(doc);
  const docxFile = segmentsToDocx(segments, getNormaFormatProfile(doc.tipo));
  return Packer.toBlob(docxFile);
}

export function buildNormaPdfBlob(doc: NormaDocument): Blob {
  const segments = buildNormaSegments(doc);
  const pdf = segmentsToPdf(segments, getNormaFormatProfile(doc.tipo));
  return pdf.output('blob');
}

export async function buildAlteracaoDocxBlob(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): Promise<Blob> {
  const segments = buildAlteracaoSegments(meta, alteracoes);
  const docxFile = segmentsToDocx(
    segments,
    getNormaFormatProfile(meta.atoAlteradorTipo)
  );
  return Packer.toBlob(docxFile);
}

export function buildAlteracaoPdfBlob(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): Blob {
  const segments = buildAlteracaoSegments(meta, alteracoes);
  const pdf = segmentsToPdf(
    segments,
    getNormaFormatProfile(meta.atoAlteradorTipo)
  );
  return pdf.output('blob');
}

export function getSuggestedFileBaseName(base: string): string {
  return sanitizeFileName(base) || 'minuta-normativa';
}

export async function exportNormaToDocx(doc: NormaDocument): Promise<void> {
  const blob = await buildNormaDocxBlob(doc);
  const baseName = sanitizeFileName(`${doc.tipo}-${doc.numero || 'minuta'}`);
  triggerBlobDownload(blob, `${baseName}.docx`);
}

export function exportNormaToPdf(doc: NormaDocument): void {
  const segments = buildNormaSegments(doc);
  const pdf = segmentsToPdf(segments, getNormaFormatProfile(doc.tipo));
  const baseName = sanitizeFileName(`${doc.tipo}-${doc.numero || 'minuta'}`);
  pdf.save(`${baseName}.pdf`);
}

export async function exportAlteracaoToDocx(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): Promise<void> {
  const blob = await buildAlteracaoDocxBlob(meta, alteracoes);
  const baseName = sanitizeFileName(
    `${meta.atoAlteradorTipo}-alterador-${meta.atoAlteradorNumero || 'minuta'}`
  );
  triggerBlobDownload(blob, `${baseName}.docx`);
}

export function exportAlteracaoToPdf(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): void {
  const segments = buildAlteracaoSegments(meta, alteracoes);
  const pdf = segmentsToPdf(
    segments,
    getNormaFormatProfile(meta.atoAlteradorTipo)
  );
  const baseName = sanitizeFileName(
    `${meta.atoAlteradorTipo}-alterador-${meta.atoAlteradorNumero || 'minuta'}`
  );
  pdf.save(`${baseName}.pdf`);
}
