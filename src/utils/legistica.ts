import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  AuditFinding,
  AuditSummary,
  NormaDocument,
  NormaTipo,
} from '../types/norma';
import {
  computeProgressiveStructure,
  formatNormaEpigrafe,
  formatPreambuloParts,
  getNormaFormatProfile,
  getNormaSpec,
  getOrdemExecucaoPadrao as getOrdemExecucaoPadraoFromProfile,
  getVigenciaPronomePrefix,
} from './normaProfiles';

export function toRoman(num: number): string {
  const map: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let n = Math.max(1, Math.floor(num));
  let result = '';
  for (const [val, sym] of map) {
    while (n >= val) {
      result += sym;
      n -= val;
    }
  }
  return result;
}

export function parseRoman(roman: string): number | null {
  const clean = roman.trim().toUpperCase();
  if (!clean || !/^[IVXLCDM]+$/.test(clean)) return null;
  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  let total = 0;
  let prev = 0;
  for (let i = clean.length - 1; i >= 0; i--) {
    const curr = values[clean[i]] || 0;
    if (curr < prev) {
      total -= curr;
    } else {
      total += curr;
      prev = curr;
    }
  }
  return total > 0 ? total : null;
}

export function toLetter(index: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  if (index < alphabet.length) {
    return alphabet[index];
  }
  const first = Math.floor(index / alphabet.length) - 1;
  const second = index % alphabet.length;
  return `${alphabet[first]}${alphabet[second]}`;
}

export function formatArtigoNumero(num: number, sufixo?: string): string {
  const base = num <= 9 ? `${num}º` : `${num}`;
  const cleanSuffix = sufixo?.trim().toUpperCase();
  return cleanSuffix ? `Art. ${base}-${cleanSuffix}` : `Art. ${base}`;
}

export function formatParagrafoNumero(
  index: number,
  total: number,
  sufixo?: string
): string {
  if (total === 1 && !sufixo?.trim()) {
    return 'Parágrafo único.';
  }
  const num = index + 1;
  const base = num <= 9 ? `§ ${num}º` : `§ ${num}`;
  const cleanSuffix = sufixo?.trim().toUpperCase();
  return cleanSuffix ? `${base}-${cleanSuffix}` : base;
}

export function getOrdemExecucaoPadrao(tipo: NormaDocument['tipo']): string {
  return getOrdemExecucaoPadraoFromProfile(tipo);
}

export function renderVigenciaClause(doc: NormaDocument): string {
  const prefix = getVigenciaPronomePrefix(doc.tipo);
  if (doc.vigenciaTipo === 'imediata') {
    return `${prefix} entra em vigor na data de sua publicação.`;
  }
  if (doc.vigenciaTipo === 'dias') {
    const dias = Math.max(1, doc.vigenciaDias || 30);
    return `${prefix} entra em vigor ${dias} (${dias === 1 ? 'um' : dias}) dias após a data de sua publicação.`;
  }
  return `${prefix} entra em vigor em ${doc.vigenciaData || '[informar data]'}.`;
}

