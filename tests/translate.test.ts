/**
 * Tradução de commits → feed humano.
 *
 * O contrato aqui é de confiança: o texto não pode inventar motivo que o
 * commit não deu, e o aviso de atenção não pode disparar por engano nem
 * deixar de disparar quando algo sensível entra no repositório.
 */

import { describe, expect, it } from 'vitest'

import { commitsParaSnapshot } from '../electron/translate.js'

const META = {
  name: 'projeto-teste',
  path: '/tmp/projeto-teste',
  branch: 'main',
  remote: null,
  firstCommitAt: '2026-01-01T10:00:00.000Z',
}

type Arquivo = { path: string; insertions?: number; deletions?: number }

let seq = 0
function commit(over: Partial<Record<string, unknown>> & { files?: (string | Arquivo)[] } = {}) {
  seq += 1
  const files = (over.files ?? ['src/lib/motor.ts']).map((f) =>
    typeof f === 'string' ? { path: f, insertions: 1, deletions: 0 } : { insertions: 1, deletions: 0, ...f },
  )
  return {
    hash: `h${seq}`,
    fullHash: `full${seq}`,
    author: 'Pessoa de Teste',
    authorEmail: 'teste@example.com',
    at: '2026-01-02T10:00:00.000Z',
    subject: 'feat: faz alguma coisa',
    body: '',
    isMerge: false,
    insertions: files.reduce((s, f) => s + (f.insertions ?? 0), 0),
    deletions: files.reduce((s, f) => s + (f.deletions ?? 0), 0),
    agent: null,
    ...over,
    files,
  }
}

const feed = (...commits: unknown[]) => commitsParaSnapshot(META, commits as never[]).events

// -------------------------------------------------------------- o que entra

describe('o que entra no feed', () => {
  it('deixa merges de fora do feed', () => {
    expect(feed(commit({ isMerge: true, subject: 'Merge branch lado' }))).toHaveLength(0)
  })

  it('deixa commits sem arquivos de fora do feed', () => {
    expect(feed(commit({ files: [] }))).toHaveLength(0)
  })

  it('mantém no feed um commit comum com arquivos', () => {
    expect(feed(commit())).toHaveLength(1)
  })
})

// --------------------------------------------------------------- manchetes

describe('manchete e explicação', () => {
  it('transforma prefixo convencional em frase humana', () => {
    const [e] = feed(commit({ subject: 'feat: adiciona login por e-mail' }))
    expect(e.human.headline).toBe('Adiciona login por e-mail.')
    expect(e.human.what).toContain('Foi adicionado algo novo')
  })

  it('reconhece o prefixo fix como correção', () => {
    const [e] = feed(commit({ subject: 'fix: corrige o total da fatura' }))
    expect(e.human.what).toContain('Um problema foi corrigido')
  })

  it('produz manchete mesmo sem prefixo convencional', () => {
    const [e] = feed(commit({ subject: 'mexi no cálculo do total' }))
    expect(e.human.headline).toBe('Mexi no cálculo do total.')
    expect(e.human.headline.length).toBeGreaterThan(0)
  })

  it('usa o corpo do commit como o porquê', () => {
    const [e] = feed(commit({ body: 'O cliente reclamou que a fatura vinha errada.' }))
    expect(e.human.why).toBe('O cliente reclamou que a fatura vinha errada.')
  })

  it('diz que o motivo não foi explicado quando não há corpo', () => {
    const [e] = feed(commit({ body: '' }))
    expect(e.human.why).toBe('A mensagem da mudança não explicou o motivo.')
  })

  it('não usa trailers de máquina como motivo', () => {
    const [e] = feed(commit({ body: 'Co-Authored-By: Claude <noreply@anthropic.com>' }))
    expect(e.human.why).toBe('A mensagem da mudança não explicou o motivo.')
  })
})

// --------------------------------------------------------- sinais de atenção

describe('sinais de atenção', () => {
  const razao = (c: unknown) => feed(c).at(0)!.human

  it('avisa quando um arquivo .env entra no repositório', () => {
    const h = razao(commit({ files: ['.env'] }))
    expect(h.needsYourAttention).toBe(true)
    expect(h.attentionReason).toMatch(/\.env/)
  })

  it('não avisa por causa de .env.example', () => {
    const h = razao(commit({ files: ['.env.example'] }))
    expect(h.needsYourAttention).toBe(false)
  })

  it('avisa quando a mudança toca controle de acesso', () => {
    const h = razao(commit({ files: ['src/lib/auth/session.ts'] }))
    expect(h.needsYourAttention).toBe(true)
    expect(h.attentionReason).toMatch(/controle de acesso/i)
  })

  it('avisa quando há migração de banco de dados', () => {
    const h = razao(commit({ files: ['prisma/migrations/001_init/migration.sql'] }))
    expect(h.needsYourAttention).toBe(true)
    expect(h.attentionReason).toMatch(/banco de dados/i)
  })

  it('avisa quando a lista de bibliotecas muda', () => {
    const h = razao(commit({ files: ['package.json'] }))
    expect(h.needsYourAttention).toBe(true)
    expect(h.attentionReason).toMatch(/bibliotecas/i)
  })

  it('avisa quando a mudança é grande demais para revisar', () => {
    const h = razao(commit({ files: [{ path: 'src/lib/motor.ts', insertions: 1600, deletions: 0 }] }))
    expect(h.needsYourAttention).toBe(true)
    expect(h.attentionReason).toMatch(/1600 linhas/)
  })

  it('não avisa em mudança comum e pequena', () => {
    const h = razao(commit({ files: ['src/components/Botao.tsx'] }))
    expect(h.needsYourAttention).toBe(false)
    expect(h.attentionReason).toBeUndefined()
  })
})

// ------------------------------------------------------------------ features

describe('features derivadas dos commits', () => {
  it('marca como implemented uma parte com código e sem teste', () => {
    const snap = commitsParaSnapshot(META, [
      commit({ files: ['src/lib/metrics/calc.ts'] }),
    ] as never[])
    const codigo = snap.features.find((f) => f.name === 'Cálculo de métricas')!
    expect(codigo.state).toBe('implemented')
  })

  /*
   * DEFEITO: nenhuma feature descoberta consegue chegar em 'tested'.
   * `classificar()` manda todo caminho `tests/` para uma feature separada
   * ("Bastidores / Testes automáticos"), então a parte que tem código nunca
   * recebe `temTeste`, e a parte que tem os testes nunca recebe `temCodigo`
   * — e `estadoDe()` devolve 'planned' para ela. O estado 'tested' existe no
   * código e é inalcançável por este caminho. (Em `aplicarMapa` funciona,
   * porque lá o mapa diz quais testes pertencem a qual parte.)
   */
  it('promove para tested a parte cujo código tem teste correspondente', () => {
    const snap = commitsParaSnapshot(META, [
      commit({ files: ['src/lib/metrics/calc.ts', 'tests/calc.test.ts'] }),
    ] as never[])
    expect(snap.features.some((f) => f.state === 'tested')).toBe(true)
  })

  it('mantém como planned uma parte que só tem documentação', () => {
    const snap = commitsParaSnapshot(META, [commit({ files: ['docs/plano.md'] })] as never[])
    expect(snap.features[0].state).toBe('planned')
  })

  it('marca o evento como vindo de agente quando o commit tem agente', () => {
    const [e] = feed(commit({ agent: 'claude-code' }))
    expect(e.source).toBe('agent')
    expect(e.agent).toBe('claude-code')
    expect(e.evidence.some((v: { kind: string }) => v.kind === 'agent_claim')).toBe(true)
  })
})
