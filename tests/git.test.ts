/**
 * Leitura de repositórios git de verdade.
 *
 * Nada de mock: os bugs que escaparam aqui eram de formato de saída do git
 * (rename, binário, repo sem commit). Só um repo real prova isso. Todos os
 * repositórios vivem em diretórios temporários e são apagados no fim.
 */

import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  isGitRepo,
  readCommits,
  readProjectMeta,
  readTrackedFiles,
  readWorkingFiles,
} from '../electron/git.js'

const execFile = promisify(_execFile)

const AMBIENTE = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
}

const criados: string[] = []

async function criarDir(prefixo: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `wtf-${prefixo}-`))
  criados.push(dir)
  return dir
}

async function g(dir: string, args: string[]) {
  return execFile('git', args, { cwd: dir, env: AMBIENTE })
}

/** Repo vazio, com identidade LOCAL — nunca toca na config do usuário. */
async function repoVazio(prefixo = 'repo') {
  const dir = await criarDir(prefixo)
  await g(dir, ['init', '-b', 'main'])
  await g(dir, ['config', 'user.email', 'teste@example.com'])
  await g(dir, ['config', 'user.name', 'Pessoa de Teste'])
  await g(dir, ['config', 'commit.gpgsign', 'false'])
  return dir
}

async function escrever(dir: string, rel: string, conteudo: string | Buffer) {
  const alvo = path.join(dir, rel)
  await fs.mkdir(path.dirname(alvo), { recursive: true })
  await fs.writeFile(alvo, conteudo)
}

async function commitar(dir: string, mensagem: string[]) {
  await g(dir, ['add', '-A'])
  await g(dir, ['commit', ...mensagem.flatMap((m) => ['-m', m])])
}

