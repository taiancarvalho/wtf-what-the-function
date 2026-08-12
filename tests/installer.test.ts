import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulos do processo main, sem tipos
import { ALVOS, estadoInstalacao, instalar } from '../electron/installer.js'
// @ts-expect-error idem
import { lerPacoteInstalacao } from '../electron/disclosure.js'

let raiz: string
let contador = 0

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-installer-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

function novoProjeto(): string {
  return path.join(raiz, `p${contador++}`)
}

/**
 * O bug que este arquivo existe para não deixar voltar.
 *
 * Uma skill nova entra em ALVOS e, de um dia para o outro, TODO projeto já
 * instalado passa a se declarar não instalado — e o app oferece "ligar o WTF
 * neste projeto" para quem ligou semanas atrás e está com ele funcionando.
 * Aconteceu de verdade quando a skill de guardrails chegou.
 */
describe('instalação já feita, e o WTF ganhou uma peça nova', () => {
  it('some uma skill do disco: continua LIGADO, e pede atualização — não instalação', async () => {
    const dir = novoProjeto()
    await instalar(dir)

    const antes = await estadoInstalacao(dir)
    expect(antes.instalado).toBe(true)
    expect(antes.desatualizado).toBe(false)

    // Exatamente o que acontece quando a versão nova traz um alvo que a
    // instalação antiga não tinha: o arquivo simplesmente não está lá.
    await rm(path.join(dir, ALVOS.guardrails[0]), { force: true })

    const depois = await estadoInstalacao(dir)
    expect(depois.instalado).toBe(false)
    expect(depois.desatualizado).toBe(true)
    expect(depois.projeto.habilitado).toBe(true)
  })

  it('projeto que nunca foi habilitado NÃO é "desatualizado" — é novo mesmo', async () => {
    const estado = await estadoInstalacao(novoProjeto())
    expect(estado.instalado).toBe(false)
    expect(estado.desatualizado).toBe(false)
  })

  it('reinstalar por cima devolve o projeto ao estado ligado', async () => {
    const dir = novoProjeto()
    await instalar(dir)
    await rm(path.join(dir, ALVOS.guardrails[0]), { force: true })
    expect((await estadoInstalacao(dir)).desatualizado).toBe(true)

    await instalar(dir)
    const depois = await estadoInstalacao(dir)
    expect(depois.instalado).toBe(true)
    expect(depois.desatualizado).toBe(false)
  })
})

/**
 * A tela de transparência promete dizer o que vai ser escrito no computador da
 * pessoa. Um alvo sem rótulo aparecia ali como uma linha em branco — a tela
 * falhando na única coisa que ela faz.
 */
describe('todo alvo tem nome na tela de transparência', () => {
  it('nenhum item do pacote sai sem título', async () => {
    const pacote = await lerPacoteInstalacao(novoProjeto())
    const todos = [...pacote.itens, ...pacote.global.itens, ...pacote.projeto.itens]
    expect(todos.length).toBeGreaterThan(0)
    for (const item of todos) {
      expect(item.titulo, `sem título: ${item.destino}`).toBeTruthy()
      expect(item.proposito, `sem propósito: ${item.destino}`).toBeTruthy()
    }
  })

  it('cada alvo tem um arquivo de origem que existe de verdade', async () => {
    const pacote = await lerPacoteInstalacao(novoProjeto())
    for (const item of pacote.itens) {
      expect(item.erro, `origem faltando: ${item.origem}`).toBeUndefined()
      expect(item.bytes).toBeGreaterThan(0)
    }
  })
})

/**
 * `/btw` é o único alvo que a PESSOA digita. Se o nome da pasta mudar, o
 * comando muda junto e o que estava documentado deixa de existir.
 */
describe('o comando /btw', () => {
  it('mora numa pasta chamada exatamente "btw"', () => {
    expect(ALVOS.btw[0]).toBe('.claude/skills/btw/SKILL.md')
  })

  it('é instalado junto com o resto', async () => {
    const dir = novoProjeto()
    await instalar(dir)
    expect((await estadoInstalacao(dir)).btw).toBe(true)
  })
})
