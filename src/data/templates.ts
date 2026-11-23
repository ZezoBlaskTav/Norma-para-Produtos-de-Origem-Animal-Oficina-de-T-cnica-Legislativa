import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  NormaDocument,
} from '../types/norma';

export const NORMA_TEMPLATES: NormaDocument[] = [
  {
    id: 'tpl-decreto-modelo-estruturado',
    tipo: 'Decreto',
    numero: '[NÚMERO]',
    data: 'DE [DIA] DE [MÊS] DE [ANO]',
    esfera: '[Ente Federativo / Órgão Central]',
    autoridade: '[CARGO DA AUTORIDADE COMPETENTE — ex.: O PREFEITO MUNICIPAL]',
    fundamentoLegal:
      'no uso da atribuição que lhe confere [artigo e inciso da Constituição, Lei Orgânica ou Estatuto], e tendo em vista o disposto na [Lei nº XXX, de DD de mês de AAAA]',
    ementa:
      '[Verbo no presente do indicativo — ex.: Regulamenta / Institui / Dispõe sobre] [objeto principal da norma] no âmbito de [órgão ou abrangência territorial].',
    ordemExecucao: 'DECRETA:',
    artigos: [
      {
        id: 'art-mod-1',
        capitulo: 'CAPÍTULO I - DAS DISPOSIÇÕES GERAIS',
        caput:
          'Este Decreto [estabelece / regulamenta] [objeto detalhado] no âmbito de [órgãos, entidades ou destinatários alcançados].',
        incisos: [],
        paragrafos: [
          {
            id: 'par-mod-1',
            texto:
              'Para os fins do disposto neste Decreto, considera-se [definição técnica de termo-chave, se necessária].',
          },
        ],
      },
      {
        id: 'art-mod-2',
        capitulo: 'CAPÍTULO II - DOS OBJETIVOS, COMPETÊNCIAS E PROCEDIMENTOS',
        caput: 'São diretrizes [ou requisitos] para a execução do disposto neste Decreto:',
        incisos: [
          {
            id: 'inc-mod-1',
            texto: '[primeira diretriz, competência ou requisito operacional em letra minúscula]',
            alineas: [],
          },
          {
            id: 'inc-mod-2',
            texto: '[segunda diretriz ou obrigação] com observância de',
            alineas: [
              {
                id: 'al-mod-1',
                texto: '[primeira condição específica ou prazo]',
              },
              {
                id: 'al-mod-2',
                texto: '[segunda condição específica ou critério técnico]',
              },
            ],
          },
        ],
        paragrafos: [],
      },
      {
        id: 'art-mod-3',
        caput:
          'Compete a [órgão ou unidade responsável] [atribuição executiva, fiscalizatória ou de coordenação], no prazo de [prazo em dias ou meses].',
        incisos: [],
        paragrafos: [
          {
            id: 'par-mod-3-1',
            texto:
              'O descumprimento das obrigações previstas neste Decreto sujeitará o responsável a [consequência jurídica ou administrativa prevista em lei].',
          },
          {
            id: 'par-mod-3-2',
            texto:
              'Os casos omissos ou que exijam detalhamento técnico serão disciplinados por [ato infralegal competente, ex.: portaria ou instrução normativa].',
          },
        ],
      },
      {
        id: 'art-mod-4',
        capitulo: 'CAPÍTULO III - DAS DISPOSIÇÕES TRANSITÓRIAS E FINAIS',
        caput:
          'Os processos, contratos ou situações constituídas antes da publicação deste Decreto deverão adequar-se às novas exigências até [data limite ou prazo de transição].',
        incisos: [],
        paragrafos: [],
      },
    ],
    vigenciaTipo: 'dias',
    vigenciaDias: 30,
    vigenciaData: '',
    revogacoes: ['[Decreto nº XXX, de DD de mês de AAAA — ou remover se não houver revogação]'],
    localAssinatura: '[Cidade/UF], em [dia] de [mês] de [ano].',
    assinante: '[NOME COMPLETO DA AUTORIDADE SIGNATÁRIA]',
    cargoAssinante: '[Cargo Oficial]',
    updatedAt: '2026-11-17T09:00:00Z',
  },
  {
    id: 'tpl-decreto-governanca',
    tipo: 'Decreto',
    numero: '1.842',
    data: 'DE 17 DE NOVEMBRO DE 2026',
    esfera: 'Executivo Municipal / Órgão Central',
    autoridade: 'O PREFEITO MUNICIPAL',
    fundamentoLegal:
      'no uso da atribuição que lhe confere o art. 84, caput, inciso IV, da Constituição, e tendo em vista o disposto na Lei nº 14.129, de 29 de março de 2021',
    ementa:
      'Institui a Política de Governança de Dados e Interoperabilidade no âmbito da Administração Pública direta, autárquica e fundacional.',
    ordemExecucao: 'DECRETA:',
    artigos: [
      {
        id: 'art-1',
        capitulo: 'CAPÍTULO I - DAS DISPOSIÇÕES PRELIMINARES',
        caput:
          'Fica instituída a Política de Governança de Dados e Interoperabilidade no âmbito da Administração Pública direta, autárquica e fundacional, com a finalidade de:',
        incisos: [
          {
            id: 'inc-1-1',
            texto:
              'assegurar a integridade, a autenticidade e a disponibilidade dos registros administrativos digitais',
            alineas: [],
          },
          {
            id: 'inc-1-2',
            texto:
              'eliminar a exigência reiterada de documentos já custodiados por órgãos públicos',
            alineas: [],
          },
          {
            id: 'inc-1-3',
            texto:
              'promover o compartilhamento seguro de bases de dados entre secretarias e entidades vinculadas',
            alineas: [],
          },
        ],
        paragrafos: [
          {
            id: 'par-1-1',
            texto:
              'O disposto neste Decreto observa integralmente as diretrizes da Lei Geral de Proteção de Dados Pessoais e as normas de sigilo fiscal e bancário.',
          },
        ],
      },
      {
        id: 'art-2',
        capitulo: 'CAPÍTULO II - DOS PAPÉIS E RESPONSABILIDADES',
        caput:
          'Cada órgão ou entidade designará, no prazo de trinta dias contado da publicação deste Decreto, um Encarregado Setorial de Dados responsável pela catalogação das bases sob sua custódia.',
        incisos: [],
        paragrafos: [
          {
            id: 'par-2-1',
            texto:
              'A designação de que trata o caput recairá preferencialmente sobre servidor efetivo com atuação técnica na área de tecnologia ou planejamento.',
          },
          {
            id: 'par-2-2',
            texto:
              'O catálogo de bases de dados será atualizado semestralmente junto ao órgão central de tecnologia da informação.',
          },
        ],
      },
      {
        id: 'art-3',
        capitulo: 'CAPÍTULO III - DISPOSIÇÕES FINAIS',
        caput:
          'O órgão central de tecnologia da informação editará normas complementares contendo os padrões técnicos de APIs e dicionários de metadados.',
        incisos: [],
        paragrafos: [],
      },
    ],
    vigenciaTipo: 'imediata',
    vigenciaDias: 30,
    vigenciaData: '',
    revogacoes: ['Decreto nº 1.105, de 12 de abril de 2019'],
    localAssinatura: 'Palácio Municipal, em 17 de novembro de 2026.',
    assinante: '[NOME DA AUTORIDADE SIGNATÁRIA]',
    cargoAssinante: 'Prefeito Municipal',
    updatedAt: '2026-11-17T09:00:00Z',
  },
  {
    id: 'tpl-in-fluxo',
    tipo: 'Instrução Normativa',
    numero: '14',
    data: 'DE 17 DE NOVEMBRO DE 2026',
    esfera: 'Diretoria Administrativa / Compliance',
    autoridade: 'O SECRETÁRIO DE ADMINISTRAÇÃO E PLANEJAMENTO',
    fundamentoLegal:
      'no uso das atribuições regimentais e considerando o disposto no Decreto nº 1.842, de 2026',
    ementa:
      'Estabelece os procedimentos operacionais para instrução, análise técnica e publicação de minutas de atos normativos internos.',
    ordemExecucao: 'RESOLVE:',
    artigos: [
      {
        id: 'art-in-1',
        capitulo: 'CAPÍTULO I - DO OBJETO E DO ÂMBITO DE APLICAÇÃO',
        caput:
          'Esta Instrução Normativa disciplina o fluxo de elaboração, revisão jurídica e publicação de portarias, instruções normativas e normas operacionais no âmbito da Secretaria.',
        incisos: [],
        paragrafos: [],
      },
      {
        id: 'art-in-2',
        capitulo: 'CAPÍTULO II - DOS REQUISITOS DO PROCESSO',
        caput:
          'A unidade proponente instruirá o processo administrativo eletrônico com:',
        incisos: [
          {
            id: 'inc-in-1',
            texto:
              'nota técnica contendo o diagnóstico do problema e a justificativa da escolha normativa',
            alineas: [
              {
                id: 'al-in-1',
                texto: 'identificação dos dispositivos vigentes afetados ou revogados',
              },
              {
                id: 'al-in-2',
                texto: 'estimativa de impacto operacional ou orçamentário, quando houver',
              },
            ],
          },
          {
            id: 'inc-in-2',
            texto:
              'minuta do ato formatada segundo a Lei Complementar nº 95, de 26 de fevereiro de 1998',
            alineas: [],
          },
          {
            id: 'inc-in-3',
            texto:
              'quadro comparativo entre a redação vigente e a proposta, nos casos de alteração de norma existente',
            alineas: [],
          },
        ],
        paragrafos: [],
      },
    ],
    vigenciaTipo: 'dias',
    vigenciaDias: 15,
    vigenciaData: '',
    revogacoes: [],
    localAssinatura: 'Brasília, 17 de novembro de 2026.',
    assinante: '[NOME DO DIRIGENTE]',
    cargoAssinante: 'Secretário de Administração e Planejamento',
    updatedAt: '2026-11-17T09:00:00Z',
  },
  {
    id: 'tpl-portaria-comissao',
    tipo: 'Portaria',
    numero: '208',
    data: 'DE 17 DE NOVEMBRO DE 2026',
    esfera: 'Gabinete / Direção Geral',
    autoridade: 'A DIRETORA-GERAL',
    fundamentoLegal: 'no uso das competências delegadas pela Resolução nº 12, de 2024',
    ementa:
      'Institui Grupo de Trabalho para revisão e consolidação do acervo de normas operacionais internas.',
    ordemExecucao: 'RESOLVE:',
    artigos: [
      {
        id: 'art-p-1',
        caput:
          'Fica instituído Grupo de Trabalho com a finalidade de inventariar, revisar e propor a consolidação das normas operacionais editadas até dezembro de 2025.',
        incisos: [],
        paragrafos: [],
      },
      {
        id: 'art-p-2',
        caput:
          'O Grupo de Trabalho será composto pelos seguintes representantes:',
        incisos: [
          {
            id: 'inc-p-1',
            texto: 'dois servidores indicados pela Assessoria Jurídica, sendo um deles o coordenador',
            alineas: [],
          },
          {
            id: 'inc-p-2',
            texto: 'um representante da Diretoria de Operações',
            alineas: [],
          },
          {
            id: 'inc-p-3',
            texto: 'um representante da Unidade de Controle Interno',
            alineas: [],
          },
        ],
        paragrafos: [
          {
            id: 'par-p-1',
            texto:
              'A participação no Grupo de Trabalho não ensejará remuneração adicional de qualquer natureza.',
          },
        ],
      },
      {
        id: 'art-p-3',
        caput:
          'O Grupo de Trabalho concluirá suas atividades no prazo de noventa dias, contado da publicação desta Portaria, mediante entrega de relatório consolidado.',
        incisos: [],
        paragrafos: [],
      },
    ],
    vigenciaTipo: 'imediata',
    vigenciaDias: 0,
    vigenciaData: '',
    revogacoes: [],
    localAssinatura: 'São Paulo, 17 de novembro de 2026.',
    assinante: '[NOME DA DIRETORA-GERAL]',
    cargoAssinante: 'Diretora-Geral',
    updatedAt: '2026-11-17T09:00:00Z',
  },
];

