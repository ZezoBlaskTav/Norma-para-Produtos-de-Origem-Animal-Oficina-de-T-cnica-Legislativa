import { NormaDocument, NormaTipo } from '../types/norma';
import { getNormaSpec } from './normaProfiles';

export type FieldRequirementLevel = 'obrigatorio' | 'recomendado' | 'opcional';

export type ValidatableDocFieldKey =
  | 'numero'
  | 'data'
  | 'esfera'
  | 'ementa'
  | 'autoridade'
  | 'fundamentoLegal'
  | 'ordemExecucao'
  | 'artigos'
  | 'vigencia'
  | 'revogacoes'
  | 'localAssinatura'
  | 'assinante'
  | 'cargoAssinante';

export type ValidationIssueSeverity = 'erro' | 'alerta' | 'info';

export interface NormaFieldRule {
  field: ValidatableDocFieldKey;
  label: string;
  requirement: FieldRequirementLevel;
  regra: string;
  orientacao: string;
}

export interface NormaValidationIssue {
  id: string;
  field: ValidatableDocFieldKey;
  fieldSelector: string;
  fieldLabel: string;
  requirement: FieldRequirementLevel;
  severidade: ValidationIssueSeverity;
  regra: string;
  mensagem: string;
  sugestao: string;
}

export interface NormaValidationSummary {
  tipo: NormaTipo;
  normaRegente: string;
  isValid: boolean;
  erros: number;
  alertas: number;
  infos: number;
  rules: Record<ValidatableDocFieldKey, NormaFieldRule>;
  issues: NormaValidationIssue[];
  issuesByField: Partial<
    Record<ValidatableDocFieldKey, NormaValidationIssue[]>
  >;
  checksPassed: string[];
}

function hasPlaceholderBrackets(value: string): string | null {
  const m = value.match(/\[[^\]\n]{2,60}\]/);
  return m ? m[0] : null;
}

