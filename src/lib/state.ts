import type { AgentId, FeatureState } from '@/types/protocol'

export const STATE_ORDER: FeatureState[] = [
  'planned',
  'building',
  'implemented',
  'tested',
  'validated',
]

/**
 * ============================================================================
 * A GEOMETRIA DA MARCA DE ESTADO
 * ============================================================================
 *
 * A tese do WTF é a distância entre "a IA disse que fez" e "está provado que
 * funciona". Os cinco estados são essa distância. A marca precisa mostrá-la
 * ANTES de qualquer texto — e sem depender de cor.
 *
 * POR QUE ISTO DEIXOU DE SER UM GLIFO DE TEXTO
 *
 * A marca antiga era ○ ◐ ● ✓ ✓✓. Medido nas capturas reais:
 *
 *   ○  planejado     #bab2a7  contraste 1,88:1   40px de tinta
 *   ◐  construindo   #b59057  contraste 2,65:1   66px
 *   ●  pronto        #477173  contraste 4,85:1  100px
 *   ✓  testado       #878a78  contraste 3,17:1   24px
 *   ✓✓ você aprovou  #9d8a7d  contraste 2,95:1   47px
 *
 * Três defeitos, e cada um tem resposta na geometria abaixo:
 *
 * 1. `tested` e `validated` estavam a ΔE 9,7 um do outro — os dois viravam
 *    cinza morno. O verde e o terracota existem no CSS, mas o ✓ é traço de
 *    ~1px: nessa espessura a cor evapora no antialiasing. AQUI nenhum traço
 *    fica abaixo de 1,5 unidades do viewBox (0,75px no menor tamanho) e os
 *    dois estados finais carregam ~80px² e ~85px² de tinta — área suficiente
 *    para a cor sobreviver e o ΔE aparecer.
 *
 * 2. O peso de tinta estava INVERTIDO em relação ao significado: `implemented`
 *    ("não quer dizer que funciona") era o mais forte da tela com 100px, e os
 *    dois estados que significam confiança eram os mais fracos (24px e 47px).
 *    AQUI a tinta cresce monotonicamente com a prova:
 *
 *      planned  ~31px²  ·  building ~40px²  ·  implemented ~50px²
 *      tested   ~80px²  ·  validated ~85px²
 *
 *    O teto (~85-90px²) é de quem foi aprovado. Nada na tela pesa mais do que
 *    "você aprovou". O slot é constante (12px no selo pequeno): o que muda é
 *    ONDE a tinta está, e o quanto dela existe cresce só na direção da prova.
 *
 * 3. Distinguir ✓ de ✓✓ era CONTAR, não olhar. AQUI cada estado ACRESCENTA
 *    MATERIAL ao anterior — anel, meio miolo, miolo inteiro, órbita, núcleo.
 *    Em preto e branco os cinco continuam ordenáveis, porque a diferença é de
 *    massa e estrutura. A cor confirma; ela não carrega.
 *
 * COMO LER OS NÚMEROS
 *
 * Tudo em unidades de um viewBox 24×24 centrado em (12,12) — assim a mesma
 * forma serve o selo de 12px e o cabeçalho de coluna de 22px sem redesenho.
 * Para converter em px renderizados: unidade × (lado / 24).
 *
 * As camadas são desenhadas na ordem do array (a primeira fica embaixo).
 */
export type MarkShape =
  /** Anel: círculo só de traço. `r` é a linha do meio, `w` a espessura. */
  | { kind: 'ring'; r: number; w: number }
  /** Disco cheio de raio `r`. */
  | { kind: 'disc'; r: number }
  /** Meio disco (metade direita) de raio `r` — o miolo "pela metade". */
  | { kind: 'half'; r: number }

/**
 * O corpo da marca vai até r=8. A órbita externa vive entre r≈9,3 e r≈11,9 —
 * dentro do slot, com uma folga de fundo entre corpo e órbita larga o bastante
 * (1,3–1,7 unidades) para o olho separar as duas massas sem precisar de cor.
 */
const R_CORPO = 8
const R_ORBITA = 10.6

/**
 * Duas formas que se encostam EXATAMENTE no mesmo raio deixam uma costura
 * clara no antialiasing — o mesmo fenômeno que apagava a cor do ✓ de 1px.
 * Onde duas camadas devem ser lidas como uma massa só, a de dentro invade a de
 * fora por esta folga. Onde a separação é intencional (corpo × órbita,
 * núcleo × corpo) a folga é de fundo, larga, e vale 1,3 a 1,7 unidades.
 */
const COSTURA = 0.4

