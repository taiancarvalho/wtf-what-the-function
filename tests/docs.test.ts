/**
 * A varredura dos documentos e a leitura do mapa `.wtf/docs.json`.
 *
 * A varredura é a metade determinística do recurso — é ela que dá honestidade
 * ao painel — então é testada contra repositórios git DE VERDADE, criados em
 * diretórios temporários e apagados no fim. Nenhum teste escreve no repositório
 * de ninguém.
 */

import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { juntarDocs, lerMapaDocs, varrerDocumentos } from '../electron/docs.js'

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

async function g(dir: string, args: string[], extra: Record<string, string> = {}) {
  return execFile('git', args, { cwd: dir, env: { ...AMBIENTE, ...extra } })
}

/** Repo vazio, com identidade LOCAL — nunca toca na config do usuário. */
async function repoVazio(prefixo = 'docs') {
  const dir = await criarDir(prefixo)
  await g(dir, ['init', '-b', 'main'])
  await g(dir, ['config', 'user.email', 'teste@example.com'])
  await g(dir, ['config', 'user.name', 'Pessoa de Teste'])
  await g(dir, ['config', 'commit.gpgsign', 'false'])
  return dir
}

async function escrever(dir: string, rel: string, conteudo = 'conteudo\n') {
  const alvo = path.join(dir, rel)
  await fs.mkdir(path.dirname(alvo), { recursive: true })
  await fs.writeFile(alvo, conteudo)
}

/** Commit com data fixa, para as asserções de data não dependerem do relógio. */
async function commitar(dir: string, mensagem: string, quando?: string) {
  await g(dir, ['add', '-A'])
  const extra = quando ? { GIT_AUTHOR_DATE: quando, GIT_COMMITTER_DATE: quando } : {}
  await g(dir, ['commit', '-m', mensagem], extra)
}