export const DEFAULT_ALTERACAO_META: AlteracaoMetadata = {
  atoAlteradorTipo: 'Decreto',
  atoAlteradorNumero: '2.015',
  atoAlteradorData: 'DE 17 DE NOVEMBRO DE 2026',
  normaAlvoNome: 'Decreto nº 1.420, de 15 de março de 2022',
  normaAlvoEmentaResumo:
    'que dispõe sobre o regime de teletrabalho e controle de entregas dos servidores',
  autoridade: 'O PREFEITO MUNICIPAL',
  fundamentoLegal:
    'no uso da atribuição que lhe confere a Lei Orgânica do Município',
  ordemExecucao: 'DECRETA:',
  vigenciaTexto: 'Este Decreto entra em vigor na data de sua publicação.',
  localAssinatura: 'Palácio Municipal, em 17 de novembro de 2026.',
  assinante: '[NOME DA AUTORIDADE SIGNATÁRIA]',
  cargoAssinante: 'Prefeito Municipal',
};

export const DEFAULT_ALTERACOES: AlteracaoDispositivo[] = [
  {
    id: 'alt-1',
    tipoAcao: 'alterar',
    dispositivoAlvo: 'Art. 4º',
    textoOriginal:
      'Art. 4º O servidor em regime de teletrabalho deverá comparecer presencialmente à unidade ao menos uma vez por semana.',
    textoNovo:
      'Art. 4º O servidor em regime de teletrabalho cumprirá meta de desempenho pactuada mensalmente e comparecerá presencialmente quando convocado com antecedência mínima de quarenta e oito horas.',
    incluirPontilhadoAntes: false,
    incluirPontilhadoDepois: true,
    justificativa:
      'Substitui o comparecimento semanal fixo por gestão orientada a metas e convocação com aviso prévio mínimo.',
  },
  {
    id: 'alt-2',
    tipoAcao: 'acrescer',
    dispositivoAlvo: 'Art. 4º-A',
    textoOriginal: '(Dispositivo inexistente na norma vigente)',
    textoNovo:
      'Art. 4º-A Fica vedada a adesão ao regime de teletrabalho durante os primeiros seis meses de exercício do servidor em estágio probatório, salvo justificativa fundamentada da chefia imediata.',
    incluirPontilhadoAntes: false,
    incluirPontilhadoDepois: false,
    justificativa:
      'Insere regra de ambientação sem renumerar os artigos 5º e seguintes (Art. 12, III, "b", LC 95/98).',
  },
  {
    id: 'alt-3',
    tipoAcao: 'revogar',
    dispositivoAlvo: 'o parágrafo único do art. 7º',
    textoOriginal:
      'Parágrafo único. O equipamento de informática será obrigatoriamente retirado na sede do órgão.',
    textoNovo: '',
    incluirPontilhadoAntes: false,
    incluirPontilhadoDepois: false,
    justificativa:
      'Dispositivo obsoleto diante da possibilidade de utilização de infraestrutura própria homologada.',
  },
];

