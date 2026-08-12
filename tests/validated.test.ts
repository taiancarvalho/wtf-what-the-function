import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import {
  aplicarValidados,
  assinaturaDe,
  alternarValidado,
  lerValidados,
} from '../electron/validated.js'

let raiz: string
let contador = 0

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-validated-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

async function projeto(conteudo?: string): Promise<string> {
  const dir = path.join(raiz, `p${contador++}`)
  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  if (conteudo !== undefined) {
    await writeFile(path.join(dir, '.wtf', 'validated.json'), conteudo, 'utf8')
  }
  return dir
}

const T = (min: number) => new Date(Date.UTC(2026, 0, 10, 12, min, 0)).toISOString()

function feature(over: Record<string, unknown> = {}) {
  return {
    id: 'f-login',
    name: 'Entrar na conta',
    state: 'tested',
    files: ['src/login.ts', 'src/senha.ts'],
    lastTouchedAt: T(0),
    ...over,
  }
}

const snap = (...features: any[]) => ({ project: {}, features, events: [] })

describe('assinaturaDe', () => {
  it('devolve a mesma assinatura para a mesma feature', () => {
    expect(assinaturaDe(feature())).toBe(assinaturaDe(feature()))
  })

  it('não depende da ordem em que os arquivos aparecem', () => {
    const a = assinaturaDe(feature({ files: ['a.ts', 'b.ts'] }))
    const b = assinaturaDe(feature({ files: ['b.ts', 'a.ts'] }))
    expect(a).toBe(b)
  })

  it('muda quando a data do último toque muda', () => {
    expect(assinaturaDe(feature())).not.toBe(assinaturaDe(feature({ lastTouchedAt: T(30) })))
  })

  it('muda quando a lista de arquivos muda', () => {
    expect(assinaturaDe(feature())).not.toBe(
      assinaturaDe(feature({ files: ['src/login.ts', 'src/senha.ts', 'src/novo.ts'] })),
    )
  })

  it('devolve texto vazio quando não recebe feature', () => {
    expect(assinaturaDe(null)).toBe('')
  })
})

describe('lerValidados — leitura tolerante', () => {
  it('devolve mapa vazio quando o arquivo não existe', async () => {
    expect(await lerValidados(await projeto())).toEqual({})
  })

  it('devolve mapa vazio quando o arquivo está corrompido', async () => {
    expect(await lerValidados(await projeto('{ isto nao e json'))).toEqual({})
  })

  it('devolve mapa vazio quando o formato não tem itens', async () => {
    expect(await lerValidados(await projeto('{"v":1}'))).toEqual({})
  })

  it('descarta o item podre e preserva os bons', async () => {
    const dir = await projeto(
      JSON.stringify({
        v: 1,
        itens: {
          'f-bom': { at: T(1), assinatura: 'abc' },
          'f-ruim': { at: 'quinta passada', assinatura: 'x' },
        },
      }),
    )

    const itens = await lerValidados(dir)
    expect(Object.keys(itens)).toEqual(['f-bom'])
  })
})

describe('alternarValidado', () => {
  it('aprova uma feature que ainda não estava aprovada', async () => {
    const dir = await projeto()
    const f = feature()

    const r = await alternarValidado(dir, f.id, assinaturaDe(f))

    expect(r.validado).toBe(true)
    expect((await lerValidados(dir))[f.id]).toBeTruthy()
  })

  it('desfaz a aprovação quando a assinatura é a MESMA', async () => {
    const dir = await projeto()
    const f = feature()
    const assinatura = assinaturaDe(f)

    await alternarValidado(dir, f.id, assinatura)
    const r = await alternarValidado(dir, f.id, assinatura)

    expect(r.validado).toBe(false)
    expect(await lerValidados(dir)).toEqual({})
  })

  it('reaprova em vez de apagar quando a assinatura é DIFERENTE', async () => {
    const dir = await projeto()
    const f = feature()

    await alternarValidado(dir, f.id, assinaturaDe(f))
    const nova = assinaturaDe(feature({ lastTouchedAt: T(30) }))
    const r = await alternarValidado(dir, f.id, nova)

    expect(r.validado).toBe(true)
    expect((await lerValidados(dir))[f.id].assinatura).toBe(nova)
  })

  it('persiste a aprovação entre leituras', async () => {
    const dir = await projeto()
    await alternarValidado(dir, 'f-login', 'sig-1')

    expect((await lerValidados(dir))['f-login'].assinatura).toBe('sig-1')
  })

  it('não aprova nada quando não recebe id de feature', async () => {
    const dir = await projeto()
    const r = await alternarValidado(dir, '', 'sig')

    expect(r.validado).toBe(false)
  })
})

describe('aplicarValidados', () => {
  it('carimba validated numa feature tested com assinatura igual', () => {
    const f = feature({ state: 'tested' })
    const s = snap(f)
    aplicarValidados(s, { 'f-login': { at: T(1), assinatura: assinaturaDe(f) } })

    expect(s.features[0].state).toBe('validated')
  })

  it('carimba validated numa feature implemented com assinatura igual', () => {
    const f = feature({ state: 'implemented' })
    const s = snap(f)
    aplicarValidados(s, { 'f-login': { at: T(1), assinatura: assinaturaDe(f) } })

    expect(s.features[0].state).toBe('validated')
  })

  it('nunca transforma uma feature planned em validated', () => {
    const f = feature({ state: 'planned' })
    const s = snap(f)
    aplicarValidados(s, { 'f-login': { at: T(1), assinatura: assinaturaDe(f) } })

    expect(s.features[0].state).toBe('planned')
  })

  it('tira a aprovação quando a data do último toque mudou', () => {
    const aprovada = assinaturaDe(feature({ lastTouchedAt: T(0) }))
    const f = feature({ state: 'tested', lastTouchedAt: T(50) })
    const s = snap(f)
    aplicarValidados(s, { 'f-login': { at: T(1), assinatura: aprovada } })

    expect(s.features[0].state).toBe('tested')
    expect(s.features[0].revalidar).toBe(true)
  })

  it('tira a aprovação quando a lista de arquivos mudou', () => {
    const aprovada = assinaturaDe(feature())
    const f = feature({ state: 'tested', files: ['src/login.ts'] })
    const s = snap(f)
    aplicarValidados(s, { 'f-login': { at: T(1), assinatura: aprovada } })

    expect(s.features[0].state).not.toBe('validated')
    expect(s.features[0].revalidar).toBe(true)
  })

  it('preserva a data da aprovação antiga ao pedir revalidação', () => {
    const aprovada = assinaturaDe(feature())
    const f = feature({ state: 'tested', files: ['src/login.ts'] })
    const s = snap(f)
    aplicarValidados(s, { 'f-login': { at: T(1), assinatura: aprovada } })

    expect(s.features[0].validadoEm).toBe(T(1))
  })

  it('não marca revalidar quando nada mudou', () => {
    const f = feature({ state: 'tested' })
    const s = snap(f)
    aplicarValidados(s, { 'f-login': { at: T(1), assinatura: assinaturaDe(f) } })

    expect(s.features[0].revalidar).toBeUndefined()
  })

  it('ignora features sem entrada de aprovação', () => {
    const f = feature({ state: 'tested' })
    const s = snap(f)
    aplicarValidados(s, { 'f-outra': { at: T(1), assinatura: 'x' } })

    expect(s.features[0].state).toBe('tested')
  })
})
