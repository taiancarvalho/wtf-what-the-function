import { describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { mesclarClaims } from '../electron/events.js'

/**
 * O defeito que este arquivo existe para não deixar voltar.
 *
 * `wtf-claim.cjs` grava `sessionId: process.env.CLAUDE_SESSION_ID || 'cli'`, e
 * essa variável NÃO é exportada para o Bash do agente — só `CLAUDE_PROJECT_DIR`
 * é. Resultado medido no repositório do próprio WTF: 58 claims, 58 com
 * `sessionId: "cli"`, enquanto os 112 `file.touched` do hook têm UUID real.
 *
 * `arquivosEntre` comparava as duas coisas (`t.sessionId !== sessionId`) e
 * nunca casava. Em cascata:
 *
 *   - os 30 cartões de "a IA terminou" não anexavam arquivo nenhum;
 *   - `feat.files` ficava vazio para sempre — 0 de 23 features;
 *   - e os toques que aconteceram DENTRO do par start/done viravam "rajada
 *     órfã", com o painel acusando a IA de não ter declarado justo quando ela
 *     declarou.
 *
 * Os testes antigos não pegaram porque usavam `sessionId: 's1'` nos dois lados.
 * O defeito morava na fresta entre o fixture e a realidade.
 */
const AGORA = '2026-08-18T12:00:00.000-03:00'
const hora = (m: number) => new Date(Date.parse(AGORA) + m * 60000).toISOString()

/** O que o CLI grava de verdade: claim sem sessão, toque com UUID. */
const cenarioReal = [
  { v: 1, id: 'c1', at: hora(0), kind: 'claim.started', agent: 'claude-code', sessionId: 'cli', feature: 'Entrar na conta', text: 'Vou mexer no login.' },
  { v: 1, id: 't1', at: hora(2), kind: 'file.touched', agent: 'claude-code', sessionId: 'a3f9c2e1-0000-4000-8000-000000000001', files: ['src/login.ts', 'src/sessao.ts'] },
  { v: 1, id: 't2', at: hora(4), kind: 'file.touched', agent: 'claude-code', sessionId: 'a3f9c2e1-0000-4000-8000-000000000001', files: ['src/login.test.ts'] },
  { v: 1, id: 'c2', at: hora(6), kind: 'claim.completed', agent: 'claude-code', sessionId: 'cli', feature: 'Entrar na conta', text: 'Terminei.' },
]

const mesclar = (brutos: unknown[]) =>
  mesclarClaims({ project: {}, features: [], events: [] }, brutos)

describe('a declaração da IA se liga aos arquivos que ela tocou', () => {
  it('anexa os arquivos ao cartão de conclusão, mesmo sem sessão no claim', () => {
    const r = mesclar(cenarioReal)
    const concluido = r.events.find((e: any) => e.type === 'work.completed')

    expect(concluido, 'nenhum cartão de conclusão foi criado').toBeDefined()
    expect(concluido.technical?.files ?? []).toEqual(
      expect.arrayContaining(['src/login.ts', 'src/sessao.ts', 'src/login.test.ts']),
    )
  })

  it('a parte do projeto fica sabendo dos arquivos dela', () => {
    const r = mesclar(cenarioReal)
    const feat = r.features.find((f: any) => f.name === 'Entrar na conta')

    expect(feat, 'a feature não foi criada').toBeDefined()
    expect(feat.files ?? []).toContain('src/login.ts')
  })

  /*
   * O contrário do bug: toque que aconteceu dentro do par start/done não pode
   * virar cartão de "a IA mexeu sem declarar". Ela declarou.
   */
  it('não acusa de rajada órfã o que aconteceu dentro do trabalho declarado', () => {
    const r = mesclar(cenarioReal)
    const rajadas = r.events.filter((e: any) => e.type === 'work.progress')
    expect(rajadas, JSON.stringify(rajadas.map((e: any) => e.human?.headline))).toHaveLength(0)
  })

  /*
   * O caminho novo: o `done` resolve os arquivos por `git status` e os grava
   * no próprio claim. Isso não depende de hook — é o que faz a ligação existir
   * também no Codex, no Gemini e no opencode.
   */
  it('a lista que veio no próprio claim vence a dedução por tempo', () => {
    const r = mesclar([
      { v: 1, id: 'c1', at: hora(0), kind: 'claim.started', sessionId: 'cli', feature: 'Carrinho' },
      { v: 1, id: 't1', at: hora(2), kind: 'file.touched', sessionId: 'uuid-real', files: ['deduzido.ts'] },
      { v: 1, id: 'c2', at: hora(5), kind: 'claim.completed', sessionId: 'cli', feature: 'Carrinho', files: ['do-claim.ts'] },
    ])
    const concluido = r.events.find((e: any) => e.type === 'work.completed')
    expect(concluido.technical?.files).toEqual(['do-claim.ts'])
  })

  /*
   * O que já funcionava tem que continuar: quando as sessões BATEM, a
   * correlação segue valendo — inclusive para não misturar dois agentes
   * trabalhando ao mesmo tempo no mesmo projeto.
   */
  it('com sessões de verdade nos dois lados, continua correlacionando por sessão', () => {
    const r = mesclar([
      { v: 1, id: 'c1', at: hora(0), kind: 'claim.started', sessionId: 's1', feature: 'Carrinho' },
      { v: 1, id: 't1', at: hora(2), kind: 'file.touched', sessionId: 's1', files: ['carrinho.ts'] },
      { v: 1, id: 't2', at: hora(3), kind: 'file.touched', sessionId: 's2', files: ['outro.ts'] },
      { v: 1, id: 'c2', at: hora(5), kind: 'claim.completed', sessionId: 's1', feature: 'Carrinho' },
    ])
    const concluido = r.events.find((e: any) => e.type === 'work.completed')
    expect(concluido.technical?.files).toEqual(['carrinho.ts'])
  })
})
