/**
 * O histórico: reconstrução do passado a partir do Git.
 *
 * Tudo aqui roda contra repositórios git DE VERDADE, criados em diretórios
 * temporários com datas de commit controladas (`GIT_AUTHOR_DATE`) e apagados no
 * fim. Nenhum teste escreve no repositório de ninguém.
 *
 * O que precisa ficar provado, porque é onde o recurso quebra em silêncio:
 *   • a granularidade acompanha a IDADE do repositório (dia vs. semana);
 *   • o teto de 14 marcos vale mesmo em projeto muito antigo;
 *   • o passado tem MENOS coisa que o presente (senão não reconstruiu nada);
 *   • o cache evita ir ao git de novo;
 *   • a primeira visita não inventa comparação, e a segunda compara certo.
 */

import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  contarPartes,
  desdeAUltimaVisita,
  historicoRapido,
  lerCacheHistorico,
  lerVisitas,
  marcosDe,
  reconstruirHistorico,
  registrarVisita,
} from '../electron/history.js'

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

async function repoVazio(prefixo = 'hist') {
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

/** Commit com data fixa — as asserções não podem depender do relógio. */
async function commitar(dir: string, mensagem: string, quando: string) {
  await g(dir, ['add', '-A'])
  await g(dir, ['commit', '-m', mensagem], {
    GIT_AUTHOR_DATE: quando,
    GIT_COMMITTER_DATE: quando,
  })
}

/** Uma data ISO a N dias de HOJE — o histórico é relativo ao presente. */
function diasAtras(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

afterAll(async () => {
  for (const dir of criados) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

// ------------------------------------------------------------ granularidade

describe('granularidade adaptativa', () => {
  it('usa DIA em projeto jovem — o caso real de quem começou anteontem', async () => {
    const dir = await repoVazio('jovem')
    await escrever(dir, 'src/app/pagina.ts')
    await commitar(dir, 'inicio', diasAtras(2))
    await escrever(dir, 'src/lib/motor.ts')
    await commitar(dir, 'motor', diasAtras(1))

    const { granularidade, datas } = await marcosDe(dir)
    expect(granularidade).toBe('dia')
    // anteontem, ontem e hoje
    expect(datas.length).toBe(3)
  })

  it(
    'usa SEMANA em projeto longo e movimentado',
    async () => {
      const dir = await repoVazio('antigo')
      await escrever(dir, 'src/lib/inicio.ts')
      await commitar(dir, 'inicio', diasAtras(200))

      /*
       * 200 dias de vida e commits de sobra: aqui o dia viraria ruído.
       * Os commits são VAZIOS de propósito — `marcosDe` só olha a data do
       * primeiro e a CONTAGEM, e criar 65 arquivos custaria segundos à toa.
       */
      for (let i = 0; i < 65; i++) {
        await g(dir, ['commit', '--allow-empty', '-qm', `passo ${i}`], {
          GIT_AUTHOR_DATE: diasAtras(199 - i),
          GIT_COMMITTER_DATE: diasAtras(199 - i),
        })
      }

      const { granularidade, commits, datas } = await marcosDe(dir)
      expect(commits).toBeGreaterThanOrEqual(60)
      expect(granularidade).toBe('semana')
      expect(datas.length).toBeLessThanOrEqual(14)
    },
    60_000,
  )

  it('projeto antigo mas curto continua no DIA — poucos commits não viram semana', async () => {
    const dir = await repoVazio('curto')
    await escrever(dir, 'src/lib/a.ts')
    await commitar(dir, 'a', diasAtras(120))
    await escrever(dir, 'src/lib/b.ts')
    await commitar(dir, 'b', diasAtras(3))

    const { granularidade } = await marcosDe(dir)
    expect(granularidade).toBe('dia')
  })
})

describe('teto de marcos', () => {
  it(
    'nunca passa de 14, e mantém os MAIS RECENTES',
    async () => {
      const dir = await repoVazio('teto')
      // 40 dias de vida, um commit por dia: 40 marcos possíveis, 14 permitidos.
      for (let i = 0; i < 40; i++) {
        await escrever(dir, `src/lib/m${i}.ts`, `export const x = ${i}\n`)
        await commitar(dir, `passo ${i}`, diasAtras(40 - i))
      }

      const { datas } = await marcosDe(dir)
      expect(datas.length).toBe(14)

      const hoje = new Date()
      const doDia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(
        hoje.getDate(),
      ).padStart(2, '0')}`
      // O último marco é HOJE: ninguém abre o painel para saber do mês passado.
      expect(datas[datas.length - 1]).toBe(doDia)
    },
    60_000,
  )
})

// -------------------------------------------------------------- reconstrução

describe('reconstrução do passado', () => {
  it('acusa MENOS arquivos e MENOS partes testadas no passado que hoje', async () => {
    const dir = await repoVazio('cresce')

    // Dia 1: uma parte, sem teste.
    await escrever(dir, 'src/lib/metrics/calc.ts')
    await commitar(dir, 'calculo', diasAtras(4))

    // Dia 2: outra parte.
    await escrever(dir, 'src/lib/auth/login.ts')
    await commitar(dir, 'login', diasAtras(3))

    // Dia 3: chegam os testes.
    await escrever(dir, 'tests/lib/metrics/calc.test.ts')
    await commitar(dir, 'testes', diasAtras(1))

    const { marcos } = await reconstruirHistorico(dir)
    expect(marcos.length).toBeGreaterThanOrEqual(3)

    const primeiro = marcos[0]
    const ultimo = marcos[marcos.length - 1]

    // O passado é MENOR — é isso que prova que não estamos lendo o disco de hoje.
    expect(primeiro.arquivos).toBeLessThan(ultimo.arquivos)
    expect(primeiro.partes).toBeLessThan(ultimo.partes)
    expect(primeiro.testadas).toBe(0)
    expect(ultimo.testadas).toBeGreaterThan(0)
    expect(ultimo.fonte).toBe('heuristica')
  })

  it('usa o mapa quando ele existe, e conta as partes do mapa', async () => {
    const dir = await repoVazio('mapa')
    await escrever(dir, 'src/cobranca/pix.ts')
    await commitar(dir, 'pix', diasAtras(2))
    await escrever(dir, 'tests/cobranca.test.ts')
    await commitar(dir, 'teste do pix', diasAtras(1))

    await escrever(
      dir,
      '.wtf/map.json',
      `${JSON.stringify({
        v: 1,
        features: [
          {
            id: 'cobranca',
            area: 'Dinheiro',
            name: 'Cobrança por Pix',
            summary: 'Recebe pagamentos',
            paths: ['src/cobranca/**'],
            tests: ['tests/cobranca.test.ts'],
          },
          {
            id: 'relatorio',
            area: 'Dinheiro',
            name: 'Relatório mensal',
            summary: 'Ainda não existe',
            paths: ['src/relatorio/**'],
            tests: [],
          },
        ],
      })}\n`,
    )

    const { marcos } = await reconstruirHistorico(dir)
    const ultimo = marcos[marcos.length - 1]
    expect(ultimo.fonte).toBe('mapa')
    // Parte planejada e sem arquivo nenhum CONTINUA existindo — é 'planned'.
    expect(ultimo.partes).toBe(2)
    expect(ultimo.comCodigo).toBe(1)
    expect(ultimo.testadas).toBe(1)
  })
})

describe('contarPartes', () => {
  it('sem mapa, uma parte com código e teste conta como testada', () => {
    const r = contarPartes(['src/lib/metrics/calc.ts', 'tests/lib/metrics/calc.test.ts'], null)
    expect(r.fonte).toBe('heuristica')
    expect(r.comCodigo).toBeGreaterThan(0)
    expect(r.testadas).toBeGreaterThan(0)
  })

  it('lista vazia não quebra e não inventa parte', () => {
    expect(contarPartes([], null)).toMatchObject({ arquivos: 0, partes: 0, testadas: 0 })
  })
})

// --------------------------------------------------------------------- cache

describe('cache de marcos', () => {
  it('grava `.wtf/history.json` e reaproveita — a segunda volta não vai ao git', async () => {
    const dir = await repoVazio('cache')
    await escrever(dir, 'src/lib/a.ts')
    await commitar(dir, 'a', diasAtras(3))
    await escrever(dir, 'src/lib/b.ts')
    await commitar(dir, 'b', diasAtras(1))

    const primeira = await reconstruirHistorico(dir)
    const cache = await lerCacheHistorico(dir)
    expect(cache?.marcos.length).toBe(primeira.marcos.length)

    /*
     * A prova do reaproveitamento: adulteramos um marco JÁ GRAVADO com um
     * número impossível. Se a segunda reconstrução voltasse ao git, ela
     * corrigiria o valor; como ela reaproveita pelo hash do commit, o número
     * mentiroso sobrevive — e é exatamente isso que queremos observar.
     *
     * Adulteramos por COMMIT, não por índice: dias sem commit nenhum
     * compartilham o mesmo marco (a linha fica reta, que é a verdade), e o
     * reaproveitamento é indexado pelo hash.
     */
    const alvo = cache!.marcos[0].commit
    const adulterado = {
      ...cache!,
      marcos: cache!.marcos.map((m) => (m.commit === alvo ? { ...m, arquivos: 999 } : m)),
    }
    await fs.writeFile(
      path.join(dir, '.wtf', 'history.json'),
      `${JSON.stringify(adulterado, null, 2)}\n`,
    )

    const segunda = await reconstruirHistorico(dir)
    expect(segunda.marcos[0].arquivos).toBe(999)
  })

  it('mapa novo invalida o cache inteiro', async () => {
    const dir = await repoVazio('invalida')
    await escrever(dir, 'src/coisa/a.ts')
    await commitar(dir, 'a', diasAtras(2))

    await reconstruirHistorico(dir)
    const antes = await lerCacheHistorico(dir)

    await escrever(
      dir,
      '.wtf/map.json',
      `${JSON.stringify({
        v: 1,
        features: [
          {
            id: 'coisa',
            area: 'Bastidores',
            name: 'Coisa',
            summary: 'Uma coisa',
            paths: ['src/coisa/**'],
            tests: [],
          },
        ],
      })}\n`,
    )

    const depois = await reconstruirHistorico(dir)
    const cacheDepois = await lerCacheHistorico(dir)
    expect(cacheDepois?.mapa).not.toBe(antes?.mapa)
    expect(depois.marcos[depois.marcos.length - 1].fonte).toBe('mapa')
  })

  it('`historicoRapido` não vai ao git: frio antes de existir cache', async () => {
    const dir = await repoVazio('frio')
    await escrever(dir, 'src/lib/a.ts')
    await commitar(dir, 'a', diasAtras(1))

    const frio = await historicoRapido(dir)
    expect(frio.frio).toBe(true)
    expect(frio.marcos).toEqual([])

    await reconstruirHistorico(dir)
    const quente = await historicoRapido(dir)
    expect(quente.frio).toBe(false)
    expect(quente.desatualizado).toBe(false)
    expect(quente.marcos.length).toBeGreaterThan(0)
  })
})

// ------------------------------------------------------------------ visitas

describe('desde a última visita', () => {
  it('na PRIMEIRA visita não inventa comparação', async () => {
    const dir = await repoVazio('primeira')
    await escrever(dir, 'src/lib/a.ts')
    await commitar(dir, 'a', diasAtras(1))

    await registrarVisita(dir)
    const r = await desdeAUltimaVisita(dir)
    expect(r.primeira).toBe(true)
    expect(r.commits).toBe(0)
  })

  it('com visita anterior, conta commits, arquivos e mudanças de estado', async () => {
    const dir = await repoVazio('segunda')
    // O próprio `.wtf/` fora do histórico: senão a marca de visita gravada no
    // meio do teste entraria no `git add -A` e contaria como arquivo tocado.
    await escrever(dir, '.gitignore', '.wtf/\n')
    await escrever(dir, 'src/lib/metrics/calc.ts')
    await commitar(dir, 'calculo', diasAtras(5))

    // A pessoa olhou o projeto há três dias e foi embora.
    const ontemMenos = new Date()
    ontemMenos.setDate(ontemMenos.getDate() - 3)
    await registrarVisita(dir, ontemMenos)

    // Enquanto isso, a IA trabalhou: mais código e, agora, testes.
    await escrever(dir, 'src/lib/auth/login.ts')
    await commitar(dir, 'login', diasAtras(2))
    await escrever(dir, 'tests/lib/metrics/calc.test.ts')
    await commitar(dir, 'testes do calculo', diasAtras(1))

    // Ela volta hoje: esta abertura rotaciona a marca.
    await registrarVisita(dir)
    const visitas = await lerVisitas(dir)
    expect(visitas.anteriorEm).not.toBeNull()

    const r = await desdeAUltimaVisita(dir, {
      snapshot: {
        events: [
          { at: diasAtras(1), human: { needsYourAttention: true } },
          { at: diasAtras(1), human: { needsYourAttention: true }, resolvido: { at: 'x' } },
          { at: diasAtras(10), human: { needsYourAttention: true } },
        ],
      },
    })

    expect(r.primeira).toBe(false)
    expect(r.commits).toBe(2)
    expect(r.arquivos).toBe(2)
    // O cálculo saiu de 'implemented' para 'tested' enquanto ela não olhava.
    expect(r.partesQueMudaram.some((p) => p.para === 'tested')).toBe(true)
    // Dois avisos no intervalo; só um continua pedindo decisão.
    expect(r.avisosNovos).toBe(2)
    expect(r.pedemDecisao).toBe(1)
  })

  it('reabrir o painel na mesma sessão NÃO apaga o intervalo', async () => {
    const dir = await repoVazio('sessao')
    await escrever(dir, 'src/lib/a.ts')
    await commitar(dir, 'a', diasAtras(4))

    const antiga = new Date()
    antiga.setDate(antiga.getDate() - 2)
    await registrarVisita(dir, antiga)

    // Segunda abertura: rotaciona, `anteriorEm` passa a ser a visita antiga.
    await registrarVisita(dir)
    const marcaUm = await lerVisitas(dir)
    expect(new Date(marcaUm.anteriorEm!).getTime()).toBeCloseTo(antiga.getTime(), -3)

    // Terceira abertura, segundos depois: é a MESMA visita. Se isto
    // rotacionasse, o resumo compararia o agora com o agora e viria vazio.
    await registrarVisita(dir)
    const marcaDois = await lerVisitas(dir)
    expect(marcaDois.anteriorEm).toBe(marcaUm.anteriorEm)
  })
})

// -------------------------------------------------------------------- bordas

describe('situações de borda', () => {
  it('repositório sem NENHUM commit não quebra', async () => {
    const dir = await repoVazio('sem-commit')

    expect((await marcosDe(dir)).datas).toEqual([])
    expect((await reconstruirHistorico(dir)).marcos).toEqual([])
    expect((await desdeAUltimaVisita(dir)).primeira).toBe(true)
  })

  it('pasta que não é repositório git devolve vazio em silêncio', async () => {
    const dir = await criarDir('sem-git')

    expect((await marcosDe(dir)).datas).toEqual([])
    expect((await reconstruirHistorico(dir)).marcos).toEqual([])
    expect((await desdeAUltimaVisita(dir)).primeira).toBe(true)
  })

  it('cache corrompido vale o mesmo que cache ausente', async () => {
    const dir = await repoVazio('podre')
    await escrever(dir, 'src/lib/a.ts')
    await commitar(dir, 'a', diasAtras(1))
    await escrever(dir, '.wtf/history.json', '{ isto não é json')

    expect(await lerCacheHistorico(dir)).toBeNull()
    expect((await historicoRapido(dir)).frio).toBe(true)
    // E reconstruir por cima do lixo funciona normalmente.
    expect((await reconstruirHistorico(dir)).marcos.length).toBeGreaterThan(0)
  })

  it('visitas.json corrompido não derruba nada', async () => {
    const dir = await repoVazio('visita-podre')
    await escrever(dir, 'src/lib/a.ts')
    await commitar(dir, 'a', diasAtras(1))
    await escrever(dir, '.wtf/visitas.json', 'nada disso')

    expect(await lerVisitas(dir)).toMatchObject({ ultimaVisitaEm: null, anteriorEm: null })
    expect((await desdeAUltimaVisita(dir)).primeira).toBe(true)
  })
})