function renderTecnicoOperacionalPlainText(doc: NormaDocument): string {
  const lines: string[] = [];
  const epigrafe = formatNormaEpigrafe(doc);
  lines.push(epigrafe);
  lines.push('================================================================');
  if (doc.esfera.trim()) {
    lines.push(`ÁREA / SETOR EMITENTE: ${doc.esfera.trim()}`);
  }
  if (doc.autoridade.trim()) {
    lines.push(`RESPONSÁVEL TÉCNICO / AUTORIDADE: ${doc.autoridade.trim()}`);
  }
  if (doc.fundamentoLegal.trim()) {
    lines.push(
      `NORMAS E DOCUMENTOS DE REFERÊNCIA: ${doc.fundamentoLegal.replace(/\n+/g, '; ').trim()}`
    );
  }
  if (doc.ementa.trim()) {
    lines.push(`OBJETIVO / ESCOPO: ${doc.ementa.trim()}`);
  }
  lines.push('================================================================');
  lines.push('');

  const ordem = doc.ordemExecucao.trim() || getOrdemExecucaoPadrao(doc.tipo);
  if (ordem) {
    lines.push(ordem);
    lines.push('');
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
      lines.push(h.formattedText);
      lines.push('');
    }

    const hasIncisos = artigo.incisos.length > 0;
    let caput = artigo.caput.trim();
    if (hasIncisos && !caput.endsWith(':')) {
      caput = `${caput.replace(/[.;]+$/, '')}:`;
    } else if (!hasIncisos && caput && !/[.!?]$/.test(caput)) {
      caput = `${caput}.`;
    }
    lines.push(`${layout.itemLabel} ${caput}`);

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
      lines.push(`   ${letter}) ${incText}`);

      inc.alineas.forEach((al, alIdx) => {
        const isLastAl = alIdx === inc.alineas.length - 1;
        const alText = `${al.texto.trim().replace(/[.;:]+$/, '')}${isLastAl && isLastInc ? '.' : ';'}`;
        lines.push(`      • ${alText}`);
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
      lines.push(`${subLabel} ${parText}`);

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
        lines.push(`   ${letter}) ${incText}`);

        inc.alineas.forEach((al, alIdx) => {
          const isLastAl = alIdx === inc.alineas.length - 1;
          const alText = `${al.texto.trim().replace(/[.;:]+$/, '')}${isLastAl && isLastInc ? '.' : ';'}`;
          lines.push(`      • ${alText}`);
        });
      });
    });

    lines.push('');

    const postArtImgs = (doc.imagens || []).filter(
      (img) => img.posicao === 'pos_artigo' && img.artigoId === artigo.id
    );
    postArtImgs.forEach((img) => {
      if (img.titulo.trim()) {
        lines.push(img.titulo.trim());
      }
      lines.push(
        `(Ilustração técnica após item ${layout.itemLabel}: ${img.legenda.trim() || img.titulo.trim() || 'diagrama ou modelo'})`
      );
      lines.push('');
    });
  });

  const revogacoesValidas = doc.revogacoes.map((r) => r.trim()).filter(Boolean);
  if (revogacoesValidas.length > 0) {
    const revHeader = hasSections
      ? `${nextPrimarySec}. DISPOSIÇÕES SUBSTITUÍDAS`
      : `${nextFlatNum}.`;
    if (hasSections) {
      lines.push(revHeader);
      if (revogacoesValidas.length === 1) {
        lines.push(
          `${nextPrimarySec}.1 Fica substituído/revogado o documento ${revogacoesValidas[0].replace(/\.$/, '')}.`
        );
      } else {
        lines.push(`${nextPrimarySec}.1 Ficam substituídos ou revogados:`);
        revogacoesValidas.forEach((rev, rIdx) => {
          const sep = rIdx === revogacoesValidas.length - 1 ? '.' : ';';
          lines.push(`   ${toLetter(rIdx)}) ${rev.replace(/[.;]+$/, '')}${sep}`);
        });
      }
      nextPrimarySec += 1;
    } else {
      if (revogacoesValidas.length === 1) {
        lines.push(
          `${revHeader} Fica substituído/revogado o documento ${revogacoesValidas[0].replace(/\.$/, '')}.`
        );
      } else {
        lines.push(`${revHeader} Ficam substituídos ou revogados:`);
        revogacoesValidas.forEach((rev, rIdx) => {
          const sep = rIdx === revogacoesValidas.length - 1 ? '.' : ';';
          lines.push(`   ${toLetter(rIdx)}) ${rev.replace(/[.;]+$/, '')}${sep}`);
        });
      }
      nextFlatNum += 1;
    }
    lines.push('');
  }

  const vigText = renderVigenciaClause(doc);
  if (hasSections) {
    lines.push(`${nextPrimarySec}. VIGÊNCIA E CONTROLE DE REVISÃO`);
    lines.push(`${nextPrimarySec}.1 ${vigText}`);
  } else {
    lines.push(`${nextFlatNum}. ${vigText}`);
  }
  lines.push('');

  if (doc.localAssinatura.trim()) {
    lines.push(doc.localAssinatura.trim());
    lines.push('');
  }
  if (doc.assinante.trim()) {
    lines.push(doc.assinante.trim());
    if (doc.cargoAssinante.trim()) {
      lines.push(doc.cargoAssinante.trim());
    }
  }

  const artIds = new Set(doc.artigos.map((a) => a.id));
  const anexoImgs = (doc.imagens || []).filter(
    (img) =>
      img.posicao === 'anexo' ||
      (img.posicao === 'pos_artigo' && (!img.artigoId || !artIds.has(img.artigoId)))
  );
  const cabecalhoImgs = (doc.imagens || []).filter(
    (img) => img.posicao === 'cabecalho'
  );

  if (cabecalhoImgs.length > 0) {
    lines.push('');
    cabecalhoImgs.forEach((img) => {
      lines.push(
        `(Imagem no cabeçalho: ${img.titulo.trim() || img.legenda.trim() || 'logotipo ou identificação institucional'})`
      );
    });
  }

  if (anexoImgs.length > 0) {
    anexoImgs.forEach((img) => {
      lines.push('');
      if (img.titulo.trim()) {
        lines.push(img.titulo.trim().toUpperCase());
      }
      lines.push(
        `(Anexo gráfico: ${img.legenda.trim() || img.titulo.trim() || 'fluxograma ou registro'})`
      );
    });
  }

  return lines.join('\n');
}

