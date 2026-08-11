/**
 * Abrir a IA no projeto observado.
 *
 * Decisão: NÃO embutimos um terminal no app.
 *   - `node-pty` é módulo nativo e quebra a cada atualização do Electron;
 *   - e, principalmente, uma tela preta com cursor piscando é exatamente o que
 *     assusta a pessoa para quem este produto existe.
 *
 * Em vez disso, abrimos o terminal do próprio sistema já dentro da pasta, com o
 * agente rodando. A pessoa fica com duas janelas lado a lado: a IA trabalhando
 * de um lado, o painel traduzindo do outro.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const exec = promisify(execFile)

/** Agentes que sabemos iniciar, em ordem de preferência. */
const AGENTES = [
  { cmd: 'claude', rotulo: 'Claude Code' },
  { cmd: 'codex', rotulo: 'Codex' },
  { cmd: 'gemini', rotulo: 'Gemini' },
]

/** Caminhos onde CLIs costumam estar — o app não herda o PATH do shell. */
const EXTRA_PATH = [
  path.join(os.homedir(), '.local/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  path.join(os.homedir(), '.bun/bin'),
  path.join(os.homedir(), '.volta/bin'),
]

async function existeExecutavel(p) {
  try {
    await access(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Procura o agente no PATH ampliado. Devolve null se não achar nenhum. */
export async function detectarAgente() {
  for (const a of AGENTES) {
    for (const base of EXTRA_PATH) {
      const alvo = path.join(base, a.cmd)
      if (await existeExecutavel(alvo)) return { ...a, caminho: alvo }
    }
    try {
      const { stdout } = await exec('/usr/bin/which', [a.cmd])
      const achado = stdout.trim()
      if (achado) return { ...a, caminho: achado }
    } catch {
      /* segue para o próximo */
    }
  }
  return null
}

/** Escapa para dentro de uma string do AppleScript. */
const aspas = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/**
 * Abre o terminal do sistema na pasta do projeto, iniciando o agente quando
 * houver um. Sem agente instalado, abre só o shell na pasta certa.
 */
export async function abrirTerminal(dir, promptInicial) {
  if (!dir) return { erro: 'Nenhum projeto aberto.' }

  const agente = await detectarAgente()
  const invocacao = agente
    ? promptInicial
      ? `${JSON.stringify(agente.caminho)} ${JSON.stringify(promptInicial)}`
      : JSON.stringify(agente.caminho)
    : null
  const comando = invocacao
    ? `cd ${JSON.stringify(dir)} && clear && ${invocacao}`
    : `cd ${JSON.stringify(dir)} && clear`

  if (process.platform === 'darwin') {
    // iTerm quando existir; Terminal.app como padrão universal do macOS.
    const temIterm = await existeExecutavel('/Applications/iTerm.app/Contents/MacOS/iTerm2')
    const script = temIterm
      ? `tell application "iTerm"
           activate
           set nova to (create window with default profile)
           tell current session of nova to write text "${aspas(comando)}"
         end tell`
      : `tell application "Terminal"
           activate
           do script "${aspas(comando)}"
         end tell`
    try {
      await exec('/usr/bin/osascript', ['-e', script])
      return { ok: true, agente: agente?.rotulo ?? null }
    } catch (erro) {
      return { erro: String(erro?.message ?? erro) }
    }
  }

  if (process.platform === 'win32') {
    try {
      await exec('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', `cd /d "${dir}"`])
      return { ok: true, agente: agente?.rotulo ?? null }
    } catch (erro) {
      return { erro: String(erro?.message ?? erro) }
    }
  }

  // Linux: tenta os emuladores mais comuns, em ordem.
  for (const [bin, args] of [
    ['x-terminal-emulator', ['-e', 'bash', '-lc', `${comando}; exec bash`]],
    ['gnome-terminal', ['--working-directory', dir]],
    ['konsole', ['--workdir', dir]],
    ['xterm', ['-e', 'bash', '-lc', `${comando}; exec bash`]],
  ]) {
    try {
      await exec(bin, args)
      return { ok: true, agente: agente?.rotulo ?? null }
    } catch {
      /* tenta o próximo */
    }
  }
  return { erro: 'Não encontrei um terminal para abrir neste sistema.' }
}
