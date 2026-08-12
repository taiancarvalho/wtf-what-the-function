import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { GERADOS, apagarGerado, listarGerados } from '../electron/gerados.js'

let raiz: string
let contador = 0

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-gerados-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

/** Um projeto com todos os documentos gerados no lugar. */
async function projetoCheio(): Promise<string> {
  const dir = path.join(raiz, `p${contador++}`)
  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  for (const rel of Object.values(GERADOS) as string[]) {
    await writeFile(path.join(dir, rel), 'conteudo', 'utf8')
  }
  return dir
}

describe('a lixeira dos documentos gerados', () => {
  it('lista o que existe, com tamanho e data', async () => {
    const dir = await projetoCheio()
    const lista = await listarGerados(dir)
    expect(lista.map((g: { chave: string }) => g.chave).sort()).toEqual(
      Object.keys(GERADOS).sort(),
    )
    for (const g of lista) {
      expect(g.bytes).toBeGreaterThan(0)
      expect(Date.parse(g.alteradoEm)).not.toBeNaN()
    }
  })

  it('apaga um, e só aquele um', async () => {
    const dir = await projetoCheio()
    const r = await apagarGerado(dir, 'guardrails')
    expect(r.ok).toBe(true)

    const restantes = (await listarGerados(dir)).map((g: { chave: string }) => g.chave)
    expect(restantes).not.toContain('guardrails')
    expect(restantes).toContain('pastas')
    expect(restantes).toContain('mapa')
  })

  it('apagar de novo não é erro — o resultado desejado já é o atual', async () => {
    const dir = await projetoCheio()
    await apagarGerado(dir, 'pastas')
    expect((await apagarGerado(dir, 'pastas')).ok).toBe(true)
  })

  /**
   * O renderer manda uma CHAVE, nunca um caminho. Estes três testes são a
   * razão de ser dessa escolha: cada um deles seria um arquivo apagado fora do
   * projeto se a porta aceitasse caminho.
   */
  describe('não apaga o que não é dela', () => {
    it('recusa uma chave que não está na lista', async () => {
      const dir = await projetoCheio()
      expect((await apagarGerado(dir, 'events')).erro).toBeTruthy()
      expect((await apagarGerado(dir, 'package.json')).erro).toBeTruthy()
      expect((await apagarGerado(dir, '../../etc/hosts')).erro).toBeTruthy()
    })

    it('o histórico do que a IA declarou NÃO é apagável por aqui', async () => {
      // Apagar `events.jsonl` é outra decisão, com outro peso. Se um dia ela
      // existir, será com a sua própria confirmação — não por este caminho.
      expect(Object.values(GERADOS)).not.toContain('.wtf/events.jsonl')
      const dir = await projetoCheio()
      await writeFile(path.join(dir, '.wtf', 'events.jsonl'), '{}', 'utf8')
      for (const chave of Object.keys(GERADOS)) await apagarGerado(dir, chave)
      expect(await readdir(path.join(dir, '.wtf'))).toContain('events.jsonl')
    })

    it('sem projeto aberto não apaga nada', async () => {
      expect((await apagarGerado(null, 'guardrails')).erro).toBeTruthy()
    })
  })
})