export function getNormaValidationRules(
  tipo: NormaTipo
): Record<ValidatableDocFieldKey, NormaFieldRule> {
  const spec = getNormaSpec(tipo);
  const profile = spec.profile;
  const isTech = profile === 'tecnico_operacional';
  const isRegimental = tipo === 'Regimento Interno' || tipo === 'Estatuto';
  const isLeiSancionada = tipo === 'Lei' || tipo === 'Lei Complementar';
  const isProjetoLei = tipo === 'Projeto de Lei';
  const isColegiado = tipo === 'Resolução' || tipo === 'Deliberação';

  return {
    numero: {
      field: 'numero',
      label: isTech ? 'Código / Número' : 'Número',
      requirement: isRegimental
        ? 'opcional'
        : isProjetoLei
          ? 'recomendado'
          : 'obrigatorio',
      regra: isTech
        ? 'ABNT NBR 6024 / ISO 9001 (Controle Documental)'
        : isRegimental
          ? 'Identificação Orgânica'
          : 'Art. 4º da LC nº 95/1998',
      orientacao: isTech
        ? 'Informe o código identificador único do procedimento (ex.: IT-001/2026 ou POP-001/2026).'
        : isRegimental
          ? 'Pode informar numeração oficial ou denominação institucional (ex.: DO CONSELHO MUNICIPAL).'
          : isProjetoLei
            ? 'Informe o número da proposição quando já protocolada (ex.: PL nº 015/2026).'
            : 'Preencha o número oficial da norma na epígrafe antes da publicação.',
    },
    data: {
      field: 'data',
      label: isTech ? 'Data / Revisão' : 'Data por Extenso',
      requirement: isTech || isProjetoLei || isRegimental
        ? 'recomendado'
        : 'obrigatorio',
      regra: isTech ? 'ISO 9001 (Revisão Documental)' : 'Art. 4º da LC nº 95/1998',
      orientacao: isTech
        ? 'Indique a edição/revisão e o mês/ano de vigência técnica (ex.: REVISÃO 00 — NOVEMBRO/2026).'
        : 'Informe a data por extenso em caixa alta (ex.: DE 17 DE NOVEMBRO DE 2026).',
    },
    esfera: {
      field: 'esfera',
      label: isTech ? 'Área / Setor Emitente' : 'Esfera / Órgão Emitente',
      requirement:
        isTech || isRegimental
          ? 'obrigatorio'
          : isColegiado || tipo === 'Norma Interna' || tipo === 'Ordem de Serviço'
            ? 'recomendado'
            : 'opcional',
      regra: isTech
        ? 'ABNT NBR 6024 / ISO 9001'
        : isRegimental
          ? 'Identificação Institucional do Estatuto/Regimento'
          : 'Contextualização Orgânica',
      orientacao: isTech
        ? 'Informe o setor ou unidade técnica responsável pela emissão e controle do documento.'
        : 'Indique o órgão, colegiado ou ente federativo emissor do ato.',
    },
    ementa: {
      field: 'ementa',
      label: isTech ? 'Objetivo / Escopo' : 'Ementa',
      requirement: isTech ? 'opcional' : 'obrigatorio',
      regra: isTech
        ? 'ABNT NBR 6024 (Objetivo no quadro técnico é opcional)'
        : 'Art. 3º, I, e Art. 5º da LC nº 95/1998',
      orientacao: isTech
        ? 'Opcional no quadro de identificação quando o objetivo já estiver detalhado na seção 1 do procedimento.'
        : `Obrigatória em ${tipo}: sintetize o objeto do ato de modo preciso e conciso, terminando com ponto final.`,
    },
    autoridade: {
      field: 'autoridade',
      label: isTech ? 'Responsável Técnico / Aprovador' : 'Autoridade Signatária',
      requirement: 'obrigatorio',
      regra: isTech
        ? 'ISO 9001 (Autoridade Técnica Aprovadora)'
        : 'Art. 6º da LC nº 95/1998',
      orientacao: isTech
        ? 'Informe o cargo ou função do responsável técnico que aprova o procedimento.'
        : 'Indique a autoridade ou órgão competente no preâmbulo (ex.: O PREFEITO MUNICIPAL).',
    },
    fundamentoLegal: {
      field: 'fundamentoLegal',
      label: isTech
        ? 'Normas e Documentos de Referência'
        : 'Fundamento Legal de Competência',
      requirement: isLeiSancionada
        ? 'opcional'
        : isTech || isRegimental || isProjetoLei
          ? 'recomendado'
          : 'obrigatorio',
      regra: isLeiSancionada
        ? 'Art. 6º da LC nº 95/1998 (Sanção Legislativa)'
        : isTech
          ? 'ABNT NBR 6024 / ISO 9001'
          : 'Art. 6º da LC nº 95/1998 e Art. 14 do Decreto nº 12.002/2024',
      orientacao: isLeiSancionada
        ? 'Em Leis sancionadas/promulgadas, o preâmbulo normalmente dispensa fundamentos regulamentares ou considerandos.'
        : isTech
          ? 'Liste normas técnicas, manuais ou legislação aplicáveis como referência ao procedimento.'
          : 'Informe o dispositivo legal, constitucional ou regimental que fundamenta a competência do ato.',
    },
    ordemExecucao: {
      field: 'ordemExecucao',
      label: isTech ? 'Faixa de Aprovação / Destinação' : 'Ordem de Execução / Sanção',
      requirement: isTech ? 'opcional' : 'obrigatorio',
      regra: isTech ? 'Quadro Técnico de Controle' : 'Art. 6º da LC nº 95/1998',
      orientacao: isTech
        ? 'Opcional; indica o comando de aprovação e cumprimento obrigatório.'
        : isLeiSancionada
          ? 'Informe a cláusula de sanção ou promulgação (ex.: "Faço saber que o Poder Legislativo aprovou e eu sanciono a seguinte Lei:").'
          : 'Informe o comando formal do ato (ex.: DECRETA:, RESOLVE:, DELIBERA:, APROVA E ESTABELECE:).',
    },
    artigos: {
      field: 'artigos',
      label: isTech ? 'Estrutura Técnica e Etapas' : 'Articulado (Artigos)',
      requirement: 'obrigatorio',
      regra: isTech ? 'ABNT NBR 6024' : 'Art. 3º, II, e Art. 10 da LC nº 95/1998',
      orientacao: isTech
        ? 'Inclua ao menos um item ou etapa operacional com descrição preenchida.'
        : 'O corpo normativo deve conter ao menos um artigo com texto redigido.',
    },
    vigencia: {
      field: 'vigencia',
      label: isTech ? 'Vigência e Controle de Revisão' : 'Cláusula de Vigência',
      requirement: 'obrigatorio',
      regra: isTech ? 'ISO 9001 (Controle Documental)' : 'Art. 8º da LC nº 95/1998',
      orientacao:
        'Defina vigência imediata, prazo em dias maior que zero ou data certa preenchida.',
    },
    revogacoes: {
      field: 'revogacoes',
      label: isTech ? 'Documentos Substituídos' : 'Revogações Expressas',
      requirement: 'opcional',
      regra: 'Art. 9º da LC nº 95/1998',
      orientacao:
        'Opcional; preencha apenas quando houver substituição expressa de norma ou documento anterior.',
    },
    localAssinatura: {
      field: 'localAssinatura',
      label: 'Local e Data (Fecho)',
      requirement: isTech || isProjetoLei ? 'recomendado' : 'obrigatorio',
      regra: isTech ? 'Identificação de Aprovação' : 'Art. 3º, III, da LC nº 95/1998',
      orientacao: 'Informe o município/local e a data de assinatura no fecho do documento.',
    },
    assinante: {
      field: 'assinante',
      label: isTech ? 'Nome do Aprovador' : 'Nome da Autoridade Signatária',
      requirement: isProjetoLei ? 'recomendado' : 'obrigatorio',
      regra: isTech ? 'ISO 9001 (Aprovação)' : 'Art. 3º, III, da LC nº 95/1998',
      orientacao: 'Informe o nome completo da autoridade ou responsável técnico signatário.',
    },
    cargoAssinante: {
      field: 'cargoAssinante',
      label: isTech ? 'Cargo / Registro Técnico' : 'Cargo do Signatário',
      requirement: isTech ? 'obrigatorio' : 'recomendado',
      regra: isTech ? 'ISO 9001 (Qualificação / Função)' : 'Redação Oficial (Fecho)',
      orientacao: isTech
        ? 'Informe o cargo, função ou registro profissional do responsável técnico aprovador.'
        : 'Informe o cargo oficial abaixo do nome do signatário.',
    },
  };
}

