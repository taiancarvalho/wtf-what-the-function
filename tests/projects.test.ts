/**
 * O registro dos projetos já abertos — e o resumo barato de cada um.
 *
 * Duas coisas aqui não podem quebrar nunca, e é por elas que este arquivo
 * existe:
 *
 *  1. ESQUECER UM PROJETO NÃO MEXE NO PROJETO. "Esquecer" é tirar da lista de
 *     atalhos; se um dia virar apagar arquivo, o teste cai.
 *  2. RESUMIR UM PROJETO CUSTA ZERO. Nenhuma escrita em disco, nenhuma chamada
 *     a modelo. A lista é desenhada com N projetos de uma vez; se cada um
 *     custasse uma chamada, a pessoa pagaria por olhar uma tela.
 *
 * Tudo roda em diretórios temporários, com `WTF_HOME` apontado para lá: nada
 * toca no `userData` real nem em projeto nenhum de quem está desenvolvendo.
 */

import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  esquecerProjeto,
  fixarProjeto,
  lerProjetos,
  registrarProjeto,
  resumirTodos,
  resumoDe,
} from '../electron/projects.js'

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

async function repo(prefixo = 'proj') {
  const dir = await criarDir(prefixo)
  await g(dir, ['init', '-b', 'main'])
  await g(dir, ['config', 'user.email', 'teste@example.com'])
  await g(dir, ['config', 'user.name', 'Pessoa de Teste'])
  await g(dir, ['config', 'commit.gpgsign', 'false'])
  return dir
}

async function escrever(dir: string, rel: string, conteudo: string) {
  const alvo = path.join(dir, rel)
  await fs.mkdir(path.dirname(alvo), { recursive: true })
  await fs.writeFile(alvo, conteudo)
}

async function commitar(dir: string, mensagem: string) {
  await g(dir, ['add', '-A'])
  await g(dir, ['commit', '-m', mensagem])
}