afterAll(async () => {
  for (const dir of criados) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

// --------------------------------------------------------------- repo vazio

describe('repositório sem nenhum commit', () => {
  let dir: string
  beforeAll(async () => {
    dir = await repoVazio('vazio')
  })

  it('é reconhecido como repositório git', async () => {
    expect(await isGitRepo(dir)).toBe(true)
  })

  it('não lança em repositório sem commits e devolve lista vazia', async () => {
    await expect(readCommits(dir)).resolves.toEqual([])
  })

  it('lê os metadados de um repositório recém-criado sem lançar', async () => {
    const meta = await readProjectMeta(dir)
    expect(meta.branch).toBe('main')
    expect(meta.name).toBe(path.basename(dir))
    expect(meta.firstCommitAt).toBeNull()
  })

  it('enxerga arquivo novo como não rastreado mesmo sem histórico', async () => {
    await escrever(dir, 'rascunho.txt', 'ainda nao commitado\n')
    const trabalho = await readWorkingFiles(dir)
    expect(trabalho.untracked).toContain('rascunho.txt')
  })
})

it('não é repositório git um diretório qualquer', async () => {
  const dir = await criarDir('sem-git')
  expect(await isGitRepo(dir)).toBe(false)
})

// ------------------------------------------------------------------ numstat

describe('leitura de commits com --numstat', () => {
  let dir: string
  beforeAll(async () => {
    dir = await repoVazio('numstat')

    await escrever(dir, 'src/velho.js', 'a\nb\nc\n')
    await escrever(dir, 'raiz-antigo.txt', 'um\ndois\n')
    await escrever(dir, 'antigo/estavel.js', 'estavel\n')
    await commitar(dir, ['chore: base do projeto'])

    // contagem de linhas + arquivo binário no mesmo commit
    await escrever(dir, 'contado.txt', 'l1\nl2\nl3\nl4\n')
    await escrever(dir, 'imagem.bin', Buffer.from([0, 1, 2, 0, 255, 0, 7]))
    await commitar(dir, ['feat: conta linhas e adiciona binário'])

    // remoção de linhas
    await escrever(dir, 'contado.txt', 'l1\n')
    await commitar(dir, ['fix: encurta arquivo'])

    // rename com prefixo comum -> formato "pre{a => b}post"
    await g(dir, ['mv', 'src/velho.js', 'src/novo.js'])
    await commitar(dir, ['refactor: renomeia dentro de src'])

    // rename sem prefixo comum -> formato "old => new"
    await g(dir, ['mv', 'raiz-antigo.txt', 'outro-nome.md'])
    await commitar(dir, ['refactor: renomeia na raiz'])
  })

  it('conta inserções e remoções por arquivo', async () => {
    const commits = await readCommits(dir)
    const conta = commits.find((c) => c.subject.includes('conta linhas'))!
    const arquivo = conta.files.find((f) => f.path === 'contado.txt')!
    expect(arquivo.insertions).toBe(4)
    expect(arquivo.deletions).toBe(0)

    const encurta = commits.find((c) => c.subject.includes('encurta'))!
    const menor = encurta.files.find((f) => f.path === 'contado.txt')!
    expect(menor.insertions).toBe(0)
    expect(menor.deletions).toBe(3)
  })

  it('conta zero linhas para arquivo binário', async () => {
    const commits = await readCommits(dir)
    const conta = commits.find((c) => c.subject.includes('conta linhas'))!
    const bin = conta.files.find((f) => f.path === 'imagem.bin')!
    expect(bin.insertions).toBe(0)
    expect(bin.deletions).toBe(0)
  })

  it('soma as linhas do commit inteiro', async () => {
    const commits = await readCommits(dir)
    const conta = commits.find((c) => c.subject.includes('conta linhas'))!
    expect(conta.insertions).toBe(4)
    expect(conta.deletions).toBe(0)
  })

  it('normaliza rename no formato "pre{a => b}post" para o caminho novo', async () => {
    const commits = await readCommits(dir)
    const c = commits.find((x) => x.subject.includes('dentro de src'))!
    expect(c.files.map((f) => f.path)).toEqual(['src/novo.js'])
  })

  it('normaliza rename no formato "old => new" para o caminho novo', async () => {
    const commits = await readCommits(dir)
    const c = commits.find((x) => x.subject.includes('na raiz'))!
    expect(c.files.map((f) => f.path)).toEqual(['outro-nome.md'])
  })

  it('lista arquivos que existem hoje mesmo fora dos commits recentes', async () => {
    const recentes = await readCommits(dir, 2)
    const tocados = new Set(recentes.flatMap((c) => c.files.map((f) => f.path)))
    expect(tocados.has('antigo/estavel.js')).toBe(false)

    const rastreados = await readTrackedFiles(dir)
    expect(rastreados).toContain('antigo/estavel.js')
  })

  it('respeita o limite de commits pedido', async () => {
    const commits = await readCommits(dir, 2)
    expect(commits).toHaveLength(2)
  })
})

// -------------------------------------------------------------------- merge

it('marca commit de merge com isMerge verdadeiro', async () => {
  const dir = await repoVazio('merge')
  await escrever(dir, 'base.txt', 'base\n')
  await commitar(dir, ['chore: base'])

  await g(dir, ['checkout', '-b', 'lado'])
  await escrever(dir, 'lado.txt', 'lado\n')
  await commitar(dir, ['feat: trabalho do lado'])

  await g(dir, ['checkout', 'main'])
  await escrever(dir, 'main.txt', 'main\n')
  await commitar(dir, ['feat: trabalho da main'])
  await g(dir, ['merge', '--no-ff', '-m', 'Merge do lado', 'lado'])

  const commits = await readCommits(dir)
  const merge = commits.find((c) => c.subject.startsWith('Merge do lado'))!
  expect(merge.isMerge).toBe(true)
  expect(commits.filter((c) => !c.isMerge).every((c) => c.isMerge === false)).toBe(true)
})

// ----------------------------------------------------------- agente e disco

describe('detecção de agente e estado do disco', () => {
  let dir: string
  beforeAll(async () => {
    dir = await repoVazio('agente')
    await escrever(dir, 'humano.txt', 'feito a mao\n')
    await commitar(dir, ['feat: escrito por pessoa'])
    await escrever(dir, 'ia.txt', 'feito pela ia\n')
    await commitar(dir, [
      'feat: escrito pelo agente',
      'Explica o motivo.\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    ])
  })

  it('detecta o agente pelo trailer Co-Authored-By: Claude', async () => {
    const commits = await readCommits(dir)
    const ia = commits.find((c) => c.subject.includes('pelo agente'))!
    expect(ia.agent).toBe('claude-code')
  })

  it('não inventa agente em commit humano', async () => {
    const commits = await readCommits(dir)
    const humano = commits.find((c) => c.subject.includes('por pessoa'))!
    expect(humano.agent).toBeNull()
  })

  it('separa o assunto do corpo do commit', async () => {
    const commits = await readCommits(dir)
    const ia = commits.find((c) => c.subject.includes('pelo agente'))!
    expect(ia.subject).toBe('feat: escrito pelo agente')
    expect(ia.body).toContain('Explica o motivo.')
  })

  it('separa arquivos não rastreados de arquivos modificados', async () => {
    await escrever(dir, 'novinho.txt', 'nunca visto\n')
    await escrever(dir, 'humano.txt', 'feito a mao\nmais uma linha\n')

    const { untracked, modified } = await readWorkingFiles(dir)
    expect(untracked).toContain('novinho.txt')
    expect(untracked).not.toContain('humano.txt')
    expect(modified).toContain('humano.txt')
    expect(modified).not.toContain('novinho.txt')
  })

  it('não devolve nada de trabalho pendente fora de um repositório git', async () => {
    const fora = await criarDir('fora')
    await expect(readWorkingFiles(fora)).resolves.toEqual({ untracked: [], modified: [] })
  })
})
