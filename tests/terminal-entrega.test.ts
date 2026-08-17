import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * O agente é falso, e precisa ser.
 *
 * `detectarAgente` procura em pastas conhecidas ANTES do PATH, então numa
 * máquina com Claude Code instalado o teste abria uma sessão do agente de
 * verdade — na pasta temporária, pedindo permissão de acesso. Interceptar a
 * detecção mantém o teste igual em qualquer máquina e no CI.
 */
const falso = vi.hoisted(() => ({ caminho: '' }))

vi.mock('../electron/terminal.js', async (original) => ({
  ...((await original()) as object),
  detectarAgente: async () =>
    falso.caminho ? { cmd: 'claude', rotulo: 'Agente falso', caminho: falso.caminho } : null,
}))

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

/** O agente falso anuncia que subiu; a espera é por este sinal, não por relógio. */
const PRONTO = 'AGENTE-NO-AR'

/*
 * A colagem só é considerada em sessão que o WTF abriu COM agente — é essa
 * marca que separa "há alguém escutando" de "o shell está nascendo com um
 * `mise` de inicialização pendurado nele". O agente falso é um eco: anuncia
 * que subiu e fica devolvendo o que recebe, como um agente esperando ordem.
 */
beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-pty-'))
  const bin = await mkdtemp(path.join(os.tmpdir(), 'wtf-bin-'))
  falso.caminho = path.join(bin, 'agente-falso.mjs')
  await writeFile(
    falso.caminho,
    `#!/usr/bin/env node\nprocess.stdout.write('${PRONTO}\\n')\nprocess.stdin.pipe(process.stdout)\n`,
    { mode: 0o755 },
  )
})

afterAll(async () => {
  encerrarTodas()
  /*
   * Com retry: o Windows tranca a pasta enquanto ela for o cwd de um processo
   * vivo, e o shell da sessão leva um instante para morrer depois do
   * `encerrarTodas`. Sem isto, a limpeza estourava EBUSY e derrubava o arquivo
   * inteiro DEPOIS de todos os testes já terem passado.
   */
  await rm(raiz, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
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

  /*
   * `detectarAgente` procura o agente com `/usr/bin/which`, que não existe no
   * Windows — lá nenhuma sessão chega a lançar agente, e o cenário deste teste
   * não tem como acontecer. Não é o teste que é de Unix: é o produto.
   */
  it.skipIf(process.platform === 'win32')(
    'com um programa RODANDO, o texto é colado — e chega inteiro',
    async () => {
    saida.length = 0
    // Uma sessão que o WTF abriu COM agente: é essa marca, e não a mera
    // existência de um filho do shell, que autoriza colar mais tarde.
    const s = await abrirSessao({ win, dir: raiz, mensagem: 'oi', cols: 80, rows: 24 })
    expect(s.erro, s.erro).toBeUndefined()
    expect(s.agente, 'nenhum agente falso foi detectado').toBeTruthy()

    /*
     * Espera-se o SINAL do agente, e não bytes quaisquer nem um sono fixo: o
     * comando é escrito no pty antes de o shell terminar de nascer, e com a
     * suíte inteira em paralelo essa partida passa de dez segundos. Bytes
     * quaisquer chegariam no eco do comando, muito antes de haver quem escute.
     */
    const partiu = await ate(() => tudo().includes(PRONTO), 45_000)
    expect(partiu, `o agente falso não chegou a rodar. Terminal:\n${tudo()}`).toBe(true)
    saida.length = 0

    /*
     * `viaAgente` aqui seria o bug: significa que a decisão não viu o agente
     * rodando e mandou executá-lo por cima dele mesmo. Sem esta asserção, o
     * sintoma era um `''` genérico, que não dizia qual das duas pontas tinha
     * quebrado.
     */
    const r = await entregar(s.id, 'primeira linha\nsegunda linha')
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true })
    expect(r?.viaAgente, 'executou o agente: a decisão não viu que ele já roda').toBeUndefined()

    await ate(() => tudo().includes('segunda linha'))

    const texto = tudo()
    expect(texto).toContain('primeira linha')
    expect(texto).toContain('segunda linha')
    expect(texto).not.toMatch(/command not found/i)

    escrever(s.id, '\x03')
  },
    /*
     * Teto próprio, bem acima do padrão de 20s: este teste sobe um shell DE
     * VERDADE e espera um programa nascer dentro dele. Com a suíte inteira em
     * paralelo, essa partida passa de dez segundos — e o que se testa aqui é a
     * decisão de colar, não a velocidade com que o zsh carrega o .zshrc.
     */
    60_000,
  )

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
