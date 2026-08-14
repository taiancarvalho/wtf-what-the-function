import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { abrirSessao, encerrarTodas, entregar, escrever } from '../electron/terminal-embutido.js'

/**
 * O erro que este arquivo existe para não deixar acontecer de novo.
 *
 * A entrega de um pedido nasceu assumindo que havia sempre um agente de IA
 * escutando, e colava o texto direto na sessão. Mas o shell volta a ficar
 * sozinho — o agente termina, a pessoa aperta Ctrl+C, o projeto muda. Colando
 * ali, a mensagem inteira virou COMANDO DE SHELL: o zsh tentou executar
 * "Possíveis dados de pessoa no código", linha por linha, e um pedido de
 * auditoria de segurança virou comandos aleatórios rodando no computador de
 * quem clicou num botão.
 *
 * Estes testes usam um pseudo-terminal DE VERDADE. Sem isso não haveria o que
 * testar: o bug inteiro morava na diferença entre o que existe do outro lado.
 */

let raiz: string
const saida: string[] = []

/** Uma janela falsa: só precisa receber os bytes que o motor manda. */
const win = {
  isDestroyed: () => false,
  once: () => {},
  webContents: {
    send: (_canal: string, dados: { dados?: string }) => {
      if (dados?.dados) saida.push(dados.dados)
    },
  },
}

const tudo = () => saida.join('')
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Espera até `cond` valer, ou desistir. Terminal é assíncrono por natureza. */
async function ate(cond: () => boolean, limite = 6000): Promise<boolean> {
  const fim = Date.now() + limite
  while (Date.now() < fim) {
    if (cond()) return true
    await esperar(60)
  }
  return cond()
}

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-pty-'))
})

afterAll(async () => {
  encerrarTodas()
  await rm(raiz, { recursive: true, force: true })
})

describe('entregar um pedido à sessão', () => {
  it('com o shell SOZINHO, o texto nunca é executado como comando', async () => {
    saida.length = 0
    const s = await abrirSessao({ win, dir: raiz, cols: 80, rows: 24 })
    expect(s.erro, s.erro).toBeUndefined()

    // O prompt precisa existir antes: entregar a um shell que ainda está
    // nascendo testaria outra coisa.
    await ate(() => tudo().length > 0)
    saida.length = 0

    const pedido = 'Possíveis dados de pessoa no código:\n- E-mail em src/x.tsx:18\nConfira cada item.'
    const r = await entregar(s.id, pedido)
    await esperar(1200)

    /*
     * O retorno importa tanto quanto a tela: `viaAgente` (ou a recusa por não
     * achar agente nenhum) é a prova de que o shell foi reconhecido como
     * SOZINHO. Sem esta asserção, um falso positivo na detecção passaria
     * despercebido — o texto seria colado, e as três asserções abaixo, que só
     * procuram reclamação do zsh, não veriam a reclamação de outro shell.
     */
    expect(r?.ok === false || r?.viaAgente === true, JSON.stringify(r)).toBe(true)

    const texto = tudo()
    // A assinatura exata do desastre: o zsh reclamando de cada linha.
    expect(texto).not.toMatch(/command not found/i)
    expect(texto).not.toMatch(/no matches found/i)
    expect(texto).not.toMatch(/number expected/i)
  })

  it('com um programa RODANDO, o texto é colado — e chega inteiro', async () => {
    saida.length = 0
    const s = await abrirSessao({ win, dir: raiz, cols: 80, rows: 24 })
    expect(s.erro, s.erro).toBeUndefined()
    await ate(() => tudo().length > 0)

    /*
     * Um eco em Node faz o papel do agente: um programa que fica lendo o que
     * chega e devolve. É o que distingue "tem alguém escutando" de "shell
     * vazio".
     *
     * Node, e não `cat`, porque este teste precisa valer nos três sistemas —
     * no Windows `cat` é o Get-Content do PowerShell, que quer um arquivo e
     * não a entrada padrão, e o Ctrl-D que encerrava o `cat` não encerra nada.
     *
     * O sinal de partida é montado por concatenação: escrito inteiro, ele
     * apareceria no ECO do próprio comando digitado, e a espera terminaria
     * antes de o programa existir.
     */
    escrever(s.id, `node -e "process.stdout.write('PRON'+'TO\\n');process.stdin.pipe(process.stdout)"\r`)
    const partiu = await ate(() => tudo().includes('PRONTO'))
    expect(partiu, `o eco não chegou a rodar. Terminal:\n${tudo()}`).toBe(true)
    saida.length = 0

    /*
     * `viaAgente` aqui seria o bug: significa que a detecção não viu o programa
     * rodando e mandou executar o agente por cima dele. Sem esta asserção, o
     * sintoma no Windows era um `''` genérico, que não dizia qual das duas
     * pontas tinha quebrado.
     */
    const r = await entregar(s.id, 'primeira linha\nsegunda linha')
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true })
    expect(r?.viaAgente, 'colou pelo agente: a detecção não viu o programa').toBeUndefined()

    await ate(() => tudo().includes('segunda linha'))

    const texto = tudo()
    expect(texto).toContain('primeira linha')
    expect(texto).toContain('segunda linha')
    expect(texto).not.toMatch(/command not found/i)

    escrever(s.id, '\x03') // Ctrl-C encerra o eco nos três sistemas
  })

  it('sessão que não existe não escreve em lugar nenhum', async () => {
    saida.length = 0
    const r = await entregar('t-inexistente', 'oi')
    expect(r.ok).toBe(false)
    expect(tudo()).toBe('')
  })

  it('texto vazio não é entregue', async () => {
    const s = await abrirSessao({ win, dir: raiz, cols: 80, rows: 24 })
    expect((await entregar(s.id, '   ')).ok).toBe(false)
  })
})