export function validateNormaDocument(
  doc: NormaDocument
): NormaValidationSummary {
  const spec = getNormaSpec(doc.tipo);
  const profile = spec.profile;
  const isTech = profile === 'tecnico_operacional';
  const isRegimental = doc.tipo === 'Regimento Interno' || doc.tipo === 'Estatuto';
  const isLeiSancionada =
    doc.tipo === 'Lei' || doc.tipo === 'Lei Complementar';
  const rules = getNormaValidationRules(doc.tipo);

  const issues: NormaValidationIssue[] = [];
  const checksPassed: string[] = [];

  const pushIssue = (issue: NormaValidationIssue) => {
    issues.push(issue);
  };

  // 1. Número / Código
  const numRule = rules.numero;
  const numTrim = doc.numero.trim();
  if (!numTrim) {
    if (numRule.requirement === 'obrigatorio') {
      pushIssue({
        id: 'val-numero-vazio',
        field: 'numero',
        fieldSelector: 'numero',
        fieldLabel: numRule.label,
        requirement: numRule.requirement,
        severidade: 'erro',
        regra: numRule.regra,
        mensagem: `O campo "${numRule.label}" é obrigatório para ${doc.tipo}.`,
        sugestao: numRule.orientacao,
      });
    } else if (numRule.requirement === 'recomendado') {
      pushIssue({
        id: 'val-numero-rec',
        field: 'numero',
        fieldSelector: 'numero',
        fieldLabel: numRule.label,
        requirement: numRule.requirement,
        severidade: 'alerta',
        regra: numRule.regra,
        mensagem: `Recomenda-se preencher "${numRule.label}" para identificar ${doc.tipo}.`,
        sugestao: numRule.orientacao,
      });
    }
  } else if (/^_+$/.test(numTrim)) {
    if (numRule.requirement !== 'opcional') {
      pushIssue({
        id: 'val-numero-placeholder',
        field: 'numero',
        fieldSelector: 'numero',
        fieldLabel: numRule.label,
        requirement: numRule.requirement,
        severidade: 'alerta',
        regra: numRule.regra,
        mensagem: `${numRule.label} está com marcação provisória ("___").`,
        sugestao:
          'Preencha o número definitivo antes da assinatura ou publicação oficial.',
      });
    }
  } else {
    checksPassed.push(`${numRule.label} preenchido (${numTrim}).`);
  }

  // 2. Data / Revisão
  const dataRule = rules.data;
  const dataTrim = doc.data.trim();
  if (!dataTrim || /___/.test(dataTrim)) {
    const isUnfilled = !dataTrim;
    if (isUnfilled && dataRule.requirement === 'obrigatorio') {
      pushIssue({
        id: 'val-data-vazia',
        field: 'data',
        fieldSelector: 'data',
        fieldLabel: dataRule.label,
        requirement: dataRule.requirement,
        severidade: 'erro',
        regra: dataRule.regra,
        mensagem: `O campo "${dataRule.label}" é obrigatório para ${doc.tipo}.`,
        sugestao: dataRule.orientacao,
      });
    } else {
      pushIssue({
        id: 'val-data-pendente',
        field: 'data',
        fieldSelector: 'data',
        fieldLabel: dataRule.label,
        requirement: dataRule.requirement,
        severidade: 'alerta',
        regra: dataRule.regra,
        mensagem: isUnfilled
          ? `Recomenda-se informar "${dataRule.label}" em ${doc.tipo}.`
          : `"${dataRule.label}" ainda contém marcação em aberto ("___").`,
        sugestao: dataRule.orientacao,
      });
    }
  } else {
    checksPassed.push(`${dataRule.label} informada.`);
  }

  // 3. Esfera / Setor Emitente
  const esferaRule = rules.esfera;
  const esferaTrim = doc.esfera.trim();
  const esferaPlaceholder = hasPlaceholderBrackets(esferaTrim);
  if (!esferaTrim) {
    if (esferaRule.requirement === 'obrigatorio') {
      pushIssue({
        id: 'val-esfera-vazia',
        field: 'esfera',
        fieldSelector: 'esfera',
        fieldLabel: esferaRule.label,
        requirement: esferaRule.requirement,
        severidade: 'erro',
        regra: esferaRule.regra,
        mensagem: `O campo "${esferaRule.label}" é obrigatório para ${doc.tipo}.`,
        sugestao: esferaRule.orientacao,
      });
    } else if (esferaRule.requirement === 'recomendado') {
      pushIssue({
        id: 'val-esfera-rec',
        field: 'esfera',
        fieldSelector: 'esfera',
        fieldLabel: esferaRule.label,
        requirement: esferaRule.requirement,
        severidade: 'alerta',
        regra: esferaRule.regra,
        mensagem: `Recomenda-se informar "${esferaRule.label}" para identificar o órgão emissor.`,
        sugestao: esferaRule.orientacao,
      });
    }
  } else if (esferaPlaceholder) {
    pushIssue({
      id: 'val-esfera-placeholder',
      field: 'esfera',
      fieldSelector: 'esfera',
      fieldLabel: esferaRule.label,
      requirement: esferaRule.requirement,
      severidade: 'alerta',
      regra: esferaRule.regra,
      mensagem: `"${esferaRule.label}" contém marcador modelo (${esferaPlaceholder}).`,
      sugestao: 'Substitua o marcador entre colchetes pelo setor ou órgão real.',
    });
  } else if (esferaRule.requirement !== 'opcional') {
    checksPassed.push(`${esferaRule.label} definida.`);
  }

  // 4. Ementa / Objetivo
  const ementaRule = rules.ementa;
  const ementaTrim = doc.ementa.trim();
  const ementaPlaceholder = hasPlaceholderBrackets(ementaTrim);
  if (!ementaTrim) {
    if (ementaRule.requirement === 'obrigatorio') {
      pushIssue({
        id: 'val-ementa-vazia',
        field: 'ementa',
        fieldSelector: 'ementa',
        fieldLabel: ementaRule.label,
        requirement: ementaRule.requirement,
        severidade: 'erro',
        regra: ementaRule.regra,
        mensagem: `O campo "${ementaRule.label}" é obrigatório em ${doc.tipo}.`,
        sugestao: ementaRule.orientacao,
      });
    } else {
      checksPassed.push(
        `Campo "${ementaRule.label}" é opcional em ${doc.tipo} (conforme ${spec.normaRegente}).`
      );
    }
  } else {
    if (ementaPlaceholder) {
      pushIssue({
        id: 'val-ementa-placeholder',
        field: 'ementa',
        fieldSelector: 'ementa',
        fieldLabel: ementaRule.label,
        requirement: ementaRule.requirement,
        severidade: 'alerta',
        regra: ementaRule.regra,
        mensagem: `"${ementaRule.label}" ainda contém marcador modelo (${ementaPlaceholder}).`,
        sugestao: 'Substitua o trecho entre colchetes pela descrição definitiva do objeto.',
      });
    } else {
      checksPassed.push(`${ementaRule.label} preenchida.`);
    }
    if (!isTech && !/[.]$/.test(ementaTrim)) {
      pushIssue({
        id: 'val-ementa-ponto',
        field: 'ementa',
        fieldSelector: 'ementa',
        fieldLabel: ementaRule.label,
        requirement: ementaRule.requirement,
        severidade: 'alerta',
        regra: 'Art. 5º da LC nº 95/1998',
        mensagem: 'A ementa deve ser encerrada com ponto final.',
        sugestao: 'Adicione um ponto final ao término da ementa.',
      });
    }
    const wordCount = ementaTrim.split(/\s+/).length;
    if (!isTech && wordCount > 55) {
      pushIssue({
        id: 'val-ementa-extensa',
        field: 'ementa',
        fieldSelector: 'ementa',
        fieldLabel: ementaRule.label,
        requirement: ementaRule.requirement,
        severidade: 'info',
        regra: 'Art. 5º da LC nº 95/1998 (Concisão)',
        mensagem: `Ementa longa (${wordCount} palavras).`,
        sugestao: 'Procure sintetizar o objeto principal em uma ou duas orações diretas.',
      });
    }
  }

  // 5. Autoridade Signatária / Responsável Técnico
  const autRule = rules.autoridade;
  const autTrim = doc.autoridade.trim();
  const autPlaceholder = hasPlaceholderBrackets(autTrim);
  if (!autTrim) {
    pushIssue({
      id: 'val-autoridade-vazia',
      field: 'autoridade',
      fieldSelector: 'autoridade',
      fieldLabel: autRule.label,
      requirement: autRule.requirement,
      severidade: 'erro',
      regra: autRule.regra,
      mensagem: `O campo "${autRule.label}" é obrigatório para ${doc.tipo}.`,
      sugestao: autRule.orientacao,
    });
  } else if (autPlaceholder) {
    pushIssue({
      id: 'val-autoridade-placeholder',
      field: 'autoridade',
      fieldSelector: 'autoridade',
      fieldLabel: autRule.label,
      requirement: autRule.requirement,
      severidade: 'alerta',
      regra: autRule.regra,
      mensagem: `"${autRule.label}" contém marcador modelo (${autPlaceholder}).`,
      sugestao: 'Informe a autoridade ou cargo técnico definitivo.',
    });
  } else {
    checksPassed.push(`${autRule.label} informada.`);
  }

  // 6. Fundamento Legal / Normas de Referência
  const fundRule = rules.fundamentoLegal;
  const fundTrim = doc.fundamentoLegal.trim();
  const fundPlaceholder = hasPlaceholderBrackets(fundTrim);
  if (!fundTrim) {
    if (fundRule.requirement === 'obrigatorio') {
      pushIssue({
        id: 'val-fundamento-vazio',
        field: 'fundamentoLegal',
        fieldSelector: 'fundamentoLegal',
        fieldLabel: fundRule.label,
        requirement: fundRule.requirement,
        severidade: 'erro',
        regra: fundRule.regra,
        mensagem: `O campo "${fundRule.label}" é obrigatório em ${doc.tipo}.`,
        sugestao: fundRule.orientacao,
      });
    } else if (fundRule.requirement === 'recomendado') {
      pushIssue({
        id: 'val-fundamento-rec',
        field: 'fundamentoLegal',
        fieldSelector: 'fundamentoLegal',
        fieldLabel: fundRule.label,
        requirement: fundRule.requirement,
        severidade: 'alerta',
        regra: fundRule.regra,
        mensagem: `Recomenda-se preencher "${fundRule.label}" em ${doc.tipo}.`,
        sugestao: fundRule.orientacao,
      });
    } else {
      checksPassed.push(
        `Fundamento regulamentar dispensado em ${doc.tipo} sancionada (LC nº 95/1998).`
      );
    }
  } else if (fundPlaceholder) {
    pushIssue({
      id: 'val-fundamento-placeholder',
      field: 'fundamentoLegal',
      fieldSelector: 'fundamentoLegal',
      fieldLabel: fundRule.label,
      requirement: fundRule.requirement,
      severidade: 'alerta',
      regra: fundRule.regra,
      mensagem: `"${fundRule.label}" contém marcador modelo (${fundPlaceholder}).`,
      sugestao: 'Informe as normas ou artigos específicos de competência.',
    });
  } else {
    if (!isTech) {
      const considerandos = (fundTrim.match(/\bCONSIDERANDO\b/gi) || []).length;
      if (considerandos >= 2) {
        pushIssue({
          id: 'val-fundamento-considerando',
          field: 'fundamentoLegal',
          fieldSelector: 'fundamentoLegal',
          fieldLabel: fundRule.label,
          requirement: fundRule.requirement,
          severidade: 'alerta',
          regra: 'Art. 6º da LC nº 95/1998 e Art. 14 do Decreto nº 12.002/2024',
          mensagem: `Há ${considerandos} blocos "CONSIDERANDO" no preâmbulo.`,
          sugestao:
            'Mantenha no preâmbulo apenas a norma de competência; leve justificativas para Exposição de Motivos ou Nota Técnica.',
        });
      }
    }
    checksPassed.push(`${fundRule.label} preenchido.`);
  }

  // 7. Ordem de Execução / Sanção
  const ordRule = rules.ordemExecucao;
  const ordTrim = doc.ordemExecucao.trim();
  if (!ordTrim) {
    if (ordRule.requirement === 'obrigatorio') {
      pushIssue({
        id: 'val-ordem-vazia',
        field: 'ordemExecucao',
        fieldSelector: 'ordemExecucao',
        fieldLabel: ordRule.label,
        requirement: ordRule.requirement,
        severidade: 'erro',
        regra: ordRule.regra,
        mensagem: `O campo "${ordRule.label}" é obrigatório em ${doc.tipo}.`,
        sugestao: ordRule.orientacao,
      });
    }
  } else {
    if (isLeiSancionada) {
      if (!/(sanciono|promulgo|seguinte\s+Lei)/i.test(ordTrim)) {
        pushIssue({
          id: 'val-ordem-lei-formula',
          field: 'ordemExecucao',
          fieldSelector: 'ordemExecucao',
          fieldLabel: ordRule.label,
          requirement: ordRule.requirement,
          severidade: 'alerta',
          regra: 'Art. 6º da LC nº 95/1998',
          mensagem: `Em ${doc.tipo}, espera-se cláusula de sanção ou promulgação legislativa (ex.: "${spec.defaultOrdemExecucao}").`,
          sugestao: `Ajuste para "${spec.defaultOrdemExecucao}".`,
        });
      } else {
        checksPassed.push('Cláusula de sanção/promulgação adequada à espécie.');
      }
    } else if (!isTech && /sanciono\s+a\s+seguinte\s+Lei/i.test(ordTrim)) {
      pushIssue({
        id: 'val-ordem-incompativel',
        field: 'ordemExecucao',
        fieldSelector: 'ordemExecucao',
        fieldLabel: ordRule.label,
        requirement: ordRule.requirement,
        severidade: 'erro',
        regra: 'Art. 6º da LC nº 95/1998',
        mensagem: `A ordem de execução menciona sanção de Lei, mas o ato selecionado é ${doc.tipo}.`,
        sugestao: `Utilize "${spec.defaultOrdemExecucao}".`,
      });
    } else if (!isTech && !/:$/.test(ordTrim)) {
      pushIssue({
        id: 'val-ordem-dois-pontos',
        field: 'ordemExecucao',
        fieldSelector: 'ordemExecucao',
        fieldLabel: ordRule.label,
        requirement: ordRule.requirement,
        severidade: 'alerta',
        regra: 'Art. 6º da LC nº 95/1998',
        mensagem: 'A ordem de execução deve terminar com dois-pontos (":").',
        sugestao: `Encerre "${ordTrim}" com dois-pontos.`,
      });
    } else {
      checksPassed.push(`${ordRule.label} compatível com ${doc.tipo}.`);
    }
  }

  // 8. Artigos / Estrutura Técnica
  const artRule = rules.artigos;
  if (doc.artigos.length === 0) {
    pushIssue({
      id: 'val-artigos-vazio',
      field: 'artigos',
      fieldSelector: 'artigos',
      fieldLabel: artRule.label,
      requirement: artRule.requirement,
      severidade: 'erro',
      regra: artRule.regra,
      mensagem: `O documento precisa ter pelo menos um ${isTech ? 'item operacional' : 'artigo'}.`,
      sugestao: artRule.orientacao,
    });
  } else {
    let hasAnyCaputText = false;
    let emptySubCount = 0;
    let placeholderInBody = false;

    doc.artigos.forEach((art, idx) => {
      const caputTrim = art.caput.trim();
      const itemRef = isTech ? `Item ${idx + 1}` : `Art. ${idx + 1 <= 9 ? `${idx + 1}º` : idx + 1}`;

      if (!caputTrim) {
        pushIssue({
          id: `val-caput-vazio-${art.id}`,
          field: 'artigos',
          fieldSelector: `caput:${art.id}`,
          fieldLabel: `${itemRef} (Texto principal)`,
          requirement: 'obrigatorio',
          severidade: 'erro',
          regra: artRule.regra,
          mensagem: `${itemRef} está sem texto preenchido.`,
          sugestao: `Redija o conteúdo do ${itemRef} ou remova o bloco em branco.`,
        });
      } else {
        hasAnyCaputText = true;
        if (!placeholderInBody && hasPlaceholderBrackets(caputTrim)) {
          placeholderInBody = true;
          const marker = hasPlaceholderBrackets(caputTrim);
          pushIssue({
            id: `val-caput-placeholder-${art.id}`,
            field: 'artigos',
            fieldSelector: `caput:${art.id}`,
            fieldLabel: itemRef,
            requirement: 'obrigatorio',
            severidade: 'alerta',
            regra: 'Revisão pré-publicação',
            mensagem: `${itemRef} contém marcador modelo não substituído (${marker}).`,
            sugestao: 'Substitua o marcador entre colchetes pelo texto definitivo.',
          });
        }
      }

      art.incisos.forEach((inc) => {
        if (!inc.texto.trim()) emptySubCount += 1;
        inc.alineas.forEach((al) => {
          if (!al.texto.trim()) emptySubCount += 1;
        });
      });

      art.paragrafos.forEach((par) => {
        if (!par.texto.trim()) emptySubCount += 1;
        (par.incisos || []).forEach((inc) => {
          if (!inc.texto.trim()) emptySubCount += 1;
          inc.alineas.forEach((al) => {
            if (!al.texto.trim()) emptySubCount += 1;
          });
        });
      });
    });

    if (emptySubCount > 0) {
      pushIssue({
        id: 'val-subitens-vazios',
        field: 'artigos',
        fieldSelector: `caput:${doc.artigos[0].id}`,
        fieldLabel: artRule.label,
        requirement: 'obrigatorio',
        severidade: 'erro',
        regra: artRule.regra,
        mensagem: `Há ${emptySubCount} ${
          emptySubCount === 1
            ? 'desdobramento em branco (inciso, parágrafo ou alínea)'
            : 'desdobramentos em branco (incisos, parágrafos ou alíneas)'
        }.`,
        sugestao: 'Preencha ou remova os subitens deixados sem texto.',
      });
    }

    if (isRegimental && doc.artigos.length >= 3) {
      const hasOrgDiv = doc.artigos.some(
        (a) => Boolean(a.titulo?.trim()) || Boolean(a.capitulo?.trim())
      );
      if (!hasOrgDiv) {
        pushIssue({
          id: 'val-regimento-divisao',
          field: 'artigos',
          fieldSelector: `caput:${doc.artigos[0].id}`,
          fieldLabel: artRule.label,
          requirement: 'recomendado',
          severidade: 'alerta',
          regra: 'LC nº 95/1998 (Estrutura Orgânica)',
          mensagem: `${doc.tipo} possui ${doc.artigos.length} artigos sem divisão em Títulos ou Capítulos.`,
          sugestao:
            'Organize os artigos em Títulos e Capítulos (ex.: Competências, Composição, Funcionamento) para maior clareza orgânica.',
        });
      }
    }

    if (isTech && doc.artigos.length >= 2) {
      const hasTechSec = doc.artigos.some(
        (a) =>
          Boolean(a.titulo?.trim()) ||
          Boolean(a.capitulo?.trim()) ||
          Boolean(a.secao?.trim())
      );
      if (!hasTechSec) {
        pushIssue({
          id: 'val-tech-secoes',
          field: 'artigos',
          fieldSelector: `caput:${doc.artigos[0].id}`,
          fieldLabel: artRule.label,
          requirement: 'recomendado',
          severidade: 'info',
          regra: 'ABNT NBR 6024 (Seções Primárias)',
          mensagem: `${doc.tipo} possui ${doc.artigos.length} itens sem agrupamento em seções numeradas.`,
          sugestao:
            'Adicione seções (ex.: 1. OBJETIVO, 2. MATERIAIS, 3. PROCEDIMENTO) para estruturar a numeração progressiva.',
        });
      }
    }

    if (hasAnyCaputText && emptySubCount === 0) {
      checksPassed.push(
        `Corpo com ${doc.artigos.length} ${
          isTech
            ? doc.artigos.length === 1
              ? 'item preenchido'
              : 'itens preenchidos'
            : doc.artigos.length === 1
              ? 'artigo preenchido'
              : 'artigos preenchidos'
        }.`
      );
    }
  }

  // 9. Vigência
  const vigRule = rules.vigencia;
  if (doc.vigenciaTipo === 'dias') {
    if (!Number.isFinite(doc.vigenciaDias) || doc.vigenciaDias < 1) {
      pushIssue({
        id: 'val-vigencia-dias',
        field: 'vigencia',
        fieldSelector: 'vigencia',
        fieldLabel: vigRule.label,
        requirement: vigRule.requirement,
        severidade: 'erro',
        regra: vigRule.regra,
        mensagem: 'O prazo de vacatio legis em dias deve ser igual ou superior a 1.',
        sugestao: 'Informe um número inteiro positivo de dias (ex.: 30, 60 ou 90).',
      });
    } else {
      checksPassed.push(`Vigência configurada (${doc.vigenciaDias} dias).`);
    }
  } else if (doc.vigenciaTipo === 'data_certa') {
    const vigDataTrim = doc.vigenciaData.trim();
    if (!vigDataTrim) {
      pushIssue({
        id: 'val-vigencia-data-vazia',
        field: 'vigencia',
        fieldSelector: 'vigenciaData',
        fieldLabel: 'Data de início da vigência',
        requirement: vigRule.requirement,
        severidade: 'erro',
        regra: vigRule.regra,
        mensagem: 'Foi selecionada "Data certa no calendário", mas a data não foi informada.',
        sugestao: 'Preencha a data por extenso (ex.: 1º de janeiro de 2027).',
      });
    } else if (hasPlaceholderBrackets(vigDataTrim)) {
      pushIssue({
        id: 'val-vigencia-data-placeholder',
        field: 'vigencia',
        fieldSelector: 'vigenciaData',
        fieldLabel: 'Data de início da vigência',
        requirement: vigRule.requirement,
        severidade: 'alerta',
        regra: vigRule.regra,
        mensagem: 'A data de vigência contém marcador modelo não substituído.',
        sugestao: 'Substitua pelo dia, mês e ano definitivos.',
      });
    } else {
      checksPassed.push(`Vigência definida para ${vigDataTrim}.`);
    }
  } else {
    checksPassed.push('Cláusula de vigência imediata configurada.');
  }

  // 10. Revogações
  const revRule = rules.revogacoes;
  doc.revogacoes.forEach((rev, rIdx) => {
    const rTrim = rev.trim();
    if (!rTrim) {
      pushIssue({
        id: `val-revogacao-vazia-${rIdx}`,
        field: 'revogacoes',
        fieldSelector: `revogacao:${rIdx}`,
        fieldLabel: `${revRule.label} #${rIdx + 1}`,
        requirement: 'opcional',
        severidade: 'alerta',
        regra: revRule.regra,
        mensagem: `Item de revogação #${rIdx + 1} está em branco.`,
        sugestao: 'Preencha a identificação do ato revogado ou remova a linha vazia.',
      });
    } else if (/revogam-se\s+as\s+disposições\s+em\s+contrário/i.test(rTrim)) {
      pushIssue({
        id: `val-revogacao-generica-${rIdx}`,
        field: 'revogacoes',
        fieldSelector: `revogacao:${rIdx}`,
        fieldLabel: `${revRule.label} #${rIdx + 1}`,
        requirement: 'opcional',
        severidade: isTech ? 'alerta' : 'erro',
        regra: 'Art. 9º da LC nº 95/1998',
        mensagem:
          'Uso de cláusula genérica ("revogam-se as disposições em contrário"), vedada pela LC nº 95/1998.',
        sugestao:
          'Indique de forma expressa o número, a data ou os artigos exatos da norma revogada.',
      });
    }
  });

  // 11. Local e Data de Assinatura
  const localRule = rules.localAssinatura;
  const localTrim = doc.localAssinatura.trim();
  if (!localTrim) {
    pushIssue({
      id: 'val-local-vazio',
      field: 'localAssinatura',
      fieldSelector: 'localAssinatura',
      fieldLabel: localRule.label,
      requirement: localRule.requirement,
      severidade: localRule.requirement === 'obrigatorio' ? 'erro' : 'alerta',
      regra: localRule.regra,
      mensagem:
        localRule.requirement === 'obrigatorio'
          ? `O campo "${localRule.label}" é obrigatório para o fecho de ${doc.tipo}.`
          : `Recomenda-se preencher "${localRule.label}" no fecho.`,
      sugestao: localRule.orientacao,
    });
  } else if (/^Local,\s+em\b/i.test(localTrim) || hasPlaceholderBrackets(localTrim)) {
    pushIssue({
      id: 'val-local-modelo',
      field: 'localAssinatura',
      fieldSelector: 'localAssinatura',
      fieldLabel: localRule.label,
      requirement: localRule.requirement,
      severidade: 'alerta',
      regra: localRule.regra,
      mensagem: `"${localRule.label}" ainda utiliza texto genérico ("${localTrim}").`,
      sugestao: 'Informe o nome real do município/unidade e a data oficial.',
    });
  } else {
    checksPassed.push('Local e data do fecho preenchidos.');
  }

  // 12. Assinante
  const assRule = rules.assinante;
  const assTrim = doc.assinante.trim();
  const assPlaceholder = hasPlaceholderBrackets(assTrim);
  if (!assTrim) {
    pushIssue({
      id: 'val-assinante-vazio',
      field: 'assinante',
      fieldSelector: 'assinante',
      fieldLabel: assRule.label,
      requirement: assRule.requirement,
      severidade: assRule.requirement === 'obrigatorio' ? 'erro' : 'alerta',
      regra: assRule.regra,
      mensagem:
        assRule.requirement === 'obrigatorio'
          ? `O campo "${assRule.label}" é obrigatório para ${doc.tipo}.`
          : `Recomenda-se informar "${assRule.label}".`,
      sugestao: assRule.orientacao,
    });
  } else if (assPlaceholder) {
    pushIssue({
      id: 'val-assinante-placeholder',
      field: 'assinante',
      fieldSelector: 'assinante',
      fieldLabel: assRule.label,
      requirement: assRule.requirement,
      severidade: 'alerta',
      regra: assRule.regra,
      mensagem: `"${assRule.label}" contém marcador modelo (${assPlaceholder}).`,
      sugestao: 'Preencha o nome completo da autoridade ou responsável técnico.',
    });
  } else {
    checksPassed.push(`${assRule.label} preenchido.`);
  }

  // 13. Cargo do Assinante
  const cargoRule = rules.cargoAssinante;
  const cargoTrim = doc.cargoAssinante.trim();
  if (!cargoTrim) {
    if (cargoRule.requirement === 'obrigatorio' || (assTrim && !assPlaceholder)) {
      pushIssue({
        id: 'val-cargo-vazio',
        field: 'cargoAssinante',
        fieldSelector: 'cargoAssinante',
        fieldLabel: cargoRule.label,
        requirement: cargoRule.requirement,
        severidade: cargoRule.requirement === 'obrigatorio' ? 'erro' : 'alerta',
        regra: cargoRule.regra,
        mensagem:
          cargoRule.requirement === 'obrigatorio'
            ? `O campo "${cargoRule.label}" é obrigatório para ${doc.tipo}.`
            : `Recomenda-se informar "${cargoRule.label}" abaixo do nome do signatário.`,
        sugestao: cargoRule.orientacao,
      });
    }
  } else if (hasPlaceholderBrackets(cargoTrim)) {
    pushIssue({
      id: 'val-cargo-placeholder',
      field: 'cargoAssinante',
      fieldSelector: 'cargoAssinante',
      fieldLabel: cargoRule.label,
      requirement: cargoRule.requirement,
      severidade: 'alerta',
      regra: cargoRule.regra,
      mensagem: `"${cargoRule.label}" contém marcador modelo (${hasPlaceholderBrackets(cargoTrim)}).`,
      sugestao: 'Informe o cargo oficial definitivo.',
    });
  }

  const issuesByField: Partial<
    Record<ValidatableDocFieldKey, NormaValidationIssue[]>
  > = {};
  for (const issue of issues) {
    if (!issuesByField[issue.field]) {
      issuesByField[issue.field] = [];
    }
    issuesByField[issue.field]!.push(issue);
  }

  const erros = issues.filter((i) => i.severidade === 'erro').length;
  const alertas = issues.filter((i) => i.severidade === 'alerta').length;
  const infos = issues.filter((i) => i.severidade === 'info').length;

  return {
    tipo: doc.tipo,
    normaRegente: spec.normaRegente,
    isValid: erros === 0,
    erros,
    alertas,
    infos,
    rules,
    issues,
    issuesByField,
    checksPassed,
  };
}