export function renderNormaPlainText(doc: NormaDocument): string {
  const profile = getNormaFormatProfile(doc.tipo);
  if (profile === 'tecnico_operacional') {
    return renderTecnicoOperacionalPlainText(doc);
  }

  const lines: string[] = [];
  lines.push(formatNormaEpigrafe(doc));
  lines.push('');

  if (doc.ementa.trim()) {
    lines.push(doc.ementa.trim());
    lines.push('');
  }

  const pre = formatPreambuloParts(doc);
  if (pre.ordemInlineAfterAutoridade) {
    const joined = [pre.autoridade, pre.ordem].filter(Boolean).join(pre.separadorAutoridade);
    if (joined) {
      lines.push(joined);
      lines.push('');
    }
  } else if (pre.linhasFundamento.length === 1) {
    const f = pre.linhasFundamento[0];
    const comma = pre.needsCommaBeforeOrdem ? ',' : '';
    const autPrefix = pre.autoridade ? `${pre.autoridade}${pre.separadorAutoridade}` : '';
    const ordemSuffix = pre.ordem ? `${comma} ${pre.ordem}` : '';
    lines.push(`${autPrefix}${f}${ordemSuffix}`);
    lines.push('');
  } else {
    const autPrefix = pre.autoridade ? `${pre.autoridade}${pre.separadorAutoridade}` : '';
    lines.push(`${autPrefix}${pre.linhasFundamento[0]}`);
    for (let i = 1; i < pre.linhasFundamento.length - 1; i++) {
      lines.push(pre.linhasFundamento[i]);
    }
    const lastFund = pre.linhasFundamento[pre.linhasFundamento.length - 1];
    if (pre.ordem) {
      const sep = pre.needsCommaBeforeOrdem ? ',' : '';
      lines.push(`${lastFund}${sep} ${pre.ordem}`);
    } else {
      lines.push(lastFund);
    }
    lines.push('');
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
      lines.push(lastTitulo.toUpperCase());
      lines.push('');
    }
    if (artigo.capitulo && artigo.capitulo.trim() !== lastCapitulo) {
      lastCapitulo = artigo.capitulo.trim();
      lastSecao = '';
      lastSubsecao = '';
      lines.push(lastCapitulo.toUpperCase());
      lines.push('');
    }
    if (artigo.secao && artigo.secao.trim() !== lastSecao) {
      lastSecao = artigo.secao.trim();
      lastSubsecao = '';
      lines.push(lastSecao.toUpperCase());
      lines.push('');
    }
    if (artigo.subsecao && artigo.subsecao.trim() !== lastSubsecao) {
      lastSubsecao = artigo.subsecao.trim();
      lines.push(lastSubsecao);
      lines.push('');
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

    lines.push(`${artLabel} ${caput}`);

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

      lines.push(`${roman} - ${incText}`);

      inc.alineas.forEach((al, alIdx) => {
        const isLastAlinea = alIdx === inc.alineas.length - 1;
        const letter = toLetter(alIdx);
        let alText = al.texto.trim().replace(/[.;:]+$/, '');
        if (isLastAlinea && isLastInciso) {
          alText = `${alText}.`;
        } else {
          alText = `${alText};`;
        }
        lines.push(`${letter}) ${alText}`);
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
      lines.push(`${parLabel} ${parText}`);

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

        lines.push(`${roman} - ${incText}`);

        inc.alineas.forEach((al, alIdx) => {
          const isLastAlinea = alIdx === inc.alineas.length - 1;
          const letter = toLetter(alIdx);
          let alText = al.texto.trim().replace(/[.;:]+$/, '');
          if (isLastAlinea && isLastInciso) {
            alText = `${alText}.`;
          } else {
            alText = `${alText};`;
          }
          lines.push(`${letter}) ${alText}`);
        });
      });
    });

    lines.push('');

    const postArtImgs = (doc.imagens || []).filter(
      (img) => img.posicao === 'pos_artigo' && img.artigoId === artigo.id
    );
    postArtImgs.forEach((img) => {
      if (img.titulo.trim()) {
        lines.push(img.titulo.trim());
      }
      lines.push(
        `(Imagem ilustrativa após o ${artLabel}: ${img.legenda.trim() || img.titulo.trim() || 'modelo oficial'})`
      );
      lines.push('');
    });
  }

  // Cláusula de revogação expressa (Art. 9º da LC 95/98)
  const revogacoesValidas = doc.revogacoes.map((r) => r.trim()).filter(Boolean);
  if (revogacoesValidas.length > 0) {
    artCounter += 1;
    const revArtLabel = formatArtigoNumero(artCounter);
    if (revogacoesValidas.length === 1) {
      lines.push(`${revArtLabel} Fica revogado o ${revogacoesValidas[0].replace(/\.$/, '')}.`);
    } else {
      lines.push(`${revArtLabel} Ficam revogados:`);
      revogacoesValidas.forEach((rev, rIdx) => {
        const sep = rIdx === revogacoesValidas.length - 1 ? '.' : ';';
        lines.push(`${toRoman(rIdx + 1)} - ${rev.replace(/[.;]+$/, '')}${sep}`);
      });
    }
    lines.push('');
  }

  // Cláusula de vigência
  artCounter += 1;
  const vigArtLabel = formatArtigoNumero(artCounter);
  const vigText = renderVigenciaClause(doc);
  lines.push(`${vigArtLabel} ${vigText}`);
  lines.push('');

  if (doc.localAssinatura.trim()) {
    lines.push(doc.localAssinatura.trim());
    lines.push('');
  }
  if (doc.assinante.trim()) {
    lines.push(doc.assinante.trim());
    if (doc.cargoAssinante.trim()) {
      lines.push(doc.cargoAssinante.trim());
    }
  }

  const artIds = new Set(doc.artigos.map((a) => a.id));
  const anexoImgs = (doc.imagens || []).filter(
    (img) =>
      img.posicao === 'anexo' ||
      (img.posicao === 'pos_artigo' && (!img.artigoId || !artIds.has(img.artigoId)))
  );
  const cabecalhoImgs = (doc.imagens || []).filter(
    (img) => img.posicao === 'cabecalho'
  );

  if (cabecalhoImgs.length > 0) {
    lines.push('');
    cabecalhoImgs.forEach((img) => {
      lines.push(
        `(Imagem no cabeçalho: ${img.titulo.trim() || img.legenda.trim() || 'brasão ou identificação oficial'})`
      );
    });
  }

  if (anexoImgs.length > 0) {
    anexoImgs.forEach((img) => {
      lines.push('');
      if (img.titulo.trim()) {
        lines.push(img.titulo.trim().toUpperCase());
      }
      lines.push(
        `(Modelo gráfico / imagem anexada: ${img.legenda.trim() || img.titulo.trim() || 'ilustração oficial'})`
      );
    });
  }

  return lines.join('\n');
}

