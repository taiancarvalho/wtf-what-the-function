import type { AgentId, FeatureState } from '@/types/protocol'

export const STATE_ORDER: FeatureState[] = [
  'planned',
  'building',
  'implemented',
  'tested',
  'validated',
]

/**
 * A geometria da marca de estado, em unidades de um viewBox 24×24 centrado em
 * (12,12) — a mesma forma serve o selo de 12px e o cabeçalho de 22px. As
 * camadas são desenhadas na ordem do array (a primeira fica embaixo).
 *
 * Três regras que quebram a marca se forem ignoradas:
 *
 * 1. Nenhum traço abaixo de 1,5 unidades. Mais fino que isso, o antialiasing
 *    come a cor e o estado vira cinza.
 * 2. A tinta cresce com a prova, nunca ao contrário — e o teto pertence a
 *    `validated`. Nada na tela pode pesar mais que "você aprovou".
 * 3. Cada estado ACRESCENTA material ao anterior, para os cinco continuarem
 *    ordenáveis em preto e branco. A cor confirma; ela não carrega.
 */
export type MarkShape =
  /** Anel: círculo só de traço. `r` é a linha do meio, `w` a espessura. */
  | { kind: 'ring'; r: number; w: number }
  /** Disco cheio de raio `r`. */
  | { kind: 'disc'; r: number }
  /** Meio disco (metade direita) de raio `r` — o miolo "pela metade". */
  | { kind: 'half'; r: number }

/** Corpo até r=8; órbita entre r≈9,3 e r≈11,9, dentro do slot. */
const R_CORPO = 8
const R_ORBITA = 10.6

/**
 * Duas camadas que se encostam no mesmo raio deixam uma costura visível: onde
 * devem ser lidas como massa só, a de dentro invade a de fora por esta folga.
 * Separação intencional usa folga de fundo, de 1,3 a 1,7 unidades.
 */
const COSTURA = 0.4

/**
 * Só o que é universal: texto que muda de idioma vive no dicionário
 * (`estado.<state>` e `estado.<state>.sentido`), nunca aqui.
 */
interface StateMeta {
  /** A marca desenhada, renderizada por `<StateMark>`. */
  shape: readonly MarkShape[]
  /** Fallback de texto puro — resumo copiado e linha de busca, onde não há geometria. */
  mark: string
  /** @deprecated Use `t('estado.<state>')`. */
  label: string
  /** @deprecated Use `t('estado.<state>.sentido')`. */
  meaning: string
  color: string
}

export const STATE: Record<FeatureState, StateMeta> = {
  planned: {
    // Anel vazio: já tem borda, ainda não tem conteúdo. A marca mais leve.
    shape: [{ kind: 'ring', r: R_CORPO - 1.5, w: 3 }],
    mark: '○',
    label: 'Planejado',
    meaning: 'Está no seu plano. Ninguém começou ainda.',
    color: 'var(--color-planned)',
  },
  building: {
    // Anel do plano + metade do miolo: começou, não terminou. A metade invade
    // o anel por COSTURA para as duas camadas virarem uma massa só.
    shape: [
      { kind: 'ring', r: R_CORPO - 1.5, w: 3 },
      { kind: 'half', r: R_CORPO - 3 + COSTURA },
    ],
    mark: '◐',
    label: 'Construindo',
    meaning: 'A IA avisou que começou. Ainda não terminou.',
    color: 'var(--color-building)',
  },
  implemented: {
    // Disco cheio, e para aqui: sem órbita. "Pronto" é matéria completa, mas
    // só matéria — fica no meio da escala, abaixo dos dois estados de prova.
    shape: [{ kind: 'disc', r: R_CORPO }],
    mark: '●',
    label: 'Pronto',
    meaning: 'A IA terminou e o código existe. Não quer dizer que funciona.',
    color: 'var(--color-implemented)',
  },
  tested: {
    // Disco + órbita: algo em volta do código além dele mesmo. O maior salto
    // de tinta da escala — mas a órbita diz que existe teste ESCRITO, não que
    // ele passou: o WTF ainda não executa teste nenhum.
    shape: [
      { kind: 'ring', r: R_ORBITA, w: 1.8 },
      { kind: 'disc', r: R_CORPO },
    ],
    mark: '✓',
    label: 'Tem teste escrito',
    meaning: 'Existe um teste escrito para esta parte. O WTF não executou esse teste — ele só viu que ele existe.',
    color: 'var(--color-tested)',
  },
  validated: {
    // Disco + órbita + núcleo separado por uma folga de fundo: alguém olhou
    // por dentro. A folga é o que faz isto sobreviver em preto e branco — sem
    // ela, a diferença contra `tested` seria só de cor. O teto da escala.
    shape: [
      { kind: 'ring', r: R_ORBITA, w: 2.6 },
      { kind: 'ring', r: 6.3, w: 3.4 },
      { kind: 'disc', r: 3.2 },
    ],
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
  opencode: 'opencode',
  antigravity: 'Antigravity',
  desconhecido: 'Agente desconhecido',
}

/** 0..1 — quanto da jornada essa feature já percorreu. */
export function stateProgress(state: FeatureState): number {
  return STATE_ORDER.indexOf(state) / (STATE_ORDER.length - 1)
}
