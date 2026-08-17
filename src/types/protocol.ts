/**
 * WTF — Core Data Model & Event Protocol (v0.1, rascunho)
 *
 * Regra que atravessa tudo: o agente de IA NÃO escreve o estado do projeto.
 * Ele emite *claims* (declarações) através da skill instalada. O WTF guarda
 * cada claim como evento imutável e só promove uma feature de estado quando
 * encontra *evidência* correspondente.
 *
 *      claim do agente  →  evidência  →  estado
 *
 * Este arquivo é a fronteira entre a UI e o futuro motor. Enquanto o motor não
 * existe, `src/mock` produz exatamente estas mesmas estruturas.
 */

// ---------------------------------------------------------------- identidade

export type AgentId =
  | 'claude-code'
  | 'codex'
  | 'gemini-cli'
  | 'opencode'
  | 'antigravity'
  | 'desconhecido'

export type EventSource = 'agent' | 'git' | 'wtf' | 'user'

// ------------------------------------------------------------------- feature

/** Os cinco estados. A distância entre `implemented` e `validated` é o produto. */
export type FeatureState =
  | 'planned' //      ○   está no plano, ninguém tocou
  | 'building' //     ◐   agente declarou que começou
  | 'implemented' //  ●   agente terminou e há evidência no código
  | 'tested' //       ✓   algo verificou (teste, build, browser)
  | 'validated' //   ✓✓   você olhou e disse "é isso"

/** De onde veio a feature: do plano, ou o WTF a descobriu no código. */
export type FeatureOrigin = 'planned' | 'discovered' | 'manual'

export interface Feature {
  id: string
  /** Área do produto em linguagem humana: "Contas", "Loja", "Pagamentos". */
  area: string
  /** Nome humano. Nunca `AuthService`. */
  name: string
  state: FeatureState
  origin: FeatureOrigin
  /** Uma linha explicando o que essa parte faz, para quem não programa. */
  summary: string
  /** Outras features que dependem desta ou das quais ela depende. */
  relatedIds: string[]
  /** Arquivos que o WTF associou a esta feature. Fica escondido por padrão. */
  files: string[]
  lastTouchedAt: string
  attention?: AttentionLevel
  /**
   * Trabalho em curso declarado pela IA (claim.started sem claim.completed).
   * Eixo separado de `state`: `state` é o que foi provado, `working` é o que
   * está acontecendo agora. Ausentes quando não há claim aberto.
   */
  working?: boolean
  /** Momento do `claim.started` que continua aberto. */
  workingSince?: string
  /** Texto do claim aberto, nas palavras da IA. */
  workingClaim?: string
  /** Há arquivos desta feature no disco que ainda não foram salvos no histórico. */
  unsaved?: boolean
  /** Quantos arquivos dela estão sem commit (novos ou modificados). */
  unsavedCount?: number
  /** Esta parte mudou depois que você aprovou — a aprovação anterior caducou. */
  revalidar?: boolean
  /** Quando você tinha aprovado esta parte, antes de ela mudar. */
  validadoEm?: string
}

// ----------------------------------------------------------------- atenção

export type AttentionLevel = 'none' | 'notice' | 'warning' | 'critical'

export type RiskCategory =
  | 'security'
  | 'privacy'
  | 'data'
  | 'reliability'
  | 'cost'
  | 'compliance'

export interface Risk {
  id: string
  category: RiskCategory
  level: AttentionLevel
  /** Frase para leigo. "Senhas estão sendo guardadas sem proteção." */
  headline: string
  detail: string
  featureId: string
}

// ------------------------------------------------------------- human diff

/**
 * Os quatro níveis de profundidade. A UI revela um por vez.
 * resumo → detalhes → técnico → código
 */
export interface HumanDiff {
  /** Nível 1 — uma frase. É o que aparece no feed. */
  headline: string
  /** Nível 2 — o que mudou, por que, e o que pode quebrar. */
  what: string
  why: string
  impact: string
  affects: string[]
  needsYourAttention: boolean
  attentionReason?: string
}

export interface TechnicalDiff {
  /** Nível 3 — números e nomes, ainda legível. */
  filesChanged: number
  insertions: number
  deletions: number
  files: string[]
  dependenciesAdded: string[]
  dependenciesRemoved: string[]
  /** Nível 4 — o diff cru. */
  patch?: string
}

