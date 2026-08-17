import { describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { sequenciaDeColagem } from '../electron/terminal-embutido.js'
// @ts-expect-error módulo do processo main, sem tipos
import { AGENTES_CONHECIDOS } from '../electron/terminal.js'
import { acoesDoEvento } from '../src/lib/acoes'
import type { WtfEvent } from '../src/types/protocol'

const INICIO = '\x1b[200~'
const FIM = '\x1b[201~'

/**
 * O bug: "pedir para resolver" travou o aplicativo inteiro.
 *
 * A mensagem foi entregue ao terminal como digitação. Cada quebra de linha
 * dela virou um Enter, o agente recebeu uma dúzia de perguntas pela metade, e
 * cada uma redesenhou a tela — a avalanche de saída entupiu a ponte entre os
 * processos. O conserto é colar em vez de digitar.
 */
describe('entregar uma mensagem ao terminal', () => {
  it('envolve o texto no modo de colagem, com UM Enter só no fim', () => {
    const bytes = sequenciaDeColagem('primeira linha\nsegunda linha')
    expect(bytes.startsWith(INICIO)).toBe(true)
    expect(bytes.endsWith(`${FIM}\r`)).toBe(true)
  })

  it('nenhuma quebra de linha vira Enter fora do bloco colado', () => {
    const texto = 'a\nb\nc\nd\ne'
    const bytes = sequenciaDeColagem(texto)
    const corpo = bytes.slice(INICIO.length, bytes.indexOf(FIM))

    // Dentro do bloco, `\r` é quebra de linha e não envio: quem decide são as
    // marcas de colagem em volta. Fora delas existe exatamente um `\r`.
    expect(corpo).toBe('a\rb\rc\rd\re')
    expect(bytes.slice(bytes.indexOf(FIM)).split('\r').length - 1).toBe(1)
  })

  it('não sobra nenhum \\n cru — o terminal não fala nova-linha', () => {
    expect(sequenciaDeColagem('x\ny\r\nz')).not.toContain('\n')
  })

  it('texto de uma linha só continua funcionando', () => {
    expect(sequenciaDeColagem('oi')).toBe(`${INICIO}oi${FIM}\r`)
  })
})

/**
 * A mensagem real que travou o app. Se ela voltar a ser de uma linha só, o
 * teste acima perde o sentido — este garante que o caso perigoso é o caso real.
 */
describe('as mensagens dos botões são mesmo de várias linhas', () => {
  const evento = {
    id: 'e1',
    at: new Date(0).toISOString(),
    type: 'risk.raised',
    source: 'wtf',
    featureId: 'f1',
    evidence: [],
    human: {
      headline: 'As senhas passaram a ser guardadas de outro jeito.',
      what: '',
      why: '',
      impact: '',
      affects: [],
      needsYourAttention: true,
      attentionReason: 'Pode expor dados de quem já tem conta.',
    },
  } as WtfEvent

  it('"resolver" tem quebras de linha — digitá-la seria uma dúzia de envios', () => {
    const resolver = acoesDoEvento(evento).find((a) => a.id === 'resolver')
    expect(resolver).toBeDefined()
    const quebras = (resolver!.mensagem.match(/\n/g) ?? []).length
    expect(quebras).toBeGreaterThan(5)
  })

  it('as perguntas de leitura pedem à IA que volte ao que estava fazendo', () => {
    for (const id of ['explicar']) {
      const acao = acoesDoEvento(evento).find((a) => a.id === id)
      expect(acao!.mensagem).toContain('volte para')
    }
  })
})

/**
 * O WTF diz funcionar com qualquer uma das quatro IAs. Cada CLI tem a sua
 * forma de rodar sem tela, e errar a sintaxe não quebra nada visivelmente:
 * a tradução simplesmente não sai, e o painel cai no texto heurístico — uma
 * falha silenciosa, que é a pior espécie.
 */
describe('rodar cada IA sem tela', () => {
  const porCmd = (cmd: string) => AGENTES_CONHECIDOS.find((a: any) => a.cmd === cmd)!

  it('conhece os quatro agentes, e cada um com seu identificador', () => {
    expect(AGENTES_CONHECIDOS.map((a: any) => a.cmd)).toEqual([
      'claude',
      'codex',
      'gemini',
      'opencode',
    ])
    expect(AGENTES_CONHECIDOS.map((a: any) => a.id)).toEqual([
      'claude-code',
      'codex',
      'gemini-cli',
      'opencode',
    ])
  })

  it('monta a invocação de cada um do jeito que aquele CLI entende', () => {
    expect(porCmd('claude').headless('oi', 'm')).toEqual(['-p', 'oi', '--model', 'm'])
    expect(porCmd('codex').headless('oi', 'm')).toEqual(['exec', '-m', 'm', 'oi'])
    expect(porCmd('gemini').headless('oi', 'm')).toEqual(['-m', 'm', '-p', 'oi'])
    expect(porCmd('opencode').headless('oi', 'm')).toEqual(['run', '-m', 'm', 'oi'])
  })

  /*
   * Sem modelo escolhido, só o Claude ganha um padrão nosso — é o único em que
   * sabemos o nome de um modelo barato. Mandar um nome inventado para os outros
   * seria erro na conta de quem instalou.
   */
  it('sem modelo, deixa cada CLI escolher — menos o Claude, que tem o barato', () => {
    expect(porCmd('claude').headless('oi', null)).toEqual([
      '-p',
      'oi',
      '--model',
      'claude-haiku-4-5-20251001',
    ])
    expect(porCmd('codex').headless('oi', null)).toEqual(['exec', 'oi'])
    expect(porCmd('gemini').headless('oi', null)).toEqual(['-p', 'oi'])
    expect(porCmd('opencode').headless('oi', null)).toEqual(['run', 'oi'])
  })

  it('o pedido vai como UM argumento, nunca concatenado na linha de comando', () => {
    const perigoso = 'confere isto; rm -rf ~'
    for (const a of AGENTES_CONHECIDOS) {
      const args = a.headless(perigoso, null)
      expect(args).toContain(perigoso)
      expect(args.join(' ').split(perigoso)).toHaveLength(2)
    }
  })
})