export function renderAlteracaoDecreeText(
  meta: AlteracaoMetadata,
  alteracoes: AlteracaoDispositivo[]
): string {
  const lines: string[] = [];
  lines.push(
    formatNormaEpigrafe({
      tipo: meta.atoAlteradorTipo,
      numero: meta.atoAlteradorNumero,
      data: meta.atoAlteradorData,
    })
  );
  lines.push('');
  lines.push(
    `Altera ${meta.normaAlvoNome.trim()}, ${meta.normaAlvoEmentaResumo.trim().replace(/\.$/, '')}.`
  );
  lines.push('');

  const pre = formatPreambuloParts({
    tipo: meta.atoAlteradorTipo,
    autoridade: meta.autoridade,
    fundamentoLegal: meta.fundamentoLegal,
    ordemExecucao: meta.ordemExecucao,
  });
  if (pre.ordemInlineAfterAutoridade) {
    lines.push([pre.autoridade, pre.ordem].filter(Boolean).join(pre.separadorAutoridade));
  } else {
    const f = pre.linhasFundamento.join(' ');
    const comma = pre.needsCommaBeforeOrdem ? ',' : '';
    const autPrefix = pre.autoridade ? `${pre.autoridade}${pre.separadorAutoridade}` : '';
    const ordemSuffix = pre.ordem ? `${comma} ${pre.ordem}` : '';
    lines.push(`${autPrefix}${f}${ordemSuffix}`);
  }
  lines.push('');

  const alteracoesOuAcrescimos = alteracoes.filter(
    (a) => a.tipoAcao === 'alterar' || a.tipoAcao === 'acrescer'
  );
  const revogacoes = alteracoes.filter((a) => a.tipoAcao === 'revogar');

  let artCounter = 0;

  if (alteracoesOuAcrescimos.length > 0) {
    artCounter += 1;
    lines.push(
      `${formatArtigoNumero(artCounter)} ${meta.normaAlvoNome.trim()} passa a vigorar com as seguintes alterações:`
    );
    lines.push('');

    alteracoesOuAcrescimos.forEach((item, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === alteracoesOuAcrescimos.length - 1;
      const openQuote = isFirst ? '"' : '';
      const closeQuote = isLast ? '"' : '';

      if (item.incluirPontilhadoAntes) {
        lines.push(`${openQuote}...........................................................................`);
      }

      const corpo = item.textoNovo.trim();
      const comNR = corpo.endsWith('(NR)') ? corpo : `${corpo} (NR)`;
      const prefix = !item.incluirPontilhadoAntes ? openQuote : '';
      const suffix = !item.incluirPontilhadoDepois ? closeQuote : '';
      lines.push(`${prefix}${comNR}${suffix}`);

      if (item.incluirPontilhadoDepois) {
        lines.push(`...........................................................................${closeQuote}`);
      }
      lines.push('');
    });
  }

  if (revogacoes.length > 0) {
    artCounter += 1;
    if (revogacoes.length === 1) {
      lines.push(
        `${formatArtigoNumero(artCounter)} Fica revogado ${revogacoes[0].dispositivoAlvo.trim()} do ${meta.normaAlvoNome.trim()}.`
      );
    } else {
      lines.push(
        `${formatArtigoNumero(artCounter)} Ficam revogados os seguintes dispositivos do ${meta.normaAlvoNome.trim()}:`
      );
      revogacoes.forEach((rev, rIdx) => {
        const sep = rIdx === revogacoes.length - 1 ? '.' : ';';
        lines.push(`${toRoman(rIdx + 1)} - ${rev.dispositivoAlvo.trim()}${sep}`);
      });
    }
    lines.push('');
  }

  artCounter += 1;
  const defaultVig = `${getVigenciaPronomePrefix(meta.atoAlteradorTipo)} entra em vigor na data de sua publicação.`;
  lines.push(
    `${formatArtigoNumero(artCounter)} ${meta.vigenciaTexto.trim() || defaultVig}`
  );
  lines.push('');

  if (meta.localAssinatura.trim()) {
    lines.push(meta.localAssinatura.trim());
    lines.push('');
  }
  if (meta.assinante.trim()) {
    lines.push(meta.assinante.trim());
    if (meta.cargoAssinante.trim()) {
      lines.push(meta.cargoAssinante.trim());
    }
  }

  return lines.join('\n');
}

const EPIGRAFE_OPENING_REGEX =
  /^(LEI\s+COMPLEMENTAR|LEI|PROJETO\s+DE\s+LEI|DECRETO|PORTARIA|INSTRUÇÃO\s+NORMATIVA|RESOLUÇÃO|DELIBERAÇÃO|REGIMENTO\s+INTERNO|ESTATUTO|NORMA\s+INTERNA|ORDEM\s+DE\s+SERVIÇO|INSTRUÇÃO\s+DE\s+TRABALHO|PROCEDIMENTO\s+OPERACIONAL\s+PADRÃO)\b/i;

const ORDEM_EXECUCAO_REGEX =
  /(DECRETA:|RESOLVE:|ESTABELECE:|PROMULGA:|DELIBERA:|DETERMINA:|APROVA\s+E\s+ESTABELECE:|sanciono\s+a\s+seguinte\s+Lei(?:\s+Complementar)?:|APROVAÇÃO\s+E\s+CUMPRIMENTO:|PADRONIZAÇÃO\s+E\s+EXECUÇÃO\s+OBRIGATÓRIA:)/i;

