/**
 * O mapa de pastas (`MAPA.md`).
 *
 * O valor está no desenho: a árvore precisa voltar caractere a caractere, e
 * cada linha precisa voltar separada em pedaços que a tela saiba desenhar.
 * Nada aqui pode lançar — mapa torto é normal.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { lerMapaPastas } from '../electron/folders.js'

const criados: string[] = []

afterAll(async () => {
  for (const dir of criados) await fs.rm(dir, { recursive: true, force: true })
})

async function dirCom(conteudo?: string, nome = 'MAPA.md') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtf-folders-'))
  criados.push(dir)
  if (conteudo !== undefined) await fs.writeFile(path.join(dir, nome), conteudo)
  return dir
}

const MAPA_EXEMPLO = [
  '# Mapa do projeto',
  '',
  'Texto de fora que não é a árvore.',
  '',
  '```',
  'meu-projeto/',
  '│',
  '│  ── NEGÓCIO ──',
  '├── src/          onde mora o código do produto',
  '├── sistema/      as engrenagens · detalhe em sistema/MAPA.md',
  '└── README.md',
  '```',
  '',
  '```',
  'este segundo bloco não conta',
  '```',
  '',
].join('\n')

describe('lerMapaPastas', () => {
  it('devolve null quando não existe MAPA.md', async () => {
    expect(await lerMapaPastas(await dirCom())).toBeNull()
  })

  it('devolve null quando o diretório não foi informado', async () => {
    expect(await lerMapaPastas(null as never)).toBeNull()
  })

  it('extrai apenas o primeiro bloco de código do arquivo', async () => {
    const r = (await lerMapaPastas(await dirCom(MAPA_EXEMPLO)))!
    expect(r.arvore).toContain('meu-projeto/')
    expect(r.arvore).not.toContain('este segundo bloco')
    expect(r.arvore).not.toContain('# Mapa do projeto')
    expect(r.existe).toBe(true)
  })

  it('preserva o desenho da árvore caractere a caractere', async () => {
    const r = (await lerMapaPastas(await dirCom(MAPA_EXEMPLO)))!
    expect(r.arvore.split('\n')[3]).toBe('├── src/          onde mora o código do produto')
  })

  it('usa o corpo inteiro quando não há bloco de código', async () => {
    const r = (await lerMapaPastas(await dirCom('meu-projeto/\n├── src/  código\n')))!
    expect(r.arvore).toContain('meu-projeto/')
    expect(r.linhas[0].tipo).toBe('raiz')
  })

  it('informa quando o mapa foi atualizado', async () => {
    const r = (await lerMapaPastas(await dirCom(MAPA_EXEMPLO)))!
    expect(() => new Date(r.atualizadoEm!).toISOString()).not.toThrow()
  })
})

describe('separação das linhas da árvore', () => {
  it('separa raiz, seção, pasta e linha vazia', async () => {
    const { linhas } = (await lerMapaPastas(await dirCom(MAPA_EXEMPLO)))!
    expect(linhas.map((l: { tipo: string }) => l.tipo)).toEqual([
      'raiz',
      'vazia',
      'secao',
      'pasta',
      'pasta',
      'pasta',
    ])
  })

  it('lê o nome da seção sem os traços do separador', async () => {
    const { linhas } = (await lerMapaPastas(await dirCom(MAPA_EXEMPLO)))!
    const secao = linhas.find((l: { tipo: string }) => l.tipo === 'secao')!
    expect(secao.nome).toBe('NEGÓCIO')
    expect(secao.proposito).toBe('')
  })

  it('separa o nome da pasta do seu propósito', async () => {
    const { linhas } = (await lerMapaPastas(await dirCom(MAPA_EXEMPLO)))!
    const src = linhas.find((l: { nome: string }) => l.nome === 'src/')!
    expect(src.prefixo).toBe('├──')
    expect(src.proposito).toBe('onde mora o código do produto')
  })

  it('deixa o propósito vazio quando a linha só tem o nome', async () => {
    const { linhas } = (await lerMapaPastas(await dirCom(MAPA_EXEMPLO)))!
    const readme = linhas.find((l: { nome: string }) => l.nome === 'README.md')!
    expect(readme.proposito).toBe('')
    expect(readme.detalheEm).toBeUndefined()
  })

  it('extrai o detalheEm de "detalhe em X"', async () => {
    const { linhas } = (await lerMapaPastas(await dirCom(MAPA_EXEMPLO)))!
    const sistema = linhas.find((l: { nome: string }) => l.nome === 'sistema/')!
    expect(sistema.detalheEm).toBe('sistema/MAPA.md')
  })

  it('corta o mapa em 200 linhas', async () => {
    const gigante = ['```', 'projeto/']
    for (let i = 0; i < 250; i++) gigante.push(`├── pasta${i}/  serve para algo`)
    gigante.push('```')
    const { linhas } = (await lerMapaPastas(await dirCom(gigante.join('\n'))))!
    expect(linhas).toHaveLength(200)
  })
})
