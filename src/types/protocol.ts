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
  formato: boolean
  hooksRegistrados: boolean
  instalado: boolean
  /** Se o onboarding já produziu `.wtf/map.json`. */
  mapeado: boolean
}

export interface ProjectSnapshot {
  project: Project
  features: Feature[]
  events: WtfEvent[]
  instalacao?: EstadoInstalacao
}