export interface GuiaEtapa {
  numero: string;
  titulo: string;
  resumo: string;
  regrasChave: Array<{ titulo: string; detalhe: string }>;
  exemploBom: string;
  exemploEvitar: string;
}

export const GUIA_ORIENTACAO_ETAPAS: GuiaEtapa[] = [
  {
    numero: '01',
    titulo: 'Diagnóstico e Escolha do Ato Adequado',
    resumo:
      'Antes de redigir o primeiro artigo, defina se o problema exige mesmo uma nova norma e qual é a espécie normativa competente segundo a hierarquia jurídica.',
    regrasChave: [
      {
        titulo: 'Decreto',
        detalhe:
          'Ato privativo do Chefe do Executivo para regulamentar leis (fiel execução), organizar a administração ou criar obrigações gerais infralegais sem inovar na criação de direitos/deveres reservados à lei.',
      },
      {
        titulo: 'Resolução / Instrução Normativa',
        detalhe:
          'Atos de órgãos colegiados ou autoridades setoriais para detalhar procedimentos técnicos, fluxos operacionais, prazos internos e formulários.',
      },
      {
        titulo: 'Portaria / Norma Interna',
        detalhe:
          'Atos administrativos ordinatórios para designar comissões, delegar competências internas, estabelecer rotinas de equipe ou políticas corporativas.',
      },
    ],
    exemploBom:
      'Usar Instrução Normativa para padronizar o checklist de compras internas, mantendo o Decreto restrito às competências e diretrizes gerais.',
    exemploEvitar:
      'Editar um novo Decreto para cada mudança de formulário ou prazo operacional, gerando inflação normativa.',
  },
  {
    numero: '02',
    titulo: 'Estrutura Obrigatória em Três Partes (Art. 3º da LC 95/98)',
    resumo:
      'Todo decreto ou norma formal deve ser organizado de maneira tripartite, preservando clareza de autoria, objeto e efeitos no tempo.',
    regrasChave: [
      {
        titulo: '1. Parte Preliminar',
        detalhe:
          'Epígrafe (tipo, número e data em caixa alta), Ementa (resumo objetivo do conteúdo), Preâmbulo (autoridade + fundamento de competência + ordem de execução: DECRETA: / RESOLVE:).',
      },
      {
        titulo: '2. Parte Normativa',
        detalhe:
          'O texto substantivo organizado em Artigos. O Art. 1º sempre indica o objeto e o âmbito de aplicação da norma (Art. 7º da LC 95/98).',
      },
      {
        titulo: '3. Parte Final',
        detalhe:
          'Disposições transitórias (se houver prazos de adaptação), Cláusula de Vigência (quando começa a valer) e Cláusula de Revogação expressa.',
      },
    ],
    exemploBom:
      'Art. 1º Este Decreto estabelece os critérios de avaliação de desempenho no âmbito da Administração direta.',
    exemploEvitar:
      'Começar o Art. 1º já com penalidades ou exceções sem antes delimitar o objeto e quem está submetido à norma.',
  },
  {
    numero: '03',
    titulo: 'Hierarquia do Articulado e Numeração Oficial',
    resumo:
      'A precisão formal impede nulidades interpretativas e facilita citações futuras. Siga rigorosamente a ordem de desdobramento do Art. 10 da LC 95/98.',
    regrasChave: [
      {
        titulo: 'Artigos (unidade básica)',
        detalhe:
          'Numerados em ordinal até o 9º ("Art. 1º", "Art. 9º") e em cardinal do 10 em diante ("Art. 10", "Art. 11" — jamais "Art. 10º").',
      },
      {
        titulo: 'Parágrafos (§ / Parágrafo único)',
        detalhe:
          'Expressam aspectos complementares ou exceções ao caput. Havendo só um parágrafo, usa-se "Parágrafo único.". Havendo dois ou mais: "§ 1º", "§ 2º"... até "§ 9º", depois "§ 10".',
      },
      {
        titulo: 'Incisos, Alíneas e Itens',
        detalhe:
          'Incisos em algarismos romanos (I, II, III) terminados em ponto e vírgula, exceto o último (ponto final). Alíneas em minúsculas com parêntese: a), b). Itens em arábicos: 1., 2.',
      },
    ],
    exemploBom:
      'Art. 10. Os prazos previstos neste regulamento contam-se em dias úteis.\nParágrafo único. Excluem-se da regra do caput os procedimentos urgentes.',
    exemploEvitar:
      'Art. 10º. (...) § 1º (quando não existe § 2º no artigo).',
  },
  {
    numero: '04',
    titulo: 'Como Ajustar Decretos e Normas Já Existentes (Art. 12)',
    resumo:
      'Alterar uma norma exige preservar a numeração original para não quebrar referências cruzadas em outros contratos, sistemas e atos.',
    regrasChave: [
      {
        titulo: 'Alteração Pontual vs. Revogação Integral',
        detalhe:
          'Se o ajuste atingir mais de 50% dos artigos ou mudar a espinha dorsal da norma, revogue-a integralmente e publique um texto novo consolidado. Se for pontual, edite um ato alterador.',
      },
      {
        titulo: 'Nunca Renumere Artigos Existentes',
        detalhe:
          'Para inserir novo artigo entre o 4º e o 5º, crie o "Art. 4º-A". Para revogar o Art. 6º, mantenha o número com a anotação "(Revogado)" — não puxe o Art. 7º para o lugar do 6º.',
      },
      {
        titulo: 'Uso de Aspas, Pontilhado e (NR)',
        detalhe:
          'O texto alterado vem entre aspas no ato alterador, com linhas pontilhadas para trechos mantidos sem mudança e a sigla "(NR)" ao final de cada dispositivo modificado ou acrescido.',
      },
    ],
    exemploBom:
      'Art. 1º O Decreto nº 1.420, de 2022, passa a vigorar com as seguintes alterações:\n"Art. 4º (...) (NR)"',
    exemploEvitar:
      'Reescrever todo o Art. 4º sem aspas, sem "(NR)", ou renumerar o Art. 5º para Art. 6º após inserir um novo artigo.',
  },
  {
    numero: '05',
    titulo: 'Vigência, Vacatio Legis e Revogação Expressa',
    resumo:
      'Normas operacionais precisam de tempo para adaptação de sistemas e equipes. E nenhuma revogação pode ser genérica.',
    regrasChave: [
      {
        titulo: 'Proibição de Revogação Genérica',
        detalhe:
          'O Art. 9º da LC 95/98 proíbe a fórmula "Revogam-se as disposições em contrário". Sempre liste exatamente qual decreto, artigo ou inciso deixa de valer.',
      },
      {
        titulo: 'Vacatio Legis Proporcional',
        detalhe:
          'Use "entra em vigor na data de sua publicação" apenas para atos de pequeno impacto ou urgência. Para mudanças de processo ou TI, defina 30, 60 ou 90 dias de transição.',
      },
      {
        titulo: 'Quadro Comparativo (De -> Para)',
        detalhe:
          'Antes de submeter à assinatura, anexe sempre o quadro comparativo lado a lado entre a norma vigente e a proposta para revisão da área jurídica e dos gestores.',
      },
    ],
    exemploBom:
      'Art. 12. Ficam revogados o Decreto nº 980, de 2018, e o inciso II do art. 5º do Decreto nº 1.420, de 2022.',
    exemploEvitar:
      'Art. 12. Revogam-se as disposições em contrário.',
  },
];