// -------------------------------------------------------------- evidência

export type EvidenceKind =
  | 'agent_claim' //     o agente disse
  | 'file_created'
  | 'file_modified'
  | 'route_registered'
  | 'test_passed'
  | 'test_failed'
  | 'build_passed'
  | 'dependency_added'
  | 'user_validated'

export interface Evidence {
  id: string
  kind: EvidenceKind
  /** Quão forte esse sinal é para promover a feature de estado. 0..1 */
  confidence: number
  detail: string
  at: string
}

// ------------------------------------------------------------------ evento

export type EventType =
  | 'work.started'
  | 'work.progress'
  | 'work.completed'
  | 'evidence.found'
  | 'risk.raised'
  | 'risk.cleared'
  | 'docs.reorganized'
  | 'user.validated'

/** Append-only. Nunca editado, nunca apagado. */
export interface WtfEvent {
  id: string
  at: string
  type: EventType
  source: EventSource
  agent?: AgentId
  featureId: string
  /** O que o agente declarou, com as próprias palavras. Guardado como dito. */
  claim?: string
  human?: HumanDiff
  technical?: TechnicalDiff
  evidence: Evidence[]
  risk?: Risk
  /**
   * Este aviso já foi respondido pela IA: ela citou o código curto dele
   * (ver `codigoCurto`) numa declaração posterior. Fecha o ciclo — o aviso
   * para de pedir atenção.
   */
  respondidoPor?: {
    /** Id do evento (claim) que respondeu. */
    eventId: string
    /** Quando a resposta foi declarada. */
    at: string
    /** O que a IA disse, cortado em ~400 caracteres. */
    texto: string
  }
  /** Código curto do aviso que ESTE evento responde. Ex.: "XVFT". */
  respondeA?: string
  /** A pessoa marcou este aviso como resolvido à mão (`.wtf/resolved.json`). */
  resolvido?: { at: string; por: string }
}

/**
 * Um aviso só continua cobrando atenção se ninguém fechou o ciclo: nem a IA
 * respondendo pelo código, nem a pessoa marcando como resolvido.
 *
 * Mesma conta usada na contagem do topo e no selo do cartão — alerta que nunca
 * some ensina a ignorar alerta.
 */
export function pedeAtencao(e: WtfEvent): boolean {
  return !!e.human?.needsYourAttention && !e.respondidoPor && !e.resolvido
}

// ----------------------------------------------------------------- projeto

export interface Project {
  id: string
  name: string
  path: string
  /** O que esse software é, em uma frase, para o dono dele. */
  pitch: string
  connectedAgents: AgentId[]
  /** Se o agente está trabalhando neste exato momento. */
  live: boolean
  createdAt: string
}

/** A instalação global, em `~/.claude` — vale para todos os projetos. */
export interface EstadoGlobal {
  /** Quais das skills do WTF estão em `~/.claude/skills`. */
  skills: {
    skill: boolean
    mapear: boolean
    pastas: boolean
    documentos: boolean
    guardrails: boolean
    btw: boolean
  }
  hook: boolean
  /** Se `~/.claude/settings.json` já chama o hook do WTF. */
  hooksRegistrados: boolean
  instalado: boolean
  /** Caminho real do `.claude` do usuário. */
  caminho: string
}

/**
 * Se ESTE projeto foi habilitado. A pasta `.wtf/` é o consentimento: sem ela o
 * hook global roda e sai em silêncio, sem gravar nada aqui.
 */
export interface EstadoProjetoWtf {
  habilitado: boolean
  cli: boolean
  formato: boolean
  pasta: boolean
}

/**
 * Se o WTF está instalado e habilitado. Os campos de arquivo (`skill`, `hook`…)
 * valem `true` quando a peça está disponível — instalada no projeto (modo
 * antigo) ou em `~/.claude` (modo global). `instalado` significa "o WTF
 * funciona neste projeto": tudo disponível E o projeto habilitado.
 */
