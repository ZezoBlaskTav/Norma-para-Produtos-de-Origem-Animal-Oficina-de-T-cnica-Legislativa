import {
  AlignmentType,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
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

interface NormaSegment {
  kind:
    | 'epigrafe'
    | 'ementa'
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

function buildNormaSegments(doc: NormaDocument): NormaSegment[] {
  const segments: NormaSegment[] = [];
  const imagens = Array.isArray(doc.imagens) ? doc.imagens : [];
  const cabecalhoImagens = imagens.filter((img) => img.posicao === 'cabecalho');
  for (const img of cabecalhoImagens) {
    pushImageSegments(segments, img);
  }

  const epigrafeTipo = doc.tipo.toUpperCase();
  const numeroLabel = doc.numero.trim() || '___';
  const dataLabel = (doc.data.trim() || 'DE ___ DE __________ DE _____').toUpperCase();

  segments.push({
    kind: 'epigrafe',
    text: `${epigrafeTipo} Nº ${numeroLabel}, ${dataLabel}`,
  });

  if (doc.ementa.trim()) {
    segments.push({
      kind: 'ementa',
      text: doc.ementa.trim(),
    });
  }

  const ordem = doc.ordemExecucao.trim() || getOrdemExecucaoPadrao(doc.tipo);
  const fundamentoLines = doc.fundamentoLegal
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (fundamentoLines.length <= 1) {
    const fund = fundamentoLines[0] || '';
    const sep = fund && !/[,:;]$/.test(fund) ? ', ' : ' ';
    segments.push({
      kind: 'preambulo',
      boldPrefix: `${doc.autoridade.trim()}, `,
      text: `${fund}${sep}`,
      trailingBold: ordem,
    });
  } else {
    segments.push({
      kind: 'preambulo',
      boldPrefix: `${doc.autoridade.trim()}, `,
      text: fundamentoLines[0],
    });
    for (let i = 1; i < fundamentoLines.length - 1; i++) {
      segments.push({
        kind: 'preambulo',
        text: fundamentoLines[i],
      });
    }
    const lastFund = fundamentoLines[fundamentoLines.length - 1];
    const hasOrdemInside = /(DECRETA:|RESOLVE:|ESTABELECE:|PROMULGA:)\s*$/i.test(
      lastFund
    );
    if (hasOrdemInside) {
      segments.push({
        kind: 'preambulo',
        text: lastFund,
      });
    } else {
      const sep = /[,:;]$/.test(lastFund) ? ' ' : ', ';
      segments.push({
        kind: 'preambulo',
        text: `${lastFund}${sep}`,
        trailingBold: ordem,
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
  const tipoPronome =
    doc.tipo === 'Portaria' ||
    doc.tipo === 'Instrução Normativa' ||
    doc.tipo === 'Resolução' ||
    doc.tipo === 'Norma Interna'
      ? `Esta ${doc.tipo}`
      : `Este ${doc.tipo}`;
  const vigText = renderVigenciaClause(doc).replace(/^Este ato/, tipoPronome);

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
  const tipoUpper = meta.atoAlteradorTipo.toUpperCase();
  const num = meta.atoAlteradorNumero.trim() || '___';
  const data = (meta.atoAlteradorData.trim() || 'DE ___ DE __________ DE _____').toUpperCase();

  segments.push({
    kind: 'epigrafe',
    text: `${tipoUpper} Nº ${num}, ${data}`,
  });

  segments.push({
    kind: 'ementa',
    text: `Altera ${meta.normaAlvoNome.trim()}, ${meta.normaAlvoEmentaResumo.trim().replace(/\.$/, '')}.`,
  });

  segments.push({
    kind: 'preambulo',
    boldPrefix: `${meta.autoridade.trim()}, `,
    text: `${meta.fundamentoLegal.trim()}, `,
    trailingBold: meta.ordemExecucao.trim() || 'DECRETA:',
  });

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
  segments.push({
    kind: 'artigo',
    boldPrefix: `${formatArtigoNumero(artCounter)} `,
    text:
      meta.vigenciaTexto.trim() ||
      'Este ato entra em vigor na data de sua publicação.',
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

function segmentsToDocx(segments: NormaSegment[]): Document {
  const FONT = 'Times New Roman';
  const SIZE_12 = 24; // 12pt em half-points
  const SIZE_11 = 22; // 11pt para ementa

  const children: Paragraph[] = segments.map((seg) => {
    switch (seg.kind) {
      case 'epigrafe':
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 280, line: 300 },
          children: [
            new TextRun({
              text: seg.text,
              bold: true,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'ementa':
        return new Paragraph({
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
        });

      case 'preambulo':
        return new Paragraph({
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
                    size: SIZE_12,
                  }),
                ]
              : []),
            new TextRun({
              text: seg.text,
              font: FONT,
              size: SIZE_12,
            }),
            ...(seg.trailingBold
              ? [
                  new TextRun({
                    text: seg.trailingBold,
                    bold: true,
                    font: FONT,
                    size: SIZE_12,
                  }),
                ]
              : []),
          ],
        });

      case 'titulo':
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 320, after: 200, line: 300 },
          children: [
            new TextRun({
              text: seg.text,
              bold: true,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'capitulo':
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 180, line: 300 },
          children: [
            new TextRun({
              text: seg.text,
              bold: true,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'secao':
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 140, line: 300 },
          children: [
            new TextRun({
              text: seg.text,
              bold: true,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'subsecao':
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 120, line: 300 },
          children: [
            new TextRun({
              text: seg.text,
              bold: true,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'artigo':
      case 'paragrafo':
        return new Paragraph({
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
                    size: SIZE_12,
                  }),
                ]
              : []),
            new TextRun({
              text: seg.text,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'inciso':
      case 'citacao':
        return new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: convertMillimetersToTwip(25) },
          spacing: { after: 120, line: 360 },
          children: [
            new TextRun({
              text: seg.text,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'alinea':
        return new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertMillimetersToTwip(35) },
          spacing: { after: 100, line: 360 },
          children: [
            new TextRun({
              text: seg.text,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'fecho':
        return new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: convertMillimetersToTwip(25) },
          spacing: { before: 240, after: 360, line: 360 },
          children: [
            new TextRun({
              text: seg.text,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'assinatura_nome':
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 40, line: 280 },
          children: [
            new TextRun({
              text: seg.text,
              bold: true,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'assinatura_cargo':
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120, line: 280 },
          children: [
            new TextRun({
              text: seg.text,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });

      case 'anexo_titulo': {
        const align =
          seg.align === 'left'
            ? AlignmentType.LEFT
            : seg.align === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.CENTER;
        return new Paragraph({
          alignment: align,
          spacing: { before: 320, after: 140, line: 300 },
          children: [
            new TextRun({
              text: seg.text,
              bold: true,
              font: FONT,
              size: SIZE_12,
            }),
          ],
        });
      }

      case 'imagem': {
        const img = seg.imagem;
        if (!img) {
          return new Paragraph({ children: [] });
        }
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
        return new Paragraph({
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
        });
      }

      case 'imagem_legenda': {
        const align =
          seg.align === 'left'
            ? AlignmentType.LEFT
            : seg.align === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.CENTER;
        return new Paragraph({
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
        });
      }
    }
  });

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
}

function tokenizeRich(
  boldPrefix: string | undefined,
  text: string,
  trailingBold: string | undefined
): RichToken[] {
  const tokens: RichToken[] = [];
  const pushWords = (str: string, bold: boolean) => {
    const words = str.trim().split(/\s+/).filter(Boolean);
    for (const w of words) {
      tokens.push({ word: w, bold });
    }
  };
  if (boldPrefix) pushWords(boldPrefix, true);
  if (text) pushWords(text, false);
  if (trailingBold) pushWords(trailingBold, true);
  return tokens;
}

function segmentsToPdf(segments: NormaSegment[]): jsPDF {
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

  const drawParagraph = (opts: {
    tokens: RichToken[];
    align: 'left' | 'center' | 'justify';
    leftIndentMm?: number;
    firstLineIndentMm?: number;
    fontSizePt?: number;
    lineHeightMm?: number;
    spaceBeforeMm?: number;
    spaceAfterMm?: number;
  }) => {
    const {
      tokens,
      align,
      leftIndentMm = 0,
      firstLineIndentMm = 0,
      fontSizePt = 12,
      lineHeightMm = 6.2,
      spaceBeforeMm = 0,
      spaceAfterMm = 3.5,
    } = opts;

    if (tokens.length === 0) return;

    cursorY += spaceBeforeMm;
    pdf.setFontSize(fontSizePt);

    const measureToken = (tok: RichToken): number => {
      pdf.setFont('times', tok.bold ? 'bold' : 'normal');
      return pdf.getTextWidth(tok.word);
    };

    pdf.setFont('times', 'normal');
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
          pdf.setFont('times', t.bold ? 'bold' : 'normal');
          pdf.text(t.word, x, cursorY);
          x += measureToken(t) + spaceWidth;
        }
      } else if (align === 'justify' && !isLastLine && lineTokens.length > 1) {
        const extraSpace = Math.max(0, maxW - wordsTotalWidth);
        const gap = extraSpace / (lineTokens.length - 1);
        let x = startX;
        for (const t of lineTokens) {
          pdf.setFont('times', t.bold ? 'bold' : 'normal');
          pdf.text(t.word, x, cursorY);
          x += measureToken(t) + gap;
        }
      } else {
        let x = startX;
        for (const t of lineTokens) {
          pdf.setFont('times', t.bold ? 'bold' : 'normal');
          pdf.text(t.word, x, cursorY);
          x += measureToken(t) + spaceWidth;
        }
      }

      cursorY += lineHeightMm;
    });

    cursorY += spaceAfterMm;
  };

  for (const seg of segments) {
    switch (seg.kind) {
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
          align: 'justify',
          firstLineIndentMm: 25,
          fontSizePt: 12,
          lineHeightMm: 6.2,
          spaceBeforeMm: 5,
          spaceAfterMm: 10,
        });
        break;

      case 'assinatura_nome':
        drawParagraph({
          tokens: tokenizeRich(seg.text, '', undefined),
          align: 'center',
          fontSizePt: 12,
          lineHeightMm: 5.5,
          spaceBeforeMm: 4,
          spaceAfterMm: 1,
        });
        break;

      case 'assinatura_cargo':
        drawParagraph({
          tokens: tokenizeRich(undefined, seg.text, undefined),
          align: 'center',
          fontSizePt: 12,
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
    pdf.setFont('times', 'normal');
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
  const docxFile = segmentsToDocx(segments);
  return Packer.toBlob(docxFile);
}

export function buildNormaPdfBlob(doc: NormaDocument): Blob {
  const segments = buildNormaSegments(doc);
  const pdf = segmentsToPdf(segments);
  return pdf.output('blob');
}

export async function buildAlteracaoDocxBlob(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): Promise<Blob> {
  const segments = buildAlteracaoSegments(meta, alteracoes);
  const docxFile = segmentsToDocx(segments);
  return Packer.toBlob(docxFile);
}

export function buildAlteracaoPdfBlob(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): Blob {
  const segments = buildAlteracaoSegments(meta, alteracoes);
  const pdf = segmentsToPdf(segments);
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
  const pdf = segmentsToPdf(segments);
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
  const pdf = segmentsToPdf(segments);
  const baseName = sanitizeFileName(
    `${meta.atoAlteradorTipo}-alterador-${meta.atoAlteradorNumero || 'minuta'}`
  );
  pdf.save(`${baseName}.pdf`);
}