/** Retrato do diretório: cada arquivo, seu tamanho e seu conteúdo. */
async function retrato(dir: string): Promise<string[]> {
  const out: string[] = []
  async function andar(atual: string) {
    for (const item of (await fs.readdir(atual, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const cheio = path.join(atual, item.name)
      const rel = path.relative(dir, cheio)
      if (item.isDirectory()) {
        out.push(`d ${rel}`)
        await andar(cheio)
      } else {
        const bruto = await fs.readFile(cheio)
        out.push(`f ${rel} ${bruto.length} ${bruto.toString('base64')}`)
      }
    }
  }
  await andar(dir)
  return out
}

let casa: string

beforeEach(async () => {
  casa = await criarDir('home')
  process.env.WTF_HOME = casa
})

afterAll(async () => {
  delete process.env.WTF_HOME
  for (const dir of criados) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

// ------------------------------------------------------------------ registro

describe('registro dos projetos abertos', () => {
  it('mora fora de qualquer projeto observado', async () => {
    const dir = await criarDir('p')
    await registrarProjeto(dir)
    // O arquivo está na casa do APLICATIVO, e o projeto continua intocado.
    expect(await fs.readFile(path.join(casa, 'projetos.json'), 'utf8')).toContain('projetos')
    expect(await fs.readdir(dir)).toEqual([])
  })

  it('acrescenta o projeto com nome e data de abertura', async () => {
    const dir = await criarDir('portal')
    const lista = await registrarProjeto(dir)
    expect(lista).toHaveLength(1)
    expect(lista[0].caminho).toBe(dir)
    expect(lista[0].nome).toBe(path.basename(dir))
    expect(typeof lista[0].ultimaAberturaEm).toBe('string')
  })

  it('atualiza a data em vez de duplicar quando o projeto volta a ser aberto', async () => {
    const dir = await criarDir('p')
    await registrarProjeto(dir, undefined, new Date('2026-01-01T10:00:00Z'))
    const lista = await registrarProjeto(dir, undefined, new Date('2026-02-02T10:00:00Z'))
    expect(lista).toHaveLength(1)
    expect(lista[0].ultimaAberturaEm).toBe('2026-02-02T10:00:00.000Z')
  })

  it('deduplica pelo caminho resolvido', async () => {
    const dir = await criarDir('p')
    await registrarProjeto(dir)
    await registrarProjeto(path.join(dir, '.'))
    await registrarProjeto(`${dir}/`)
    expect(await lerProjetos()).toHaveLength(1)
  })

  it('ordena por abertura mais recente, com os fixados sempre na frente', async () => {
    const antigo = await criarDir('antigo')
    const meio = await criarDir('meio')
    const novo = await criarDir('novo')
    await registrarProjeto(antigo, undefined, new Date('2026-01-01T00:00:00Z'))
    await registrarProjeto(meio, undefined, new Date('2026-02-01T00:00:00Z'))
    await registrarProjeto(novo, undefined, new Date('2026-03-01T00:00:00Z'))

    expect((await lerProjetos()).map((p) => p.caminho)).toEqual([novo, meio, antigo])

    await fixarProjeto(antigo, true)
    expect((await lerProjetos()).map((p) => p.caminho)).toEqual([antigo, novo, meio])

    await fixarProjeto(antigo, false)
    expect((await lerProjetos()).map((p) => p.caminho)).toEqual([novo, meio, antigo])
  })

  it('marca com `sumiu` o caminho que não existe mais — sem tirá-lo da lista', async () => {
    const dir = await criarDir('some')
    await registrarProjeto(dir)
    await fs.rm(dir, { recursive: true, force: true })

    const lista = await lerProjetos()
    expect(lista).toHaveLength(1)
    expect(lista[0].sumiu).toBe(true)
  })

  it('esquecer tira da lista e NÃO toca no projeto', async () => {
    const dir = await repo('esquecido')
    await escrever(dir, 'README.md', '# oi\n')
    await escrever(dir, '.wtf/events.jsonl', '')
    await commitar(dir, 'primeiro')
    await registrarProjeto(dir)

    const antes = await retrato(dir)
    const lista = await esquecerProjeto(dir)

    expect(lista).toHaveLength(0)
    // Nada do projeto mudou: nem arquivo apagado, nem conteúdo alterado.
    expect(await retrato(dir)).toEqual(antes)
  })

  it('lista vazia quando o arquivo não existe ou está corrompido', async () => {
    expect(await lerProjetos()).toEqual([])
    await fs.writeFile(path.join(casa, 'projetos.json'), '{isso não é json', 'utf8')
    expect(await lerProjetos()).toEqual([])
    await fs.writeFile(path.join(casa, 'projetos.json'), '{"v":1,"projetos":"nada"}', 'utf8')
    expect(await lerProjetos()).toEqual([])
  })
})

// -------------------------------------------------------------------- resumo

describe('resumo barato de um projeto', () => {
  it('conta pendências, arquivos não salvos e o último evento da IA', async () => {
    const dir = await repo('resumo')
    await escrever(dir, 'src/app.ts', 'export const x = 1\n')
    await commitar(dir, 'feat: primeira parte')
    // `package.json` é um dos sinais que pedem atenção (ver translate.js).
    await escrever(dir, 'package.json', '{"name":"exemplo"}\n')
    await commitar(dir, 'chore: dependências')

    await escrever(dir, 'rascunho.txt', 'ainda não salvo\n')
    await escrever(dir, 'src/app.ts', 'export const x = 2\n')

    const agora = new Date().toISOString()
    await escrever(
      dir,
      '.wtf/events.jsonl',
      `${JSON.stringify({ kind: 'claim.started', at: agora, feature: 'Telas', sessionId: 's1', id: 'e1', text: 'mexendo' })}\n`,
    )

    const r = await resumoDe(dir)
    expect(r.erro).toBeUndefined()
    expect(r.nome).toBe(path.basename(dir))
    expect(r.pendencias).toBe(1)
    // dois arquivos novos (o rascunho e o .wtf/events.jsonl) + um modificado
    expect(r.naoSalvos).toBe(3)
    expect(r.ultimoEventoEm).toBe(agora)
    expect(r.ativo).toBe(true)
    expect(r.habilitado).toBe(true)
  })

  it('declaração velha não conta como projeto ativo', async () => {
    const dir = await repo('parado')
    await escrever(dir, 'a.txt', 'a\n')
    await commitar(dir, 'feat: algo')
    const antigo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    await escrever(
      dir,
      '.wtf/events.jsonl',
      `${JSON.stringify({ kind: 'claim.completed', at: antigo, feature: 'Telas', id: 'e9' })}\n`,
    )

    const r = await resumoDe(dir)
    expect(r.ultimoEventoEm).toBe(antigo)
    expect(r.ativo).toBe(false)
  })

  it('devolve erro em vez de lançar quando a pasta não é um repositório', async () => {
    const dir = await criarDir('sem-git')
    const r = await resumoDe(dir)
    expect(r.erro).toBeTruthy()
    expect(r.pendencias).toBe(0)
  })

  /*
   * CUSTO ZERO — a prova.
   *
   * Se um dia alguém acrescentar aqui uma tradução, um cache ou um contador,
   * este teste cai: o retrato do diretório inclui conteúdo de cada arquivo.
   */
  it('não escreve NADA no projeto ao resumir', async () => {
    const dir = await repo('intocado')
    await escrever(dir, 'src/tela.ts', 'export const y = 1\n')
    await escrever(dir, 'package.json', '{"name":"x"}\n')
    await commitar(dir, 'feat: tela nova')
    await escrever(
      dir,
      '.wtf/events.jsonl',
      `${JSON.stringify({ kind: 'claim.completed', at: new Date().toISOString(), feature: 'Tela', id: 'e1' })}\n`,
    )

    const antes = await retrato(dir)
    await resumoDe(dir)
    await resumoDe(dir)
    expect(await retrato(dir)).toEqual(antes)
  })

  it('não chama o modelo: o contador de consumo não nasce nem se mexe', async () => {
    const dir = await repo('sem-modelo')
    await escrever(dir, 'src/a.ts', 'export const a = 1\n')
    await commitar(dir, 'feat: a')

    // Sem uso nenhum: resumir não pode criar o arquivo de consumo.
    await resumoDe(dir)
    await expect(fs.access(path.join(dir, '.wtf', 'usage.json'))).rejects.toThrow()

    // Com um consumo já registrado: resumir não pode incrementá-lo.
    const usoAntes = '{"v":1,"traducoes":{"chamadas":2,"eventos":5,"cache":1},"perguntas":{"chamadas":0,"porProvedor":{}},"desde":"2026-01-01T00:00:00.000Z"}\n'
    await escrever(dir, '.wtf/usage.json', usoAntes)
    await resumoDe(dir)
    expect(await fs.readFile(path.join(dir, '.wtf', 'usage.json'), 'utf8')).toBe(usoAntes)
  })
})

describe('resumo de todos os projetos', () => {
  it('um projeto quebrado não derruba a lista', async () => {
    const bom = await repo('bom')
    await escrever(bom, 'a.txt', 'a\n')
    await commitar(bom, 'feat: a')
    const ruim = await criarDir('ruim')
    await fs.rm(ruim, { recursive: true, force: true })

    await registrarProjeto(bom)
    await registrarProjeto(ruim)

    const resumos = await resumirTodos()
    expect(resumos).toHaveLength(2)
    expect(resumos.find((r) => r.caminho === bom)?.erro).toBeUndefined()
    expect(resumos.find((r) => r.caminho === ruim)?.erro).toBeTruthy()
  })

  it('devolve um resumo por caminho pedido, na mesma ordem', async () => {
    const a = await repo('a')
    await escrever(a, 'x.txt', 'x\n')
    await commitar(a, 'feat: x')
    const b = await repo('b')
    await escrever(b, 'y.txt', 'y\n')
    await commitar(b, 'feat: y')

    const resumos = await resumirTodos([a, b])
    expect(resumos.map((r) => r.caminho)).toEqual([a, b])
  })
})
