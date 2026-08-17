/**
 * Que versão do WTF está rodando, e se existe uma mais nova.
 *
 * O WTF é distribuído por clone, então "atualizar" é `git pull` na pasta DELE
 * — nunca na pasta do projeto observado. Este módulo é o único lugar que fala
 * do repositório do próprio aplicativo; todo o resto do app trata git como
 * leitura do projeto de quem usa.
 *
 * Nada aqui escreve no repositório do WTF. `git fetch` atualiza só as
 * referências remotas locais, que é o mínimo para saber se ficamos para trás;
 * quem puxa de fato é o comando `wtf --atualizar`, disparado pela pessoa.
 */

import { execFile as _execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(_execFile)

/** A pasta do WTF, não a do projeto observado. */
export const RAIZ_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Fetch vai à rede: sem teto, uma máquina offline trava a leitura. */
const TIMEOUT_REDE_MS = 15_000

async function git(args, { timeout } = {}) {
  const { stdout } = await execFile('git', args, {
    cwd: RAIZ_APP,
    windowsHide: true,
    timeout,
  })
  return stdout.trim()
}

async function gitOuNulo(args, opcoes) {
  try {
    return await git(args, opcoes)
  } catch {
    return null
  }
}

/**
 * Versão declarada, commit e data. `commit` é null quando o WTF não veio de um
 * clone — instalado por pacote, por exemplo, onde não há `.git` e também não
 * há o que atualizar por aqui.
 */
export async function versaoAtual() {
  let versao = null
  try {
    versao = JSON.parse(await readFile(path.join(RAIZ_APP, 'package.json'), 'utf8')).version
  } catch {
    /* sem package.json legível: seguimos com o que der */
  }
  const commit = await gitOuNulo(['rev-parse', '--short', 'HEAD'])
  const data = await gitOuNulo(['log', '-1', '--format=%cI'])
  return { versao: versao ?? null, commit, data: data ?? null }
}

/**
 * Decide o que dizer, a partir do estado bruto do repositório.
 *
 * Pura de propósito: é aqui que mora a regra, e é isto que os testes provam
 * sem precisar de rede nem de um clone de mentira.
 *
 * `atras` é quantos commits o remoto tem a mais. `sujo` é trabalho não salvo
 * na pasta do WTF — quem mexeu no código do aplicativo não pode receber um
 * `git pull` por cima sem ser avisado.
 */
export function decidirAtualizacao({ commit, atras, sujo, erro }) {
  if (erro) return { estado: 'desconhecido', motivo: erro }
  if (!commit) return { estado: 'sem-git' }
  if (sujo) return { estado: 'travado', motivo: 'ha-mudanca-local' }
  if (!Number.isFinite(atras) || atras <= 0) return { estado: 'em-dia' }
  return { estado: 'desatualizado', atras }
}

/**
 * Consulta o remoto e devolve o veredito. Nunca lança: sem rede, sem git ou
 * sem remoto configurado, o app segue exatamente igual — apenas sem saber.
 */
export async function verificarAtualizacao() {
  const { commit } = await versaoAtual()
  if (!commit) return decidirAtualizacao({ commit: null })

  const ramo = (await gitOuNulo(['rev-parse', '--abbrev-ref', 'HEAD'])) || 'main'
  const buscou = await gitOuNulo(['fetch', '--quiet', 'origin', ramo], {
    timeout: TIMEOUT_REDE_MS,
  })
  if (buscou === null) return decidirAtualizacao({ commit, erro: 'sem-resposta-do-remoto' })

  const contagem = await gitOuNulo(['rev-list', '--count', `HEAD..origin/${ramo}`])
  const sujo = Boolean(await gitOuNulo(['status', '--porcelain']))
  return decidirAtualizacao({ commit, atras: Number(contagem), sujo })
}
