import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { CONFIG_PADRAO, lerConfig, nomeDoIdioma, salvarConfig } from '../electron/config.js'

let raiz: string
let contador = 0

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-config-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

async function projeto(conteudo?: string): Promise<string> {
  const dir = path.join(raiz, `p${contador++}`)
  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  if (conteudo !== undefined) {
    await writeFile(path.join(dir, '.wtf', 'config.json'), conteudo, 'utf8')
  }
  return dir
}

describe('lerConfig — padrões', () => {
  it('devolve os padrões quando não existe arquivo de configuração', async () => {
    expect(await lerConfig(await projeto())).toEqual(CONFIG_PADRAO)
  })

  it('devolve os padrões quando o arquivo está corrompido', async () => {
    expect(await lerConfig(await projeto('{{{'))).toEqual(CONFIG_PADRAO)
  })

  it('devolve os padrões quando não há pasta de projeto', async () => {
    expect(await lerConfig(null)).toEqual(CONFIG_PADRAO)
  })
})

describe('lerConfig — idiomas', () => {
  it('cai no padrão quando o idioma de interface não é um dos três suportados', async () => {
    const dir = await projeto(JSON.stringify({ v: 1, idiomaInterface: 'tlh' }))
    expect((await lerConfig(dir)).idiomaInterface).toBe(CONFIG_PADRAO.idiomaInterface)
  })

  it('aceita os três idiomas de interface suportados', async () => {
    const dir = await projeto(JSON.stringify({ v: 1, idiomaInterface: 'es' }))
    expect((await lerConfig(dir)).idiomaInterface).toBe('es')
  })

  it('aceita qualquer string como idioma de conteúdo', async () => {
    const dir = await projeto(JSON.stringify({ v: 1, idiomaConteudo: 'zh-Hans' }))
    expect((await lerConfig(dir)).idiomaConteudo).toBe('zh-Hans')
  })

  it('usa o próprio código como nome quando o idioma de conteúdo é desconhecido', async () => {
    const dir = await projeto(JSON.stringify({ v: 1, idiomaConteudo: 'zh-Hans' }))
    expect((await lerConfig(dir)).nomeIdiomaConteudo).toBe('zh-Hans')
  })

  it('preenche sozinho o nome por extenso dos idiomas conhecidos', async () => {
    const dir = await projeto(JSON.stringify({ v: 1, idiomaConteudo: 'en' }))
    expect((await lerConfig(dir)).nomeIdiomaConteudo).toBe('inglês')
  })

  it('respeita o nome informado à mão para um idioma qualquer', async () => {
    const dir = await projeto(
      JSON.stringify({ v: 1, idiomaConteudo: 'ja', nomeIdiomaConteudo: '日本語' }),
    )
    expect((await lerConfig(dir)).nomeIdiomaConteudo).toBe('日本語')
  })

  it('usa o idioma da interface como conteúdo quando o conteúdo não foi escolhido', async () => {
    const dir = await projeto(JSON.stringify({ v: 1, idiomaInterface: 'es' }))
    expect((await lerConfig(dir)).idiomaConteudo).toBe('es')
  })
})

describe('nomeDoIdioma', () => {
  it('prefere o nome informado ao código', () => {
    expect(nomeDoIdioma('de', 'alemão')).toBe('alemão')
  })

  it('conhece o nome por extenso do espanhol', () => {
    expect(nomeDoIdioma('es')).toBe('espanhol')
  })

  it('devolve o próprio código quando não conhece o idioma', () => {
    expect(nomeDoIdioma('de')).toBe('de')
  })
})

describe('salvarConfig', () => {
  it('recalcula o nome do idioma quando o código muda sem o nome', async () => {
    const dir = await projeto()
    const final = await salvarConfig(dir, { idiomaConteudo: 'en' })

    expect(final.nomeIdiomaConteudo).toBe('inglês')
  })

  it('não deixa sobrar o nome do idioma anterior depois da troca', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { idiomaConteudo: 'en' })
    const final = await salvarConfig(dir, { idiomaConteudo: 'ja' })

    expect(final.nomeIdiomaConteudo).not.toBe('inglês')
    expect(final.nomeIdiomaConteudo).toBe('ja')
  })

  it('respeita o nome informado junto com a troca de código', async () => {
    const dir = await projeto()
    const final = await salvarConfig(dir, { idiomaConteudo: 'ja', nomeIdiomaConteudo: '日本語' })

    expect(final.nomeIdiomaConteudo).toBe('日本語')
  })

  it('guarda o modelo de pergunta e o devolve na leitura seguinte', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { modeloPergunta: 'claude-opus-5' })

    expect((await lerConfig(dir)).modeloPergunta).toBe('claude-opus-5')
  })

  it('preserva o modelo de pergunta ao salvar outra preferência depois', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { modeloPergunta: 'claude-opus-5' })
    const final = await salvarConfig(dir, { idiomaInterface: 'en' })

    expect(final.modeloPergunta).toBe('claude-opus-5')
  })

  it('mescla sobre o que já existia em vez de apagar', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { idiomaInterface: 'es' })
    const final = await salvarConfig(dir, { idiomaConteudo: 'en' })

    expect(final.idiomaInterface).toBe('es')
    expect(final.idiomaConteudo).toBe('en')
  })
})