function auditTecnicoOperacionalText(
  text: string,
  docTipo: NormaTipo
): AuditSummary {
  const lines = text.split('\n');
  const words = text.split(/\s+/).filter(Boolean);
  const findings: AuditFinding[] = [];
  const conformes: string[] = [];
  const spec = getNormaSpec(docTipo);

  const firstNonEmpty = lines.find((l) => l.trim().length > 0) || '';
  if (/^(INSTRUÇÃO DE TRABALHO|PROCEDIMENTO OPERACIONAL PADRÃO)/i.test(firstNonEmpty.trim())) {
    conformes.push(`Identificação técnica (${spec.siglaCurta || docTipo}) presente na abertura.`);
    if (/N[º°]\s*___/.test(firstNonEmpty) || /DE\s+___\s+DE/.test(firstNonEmpty)) {
      findings.push({
        id: 'tec-epigrafe-pendente',
        severidade: 'alerta',
        regra: spec.normaRegente,
        local: 'Cabeçalho Técnico',
        descricao: 'Código/número ou data de emissão ainda contém marcação em aberto ("___").',
        sugestao: 'Defina o código de controle e a data de emissão antes da aprovação.',
      });
    }
  } else {
    findings.push({
      id: 'tec-epigrafe',
      severidade: 'erro',
      regra: spec.normaRegente,
      local: 'Linha 1 (Cabeçalho)',
      descricao: 'Identificação inicial do documento técnico (IT ou POP) ausente.',
      sugestao: 'Inicie o documento com "INSTRUÇÃO DE TRABALHO (IT) Nº ..." ou "PROCEDIMENTO OPERACIONAL PADRÃO (POP) Nº ...".',
    });
  }

  if (/OBJETIVO\s*\/\s*ESCOPO:/i.test(text) || /^\s*1\.\s+OBJETIVO/im.test(text)) {
    conformes.push('Objetivo / Escopo delimitado conforme ABNT NBR 6024.');
  } else {
    findings.push({
      id: 'tec-objetivo',
      severidade: 'alerta',
      regra: 'ABNT NBR 6024 / ISO 9001',
      local: 'Cabeçalho Técnico / Seção 1',
      descricao: 'Objetivo ou escopo operacional não identificado claramente.',
      sugestao: 'Preencha o campo Objetivo / Escopo indicando a finalidade e quem executa a atividade.',
    });
  }

  if (/ÁREA\s*\/\s*SETOR\s+EMITENTE:/i.test(text) && /RESPONSÁVEL\s+TÉCNICO/i.test(text)) {
    conformes.push('Quadro de responsabilidade técnica e área emitente preenchido.');
  } else {
    findings.push({
      id: 'tec-meta',
      severidade: 'info',
      regra: 'ISO 9001 (Controle de Informação Documentada)',
      local: 'Quadro de Identificação',
      descricao: 'Recomenda-se informar explicitamente a Área/Setor Emitente e o Responsável Técnico.',
      sugestao: 'Complete os campos de Área / Setor Emitente e Autoridade / Responsável Técnico.',
    });
  }

  // Verificar numeração progressiva (ABNT NBR 6024)
  const itemMatches = text.match(/^\s*\d+(?:\.\d+)*\.?\s+/gm) || [];
  let lastPrimary = 0;
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const secMatch = line.match(/^\s*(\d+)\.\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/);
    if (secMatch) {
      const num = parseInt(secMatch[1], 10);
      if (lastPrimary > 0 && num > lastPrimary + 1) {
        findings.push({
          id: `tec-seq-${lineNum}`,
          severidade: 'erro',
          regra: 'ABNT NBR 6024 (Numeração Progressiva)',
          local: `Linha ${lineNum}`,
          descricao: `Salto na numeração primária: passou da seção ${lastPrimary} para ${num}.`,
          sugestao: `Ajuste a numeração sequencial para "${lastPrimary + 1}.".`,
        });
      }
      lastPrimary = num;
    }

    const placeholder = line.match(/\[[^\]\n]{3,50}\]/);
    if (placeholder) {
      findings.push({
        id: `placeholder-${idx}`,
        severidade: 'alerta',
        regra: 'Revisão antes da emissão',
        local: `Linha ${lineNum}`,
        descricao: `Campo modelo ainda não preenchido: ${placeholder[0]}.`,
        sugestao: 'Substitua o marcador entre colchetes pelo conteúdo operacional definitivo.',
      });
    }
  });

  if (itemMatches.length > 0) {
    conformes.push(`Numeração progressiva ABNT detectada (${itemMatches.length} seções/etapas).`);
  } else {
    findings.push({
      id: 'tec-sem-itens',
      severidade: 'erro',
      regra: 'ABNT NBR 6024',
      local: 'Corpo Operacional',
      descricao: 'Nenhuma seção ou etapa numerada progressivamente (1., 1.1) foi encontrada.',
      sugestao: 'Organize o procedimento em seções e etapas numeradas (ex.: 1. Objetivo, 2. Procedimento, 2.1 Etapa inicial).',
    });
  }

  if (/entra\s+em\s+vigor/i.test(text)) {
    conformes.push('Cláusula de vigência e controle identificada.');
  } else {
    findings.push({
      id: 'sem-vigencia',
      severidade: 'erro',
      regra: 'Controle Documental / Vigência',
      local: 'Parte Final',
      descricao: 'Cláusula de vigência não localizada no documento técnico.',
      sugestao: 'Inclua o item final definindo a data ou condição de entrada em vigor.',
    });
  }

  return {
    findings,
    totalArtigos: itemMatches.length,
    totalPalavras: words.length,
    erros: findings.filter((f) => f.severidade === 'erro').length,
    alertas: findings.filter((f) => f.severidade === 'alerta').length,
    conformes,
  };
}