/**
 * Só o que é universal.
 *
 * `shape`, `mark` e `color` são iguais em qualquer idioma — são o alfabeto do
 * produto. O nome que a pessoa lê e a frase que explica o estado vivem no
 * dicionário (`estado.<state>` e `estado.<state>.sentido`), porque mudam de
 * língua.
 *
 * `label` e `meaning` continuam aqui só enquanto `src/views/ProductMap.tsx` e
 * `src/views/BuildMap.tsx` ainda os lerem. São resíduo: quem escrever texto
 * novo deve usar o dicionário.
 */
interface StateMeta {
  /**
   * A marca desenhada — o que a pessoa vê na tela. Renderizada por
   * `<StateMark>` em `src/components/StateMark.tsx`.
   */
  shape: readonly MarkShape[]
  /**
   * Fallback de TEXTO PURO — resumo copiado para a área de transferência
   * (`src/lib/resumo.ts`) e linha de busca (`src/components/Busca.tsx`), onde
   * não existe geometria possível. Na tela, use `shape` via `<StateMark>`.
   */
  mark: string
  /** @deprecated Use `t('estado.<state>')`. */
  label: string
  /** @deprecated Use `t('estado.<state>.sentido')`. */
  meaning: string
  color: string
}

export const STATE: Record<FeatureState, StateMeta> = {
  planned: {
    // Anel vazio. O contorno do que vai existir, sem nada dentro — o plano
    // já tem borda, mas ainda não tem conteúdo.
    // Traço de 3 unidades (1,5px a 12px) porque abaixo disso a cor evapora
    // no antialiasing: foi exatamente o que matou o ✓ antigo a 3,17:1.
    // Tinta: 2π·6,5·3 ≈ 123 u² ≈ 31px² — a marca mais leve das cinco.
    shape: [{ kind: 'ring', r: R_CORPO - 1.5, w: 3 }],
    mark: '○',
    label: 'Planejado',
    meaning: 'Está no seu plano. Ninguém começou ainda.',
    color: 'var(--color-planned)',
  },
  building: {
    // O mesmo anel do plano + metade do miolo. É o único estado que mostra
    // movimento parado no meio: começou, não terminou. Meio disco (e não um
    // ◐ tipográfico) porque a metade preenchida é lida como progresso, do
    // jeito que o Linear preenche o ícone de "In Progress".
    // A metade avança meio traço para dentro do anel (COSTURA) para os dois
    // virarem uma massa só; o que se vê termina na borda interna do anel.
    // Tinta visível: 123 + π·5²/2 ≈ 162 u² ≈ 40px².
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
    // Disco cheio: o miolo fechou. O código existe.
    // E PARA AQUI — sem órbita. É o ponto da tese: "pronto" é matéria
    // completa, mas ainda é só matéria. Antes ele era o mais forte da tela
    // (100px de tinta); agora é o MEIO da escala (~50px²), com os dois
    // estados de prova acima dele.
    // Tinta: π·8² ≈ 201 u² ≈ 50px².
    shape: [{ kind: 'disc', r: R_CORPO }],
    mark: '●',
    label: 'Pronto',
    meaning: 'A IA terminou e o código existe. Não quer dizer que funciona.',
    color: 'var(--color-implemented)',
  },
  tested: {
    // Disco cheio + órbita externa. A órbita é a máquina em volta do código:
    // algo que não é o próprio código atesta que ele funciona.
    // O salto de tinta aqui é o maior de todos (50px² → 80px²), de propósito:
    // é o degrau entre "existe" e "foi verificado".
    // Tinta: 201 + 2π·10,6·1,8 ≈ 321 u² ≈ 80px².
    shape: [
      { kind: 'ring', r: R_ORBITA, w: 1.8 },
      { kind: 'disc', r: R_CORPO },
    ],
    mark: '✓',
    label: 'Testado',
    meaning: 'Alguma verificação automática passou. Ainda falta você conferir.',
    color: 'var(--color-tested)',
  },
  validated: {
    // Disco + órbita (mais grossa) + NÚCLEO destacado por uma folga de fundo.
    // O núcleo é o material novo: alguém olhou por dentro. A folga de 1,4
    // unidades é o truque que faz isto sobreviver em preto e branco — sem
    // ela, "miolo na cor de aprovação" seria diferença SÓ de cor, e a cor era
    // justamente o que falhava (ΔE 9,7 contra `tested`).
    // Contra `tested`: mesma silhueta, três anéis concêntricos em vez de dois.
    // Não é contar ✓✓ — é ver que o miolo abriu.
    // Tinta: 2π·6,3·3,4 + π·3,2² + 2π·10,6·2,6 ≈ 340 u² ≈ 85px². O teto da
    // escala pertence a "você aprovou", e a nada mais.
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
  antigravity: 'Antigravity',
  desconhecido: 'Agente desconhecido',
}

/** 0..1 — quanto da jornada essa feature já percorreu. */
export function stateProgress(state: FeatureState): number {
  return STATE_ORDER.indexOf(state) / (STATE_ORDER.length - 1)
}