export interface EstadoInstalacao {
  skill: boolean
  hook: boolean
  cli: boolean
  mapear: boolean
  /** A skill que escreve e mantém o `MAPA.md` das pastas. */
  pastas: boolean
  /** A skill que escreve e mantém o mapa dos documentos em `.wtf/docs.json`. */
  documentos: boolean
  /** A skill que escreve o `GUARDRAILS.md` — o que não se faz neste projeto. */
  guardrails: boolean
  /** O comando `/btw`: pergunta respondida sem derrubar o trabalho em curso. */
  btw: boolean
  formato: boolean
  hooksRegistrados: boolean
  instalado: boolean
  /**
   * Ligado aqui, mas faltando alguma peça — quase sempre uma skill que passou
   * a existir depois. Não é "desligado": é "há novidade para aplicar".
   */
  desatualizado: boolean
  /** Se o onboarding já produziu `.wtf/map.json`. */
  mapeado: boolean
  /** Nível A — a instalação global. */
  global?: EstadoGlobal
  /** Nível B — se este projeto foi habilitado. */
  projeto?: EstadoProjetoWtf
}

/**
 * Preferências do projeto, em `.wtf/config.json`.
 *
 * `idiomaInterface` são os textos do app e só tem três valores possíveis.
 * `idiomaConteudo` é a língua em que a IA escreve — pode ser qualquer uma,
 * inclusive uma que a interface não tenha. `nomeIdiomaConteudo` é o nome por
 * extenso dessa língua, e é ele que entra nos prompts e na skill.
 */
export type IdiomaInterface = 'pt-BR' | 'en' | 'es'

export interface ConfigProjeto {
  v: 1
  idiomaInterface: IdiomaInterface
  idiomaConteudo: string
  nomeIdiomaConteudo: string
  /**
   * Modelo usado no "Explique isso" (ex.: `google/gemini-2.0-flash-001`).
   * Opcional: ausente vale o padrão barato definido em `electron/ask.js`.
   */
  modeloPergunta?: string
  /**
   * Tradução automática: pode o WTF chamar o agente instalado para reescrever
   * as mudanças em linguagem humana?
   *
   * `'perguntar'` (padrão) espera a pessoa autorizar. `'nao'` nunca chama — e
   * o painel segue completo com o texto heurístico: estados, avisos, mapa e
   * progresso não dependem de tradução nenhuma.
   */
  traduzirAuto?: TraduzirAuto
  /** Teto de eventos traduzidos por rodada. Padrão conservador: 8. */
  maxTraducoesPorRodada?: number
  /** A pessoa já leu o aviso de que perguntar consome créditos da chave dela. */
  avisoCustoAceito?: boolean
  /**
   * Avisos do sistema operacional quando algo precisa da decisão dela.
   * Padrão `'nao'`: ninguém recebe notificação sem ligar (ver electron/notify.js).
   */
  notificar?: Notificar
  /** Sem avisos entre 22h e 7h. Padrão: ligado. */
  silencioNoturno?: boolean
}

export type TraduzirAuto = 'perguntar' | 'sim' | 'nao'

/** Ligado ou desligado — não existe "perguntar" aqui: a permissão é do sistema. */
export type Notificar = 'sim' | 'nao'

/** A resposta ao pedido de tradução: uma vez, sempre ou nunca. */
export type RespostaTraducao = 'agora' | 'sempre' | 'nunca'

/** Quantos eventos estão sem tradução porque ninguém autorizou o gasto. */
export interface TraducaoPendente {
  pendentes: number
  maxPorRodada: number
}

/**
 * Consumo de recurso da pessoa, contado dentro do projeto (`.wtf/usage.json`).
 *
 * `traducoes.cache` é o número que prova a economia: quantas vezes o app
 * reaproveitou uma tradução já feita em vez de gastar de novo.
 */
export interface UsoProjeto {
  v: 1
  traducoes: { chamadas: number; eventos: number; cache: number }
  perguntas: { chamadas: number; porProvedor: Record<string, number> }
  /** ISO do primeiro gasto contado. `null` enquanto nada foi consumido. */
  desde: string | null
}

// ------------------------------------------------------- perguntar sobre algo

/** Provedores de modelo. Hoje só `openrouter` responde de verdade. */
export type ProvedorChave = 'openrouter' | 'anthropic' | 'openai'

/**
 * O que o renderer sabe sobre uma chave: que ela existe, como ela começa e
 * termina, e se está guardada em disco ou só nesta sessão. A chave inteira
 * NUNCA chega aqui — ver `electron/keys.js`.
 */