export function auditNormaText(
  rawText: string,
  docTipo?: NormaTipo
): AuditSummary {
  const text = rawText.trim();
  const findings: AuditFinding[] = [];
  const conformes: string[] = [];

  if (!text) {
    return {
      findings: [],
      totalArtigos: 0,
      totalPalavras: 0,
      erros: 0,
      alertas: 0,
      conformes: [],
    };
  }

  const lines = text.split('\n');
  const firstNonEmpty = lines.find((l) => l.trim().length > 0) || '';
  const detectedTechType: NormaTipo | null =
    docTipo && getNormaFormatProfile(docTipo) === 'tecnico_operacional'
      ? docTipo
      : /^INSTRUÇÃO\s+DE\s+TRABALHO\b/i.test(firstNonEmpty.trim())
        ? 'Instrução de Trabalho'
        : /^PROCEDIMENTO\s+OPERACIONAL\s+PADRÃO\b/i.test(firstNonEmpty.trim())
          ? 'Procedimento Operacional Padrão'
          : null;

  if (detectedTechType) {
    return auditTecnicoOperacionalText(text, detectedTechType);
  }

  const words = text.split(/\s+/).filter(Boolean);
  const artigoMatches = text.match(/^\s*Art\.\s*\d+/gm) || [];

  // 1. Epígrafe e placeholders em aberto
  if (EPIGRAFE_OPENING_REGEX.test(firstNonEmpty.trim())) {
    conformes.push('Epígrafe presente na abertura do ato.');
    if (/N[º°]\s*___/.test(firstNonEmpty) || /DE\s+___\s+DE/.test(firstNonEmpty)) {
      findings.push({
        id: 'epigrafe-pendente',
        severidade: 'alerta',
        regra: 'Art. 4º da LC nº 95/1998',
        local: 'Epígrafe (Linha 1)',
        descricao: 'Número ou data da norma ainda está com marcação em aberto ("___").',
        sugestao: 'Preencha ou reserve o número oficial e a data por extenso antes da publicação definitiva.',
      });
    }
  } else {
    findings.push({
      id: 'epigrafe',
      severidade: 'erro',
      regra: 'Art. 4º da LC nº 95/1998',
      local: 'Linha 1 (Abertura)',
      descricao: 'Epígrafe ausente ou fora do padrão oficial no início do texto.',
      sugestao: 'Inicie o documento com a espécie normativa, número e data em caixa alta (ex.: LEI Nº 123, DE 17 DE NOVEMBRO DE 2026 ou DECRETO Nº ...).',
    });
  }

  // 2. Ementa (entre epígrafe e preâmbulo/artigos)
  const preambuloOrArtIdx = lines.findIndex(
    (l, i) =>
      i > 0 &&
      (ORDEM_EXECUCAO_REGEX.test(l) || /^\s*Art\.\s*\d+/.test(l))
  );
  const ementaCandidate =
    lines
      .slice(1, preambuloOrArtIdx > 1 ? preambuloOrArtIdx : 6)
      .find((l) => l.trim().length > 0)
      ?.trim() || '';
  if (
    ementaCandidate &&
    !/^(O |A |Art\.|CAPÍTULO|TÍTULO|SEÇÃO|SUBSEÇÃO|LIVRO)/i.test(
      ementaCandidate
    )
  ) {
    conformes.push('Ementa localizada logo após a epígrafe.');
    if (!/[.]$/.test(ementaCandidate)) {
      findings.push({
        id: 'ementa-ponto',
        severidade: 'alerta',
        regra: 'Art. 5º da LC nº 95/1998',
        local: 'Ementa',
        descricao: 'A ementa deve encerrar com ponto final.',
        sugestao: 'Adicione ponto final ao término da ementa.',
      });
    }
    const ementaWords = ementaCandidate.split(/\s+/).length;
    if (ementaWords > 50) {
      findings.push({
        id: 'ementa-longa',
        severidade: 'info',
        regra: 'Art. 5º da LC nº 95/1998 (Concisão)',
        local: 'Ementa',
        descricao: `Ementa extensa (${ementaWords} palavras).`,
        sugestao: 'Resuma o objeto principal em até uma ou duas orações diretas, evitando detalhamento excessivo na ementa.',
      });
    }
  }

  // 3. Ordem de execução e uso de "CONSIDERANDO" no preâmbulo
  if (ORDEM_EXECUCAO_REGEX.test(text)) {
    conformes.push('Ordem de execução formal localizada no preâmbulo.');
  } else {
    findings.push({
      id: 'preambulo-ordem',
      severidade: 'alerta',
      regra: 'Art. 6º da LC nº 95/1998',
      local: 'Preâmbulo',
      descricao: 'Não foi identificada a fórmula de ordem de execução (ex.: DECRETA:, RESOLVE:, APROVA E ESTABELECE:, sanciono a seguinte Lei:).',
      sugestao: 'Encerre o preâmbulo indicando a autoridade, o fundamento legal de competência e a ordem de execução seguida de dois-pontos.',
    });
  }

  const considerandoCount = (text.match(/\bCONSIDERANDO\b/gi) || []).length;
  if (considerandoCount >= 2) {
    findings.push({
      id: 'excesso-considerando',
      severidade: 'alerta',
      regra: 'Art. 6º da LC nº 95/1998 e Art. 14 do Decreto nº 12.002/2024',
      local: `Preâmbulo (${considerandoCount} ocorrências)`,
      descricao: `Foram detectados ${considerandoCount} blocos de "CONSIDERANDO" no preâmbulo.`,
      sugestao: 'Pela técnica legislativa moderna, justificativas técnicas, memoriais e razões de conveniência devem constar na Exposição de Motivos ou Nota Técnica, mantendo no preâmbulo apenas a autoridade e a norma legal de competência.',
    });
  }

  // 4. Placeholders genéricos remanescentes ([...])
  lines.forEach((line, idx) => {
    const placeholder = line.match(/\[[^\]\n]{3,50}\]/);
    if (placeholder) {
      findings.push({
        id: `placeholder-${idx}`,
        severidade: 'alerta',
        regra: 'Revisão pré-publicação',
        local: `Linha ${idx + 1}`,
        descricao: `Campo modelo ainda não preenchido: ${placeholder[0]}.`,
        sugestao: 'Substitua o marcador entre colchetes pela informação definitiva antes de finalizar o ato.',
      });
    }
  });

  // 5. Numeração ordinal vs cardinal (Art. 1º..9º vs Art. 10.. / § 1º..9º vs § 10..) e sequência de artigos
  let lastArtNum = 0;
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    const artCardinalErr = line.match(/\bArt\.\s*([1-9]\d+)º/);
    if (artCardinalErr) {
      findings.push({
        id: `ordinal-art-${lineNum}`,
        severidade: 'erro',
        regra: 'Art. 10, I, da LC nº 95/1998',
        local: `Linha ${lineNum}`,
        descricao: `Uso indevido de ordinal em "Art. ${artCardinalErr[1]}º". A partir de 10, a numeração deve ser cardinal.`,
        sugestao: `Substitua por "Art. ${artCardinalErr[1]}" (sem o símbolo ordinal "º").`,
      });
    }

    const parCardinalErr = line.match(/§\s*([1-9]\d+)º/);
    if (parCardinalErr) {
      findings.push({
        id: `ordinal-par-${lineNum}`,
        severidade: 'erro',
        regra: 'Art. 10, III, da LC nº 95/1998',
        local: `Linha ${lineNum}`,
        descricao: `Uso indevido de ordinal em "§ ${parCardinalErr[1]}º". Parágrafos a partir de 10 usam numeração cardinal.`,
        sugestao: `Substitua por "§ ${parCardinalErr[1]}" (sem "º").`,
      });
    }

    const artMissingOrdinal = line.match(/^\s*Art\.\s*([1-9])(?:\s|[.-])/);
    if (artMissingOrdinal && !line.includes(`Art. ${artMissingOrdinal[1]}º`)) {
      findings.push({
        id: `missing-ord-${lineNum}`,
        severidade: 'erro',
        regra: 'Art. 10, I, da LC nº 95/1998',
        local: `Linha ${lineNum}`,
        descricao: `Ausência de símbolo ordinal em "Art. ${artMissingOrdinal[1]}". De 1 a 9, os artigos usam numeração ordinal.`,
        sugestao: `Altere para "Art. ${artMissingOrdinal[1]}º".`,
      });
    }

    const seqMatch = line.match(/^\s*Art\.\s*(\d+)º?(?!-[A-Z])/);
    if (seqMatch) {
      const currentNum = parseInt(seqMatch[1], 10);
      if (lastArtNum > 0) {
        if (currentNum === lastArtNum) {
          findings.push({
            id: `dup-art-${lineNum}`,
            severidade: 'erro',
            regra: 'Art. 10, I, da LC nº 95/1998',
            local: `Linha ${lineNum} (Art. ${currentNum})`,
            descricao: `Numeração duplicada: o Art. ${currentNum} aparece repetido em sequência.`,
            sugestao: `Ajuste para Art. ${lastArtNum + 1 <= 9 ? `${lastArtNum + 1}º` : lastArtNum + 1} ou, se for inserção em norma vigente, use sufixo alfabético (ex.: Art. ${currentNum}º-A).`,
          });
        } else if (currentNum > lastArtNum + 1) {
          findings.push({
            id: `gap-art-${lineNum}`,
            severidade: 'erro',
            regra: 'Art. 10, I, da LC nº 95/1998',
            local: `Linha ${lineNum} (Art. ${currentNum})`,
            descricao: `Salto na numeração dos artigos: passou do Art. ${lastArtNum} diretamente para o Art. ${currentNum}.`,
            sugestao: `Corrija a sequência numérica para Art. ${lastArtNum + 1 <= 9 ? `${lastArtNum + 1}º` : lastArtNum + 1} ou sinalize dispositivo vetado/revogado quando aplicável.`,
          });
        }
      }
      lastArtNum = currentNum;
    }
  });

  // 5b. Encerramento de capítulos ao abrir novo Título e reinício em "CAPÍTULO I" (Art. 10, V e VI, LC 95/98)
  let tituloCount = 0;
  let expectingCapOne = false;
  let expectedCapNum = 1;
  let prevTituloHadCaps = false;
  let currentTituloHasCaps = false;
  let confirmedCapResetOnNewTitle = false;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const tituloMatch = line.match(/^\s*T[ÍI]TULO\s+([IVXLCDM]+)\b/i);
    if (tituloMatch) {
      if (tituloCount > 0 && currentTituloHasCaps) {
        prevTituloHadCaps = true;
      }
      tituloCount += 1;
      currentTituloHasCaps = false;
      expectingCapOne = true;
      expectedCapNum = 1;
      return;
    }

    const capMatch = line.match(/^\s*CAP[ÍI]TULO\s+([IVXLCDM]+)\b/i);
    if (capMatch) {
      const capNum = parseRoman(capMatch[1]);
      currentTituloHasCaps = true;
      if (capNum !== null) {
        if (expectingCapOne && capNum !== 1) {
          findings.push({
            id: `cap-reset-titulo-${lineNum}`,
            severidade: 'erro',
            regra: 'Art. 10, V e VI, da LC nº 95/1998',
            local: `Linha ${lineNum} (CAPÍTULO ${capMatch[1].toUpperCase()})`,
            descricao: `Após a abertura de novo Título, o capítulo foi numerado como "CAPÍTULO ${capMatch[1].toUpperCase()}". Os capítulos do título anterior encerram-se com o novo Título.`,
            sugestao: 'Reinicie a numeração de capítulos do novo Título em "CAPÍTULO I".',
          });
        } else if (
          expectingCapOne &&
          capNum === 1 &&
          prevTituloHadCaps &&
          !confirmedCapResetOnNewTitle
        ) {
          confirmedCapResetOnNewTitle = true;
          conformes.push(
            'Capítulos encerrados na mudança de Título e reiniciados corretamente em "CAPÍTULO I".'
          );
        } else if (!expectingCapOne && capNum !== expectedCapNum) {
          findings.push({
            id: `cap-seq-${lineNum}`,
            severidade: 'alerta',
            regra: 'Art. 10, V e VI, da LC nº 95/1998',
            local: `Linha ${lineNum} (CAPÍTULO ${capMatch[1].toUpperCase()})`,
            descricao: `Sequência irregular de capítulos dentro do mesmo Título: esperado "CAPÍTULO ${toRoman(expectedCapNum)}", encontrado "CAPÍTULO ${capMatch[1].toUpperCase()}".`,
            sugestao: `Ajuste para "CAPÍTULO ${toRoman(expectedCapNum)}".`,
          });
        }
        expectingCapOne = false;
        expectedCapNum = capNum + 1;
      }
    }
  });

  // 6. § 1º isolado sem § 2º e verificação de dois-pontos antes de incisos
  const blocksByArt = text.split(/(?=^\s*Art\.\s*\d+)/m);
  blocksByArt.forEach((block) => {
    const artHeader = block.match(/^\s*(Art\.\s*\d+º?)/);
    if (artHeader && /§\s*1º/.test(block) && !/§\s*2º/.test(block)) {
      findings.push({
        id: `par-unico-${artHeader[1]}`,
        severidade: 'erro',
        regra: 'Art. 10, III, da LC nº 95/1998',
        local: artHeader[1],
        descricao: `O ${artHeader[1]} possui apenas "§ 1º" sem "§ 2º".`,
        sugestao: 'Quando houver apenas um parágrafo no artigo, utilize obrigatoriamente a expressão "Parágrafo único.".',
      });
    }
  });

  for (let i = 0; i < lines.length - 1; i++) {
    const curr = lines[i].trim();
    const next = lines[i + 1].trim();
    if (/^(Art\.|§|Parágrafo único)/.test(curr) && /^[IVXLCDM]+\s*[-–]/.test(next)) {
      if (!curr.endsWith(':')) {
        findings.push({
          id: `falta-dois-pontos-${i + 1}`,
          severidade: 'alerta',
          regra: 'Art. 10, II, da LC nº 95/1998',
          local: `Linha ${i + 1}`,
          descricao: 'Dispositivo introdutório de incisos não termina com dois-pontos (":").',
          sugestao: 'Encerre o caput ou parágrafo que antecede os incisos com dois-pontos.',
        });
      }
    }
    if (/^[IVXLCDM]+\s*[-–]/.test(curr)) {
      const nextIsInciso = /^[IVXLCDM]+\s*[-–]/.test(next);
      const nextIsAlinea = /^[a-z]\)/.test(next);
      if (nextIsAlinea && !curr.endsWith(':')) {
        findings.push({
          id: `inciso-dois-pontos-${i + 1}`,
          severidade: 'alerta',
          regra: 'Art. 10, II e IV, da LC nº 95/1998',
          local: `Linha ${i + 1}`,
          descricao: 'Inciso desdobrado em alíneas deve terminar com dois-pontos (":").',
          sugestao: 'Substitua a pontuação final deste inciso por dois-pontos.',
        });
      } else if (nextIsInciso && !curr.endsWith(';')) {
        findings.push({
          id: `inciso-ponto-virgula-${i + 1}`,
          severidade: 'alerta',
          regra: 'Art. 10, II, da LC nº 95/1998',
          local: `Linha ${i + 1}`,
          descricao: 'Inciso intermediário deve terminar com ponto e vírgula (";").',
          sugestao: 'Ajuste a pontuação final deste inciso para ponto e vírgula.',
        });
      }
    }
  }

  // 7. Revogação genérica proibida
  if (/revogam-se\s+as\s+disposições\s+em\s+contrário/i.test(text)) {
    findings.push({
      id: 'revogacao-generica',
      severidade: 'erro',
      regra: 'Art. 9º da LC nº 95/1998',
      local: 'Cláusula de Revogação',
      descricao: 'Uso da cláusula genérica "Revogam-se as disposições em contrário", expressamente vedada pela legislação.',
      sugestao: 'Enumere de forma expressa e específica cada norma ou dispositivo revogado (ex.: "Fica revogado o Decreto nº 1.200, de 2021.").',
    });
  } else if (/(fica\s+revogad|ficam\s+revogad)/i.test(text)) {
    conformes.push('Cláusula de revogação expressa sem fórmula genérica proibida.');
  }

  // 8. Uso de (NR) em atos alteradores
  if (/passa\s+a\s+vigorar\s+com\s+as\s+seguintes\s+alterações/i.test(text)) {
    if (!/\(NR\)/.test(text)) {
      findings.push({
        id: 'falta-nr',
        severidade: 'alerta',
        regra: 'Art. 12, III, "d", da LC nº 95/1998',
        local: 'Dispositivos alterados',
        descricao: 'O texto indica alteração de norma vigente, mas não contém a marcação "(NR)" (Nova Redação).',
        sugestao: 'Insira "(NR)" ao final de cada dispositivo que recebeu nova redação ou foi acrescido.',
      });
    } else {
      conformes.push('Marcação "(NR)" aplicada nos dispositivos alterados.');
    }
  }

  // 9. Termos imprecisos, latinismos ou vícios redacionais
  const imprecisos: Array<{ pattern: RegExp; label: string; tip: string }> = [
    {
      pattern: /\betc\.?/gi,
      label: '"etc."',
      tip: 'Substitua por rol taxativo ou por critérios objetivos que definam a abrangência da regra.',
    },
    {
      pattern: /\be\/ou\b/gi,
      label: '"e/ou"',
      tip: 'Em técnica legislativa, evite "e/ou". Redija "X, Y, ou ambos" ou desdobre em incisos.',
    },
    {
      pattern: /\bdentre\s+outros\b/gi,
      label: '"dentre outros"',
      tip: 'Se o rol for exemplificativo, use "inclusive" ou explicite o critério geral no caput.',
    },
    {
      pattern: /\bconforme\s+o\s+caso\b/gi,
      label: '"conforme o caso"',
      tip: 'Especifique objetivamente qual condição aciona cada consequência jurídica.',
    },
    {
      pattern: /\batravés\s+de\b/gi,
      label: '"através de"',
      tip: 'Em redação oficial, prefira "por meio de" ou "mediante" ao indicar instrumento ou meio.',
    },
    {
      pattern: /\b(supra|retro|in fine)\b/gi,
      label: 'latinismo ("supra/retro/in fine")',
      tip: 'Evite expressões em latim; remeta diretamente ao número do artigo, parágrafo ou inciso.',
    },
  ];

  imprecisos.forEach((imp) => {
    lines.forEach((line, idx) => {
      if (imp.pattern.test(line)) {
        findings.push({
          id: `impreciso-${imp.label}-${idx}`,
          severidade: 'alerta',
          regra: 'Art. 11, I, da LC nº 95/1998 (Clareza e Precisão)',
          local: `Linha ${idx + 1}`,
          descricao: `Expressão imprecisa ou não recomendada detectada: ${imp.label}.`,
          sugestao: imp.tip,
        });
      }
      imp.pattern.lastIndex = 0;
    });
  });

  // 10. Frases longas em artigos (acima de 75 palavras no caput)
  lines.forEach((line, idx) => {
    if (/^\s*Art\.\s*\d+/.test(line)) {
      const wordCount = line.trim().split(/\s+/).length;
      if (wordCount > 75) {
        findings.push({
          id: `frase-longa-${idx}`,
          severidade: 'info',
          regra: 'Art. 11, I, "b", da LC nº 95/1998 (Concisão)',
          local: `Linha ${idx + 1}`,
          descricao: `Dispositivo extenso (${wordCount} palavras em bloco único).`,
          sugestao: 'Considere fracionar enumerações em incisos (I, II, III) ou exceções em parágrafos para facilitar leitura e futuras alterações.',
        });
      }
    }
  });

  // 11. Cláusula de vigência
  if (/entra\s+em\s+vigor/i.test(text)) {
    conformes.push('Cláusula de vigência identificada no texto.');
  } else {
    findings.push({
      id: 'sem-vigencia',
      severidade: 'erro',
      regra: 'Art. 8º da LC nº 95/1998',
      local: 'Parte Final',
      descricao: 'Cláusula de vigência não localizada.',
      sugestao: 'Inclua artigo final definindo quando a norma começa a produzir efeitos (ex.: "Esta Lei entra em vigor na data de sua publicação.").',
    });
  }

  return {
    findings,
    totalArtigos: artigoMatches.length,
    totalPalavras: words.length,
    erros: findings.filter((f) => f.severidade === 'erro').length,
    alertas: findings.filter((f) => f.severidade === 'alerta').length,
    conformes,
  };
}
