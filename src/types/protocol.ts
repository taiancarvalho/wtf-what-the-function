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

export type AgentId = 'claude-code' | 'codex' | 'gemini-cli' | 'antigravity' | 'desconhecido'

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

/** Se a skill e o hook do WTF estão instalados no projeto observado. */
export interface EstadoInstalacao {
  skill: boolean
  hook: boolean
  cli: boolean
  mapear: boolean
  /** A skill que escreve e mantém o `MAPA.md` das pastas. */
  pastas: boolean
  formato: boolean
  hooksRegistrados: boolean
  instalado: boolean
  /** Se o onboarding já produziu `.wtf/map.json`. */
  mapeado: boolean
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

export interface ProjectSnapshot {
  project: Project
  features: Feature[]
  events: WtfEvent[]
  instalacao?: EstadoInstalacao
  config?: ConfigProjeto
  /** Ausente quando o projeto ainda não tem `MAPA.md`. */
  pastas?: MapaPastas
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
}