export interface GlossarioTermo {
  termo: string;
  categoria: 'Estrutura' | 'Articulado' | 'Vigência e Alteração' | 'Técnica Jurídica';
  definicao: string;
  exemploUso: string;
}

export const GLOSSARIO_JURIDICO: GlossarioTermo[] = [
  {
    termo: 'Epígrafe',
    categoria: 'Estrutura',
    definicao:
      'Título oficial que abre o ato normativo, grafado em caixa alta e negrito, indicando a espécie normativa, o número de ordem e a data de promulgação.',
    exemploUso: 'DECRETO Nº 1.842, DE 17 DE NOVEMBRO DE 2026.',
  },
  {
    termo: 'Ementa',
    categoria: 'Estrutura',
    definicao:
      'Resumo conciso e objetivo do conteúdo principal da norma, posicionado à direita logo abaixo da epígrafe para permitir identificação rápida do assunto.',
    exemploUso:
      'Regulamenta a Lei nº 14.129, de 2021, para dispor sobre a governança de dados no âmbito municipal.',
  },
  {
    termo: 'Preâmbulo',
    categoria: 'Estrutura',
    definicao:
      'Parte introdutória que declara a autoridade competente para editar o ato, o fundamento legal que lhe confere competência e a ordem de execução.',
    exemploUso:
      'O PREFEITO MUNICIPAL, no uso da atribuição que lhe confere o art. 74 da Lei Orgânica, DECRETA:',
  },
  {
    termo: 'Caput',
    categoria: 'Articulado',
    definicao:
      'Do latim "cabeça", designa o enunciado principal de um artigo, no qual se fixa a regra geral antes de eventuais desdobramentos em incisos ou parágrafos.',
    exemploUso:
      'Aplica-se a regra prevista no caput do art. 4º também às autarquias e fundações públicas.',
  },
  {
    termo: 'Parágrafo único / Parágrafos (§)',
    categoria: 'Articulado',
    definicao:
      'Dispositivo subordinado ao caput destinado a expressar exceções, complementos ou condições da regra principal. Quando houver apenas um, escreve-se "Parágrafo único.".',
    exemploUso:
      'Parágrafo único. O prazo de que trata o caput poderá ser prorrogado uma única vez, mediante justificativa.',
  },
  {
    termo: 'Inciso e Alínea',
    categoria: 'Articulado',
    definicao:
      'Incisos são enumerações em algarismos romanos (I, II, III) subordinadas ao caput ou parágrafo. Alíneas são subdivisões de incisos grafadas com letras minúsculas e parêntese (a), b)).',
    exemploUso:
      'I - comprovar regularidade fiscal mediante apresentação de: a) certidão negativa federal; b) certificado do FGTS.',
  },
  {
    termo: 'Vacatio legis',
    categoria: 'Vigência e Alteração',
    definicao:
      'Intervalo de tempo entre a publicação oficial de um decreto ou norma e a data em que passa efetivamente a produzir efeitos obrigatórios.',
    exemploUso:
      'Art. 15. Este Decreto entra em vigor noventa dias após a data de sua publicação.',
  },
  {
    termo: 'Revogação expressa',
    categoria: 'Vigência e Alteração',
    definicao:
      'Supressão explícita e nominal de norma ou dispositivo anterior. É obrigatória pelo art. 9º da LC nº 95/1998, sendo proibida a fórmula genérica "revogam-se as disposições em contrário".',
    exemploUso:
      'Art. 14. Ficam revogados o Decreto nº 1.105, de 2019, e o inciso II do art. 3º do Decreto nº 1.420, de 2022.',
  },
  {
    termo: 'Ab-rogação e Derrogação',
    categoria: 'Vigência e Alteração',
    definicao:
      'Ab-rogação é a revogação total de uma norma vigente. Derrogação é a revogação apenas parcial (de alguns artigos, parágrafos ou incisos), mantendo o restante em vigor.',
    exemploUso:
      'Optou-se pela ab-rogação do regulamento de 2015 em razão da reforma de mais de 70% dos seus dispositivos.',
  },
  {
    termo: 'Nova Redação (NR)',
    categoria: 'Vigência e Alteração',
    definicao:
      'Sigla aposta ao final de dispositivos modificados ou acrescidos dentro de um ato alterador, sinalizando que aquela redação substitui ou integra o texto da norma original.',
    exemploUso:
      '"Art. 4º O atendimento presencial ocorrerá mediante agendamento prévio. (NR)"',
  },
  {
    termo: 'Efeito repristinatório',
    categoria: 'Vigência e Alteração',
    definicao:
      'Fenômeno pelo qual uma norma revogada volta a vigorar quando a norma que a revogou perde a vigência. No Brasil (art. 2º, § 3º, da LINDB), não ocorre automaticamente, exigindo previsão expressa.',
    exemploUso:
      'A revogação do Decreto nº 2.000 não restaura automaticamente a vigência do Decreto nº 1.500, salvo disposição expressa.',
  },
  {
    termo: 'Poder regulamentar',
    categoria: 'Técnica Jurídica',
    definicao:
      'Prerrogativa do Chefe do Executivo de editar decretos para dar fiel execução às leis, detalhando procedimentos administrativos sem criar direitos ou deveres não previstos em lei.',
    exemploUso:
      'No exercício do poder regulamentar, o decreto detalhou os documentos exigidos pela lei municipal.',
  },
  {
    termo: 'Disposição transitória',
    categoria: 'Estrutura',
    definicao:
      'Regra temporária inserida na parte final do ato para disciplinar a passagem do regime jurídico anterior para o novo, preservando prazos e situações em curso.',
    exemploUso:
      'Art. 12. Os requerimentos protocolados antes da vigência deste Decreto serão analisados segundo as regras anteriores.',
  },
];

