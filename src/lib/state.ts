import type { AgentId, FeatureState } from '@/types/protocol'

export const STATE_ORDER: FeatureState[] = [
  'planned',
  'building',
  'implemented',
  'tested',
  'validated',
]

interface StateMeta {
  /** Símbolo usado no app inteiro. Nunca muda de tela para tela. */
  mark: string
  /** Nome que o usuário lê. Sem jargão. */
  label: string
  /** Uma frase explicando o que esse estado significa de verdade. */
  meaning: string
  color: string
}

export const STATE: Record<FeatureState, StateMeta> = {
  planned: {
    mark: '○',
    label: 'Planejado',
    meaning: 'Está no seu plano. Ninguém começou ainda.',
    color: 'var(--color-planned)',
  },
  building: {
    mark: '◐',
    label: 'Construindo',
    meaning: 'A IA avisou que começou. Ainda não terminou.',
    color: 'var(--color-building)',
  },
  implemented: {
    mark: '●',
    label: 'Pronto',
    meaning: 'A IA terminou e o código existe. Não quer dizer que funciona.',
    color: 'var(--color-implemented)',
  },
  tested: {
    mark: '✓',
    label: 'Testado',
    meaning: 'Alguma verificação automática passou. Ainda falta você conferir.',
    color: 'var(--color-tested)',
  },
  validated: {
    mark: '✓✓',
    label: 'Você aprovou',
    meaning: 'Você abriu, olhou e disse que era isso que queria.',
    color: 'var(--color-validated)',
  },
}

export const AGENT_LABEL: Record<AgentId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'gemini-cli': 'Gemini',
  antigravity: 'Antigravity',
  desconhecido: 'Agente desconhecido',
}

/** 0..1 — quanto da jornada essa feature já percorreu. */
export function stateProgress(state: FeatureState): number {
  return STATE_ORDER.indexOf(state) / (STATE_ORDER.length - 1)
}