export interface ChaveMascarada {
  tem: boolean
  /** `sk-or-…4f2a`. Suficiente para reconhecer, inútil para usar. */
  mascara: string
  /** `false` quando o sistema não ofereceu cofre: vale só até fechar o app. */
  guardada: boolean
  at?: string
}

export interface EstadoChaves {
  chaves: Partial<Record<ProvedorChave, ChaveMascarada>>
  /** O cofre do sistema está disponível? Sem ele, não gravamos nada. */
  podeGuardar: boolean
  /** Caminho do arquivo cifrado, para a interface poder mostrar onde é. */
  onde?: string
  erro?: string
}

/** O que o painel sabe da mudança e manda junto com a pergunta. */
export interface ContextoPergunta {
  headline?: string
  what?: string
  why?: string
  impact?: string
  attentionReason?: string
  claim?: string
  feature?: string
  files?: string[]
  patch?: string
}

/** Um pedaço da resposta chegando (ou o fim, ou o erro). */
/**
 * Uma sessão do terminal embutido. O `id` é a única coisa que a tela guarda:
 * o processo em si vive no main (ver electron/terminal-embutido.js).
 */
export interface SessaoTerminal {
  id?: string
  /** Nome do agente que já começou rodando, quando havia um instalado. */
  agente?: string | null
  shell?: string
  erro?: string
  /** `true` quando a recusa foi por já haver terminais demais abertos. */
  limite?: boolean
}

/** Um pedaço de saída do terminal embutido, como veio do shell. */
export interface SaidaTerminal {
  id: string
  dados: string
}

/** O shell terminou. `codigo` é o código de saída do processo. */
export interface FimTerminal {
  id: string
  codigo: number
}

export interface PedacoResposta {
  id: string
  pedaco?: string
  fim?: boolean
  incompleta?: boolean
  erro?: string
}

/**
 * Uma linha da árvore do `MAPA.md`, já separada em partes para a interface
 * poder desenhar a árvore de verdade em vez de despejar um `<pre>`.
 *
 * `prefixo` guarda os caracteres do desenho (`├──`, `│`, `└──`) exatamente
 * como estavam no arquivo — é o que mantém o alinhamento visual.
 */
export interface LinhaMapaPastas {
  tipo: 'raiz' | 'secao' | 'pasta' | 'vazia'
  prefixo: string
  nome: string
  proposito: string
  /** Caminho citado por “detalhe em …”: a interface vira isso em link. */
  detalheEm?: string
}

/** O `MAPA.md` da raiz: para que serve cada pasta do projeto. */
export interface MapaPastas {
  /** O texto cru da árvore, preservado — a arte ASCII é o valor. */
  arvore: string
  linhas: LinhaMapaPastas[]
  /** Data da última modificação do arquivo, em ISO. */
  atualizadoEm?: string
  existe: true
}

// ------------------------------------------------------------- documentos

/**
 * Um grupo de documentos que parecem falar do mesmo assunto.
 *
 * `nome`   o MESMO nome base em pastas diferentes (os 26 `README.md`).
 * `versao` o mesmo nome com sufixo colado: `plano`, `plano-v2`, `plano-final`.
 */
export interface FamiliaDocs {
  /** O nome base mais curto do grupo — o candidato a "original". */
  base: string
  /** A chave de agrupamento: o nome sem acento e sem sufixo de versão. */
  raiz: string
  tipo: 'nome' | 'versao'
  arquivos: {
    caminho: string
    /** Data ISO do último commit que tocou o arquivo. `null` = sem data. */
    ultimoCommitEm: string | null
  }[]
}

/** A varredura determinística: fatos sobre os documentos, sem opinião de IA. */
export interface VarreduraDocs {
  /** Todos os documentos rastreados pelo Git (`.md`, `.mdx`, `.txt`). */
  total: number
  naRaiz: number
  emDocs: number
  /** Contagem por pasta de primeiro nível, da maior para a menor. */
  porPasta: { pasta: string; total: number }[]
  familias: FamiliaDocs[]
  /** HEURÍSTICA: pastas com cara de material instalado de terceiros. */
  provavelmenteDeFerramenta: { pasta: string; arquivos: number; motivo: string }[]
  /** Quantos arquivos de família ficaram sem data de commit. */
  semData: number
}

