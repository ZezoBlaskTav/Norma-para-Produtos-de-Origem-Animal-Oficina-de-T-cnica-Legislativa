import { AuditSummary, NormaDocument, NormaTipo } from '../types/norma';
import { formatNormaEpigrafe, getNormaSpec } from './normaProfiles';
import { NormaValidationSummary } from './normaValidation';

export type ChecklistItemStatus = 'conforme' | 'parcial' | 'pendente';

export interface ChecklistSubCheck {
  label: string;
  ok: boolean;
  nota?: string;
}

export interface ComplianceChecklistItem {
  id: string;
  ordem: number;
  titulo: string;
  artigoLc95: string;
  status: ChecklistItemStatus;
  opcional: boolean;
  resumo: string;
  detalhes: ChecklistSubCheck[];
  fieldSelector: string;
}

export interface ComplianceChecklistSummary {
  tipo: NormaTipo;
  normaBase: string;
  items: ComplianceChecklistItem[];
  totalConformes: number;
  totalParciais: number;
  totalPendentes: number;
  totalItems: number;
  percentual: number;
}

function hasBrackets(value: string): boolean {
  return /\[[^\]\n]{2,60}\]/.test(value);
}

export function buildComplianceChecklist(
  doc: NormaDocument,
  validation: NormaValidationSummary,
  audit: AuditSummary
): ComplianceChecklistSummary {
  const spec = getNormaSpec(doc.tipo);
  const isTech = spec.profile === 'tecnico_operacional';
  const isRegimental = doc.tipo === 'Regimento Interno' || doc.tipo === 'Estatuto';
  const isLeiSancionada =
    doc.tipo === 'Lei' || doc.tipo === 'Lei Complementar';
  const isProjetoLei = doc.tipo === 'Projeto de Lei';

  const items: ComplianceChecklistItem[] = [];

  // 1. Epígrafe (Art. 4º da LC 95/98)
  const numTrim = doc.numero.trim();
  const dataTrim = doc.data.trim();
  const numRequired = !isRegimental && !isProjetoLei;
  const numOk = isRegimental
    ? true
    : Boolean(numTrim) && !/^_+$/.test(numTrim);
  const dataOk = Boolean(dataTrim) && !/___/.test(dataTrim);
  const epigrafeStatus: ChecklistItemStatus =
    numOk && dataOk
      ? 'conforme'
      : (numRequired && !numTrim) || (!dataTrim && !isTech && !isProjetoLei)
        ? 'pendente'
        : 'parcial';

  items.push({
    id: 'lc95-epigrafe',
    ordem: 1,
    titulo: 'Epígrafe',
    artigoLc95: isTech
      ? 'ABNT NBR 6024 / ISO 9001'
      : 'Art. 4º da LC nº 95/1998',
    status: epigrafeStatus,
    opcional: false,
    resumo:
      epigrafeStatus === 'conforme'
        ? formatNormaEpigrafe(doc)
        : !numOk && !dataOk
          ? 'Preencha a numeração/código e a data por extenso na abertura.'
          : !numOk
            ? 'Numeração oficial ainda não informada ou pendente ("___").'
            : 'Data por extenso ainda pendente ou com marcação em aberto ("___").',
    detalhes: [
      {
        label: `Espécie normativa selecionada (${doc.tipo})`,
        ok: true,
      },
      {
        label: isTech
          ? 'Código de controle preenchido'
          : isRegimental
            ? 'Identificação ou número (opcional em regimento/estatuto)'
            : 'Número oficial definido (sem "___")',
        ok: numOk,
      },
      {
        label: isTech
          ? 'Data / revisão documental informada'
          : 'Data por extenso completa (sem "___")',
        ok: dataOk,
      },
    ],
    fieldSelector: !numOk ? 'numero' : 'data',
  });

  // 2. Ementa (Art. 5º da LC 95/98)
  const ementaTrim = doc.ementa.trim();
  const ementaHasBrackets = hasBrackets(ementaTrim);
  const ementaEndsPeriod = /[.]$/.test(ementaTrim);
  let ementaStatus: ChecklistItemStatus;
  let ementaResumo: string;

  if (isTech) {
    if (!ementaTrim) {
      ementaStatus = 'conforme';
      ementaResumo =
        'Campo Objetivo / Escopo opcional neste tipo documental (ABNT NBR 6024).';
    } else if (ementaHasBrackets) {
      ementaStatus = 'parcial';
      ementaResumo =
        'Objetivo preenchido, mas ainda contém marcador entre colchetes ([...]).';
    } else {
      ementaStatus = 'conforme';
      ementaResumo = 'Objetivo / Escopo preenchido no quadro técnico.';
    }
  } else {
    if (!ementaTrim) {
      ementaStatus = 'pendente';
      ementaResumo = `Ementa obrigatória ausente para ${doc.tipo}.`;
    } else if (ementaHasBrackets || !ementaEndsPeriod) {
      ementaStatus = 'parcial';
      ementaResumo = ementaHasBrackets
        ? 'Ementa contém marcador modelo ([...]) a substituir.'
        : 'Ementa preenchida, mas falta ponto final ao término (Art. 5º).';
    } else {
      ementaStatus = 'conforme';
      ementaResumo =
        ementaTrim.length > 90
          ? `${ementaTrim.slice(0, 87)}...`
          : ementaTrim;
    }
  }

  items.push({
    id: 'lc95-ementa',
    ordem: 2,
    titulo: isTech ? 'Objetivo / Escopo (Ementa)' : 'Ementa',
    artigoLc95: isTech
      ? 'Opcional · ABNT NBR 6024'
      : 'Art. 5º da LC nº 95/1998',
    status: ementaStatus,
    opcional: isTech,
    resumo: ementaResumo,
    detalhes: isTech
      ? [
          {
            label: 'Objetivo no quadro técnico (opcional em IT/POP)',
            ok: !ementaHasBrackets,
            nota: ementaTrim ? 'Preenchido' : 'Opcional',
          },
        ]
      : [
          {
            label: 'Síntese do objeto preenchida',
            ok: Boolean(ementaTrim),
          },
          {
            label: 'Sem marcadores modelo ([...])',
            ok: Boolean(ementaTrim) && !ementaHasBrackets,
          },
          {
            label: 'Encerrada com ponto final (.)',
            ok: Boolean(ementaTrim) && ementaEndsPeriod,
          },
        ],
    fieldSelector: 'ementa',
  });

  // 3. Preâmbulo e Ordem de Execução (Art. 6º da LC 95/98)
  const autTrim = doc.autoridade.trim();
  const autOk = Boolean(autTrim) && !hasBrackets(autTrim);
  const fundTrim = doc.fundamentoLegal.trim();
  const fundReq = validation.rules.fundamentoLegal.requirement;
  const fundOk =
    fundReq === 'opcional'
      ? !hasBrackets(fundTrim)
      : fundReq === 'recomendado'
        ? Boolean(fundTrim) && !hasBrackets(fundTrim)
        : Boolean(fundTrim) && !hasBrackets(fundTrim);
  const ordTrim = doc.ordemExecucao.trim();
  const ordHasError = (validation.issuesByField.ordemExecucao || []).some(
    (i) => i.severidade === 'erro' || i.severidade === 'alerta'
  );
  const ordOk = isTech ? true : Boolean(ordTrim) && !ordHasError;
  const excessiveConsiderando =
    !isTech && (fundTrim.match(/\bCONSIDERANDO\b/gi) || []).length >= 2;

  let preambuloStatus: ChecklistItemStatus;
  if (autOk && fundOk && ordOk && !excessiveConsiderando) {
    preambuloStatus = 'conforme';
  } else if (
    !autTrim ||
    (fundReq === 'obrigatorio' && !fundTrim) ||
    (!isTech && !ordTrim) ||
    (validation.issuesByField.ordemExecucao || []).some(
      (i) => i.severidade === 'erro'
    )
  ) {
    preambuloStatus = 'pendente';
  } else {
    preambuloStatus = 'parcial';
  }

  items.push({
    id: 'lc95-preambulo',
    ordem: 3,
    titulo: isTech
      ? 'Responsável Técnico e Referências'
      : 'Preâmbulo e Ordem de Execução',
    artigoLc95: isTech
      ? 'ISO 9001 / ABNT NBR 6024'
      : 'Art. 6º da LC nº 95/1998',
    status: preambuloStatus,
    opcional: false,
    resumo:
      preambuloStatus === 'conforme'
        ? isLeiSancionada
          ? 'Autoridade promulgadora e cláusula de sanção conforme LC nº 95/1998.'
          : isTech
            ? 'Responsável técnico e normas de referência informados.'
            : 'Autoridade, competência legal e ordem de execução preenchidas.'
        : !autOk
          ? 'Informe a autoridade ou responsável técnico no preâmbulo.'
          : fundReq === 'obrigatorio' && !fundTrim
            ? `Fundamento legal de competência obrigatório para ${doc.tipo}.`
            : !ordOk
              ? 'Verifique a fórmula da ordem de execução/sanção e os dois-pontos finais.'
              : 'Revise recomendações de preâmbulo ou marcadores pendentes.',
    detalhes: [
      {
        label: isTech
          ? 'Responsável Técnico / Aprovador preenchido'
          : 'Autoridade signatária informada',
        ok: autOk,
      },
      {
        label: isLeiSancionada
          ? 'Fundamento regulamentar dispensado em Lei sancionada'
          : isTech
            ? 'Normas e documentos de referência'
            : fundReq === 'obrigatorio'
              ? 'Fundamento legal de competência (obrigatório)'
              : 'Fundamento de competência (recomendado)',
        ok: fundReq === 'recomendado' ? !hasBrackets(fundTrim) : fundOk,
        nota:
          fundReq === 'opcional'
            ? 'Opcional'
            : fundReq === 'recomendado' && !fundTrim
              ? 'Recomendado'
              : undefined,
      },
      {
        label: isTech
          ? 'Faixa de aprovação / destinação'
          : 'Ordem de execução / sanção compatível com a espécie',
        ok: ordOk,
      },
    ],
    fieldSelector: !autOk
      ? 'autoridade'
      : !fundOk && fundReq === 'obrigatorio'
        ? 'fundamentoLegal'
        : 'ordemExecucao',
  });

  // 4. Objeto e Âmbito de Aplicação (Art. 1º / Art. 7º da LC 95/98)
  const firstArt = doc.artigos[0];
  const firstCaputTrim = firstArt?.caput.trim() || '';
  const firstHasBrackets = hasBrackets(firstCaputTrim);
  const objStatus: ChecklistItemStatus = !firstCaputTrim
    ? 'pendente'
    : firstHasBrackets
      ? 'parcial'
      : 'conforme';

  items.push({
    id: 'lc95-objeto',
    ordem: 4,
    titulo: isTech
      ? 'Objetivo / Escopo Inicial (Item 1)'
      : 'Objeto e Âmbito de Aplicação (Art. 1º)',
    artigoLc95: isTech
      ? 'ABNT NBR 6024'
      : 'Art. 7º da LC nº 95/1998',
    status: objStatus,
    opcional: false,
    resumo:
      objStatus === 'conforme'
        ? 'Primeiro dispositivo indica o objeto e o âmbito de aplicação do texto.'
        : objStatus === 'parcial'
          ? 'O primeiro dispositivo ainda contém marcador entre colchetes ([...]).'
          : `Preencha o ${isTech ? 'Item 1' : 'Art. 1º'} definindo o objeto e a abrangência.`,
    detalhes: [
      {
        label: `${isTech ? 'Item 1' : 'Art. 1º'} redigido`,
        ok: Boolean(firstCaputTrim),
      },
      {
        label: 'Sem marcadores modelo ([...]) no dispositivo inicial',
        ok: Boolean(firstCaputTrim) && !firstHasBrackets,
      },
    ],
    fieldSelector: firstArt ? `caput:${firstArt.id}` : 'artigos',
  });

  // 5. Articulação, Numeração e Pontuação (Art. 10 da LC 95/98)
  const hasAnyBodyError =
    doc.artigos.length === 0 ||
    doc.artigos.some((a) => !a.caput.trim()) ||
    doc.artigos.some(
      (a) =>
        a.incisos.some(
          (i) => !i.texto.trim() || i.alineas.some((al) => !al.texto.trim())
        ) ||
        a.paragrafos.some(
          (p) =>
            !p.texto.trim() ||
            (p.incisos || []).some(
              (i) => !i.texto.trim() || i.alineas.some((al) => !al.texto.trim())
            )
        )
    );

  const numberingIssues = audit.findings.filter((f) =>
    /^(ordinal-art|ordinal-par|missing-ord|dup-art|gap-art|par-unico|cap-reset-titulo|tec-seq|tec-sem-itens)/.test(
      f.id
    )
  );
  const punctuationIssues = audit.findings.filter((f) =>
    /^(falta-dois-pontos|inciso-dois-pontos|inciso-ponto-virgula|cap-seq)/.test(
      f.id
    )
  );
  const bodyHasPlaceholders = doc.artigos.some(
    (a) =>
      hasBrackets(a.caput) ||
      a.incisos.some(
        (i) => hasBrackets(i.texto) || i.alineas.some((al) => hasBrackets(al.texto))
      ) ||
      a.paragrafos.some((p) => hasBrackets(p.texto))
  );
  const needsRegimentalDivisions =
    isRegimental &&
    doc.artigos.length >= 3 &&
    !doc.artigos.some((a) => Boolean(a.titulo?.trim()) || Boolean(a.capitulo?.trim()));

  let articulacaoStatus: ChecklistItemStatus;
  if (
    hasAnyBodyError ||
    numberingIssues.some((f) => f.severidade === 'erro')
  ) {
    articulacaoStatus = 'pendente';
  } else if (
    punctuationIssues.length > 0 ||
    bodyHasPlaceholders ||
    needsRegimentalDivisions
  ) {
    articulacaoStatus = 'parcial';
  } else {
    articulacaoStatus = 'conforme';
  }

  items.push({
    id: 'lc95-articulacao',
    ordem: 5,
    titulo: isTech
      ? 'Estrutura e Numeração Progressiva'
      : 'Articulação, Numeração e Pontuação',
    artigoLc95: isTech
      ? 'ABNT NBR 6024'
      : 'Art. 10 da LC nº 95/1998',
    status: articulacaoStatus,
    opcional: false,
    resumo:
      articulacaoStatus === 'conforme'
        ? `${doc.artigos.length} ${
            isTech
              ? doc.artigos.length === 1
                ? 'item estruturado'
                : 'itens estruturados'
              : doc.artigos.length === 1
                ? 'artigo articulado'
                : 'artigos articulados'
          } em conformidade.`
        : hasAnyBodyError
          ? 'Há artigo/item ou desdobramento (inciso, parágrafo ou alínea) sem texto.'
          : numberingIssues.length > 0
            ? numberingIssues[0].descricao
            : needsRegimentalDivisions
              ? `${doc.tipo} com ${doc.artigos.length} artigos sem divisão em Títulos ou Capítulos.`
              : bodyHasPlaceholders
                ? 'Existem marcadores ([...]) pendentes no corpo do texto.'
                : 'Verifique recomendações de pontuação ou sequência de capítulos.',
    detalhes: [
      {
        label: 'Todos os dispositivos e desdobramentos preenchidos',
        ok: !hasAnyBodyError,
      },
      {
        label: isTech
          ? 'Numeração progressiva sequencial (1., 1.1, 1.1.1)'
          : 'Numeração ordinal/cardinal (Art. 1º–9º / Art. 10) e capítulos sem falhas',
        ok: numberingIssues.length === 0,
      },
      {
        label: 'Sem marcadores modelo ([...]) nos dispositivos',
        ok: !bodyHasPlaceholders,
      },
      ...(isRegimental && doc.artigos.length >= 3
        ? [
            {
              label: 'Organização em Títulos ou Capítulos (recomendado)',
              ok: !needsRegimentalDivisions,
            },
          ]
        : []),
    ],
    fieldSelector: firstArt ? `caput:${firstArt.id}` : 'artigos',
  });

  // 6. Cláusula de Vigência (Art. 8º da LC 95/98)
  const vigDiasOk =
    doc.vigenciaTipo !== 'dias' ||
    (Number.isFinite(doc.vigenciaDias) && doc.vigenciaDias >= 1);
  const vigDataTrim = doc.vigenciaData.trim();
  const vigDataOk =
    doc.vigenciaTipo !== 'data_certa' ||
    (Boolean(vigDataTrim) && !hasBrackets(vigDataTrim));
  const vigStatus: ChecklistItemStatus =
    !vigDiasOk || (doc.vigenciaTipo === 'data_certa' && !vigDataTrim)
      ? 'pendente'
      : !vigDataOk
        ? 'parcial'
        : 'conforme';

  items.push({
    id: 'lc95-vigencia',
    ordem: 6,
    titulo: 'Cláusula de Vigência',
    artigoLc95: isTech
      ? 'ISO 9001 · Vigência'
      : 'Art. 8º da LC nº 95/1998',
    status: vigStatus,
    opcional: false,
    resumo:
      vigStatus === 'conforme'
        ? doc.vigenciaTipo === 'imediata'
          ? 'Entrada em vigor na data de publicação.'
          : doc.vigenciaTipo === 'dias'
            ? `Vacatio legis configurada para ${doc.vigenciaDias} dias.`
            : `Vigência em data certa: ${vigDataTrim}.`
        : doc.vigenciaTipo === 'data_certa' && !vigDataTrim
          ? 'Informe a data certa de início da vigência.'
          : 'Verifique o prazo ou a data informada para vigência.',
    detalhes: [
      {
        label: 'Modalidade de vigência definida',
        ok: true,
      },
      {
        label:
          doc.vigenciaTipo === 'data_certa'
            ? 'Data certa preenchida por extenso'
            : doc.vigenciaTipo === 'dias'
              ? 'Quantidade de dias maior ou igual a 1'
              : 'Vigência imediata selecionada',
        ok: vigDiasOk && vigDataOk,
      },
    ],
    fieldSelector:
      doc.vigenciaTipo === 'data_certa' ? 'vigenciaData' : 'vigencia',
  });

  // 7. Cláusula de Revogação Expressa (Art. 9º da LC 95/98)
  const hasGenericRevogacao = doc.revogacoes.some((r) =>
    /revogam-se\s+as\s+disposições\s+em\s+contrário/i.test(r)
  );
  const hasBlankRevogacao = doc.revogacoes.some((r) => !r.trim());
  const revStatus: ChecklistItemStatus = hasGenericRevogacao
    ? 'pendente'
    : hasBlankRevogacao
      ? 'parcial'
      : 'conforme';

  items.push({
    id: 'lc95-revogacao',
    ordem: 7,
    titulo: isTech
      ? 'Documentos Substituídos / Revogados'
      : 'Cláusula de Revogação Expressa',
    artigoLc95: 'Art. 9º da LC nº 95/1998',
    status: revStatus,
    opcional: doc.revogacoes.length === 0,
    resumo: hasGenericRevogacao
      ? 'Fórmula genérica proibida ("revogam-se as disposições em contrário") detectada.'
      : hasBlankRevogacao
        ? 'Há linha de revogação em branco na Parte Final.'
        : doc.revogacoes.length === 0
          ? 'Sem revogações informadas (livre de cláusula genérica proibida).'
          : `${doc.revogacoes.length} ${
              doc.revogacoes.length === 1
                ? 'norma especificada expressamente'
                : 'normas especificadas expressamente'
            }.`,
    detalhes: [
      {
        label: 'Livre da fórmula genérica proibida ("em contrário")',
        ok: !hasGenericRevogacao,
      },
      {
        label: 'Todas as revogações listadas estão especificadas',
        ok: !hasBlankRevogacao,
      },
    ],
    fieldSelector: hasBlankRevogacao
      ? `revogacao:${doc.revogacoes.findIndex((r) => !r.trim())}`
      : 'localAssinatura',
  });

  // 8. Fecho e Assinatura (Art. 3º, III, da LC 95/98)
  const localTrim = doc.localAssinatura.trim();
  const localOk =
    Boolean(localTrim) &&
    !/^Local,\s+em\b/i.test(localTrim) &&
    !hasBrackets(localTrim);
  const assTrim = doc.assinante.trim();
  const assOk = Boolean(assTrim) && !hasBrackets(assTrim);
  const cargoTrim = doc.cargoAssinante.trim();
  const cargoOk = Boolean(cargoTrim) && !hasBrackets(cargoTrim);

  let fechoStatus: ChecklistItemStatus;
  if (localOk && assOk && cargoOk) {
    fechoStatus = 'conforme';
  } else if (
    (!assTrim && validation.rules.assinante.requirement === 'obrigatorio') ||
    (!localTrim &&
      validation.rules.localAssinatura.requirement === 'obrigatorio') ||
    (!cargoTrim &&
      validation.rules.cargoAssinante.requirement === 'obrigatorio')
  ) {
    fechoStatus = 'pendente';
  } else {
    fechoStatus = 'parcial';
  }

  items.push({
    id: 'lc95-fecho',
    ordem: 8,
    titulo: 'Fecho e Assinatura',
    artigoLc95: isTech
      ? 'ISO 9001 · Aprovação'
      : 'Art. 3º, III, da LC nº 95/1998',
    status: fechoStatus,
    opcional: false,
    resumo:
      fechoStatus === 'conforme'
        ? `${localTrim} · ${assTrim}${cargoTrim ? ` (${cargoTrim})` : ''}`
        : !assOk
          ? 'Preencha o nome definitivo da autoridade ou responsável signatário.'
          : !localOk
            ? 'Substitua "Local, em ..." pelo município/local e data reais.'
            : 'Informe o cargo ou qualificação técnica do signatário.',
    detalhes: [
      {
        label: 'Local e data reais informados',
        ok: localOk,
      },
      {
        label: 'Nome do signatário preenchido (sem [...])',
        ok: assOk,
      },
      {
        label: 'Cargo / registro técnico preenchido',
        ok: cargoOk,
      },
    ],
    fieldSelector: !localOk
      ? 'localAssinatura'
      : !assOk
        ? 'assinante'
        : 'cargoAssinante',
  });

  const totalConformes = items.filter((i) => i.status === 'conforme').length;
  const totalParciais = items.filter((i) => i.status === 'parcial').length;
  const totalPendentes = items.filter((i) => i.status === 'pendente').length;
  const totalItems = items.length;
  const score = items.reduce(
    (acc, item) =>
      acc + (item.status === 'conforme' ? 1 : item.status === 'parcial' ? 0.5 : 0),
    0
  );
  const percentual = Math.round((score / Math.max(1, totalItems)) * 100);

  return {
    tipo: doc.tipo,
    normaBase: spec.normaRegente,
    items,
    totalConformes,
    totalParciais,
    totalPendentes,
    totalItems,
    percentual,
  };
}