export interface ImpactoCategoria {
  id: 'legal' | 'economico' | 'social' | 'ambiental';
  titulo: string;
  subtitulo: string;
  itens: Array<{ id: string; pergunta: string; orientacao: string }>;
}

export const ANALISE_IMPACTO_CATEGORIAS: ImpactoCategoria[] = [
  {
    id: 'legal',
    titulo: 'Aspectos Legais e Institucionais',
    subtitulo: 'Competência, reserva legal, coerência normativa e capacidade de fiscalização',
    itens: [
      {
        id: 'leg-1',
        pergunta: 'Há base legal prévia autorizando o decreto ou norma?',
        orientacao:
          'Decretos regulamentares não podem criar tributos, sanções inéditas nem restringir direitos sem previsão em lei anterior.',
      },
      {
        id: 'leg-2',
        pergunta: 'A competência pertence de fato à autoridade signatária?',
        orientacao:
          'Verifique a Constituição, Lei Orgânica ou regimento interno para confirmar se o tema é de Decreto, Resolução ou Portaria.',
      },
      {
        id: 'leg-3',
        pergunta: 'Foram mapeadas todas as normas anteriores conflitantes ou sobrepostas?',
        orientacao:
          'Liste expressamente os atos ou artigos que serão revogados para evitar antinomias e insegurança jurídica.',
      },
      {
        id: 'leg-4',
        pergunta: 'O órgão possui estrutura e competência para fiscalizar o cumprimento?',
        orientacao:
          'Evite criar obrigações sem definir claramente a unidade responsável pelo controle e pela aplicação de sanções.',
      },
    ],
  },
  {
    id: 'economico',
    titulo: 'Aspectos Econômicos e Orçamentários',
    subtitulo: 'Custos de conformidade, impacto fiscal (LRF) e efeitos sobre o setor produtivo',
    itens: [
      {
        id: 'eco-1',
        pergunta: 'A norma gera despesa pública nova ou renúncia de receita?',
        orientacao:
          'Se houver impacto orçamentário, anexe estimativa de impacto financeiro e declaração de adequação à LDO/LOA (arts. 15 e 16 da LRF).',
      },
      {
        id: 'eco-2',
        pergunta: 'Qual é o custo regulatório para cidadãos, empresas e fornecedores?',
        orientacao:
          'Avalie taxas, prazos, exigências documentais e adequação de sistemas para evitar ônus desproporcional às micro e pequenas empresas.',
      },
      {
        id: 'eco-3',
        pergunta: 'O prazo de vacatio legis é suficiente para adaptação financeira e de TI?',
        orientacao:
          'Estabeleça prazos de transição escalonados (30, 60 ou 180 dias) quando houver necessidade de investimento ou alteração de rotinas.',
      },
    ],
  },
  {
    id: 'social',
    titulo: 'Aspectos Sociais e Operacionais',
    subtitulo: 'Equidade, acessibilidade do serviço público, LGPD e impacto sobre grupos vulneráveis',
    itens: [
      {
        id: 'soc-1',
        pergunta: 'Quem são os grupos diretamente beneficiados ou afetados pela medida?',
        orientacao:
          'Identifique impactos desiguais sobre população de baixa renda, idosos, pessoas com deficiência ou regiões periféricas.',
      },
      {
        id: 'soc-2',
        pergunta: 'A norma garante atendimento acessível (digital e presencial) sem exclusão?',
        orientacao:
          'Preveja canais alternativos quando exigir protocolos exclusivamente eletrônicos ou certificados digitais.',
      },
      {
        id: 'soc-3',
        pergunta: 'Há tratamento de dados pessoais e conformidade com a LGPD?',
        orientacao:
          'Especifique finalidade, base legal, compartilhamento mínimo necessário e medidas de segurança da informação.',
      },
    ],
  },
  {
    id: 'ambiental',
    titulo: 'Aspectos Ambientais e de Sustentabilidade',
    subtitulo: 'Uso de recursos naturais, desmaterialização, resíduos e licenciamento',
    itens: [
      {
        id: 'amb-1',
        pergunta: 'O ato incentiva ou exige procedimentos digitais em substituição ao papel?',
        orientacao:
          'Priorize processos eletrônicos, assinaturas digitais e publicações oficiais em meio eletrônico.',
      },
      {
        id: 'amb-2',
        pergunta: 'A norma afeta uso do solo, recursos hídricos, fauna ou geração de resíduos?',
        orientacao:
          'Em temas sanitários, agropecuários ou urbanos, alinhe exigências com órgãos ambientais e normas de descarte e logística reversa.',
      },
      {
        id: 'amb-3',
        pergunta: 'Foram considerados critérios de compras públicas e eficiência sustentáveis?',
        orientacao:
          'Quando envolver contratações ou infraestrutura, incorpore padrões de eficiência energética e menor impacto ambiental.',
      },
    ],
  },
];