/** Um assunto do mapa: qual documento vale hoje, e por quê. */
export interface AssuntoDocs {
  assunto: string
  resumo: string
  /** Caminho do documento vigente. Ausente quando a IA não soube dizer. */
  vigente?: string
  confianca: 'alta' | 'media' | 'baixa'
  /** A justificativa — é ela que permite ao dono do projeto discordar. */
  porque: string
  outros: { caminho: string; situacao: string; porque: string }[]
}

/** `.wtf/docs.json`: o julgamento da skill `wtf-documentos`. */
export interface MapaDocs {
  v: 1
  geradoEm?: string
  totalEncontrados: number
  /** Quantos a IA realmente abriu — número honesto vale mais que cobertura fingida. */
  totalLidos: number
  ignorados: { pasta: string; motivo: string; arquivos?: number }[]
  assuntos: AssuntoDocs[]
  orfaos: { caminho: string; porque: string }[]
}

/** O que o painel recebe: fato e opinião lado a lado, sempre distinguíveis. */
export interface DocumentosProjeto {
  varredura: VarreduraDocs
  /** `null` enquanto ninguém rodou a skill — a varredura sozinha já vale a tela. */
  mapa: MapaDocs | null
  temMapa: boolean
  geradoEm?: string
  /** Pista (não veredito) de que nasceram muitos documentos depois do mapa. */
  desatualizado: boolean
}

// -------------------------------------------------------------- histórico

/**
 * Como o projeto estava num ponto do passado.
 *
 * Reconstruído do Git (não de snapshots gravados), então existe desde o
 * primeiro minuto de uso — inclusive em projeto anterior à instalação do WTF.
 */
export interface MarcoHistorico {
  /** O dia do marco, `YYYY-MM-DD` no fuso local. */
  em: string
  /** Commit que era o HEAD naquele instante. É a chave do cache. */
  commit: string
  /** Arquivos rastreados naquele momento. */
  arquivos: number
  partes: number
  /** Partes que já tinham código (estado 'implemented' ou 'tested'). */
  comCodigo: number
  testadas: number
  /** Com mapa do projeto, ou pela classificação heurística. */
  fonte: 'mapa' | 'heuristica'
}

export interface Historico {
  /**
   * ADAPTATIVA: por dia em projeto jovem ou curto, por semana em projeto
   * longo. Projeto de dois dias com granularidade semanal seria uma barra só.
   */
  granularidade: 'dia' | 'semana'
  /** No máximo 14, sempre os mais recentes. */
  marcos: MarcoHistorico[]
  /** Quando o cache foi calculado. `null` enquanto nunca foi. */
  geradoEm: string | null
  /** Ainda não há cache: os marcos chegam por `wtf:mudou` em instantes. */
  frio: boolean
  /** O cache é de outro dia ou de outro mapa; um recálculo está a caminho. */
  desatualizado: boolean
}

/** Uma parte que trocou de estado enquanto a pessoa não estava olhando. */
export interface ParteQueMudou {
  id: string
  nome: string
  de: FeatureState
  para: FeatureState
}

/** O resumo do intervalo entre a visita anterior e esta. */
export interface DesdeUltimaVisita {
  /** Primeira visita: não há contra o que comparar, e não se inventa. */
  primeira: boolean
  /** Início do intervalo (a visita anterior), em ISO. */
  desdeEm: string | null
  commits: number
  /** Arquivos distintos tocados no intervalo. */
  arquivos: number
  partesQueMudaram: ParteQueMudou[]
  avisosNovos: number
  /** Dos avisos novos, quantos continuam esperando uma decisão da pessoa. */
  pedemDecisao: number
}

/**
 * Uma chave ou senha encontrada em arquivo que AINDA NÃO está no histórico.
 *
 * `trecho` nunca contém o segredo inteiro: no máximo 4 caracteres do começo e
 * 2 do fim, o resto mascarado. Mostrar a chave na tela seria um segundo
 * vazamento — screenshot, gravação, print de suporte.
 */
/** A IA analisou este achado e acha que não é problema. Só ela achar não basta. */
export interface PropostaFalsoPositivo {
  motivo: string
  at?: string | null
  por?: string
  /**
   * `'real'` = a IA conferiu e CONFIRMOU o problema. Esse não tem botão para
   * tirar da lista: o que sai dele é o conserto, não o clique.
   */
  veredito?: 'falso-positivo' | 'real'
}

