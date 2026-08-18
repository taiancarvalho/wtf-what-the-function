import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulos do processo main, sem tipos
import { instalar } from '../electron/installer.js'
// @ts-expect-error idem
import { itensDoProjeto, historicoPreservado, levantar, remover } from '../electron/desinstalacao.js'
// @ts-expect-error idem
import { registrarProjeto } from '../electron/projects.js'

/**
 * `wtf --del` apaga arquivo em pasta que não é a dele, em vários projetos de
 * uma vez. Três coisas não podem acontecer nunca, e é o que este arquivo trava:
 *
 *   1. levar embora o `AGENTS.md` de quem trabalha no projeto;
 *   2. apagar o histórico — o que a IA declarou, as traduções já pagas, o que
 *      a pessoa aprovou. Isso é dela, não componente nosso;
 *   3. parar tudo porque UM projeto falhou.
 */
let raiz: string
let contador = 0

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-del-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
})

const DA_CASA = '# Regras da casa\n\nNunca use `any` em TypeScript.\n'

async function projetoInstalado(comAgents = true) {
  const dir = path.join(raiz, `p${contador++}`)
  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  if (comAgents) await writeFile(path.join(dir, 'AGENTS.md'), DA_CASA, 'utf8')
  await instalar(dir)
  return dir
}

const existe = (p: string) =>
  readFile(p, 'utf8').then(
    () => true,
    () => false,
  )

describe('levantar o que será removido', () => {
  it('lista as peças do WTF, e marca as que saem só em parte', async () => {
    const dir = await projetoInstalado()
    const itens = await itensDoProjeto(dir)

    expect(itens).toContain('.claude/skills/wtf/SKILL.md')
    expect(itens).toContain('.wtf/bin/wtf-claim.cjs')
    // Nos arquivos que podem ser de terceiros, a lista diz que só o trecho sai.
    expect(itens.some((i: string) => i.startsWith('AGENTS.md') && i.includes('trecho'))).toBe(true)
  })

  it('projeto sem WTF não aparece na lista', async () => {
    const dir = path.join(raiz, `vazio${contador++}`)
    await mkdir(dir, { recursive: true })
    expect(await itensDoProjeto(dir)).toHaveLength(0)
  })

  /*
   * O `AGENTS.md` pode existir sem nada nosso dentro. Prometer removê-lo seria
   * anunciar que vamos mexer num arquivo que não é do WTF.
   */
  it('AGENTS.md sem o nosso trecho não conta como peça do WTF', async () => {
    const dir = path.join(raiz, `alheio${contador++}`)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'AGENTS.md'), DA_CASA, 'utf8')
    expect(await itensDoProjeto(dir)).toHaveLength(0)
  })

  it('diz qual histórico vai FICAR', async () => {
    const dir = await projetoInstalado()
    await writeFile(path.join(dir, '.wtf', 'events.jsonl'), '{"v":1}\n', 'utf8')
    await writeFile(path.join(dir, '.wtf', 'validated.json'), '{"v":1}\n', 'utf8')

    const fica = await historicoPreservado(dir)
    expect(fica).toContain('events.jsonl')
    expect(fica).toContain('validated.json')
  })
})

describe('remover de tudo', () => {
  it('tira as peças e devolve o AGENTS.md byte a byte ao que era', async () => {
    const casa = path.join(raiz, `casa${contador++}`)
    const dir = await projetoInstalado()
    await registrarProjeto(dir, casa)

    const plano = await levantar(casa)
    const r = await remover(plano, casa)

    expect(r.falhas).toHaveLength(0)
    expect(await existe(path.join(dir, '.claude/skills/wtf/SKILL.md'))).toBe(false)
    expect(await readFile(path.join(dir, 'AGENTS.md'), 'utf8')).toBe(DA_CASA)
  })

  it('o histórico do projeto sobrevive — ele é da pessoa, não nosso', async () => {
    const casa = path.join(raiz, `casa${contador++}`)
    const dir = await projetoInstalado()
    await writeFile(path.join(dir, '.wtf', 'events.jsonl'), '{"declarei":true}\n', 'utf8')
    await registrarProjeto(dir, casa)

    await remover(await levantar(casa), casa)

    expect(await readFile(path.join(dir, '.wtf', 'events.jsonl'), 'utf8')).toBe('{"declarei":true}\n')
    // ...mas as PEÇAS que moram dentro de `.wtf/` saem.
    expect(await existe(path.join(dir, '.wtf/bin/wtf-claim.cjs'))).toBe(false)
  })

  it('limpa vários projetos numa passada só', async () => {
    const casa = path.join(raiz, `casa${contador++}`)
    const a = await projetoInstalado()
    const b = await projetoInstalado()
    await registrarProjeto(a, casa)
    await registrarProjeto(b, casa)

    const r = await remover(await levantar(casa), casa)

    expect(r.falhas).toHaveLength(0)
    for (const dir of [a, b]) {
      expect(await existe(path.join(dir, '.claude/skills/wtf/SKILL.md'))).toBe(false)
    }
  })

  it('sem nada instalado, o levantamento diz que não há o que fazer', async () => {
    const casa = path.join(raiz, `casa${contador++}`)
    const plano = await levantar(casa)
    expect(plano.projetos).toHaveLength(0)
    expect(plano.nada).toBe(true)
  })
})
