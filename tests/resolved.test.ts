import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { alternarResolvido, aplicarResolvidos, lerResolvidos } from '../electron/resolved.js'
import { pedeAtencao } from '@/types/protocol'
import type { WtfEvent } from '@/types/protocol'

let raiz: string
let contador = 0

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-resolved-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

async function projeto(conteudo?: string): Promise<string> {
  const dir = path.join(raiz, `p${contador++}`)
  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  if (conteudo !== undefined) {
    await writeFile(path.join(dir, '.wtf', 'resolved.json'), conteudo, 'utf8')
  }
  return dir
}

const T = (min: number) => new Date(Date.UTC(2026, 0, 10, 12, min, 0)).toISOString()

function evento(over: Record<string, unknown> = {}, human: Record<string, unknown> = {}): WtfEvent {
  return {
    id: 'aviso-1',
    at: T(1),
    type: 'code.changed',
    source: 'git',
    featureId: 'f-1',
    human: {
      headline: 'Alguma coisa mudou',
      what: '',
      why: '',
      impact: '',
      affects: [],
      needsYourAttention: true,
      ...human,
    },
    ...over,
  } as unknown as WtfEvent
}

describe('lerResolvidos — leitura tolerante', () => {
  it('devolve mapa vazio quando o arquivo não existe', async () => {
    expect(await lerResolvidos(await projeto())).toEqual({})
  })

  it('devolve mapa vazio quando o arquivo está corrompido', async () => {
    expect(await lerResolvidos(await projeto('nada de json aqui'))).toEqual({})
  })

  it('devolve mapa vazio quando não existe pasta de projeto informada', async () => {
    expect(await lerResolvidos('')).toEqual({})
  })

  it('descarta a entrada com data inválida e mantém as boas', async () => {
    const dir = await projeto(
      JSON.stringify({
        v: 1,
        itens: { bom: { at: T(2), por: 'usuario' }, ruim: { at: 'sei lá', por: 'usuario' } },
      }),
    )

    expect(Object.keys(await lerResolvidos(dir))).toEqual(['bom'])
  })
})

describe('alternarResolvido', () => {
  it('marca um aviso como resolvido e persiste', async () => {
    const dir = await projeto()
    const r = await alternarResolvido(dir, 'aviso-1')

    expect(r.resolvido).toBe(true)
    expect((await lerResolvidos(dir))['aviso-1']).toBeTruthy()
  })

  it('desmarca o aviso no segundo clique e persiste', async () => {
    const dir = await projeto()
    await alternarResolvido(dir, 'aviso-1')
    const r = await alternarResolvido(dir, 'aviso-1')

    expect(r.resolvido).toBe(false)
    expect(await lerResolvidos(dir)).toEqual({})
  })

  it('não afeta os outros avisos já resolvidos', async () => {
    const dir = await projeto()
    await alternarResolvido(dir, 'aviso-1')
    await alternarResolvido(dir, 'aviso-2')
    await alternarResolvido(dir, 'aviso-1')

    expect(Object.keys(await lerResolvidos(dir))).toEqual(['aviso-2'])
  })

  it('não escreve nada quando não recebe id de evento', async () => {
    const dir = await projeto()
    const r = await alternarResolvido(dir, '')

    expect(r.resolvido).toBe(false)
    expect(await lerResolvidos(dir)).toEqual({})
  })
})

describe('aplicarResolvidos', () => {
  it('carimba resolvido no evento correspondente', () => {
    const s = { events: [evento()] } as any
    aplicarResolvidos(s, { 'aviso-1': { at: T(5), por: 'usuario' } })

    expect(s.events[0].resolvido).toEqual({ at: T(5), por: 'usuario' })
  })

  it('não apaga o needsYourAttention original', () => {
    const s = { events: [evento()] } as any
    aplicarResolvidos(s, { 'aviso-1': { at: T(5), por: 'usuario' } })

    expect(s.events[0].human.needsYourAttention).toBe(true)
  })
})

describe('pedeAtencao', () => {
  it('responde true para aviso pendente sem resposta nem resolução', () => {
    expect(pedeAtencao(evento())).toBe(true)
  })

  it('responde false quando o aviso já foi respondido pela IA', () => {
    const e = evento({ respondidoPor: { eventId: 'r1', at: T(5), texto: 'conferido' } })
    expect(pedeAtencao(e)).toBe(false)
  })

  it('responde false quando a pessoa marcou como resolvido', () => {
    const e = evento({ resolvido: { at: T(5), por: 'usuario' } })
    expect(pedeAtencao(e)).toBe(false)
  })

  it('responde false para evento que nunca pediu atenção', () => {
    expect(pedeAtencao(evento({}, { needsYourAttention: false }))).toBe(false)
  })
})