export interface AchadoSegredo {
  /** Caminho relativo à raiz do projeto. */
  arquivo: string
  /** Linha (base 1). */
  linha: number
  /** Família do padrão: 'aws', 'anthropic', 'generico', 'url-com-senha'… */
  tipo: string
  /** Rótulo humano, sem jargão. */
  rotulo: string
  /** O valor MASCARADO. Nunca o segredo. */
  trecho: string
  /** A IA propôs marcar como falso alarme, com o motivo. */
  proposta?: PropostaFalsoPositivo
  /**
   * 'alta' = formato conhecido de provedor (AKIA…, sk-ant-…, chave privada).
   * 'media' = padrão genérico (`senha=algo`), que erra mais.
   */
  confianca: 'alta' | 'media'
}

/** Resultado da varredura do caça-segredos. */
export interface Segredos {
  achados: AchadoSegredo[]
  /** Os que a pessoa marcou como falso alarme. Ficam à vista, fora da conta. */
  dispensados?: (AchadoSegredo & { dispensadoEm: string; nota?: string })[]
  /** Arquivos efetivamente lidos. */
  varridos: number
  /** Pulados: binários, grandes demais, gerados, ilegíveis. */
  ignorados: number
  /** Bateu no teto de arquivos ou de bytes; a varredura parou antes do fim. */
  truncado: boolean
}

/**
 * Um dado de PESSOA encontrado dentro do código que vai para o navegador.
 *
 * Diferente de `AchadoSegredo` em duas coisas: o escopo (aqui entra também o
 * que já está commitado — no front, o histórico não protege ninguém) e a
 * natureza (aqui é e-mail, CPF, cartão, telefone, endereço, login+senha, não
 * chave de provedor). `trecho` é sempre MASCARADO.
 */
export interface AchadoExposto {
  /** Caminho relativo à raiz do projeto. */
  arquivo: string
  /** Linha (base 1). */
  linha: number
  /** 'email' | 'email-sensivel' | 'cpf' | 'cnpj' | 'cartao' | 'telefone' | 'endereco' | 'credencial' */
  tipo: string
  /** Rótulo humano, sem jargão. */
  rotulo: string
  /** O valor MASCARADO. Nunca o dado inteiro. */
  trecho: string
  /** A IA propôs marcar como falso alarme, com o motivo. */
  proposta?: PropostaFalsoPositivo
  /**
   * 'alta' = formato inequívoco e validado (CPF formatado, cartão no Luhn).
   * 'media'/'baixa' = casos com dúvida, ou arquivo que parece rodar no servidor.
   */
  confianca: 'alta' | 'media' | 'baixa'
  /** Uma frase explicando o risco para quem não programa. */
  porque: string
}

/** Resultado da varredura do caça-expostos. */
export interface Expostos {
  achados: AchadoExposto[]
  /** Os que a pessoa marcou como falso alarme. Ficam à vista, fora da conta. */
  dispensados?: (AchadoExposto & { dispensadoEm: string; nota?: string })[]
  /** Arquivos de frente efetivamente lidos. */
  varridos: number
  /** Pulados: testes, mocks, gerados, de servidor, fora do front. */
  ignorados: number
  /** Bateu no teto de arquivos ou de bytes; a varredura parou antes do fim. */
  truncado: boolean
}

export interface ProjectSnapshot {
  project: Project
  features: Feature[]
  events: WtfEvent[]
  instalacao?: EstadoInstalacao
  config?: ConfigProjeto
  /** Consumo acumulado. Ausente fora do aplicativo. */
  uso?: UsoProjeto
  /** Ausente quando o projeto ainda não tem `MAPA.md`. */
  pastas?: MapaPastas
  /** Ausente fora do aplicativo. A varredura existe mesmo sem `.wtf/docs.json`. */
  documentos?: DocumentosProjeto
  /** Como o projeto chegou até aqui. Vem do cache; recalcula em segundo plano. */
  historico?: Historico
  /** O que aconteceu desde a última vez que a pessoa olhou. */
  desdeUltimaVisita?: DesdeUltimaVisita
  /**
   * Chaves e senhas prestes a entrar no histórico. Só arquivos não commitados:
   * é a única janela em que o aviso ainda muda o desfecho.
   */
  segredos?: Segredos
  /**
   * Dado de pessoa escrito no código que vai para o navegador — commitado ou
   * não. Aqui não há janela de prevenção: se está no front, já está visível
   * para quem abrir o inspecionar.
   */
  expostos?: Expostos
}