afterAll(async () => {
  for (const dir of criados) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

// ------------------------------------------------------------------ básicos

describe('varredura em situações de borda', () => {
  it('devolve zeros quando não há diretório nenhum', async () => {
    const v = await varrerDocumentos(null as unknown as string)
    expect(v.total).toBe(0)
    expect(v.porPasta).toEqual([])
    expect(v.familias).toEqual([])
  })

  it('não lança fora de um repositório git', async () => {
    const dir = await criarDir('sem-git')
    await escrever(dir, 'README.md')
    const v = await varrerDocumentos(dir)
    expect(v.total).toBe(0)
  })

  it('devolve zeros num projeto sem documento nenhum', async () => {
    const dir = await repoVazio('sem-doc')
    await escrever(dir, 'src/app.ts', 'export const x = 1\n')
    await commitar(dir, 'código, nenhum documento')
    const v = await varrerDocumentos(dir)
    expect(v.total).toBe(0)
    expect(v.provavelmenteDeFerramenta).toEqual([])
  })
})

// -------------------------------------------------------- projeto de verdade

describe('varredura de um projeto com muitos documentos', () => {
  let dir: string

  beforeAll(async () => {
    dir = await repoVazio('projeto')

    // Raiz
    await escrever(dir, 'README.md')
    await escrever(dir, 'CLAUDE.md')
    await escrever(dir, 'notas.txt')

    // docs/ — o mesmo assunto em três versões
    await escrever(dir, 'docs/plano.md')
    await escrever(dir, 'docs/plano-v2.md')
    await escrever(dir, 'docs/plano-final.md')
    await escrever(dir, 'docs/guia.mdx')

    // README repetido em pastas diferentes (a "família por nome")
    await escrever(dir, 'src/README.md')
    await escrever(dir, 'app/README.md')

    // Material de ferramenta instalada, pelo nome conhecido
    for (let i = 0; i < 5; i++) await escrever(dir, `.aiox-core/regra-${i}.md`)

    // O que não é documento nem deve ser contado
    await escrever(dir, 'src/app.ts', 'export const x = 1\n')
    await escrever(dir, 'node_modules/pacote/README.md')

    await commitar(dir, 'primeiro', '2020-01-02T10:00:00-03:00')

    // Um toque posterior só no plano.md — é a data que o painel mostra.
    await escrever(dir, 'docs/plano.md', 'atualizado\n')
    await commitar(dir, 'atualiza o plano', '2020-06-15T09:00:00-03:00')
  })

  it('conta os documentos e ignora código e node_modules', async () => {
    const v = await varrerDocumentos(dir)
    // 3 na raiz + 4 em docs + 2 READMEs + 5 do .aiox-core
    expect(v.total).toBe(14)
    expect(v.naRaiz).toBe(3)
    expect(v.emDocs).toBe(4)
  })

  it('conta por pasta de primeiro nível, da maior para a menor', async () => {
    const v = await varrerDocumentos(dir)
    expect(v.porPasta[0]).toEqual({ pasta: '.aiox-core', total: 5 })
    expect(v.porPasta.map((p) => p.pasta)).toContain('docs')
    expect(v.porPasta.map((p) => p.pasta)).not.toContain('node_modules')
    // A raiz não é uma pasta de primeiro nível — vive em `naRaiz`.
    const soma = v.porPasta.reduce((t, p) => t + p.total, 0)
    expect(soma + v.naRaiz).toBe(v.total)
  })

  it('acha a família dos arquivos com o MESMO nome base em pastas diferentes', async () => {
    const v = await varrerDocumentos(dir)
    const familia = v.familias.find((f) => f.raiz === 'readme')
    expect(familia?.tipo).toBe('nome')
    expect(familia?.arquivos.map((a) => a.caminho).sort()).toEqual([
      'README.md',
      'app/README.md',
      'src/README.md',
    ])
  })

  it('acha a família cujo nome difere só por sufixo de versão', async () => {
    const v = await varrerDocumentos(dir)
    const familia = v.familias.find((f) => f.raiz === 'plano')
    expect(familia?.tipo).toBe('versao')
    expect(familia?.arquivos.map((a) => a.caminho).sort()).toEqual([
      'docs/plano-final.md',
      'docs/plano-v2.md',
      'docs/plano.md',
    ])
  })

  it('traz a data do último commit que tocou cada arquivo', async () => {
    const v = await varrerDocumentos(dir)
    const familia = v.familias.find((f) => f.raiz === 'plano')!
    const porCaminho = new Map(familia.arquivos.map((a) => [a.caminho, a.ultimoCommitEm]))
    expect(porCaminho.get('docs/plano.md')).toBe('2020-06-15T09:00:00-03:00')
    expect(porCaminho.get('docs/plano-v2.md')).toBe('2020-01-02T10:00:00-03:00')
    expect(v.semData).toBe(0)
  })

  it('não inventa família para um documento sozinho', async () => {
    const v = await varrerDocumentos(dir)
    expect(v.familias.some((f) => f.raiz === 'guia')).toBe(false)
    expect(v.familias.every((f) => f.arquivos.length >= 2)).toBe(true)
  })

  it('marca como provavelmente-de-ferramenta pelo nome conhecido da pasta', async () => {
    const v = await varrerDocumentos(dir)
    const suspeita = v.provavelmenteDeFerramenta.find((p) => p.pasta === '.aiox-core')
    expect(suspeita?.arquivos).toBe(5)
    expect(suspeita?.motivo).toContain('ferramenta conhecida')
    // Heurística é heurística: docs/ nunca vira suspeita por engano.
    expect(v.provavelmenteDeFerramenta.some((p) => p.pasta === 'docs')).toBe(false)
  })
})

// ------------------------------------------------- pasta grande e parada

describe('pasta grande e sem commit recente', () => {
  it('vira suspeita mesmo com nome desconhecido', async () => {
    const dir = await repoVazio('parada')
    for (let i = 0; i < 20; i++) await escrever(dir, `material/doc-${i}.md`)
    await commitar(dir, 'material antigo', '2019-03-01T12:00:00-03:00')
    await escrever(dir, 'README.md')
    await commitar(dir, 'documento de agora')

    const v = await varrerDocumentos(dir)
    const suspeita = v.provavelmenteDeFerramenta.find((p) => p.pasta === 'material')
    expect(suspeita?.arquivos).toBe(20)
    expect(suspeita?.motivo).toContain('nenhum foi tocado')
  })
})

// ------------------------------------------------------------------- mapa

describe('lerMapaDocs', () => {
  const mapaBom = {
    v: 1,
    geradoEm: '2026-08-12T14:02:11-03:00',
    totalEncontrados: 635,
    totalLidos: 48,
    ignorados: [{ pasta: '.aiox-core/', motivo: 'ferramenta instalada', arquivos: 512 }],
    assuntos: [
      {
        assunto: 'Plano do produto',
        resumo: 'o que vai ser construído e em que ordem',
        vigente: 'docs/plano.md',
        confianca: 'alta',
        porque: 'é o único citado pelo README',
        outros: [{ caminho: 'docs/plano-v2.md', situacao: 'provavelmente antigo', porque: 'ninguém aponta para ele' }],
      },
    ],
    orfaos: [{ caminho: 'docs/ideias.md', porque: 'nenhum outro documento o cita' }],
  }

  async function comMapa(conteudo: string) {
    const dir = await criarDir('mapa')
    await fs.mkdir(path.join(dir, '.wtf'), { recursive: true })
    await fs.writeFile(path.join(dir, '.wtf', 'docs.json'), conteudo)
    return dir
  }

  it('devolve null quando o arquivo não existe', async () => {
    expect(await lerMapaDocs(await criarDir('sem-mapa'))).toBeNull()
  })

  it('devolve null com JSON corrompido', async () => {
    expect(await lerMapaDocs(await comMapa('{ isto nao é json'))).toBeNull()
  })

  it('devolve null quando a versão não é 1', async () => {
    const dir = await comMapa(JSON.stringify({ ...mapaBom, v: 2 }))
    expect(await lerMapaDocs(dir)).toBeNull()
  })

  it('devolve null quando `assuntos` não é lista', async () => {
    const dir = await comMapa(JSON.stringify({ ...mapaBom, assuntos: 'vários' }))
    expect(await lerMapaDocs(dir)).toBeNull()
  })

  it('lê um mapa válido inteiro', async () => {
    const dir = await comMapa(JSON.stringify(mapaBom))
    const mapa = await lerMapaDocs(dir)
    expect(mapa?.totalEncontrados).toBe(635)
    expect(mapa?.assuntos[0].vigente).toBe('docs/plano.md')
    expect(mapa?.assuntos[0].outros[0].caminho).toBe('docs/plano-v2.md')
    expect(mapa?.orfaos[0].caminho).toBe('docs/ideias.md')
  })

  it('descarta em silêncio as entradas malformadas e mantém as boas', async () => {
    const dir = await comMapa(
      JSON.stringify({
        ...mapaBom,
        assuntos: [null, { resumo: 'sem assunto nenhum' }, ...mapaBom.assuntos],
      }),
    )
    const mapa = await lerMapaDocs(dir)
    expect(mapa?.assuntos).toHaveLength(1)
    expect(mapa?.assuntos[0].assunto).toBe('Plano do produto')
  })

  it('rebaixa uma confiança inventada para baixa em vez de repeti-la', async () => {
    const dir = await comMapa(
      JSON.stringify({
        ...mapaBom,
        assuntos: [{ assunto: 'X', confianca: 'absoluta' }],
      }),
    )
    expect((await lerMapaDocs(dir))?.assuntos[0].confianca).toBe('baixa')
  })
})

// ----------------------------------------------------------------- junção

describe('juntarDocs', () => {
  it('funciona com mapa null — a varredura sozinha já vale a tela', async () => {
    const dir = await repoVazio('junta')
    await escrever(dir, 'README.md')
    await escrever(dir, 'docs/README.md')
    await commitar(dir, 'dois documentos')

    const junto = juntarDocs(await varrerDocumentos(dir), null)
    expect(junto.temMapa).toBe(false)
    expect(junto.mapa).toBeNull()
    expect(junto.desatualizado).toBe(false)
    expect(junto.varredura.total).toBe(2)
    expect(junto.varredura.familias[0].tipo).toBe('nome')
  })

  it('junta varredura e mapa sem misturar fato com opinião', () => {
    const varredura = {
      total: 10,
      naRaiz: 2,
      emDocs: 3,
      porPasta: [{ pasta: 'docs', total: 3 }],
      familias: [],
      provavelmenteDeFerramenta: [],
      semData: 0,
    }
    const mapa = { v: 1 as const, geradoEm: 'ontem', totalEncontrados: 10, totalLidos: 4, ignorados: [], assuntos: [], orfaos: [] }
    const junto = juntarDocs(varredura, mapa)
    expect(junto.temMapa).toBe(true)
    expect(junto.geradoEm).toBe('ontem')
    expect(junto.varredura).toBe(varredura)
    expect(junto.mapa).toBe(mapa)
  })

  it('avisa quando nasceram muitos documentos depois do mapa', () => {
    const varredura = { total: 100, naRaiz: 0, emDocs: 0, porPasta: [], familias: [], provavelmenteDeFerramenta: [], semData: 0 }
    const mapa = { v: 1 as const, totalEncontrados: 40, totalLidos: 10, ignorados: [], assuntos: [], orfaos: [] }
    expect(juntarDocs(varredura, mapa).desatualizado).toBe(true)
  })

  it('não quebra com entradas inválidas', () => {
    const junto = juntarDocs(undefined as never, undefined as never)
    expect(junto.varredura.total).toBe(0)
    expect(junto.temMapa).toBe(false)
  })
})