// ------------------------------------------- o que a instalação vai escrever

/** Um arquivo que a instalação do WTF criaria dentro do projeto. */
export interface ItemInstalacao {
  /** Caminho relativo à raiz do projeto. */
  destino: string
  /** Arquivo de origem, dentro da pasta `skill/` do aplicativo. */
  origem: string
  /** Rótulo humano — o que este arquivo faz, sem jargão. */
  titulo: string
  /** Uma frase: por que este arquivo existe. */
  proposito: string
  /** O texto integral que seria escrito, já com o idioma escolhido aplicado. */
  conteudo: string
  bytes: number
  /** Já está instalado no projeto? */
  jaExiste: boolean
  /** Se existe, o que está lá é idêntico ao que seria escrito? */
  igual: boolean
  /** Preenchido quando o arquivo de origem não pôde ser lido. */
  erro?: string
  /** Só nos itens globais: o caminho completo, fora do projeto. */
  destinoAbsoluto?: string
}

/** Um hook que seria registrado em `.claude/settings.local.json`. */
export interface HookDeclarado {
  evento: string
  /** `null` quando o hook vale para qualquer ferramenta. */
  matcher: string | null
  /** O comando exato, como aparece no arquivo. */
  comando: string
}

/** Tudo o que a instalação escreve — para ver antes de aceitar. */
export interface PacoteInstalacao {
  itens: ItemInstalacao[]
  hooks: HookDeclarado[]
  /** Linhas acrescentadas ao `.gitignore`. */
  gitignore: string[]
  /** Nível A: o que vai para `~/.claude`, uma vez por computador. */
  global?: PacoteGlobal
  /** Nível B: o que vai para dentro do projeto ao habilitá-lo. */
  projeto?: PacoteProjeto
}

/** O que a instalação global escreve em `~/.claude`. */
export interface PacoteGlobal {
  /** Caminho real do `.claude` do usuário nesta máquina. */
  caminho: string
  itens: ItemInstalacao[]
  hooks: HookDeclarado[]
  /** Caminho do `settings.json` que recebe o registro dos hooks. */
  settings: string
}

/** O que "habilitar neste projeto" escreve dentro do projeto. */
export interface PacoteProjeto {
  caminho: string | null
  itens: ItemInstalacao[]
  gitignore: string[]
}

// -------------------------------------------------- projetos já conhecidos

/**
 * O retrato barato de um projeto que NÃO está aberto.
 *
 * Tudo aqui vem de leitura local (git log curto, estado do disco e os JSON que
 * o próprio WTF escreveu). Calcular isto nunca chama modelo, nunca traduz e
 * nunca escreve em disco — ver a regra de custo zero em electron/projects.js.
 */
export interface ResumoProjeto {
  nome: string
  caminho: string
  /** Assuntos que ainda dependem de uma decisão da pessoa. */
  pendencias: number
  /** Arquivos alterados ou criados que ainda não entraram no histórico. */
  naoSalvos: number
  /** Houve declaração da IA nos últimos 30 minutos. */
  ativo: boolean
  ultimoEventoEm: string | null
  /** O projeto tem `.wtf/` — ou seja, autorizou o WTF a registrar ali. */
  habilitado: boolean
  idiomaInterface?: string
  /** Preenchido quando o resumo falhou (pasta sumida, repo quebrado, demora). */
  erro?: string
}

/** Um projeto na lista de atalhos, guardada fora de qualquer repositório. */
export interface ProjetoConhecido {
  caminho: string
  nome: string
  ultimaAberturaEm: string | null
  fixado?: boolean
  /** A pasta não está mais no disco. Continua na lista até a pessoa esquecê-la. */
  sumiu?: boolean
  resumo?: ResumoProjeto | null
}

/** A lista inteira, mais qual deles está aberto agora. */
export interface ListaProjetos {
  atual: string | null
  projetos: ProjetoConhecido[]
}
