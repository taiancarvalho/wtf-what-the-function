/**
 * O contador de consumo e o consentimento da tradução.
 *
 * Estes testes existem para provar a promessa central do produto: o WTF não
 * gasta recurso de ninguém sem autorização, e o que ele gasta fica visível.
 * Um app que existe para acabar com o "OK, OK, OK sem saber o que está
 * acontecendo" não pode ser o próprio exemplo do problema.
 *
 * Nunca escrevem em repositório de usuário: tudo acontece em pastas temporárias.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulos do processo main, sem tipos
import { lerUso, registrarPergunta, registrarTraducao, usoVazio, zerarUso } from '../electron/usage.js'
// @ts-expect-error módulos do processo main, sem tipos
import { contarPendentes, traducaoAutorizada, traduzirEventos } from '../electron/translator.js'
// @ts-expect-error módulos do processo main, sem tipos
import { salvarConfig } from '../electron/config.js'

let raiz: string
let contador = 0

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-uso-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

async function projeto(): Promise<string> {
  const dir = path.join(raiz, `p${contador++}`)
  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  return dir
}

/** Eventos falsos, no formato mínimo que o tradutor sabe ler. */
function eventos(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    commit: { subject: `mudança número ${i}`, body: '', files: [`arquivo${i}.ts`] },
    technical: { insertions: i + 1, deletions: 0, files: [`arquivo${i}.ts`] },
  }))
}

/**
 * Um CLI de mentira: responde JSON válido e conta quantas vezes foi chamado.
 * É assim que provamos que o modelo NÃO foi chamado sem depender de haver (ou
 * não) um agente instalado na máquina que roda o teste.
 */
function agenteFalso() {
  const chamadas: string[][] = []
  const rodar = async (_bin: string, args: string[]) => {
    chamadas.push(args)
    const prompt = args[1] ?? ''
    const ids = [...prompt.matchAll(/^id: (\S+)$/gm)].map((m) => m[1])
    return JSON.stringify({
      itens: ids.map((id) => ({
        id,
        headline: `explicação de ${id}`,
        what: 'algo mudou',
        why: 'não foi explicado',
        impact: 'nenhum',
        affects: [],
        needsYourAttention: false,
        attentionReason: '',
      })),
    })
  }
  return { rodar, chamadas }
}

describe('lerUso — leitura tolerante', () => {
  it('devolve o contador zerado quando não existe arquivo', async () => {
    expect(await lerUso(await projeto())).toEqual(usoVazio())
  })

  it('devolve o contador zerado quando o arquivo está corrompido', async () => {
    const dir = await projeto()
    await writeFile(path.join(dir, '.wtf', 'usage.json'), '{{{ não é json', 'utf8')
    expect(await lerUso(dir)).toEqual(usoVazio())
  })

  it('devolve o contador zerado quando não há pasta de projeto', async () => {
    expect(await lerUso(null)).toEqual(usoVazio())
  })

  it('ignora números estranhos em vez de propagar NaN', async () => {
    const dir = await projeto()
    await writeFile(
      path.join(dir, '.wtf', 'usage.json'),
      JSON.stringify({ v: 1, traducoes: { chamadas: 'muitas', cache: -8 } }),
      'utf8',
    )
    const uso = await lerUso(dir)
    expect(uso.traducoes.chamadas).toBe(0)
    expect(uso.traducoes.cache).toBe(0)
  })
})

describe('registrar consumo', () => {
  it('soma chamadas e eventos de tradução entre leituras', async () => {
    const dir = await projeto()
    await registrarTraducao(dir, { chamadas: 1, eventos: 8 })
    await registrarTraducao(dir, { chamadas: 2, eventos: 5 })

    const uso = await lerUso(dir)
    expect(uso.traducoes.chamadas).toBe(3)
    expect(uso.traducoes.eventos).toBe(13)
  })

  it('conta os acertos de cache separado das chamadas de verdade', async () => {
    const dir = await projeto()
    await registrarTraducao(dir, { cache: 12 })

    const uso = await lerUso(dir)
    expect(uso.traducoes.cache).toBe(12)
    // O cache é economia, não gasto: não pode contaminar o número de chamadas.
    expect(uso.traducoes.chamadas).toBe(0)
    expect(uso.traducoes.eventos).toBe(0)
  })

  it('conta as perguntas pagas por provedor', async () => {
    const dir = await projeto()
    await registrarPergunta(dir, 'openrouter')
    await registrarPergunta(dir, 'openrouter')
    await registrarPergunta(dir, 'anthropic')

    const uso = await lerUso(dir)
    expect(uso.perguntas.chamadas).toBe(3)
    expect(uso.perguntas.porProvedor).toEqual({ openrouter: 2, anthropic: 1 })
  })

  it('marca desde quando está contando no primeiro gasto', async () => {
    const dir = await projeto()
    expect((await lerUso(dir)).desde).toBeNull()
    await registrarPergunta(dir, 'openrouter')
    expect(typeof (await lerUso(dir)).desde).toBe('string')
  })

  it('zerar devolve o contador limpo', async () => {
    const dir = await projeto()
    await registrarTraducao(dir, { chamadas: 5, eventos: 5, cache: 5 })
    await zerarUso(dir)
    expect(await lerUso(dir)).toEqual(usoVazio())
  })
})

describe('traducaoAutorizada', () => {
  it('não autoriza no padrão perguntar', () => {
    expect(traducaoAutorizada({ traduzirAuto: 'perguntar' })).toBe(false)
  })

  it('autoriza esta rodada quando a pessoa disse sim uma vez', () => {
    expect(traducaoAutorizada({ traduzirAuto: 'perguntar' }, true)).toBe(true)
  })

  it('autoriza sempre com sim', () => {
    expect(traducaoAutorizada({ traduzirAuto: 'sim' })).toBe(true)
  })

  it('nunca autoriza com nao, mesmo com autorização de rodada', () => {
    expect(traducaoAutorizada({ traduzirAuto: 'nao' }, true)).toBe(false)
  })

  it('trata config ausente como perguntar', () => {
    expect(traducaoAutorizada(undefined)).toBe(false)
  })
})

describe('traduzirEventos — consentimento', () => {
  it('não chama o modelo enquanto ninguém autorizou', async () => {
    const dir = await projeto()
    const agente = agenteFalso()

    const saida = await traduzirEventos(dir, eventos(10), { rodar: agente.rodar })

    expect(agente.chamadas).toHaveLength(0)
    expect(saida.size).toBe(0)
    // E nada é contado como gasto, porque nada foi gasto.
    expect((await lerUso(dir)).traducoes.chamadas).toBe(0)
  })

  it('não chama o modelo quando a pessoa disse nunca', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { traduzirAuto: 'nao' })
    const agente = agenteFalso()

    await traduzirEventos(dir, eventos(4), { rodar: agente.rodar })

    expect(agente.chamadas).toHaveLength(0)
  })

  it('chama o modelo quando a rodada foi autorizada uma vez', async () => {
    const dir = await projeto()
    const agente = agenteFalso()

    const saida = await traduzirEventos(dir, eventos(3), {
      rodar: agente.rodar,
      autorizadoAgora: true,
    })

    expect(agente.chamadas).toHaveLength(1)
    expect(saida.size).toBe(3)
  })

  it('chama o modelo quando a pessoa autorizou para sempre', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { traduzirAuto: 'sim' })
    const agente = agenteFalso()

    await traduzirEventos(dir, eventos(3), { rodar: agente.rodar })

    expect(agente.chamadas).toHaveLength(1)
  })
})

describe('traduzirEventos — teto por rodada', () => {
  it('respeita o teto padrão conservador de 8 traduções', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { traduzirAuto: 'sim' })
    const agente = agenteFalso()

    const saida = await traduzirEventos(dir, eventos(40), { rodar: agente.rodar })

    // Antes eram 32 por rodada; o padrão agora é 8.
    expect(saida.size).toBe(8)
    expect(agente.chamadas).toHaveLength(1)
  })

  it('respeita o teto configurado no projeto', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { traduzirAuto: 'sim', maxTraducoesPorRodada: 2 })
    const agente = agenteFalso()

    const saida = await traduzirEventos(dir, eventos(20), { rodar: agente.rodar })

    expect(saida.size).toBe(2)
  })

  it('teto zero não chama o modelo nenhuma vez', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { traduzirAuto: 'sim', maxTraducoesPorRodada: 0 })
    const agente = agenteFalso()

    await traduzirEventos(dir, eventos(20), { rodar: agente.rodar })

    expect(agente.chamadas).toHaveLength(0)
  })
})

describe('traduzirEventos — contador', () => {
  it('conta as chamadas de verdade e as mudanças traduzidas', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { traduzirAuto: 'sim', maxTraducoesPorRodada: 3 })
    const agente = agenteFalso()

    await traduzirEventos(dir, eventos(3), { rodar: agente.rodar })

    const uso = await lerUso(dir)
    expect(uso.traducoes.chamadas).toBe(1)
    expect(uso.traducoes.eventos).toBe(3)
    expect(uso.traducoes.cache).toBe(0)
  })

  it('conta o cache na segunda rodada, sem chamar o modelo de novo', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { traduzirAuto: 'sim', maxTraducoesPorRodada: 3 })
    const agente = agenteFalso()
    const lista = eventos(3)

    await traduzirEventos(dir, lista, { rodar: agente.rodar })
    const saida = await traduzirEventos(dir, lista, { rodar: agente.rodar })

    expect(saida.size).toBe(3)
    // A segunda rodada saiu inteira do cache: nenhuma chamada nova.
    expect(agente.chamadas).toHaveLength(1)

    const uso = await lerUso(dir)
    expect(uso.traducoes.chamadas).toBe(1)
    expect(uso.traducoes.cache).toBe(3)
  })

  it('não conta nada quando registrarUso é falso', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { traduzirAuto: 'sim' })
    const agente = agenteFalso()

    await traduzirEventos(dir, eventos(2), { rodar: agente.rodar, registrarUso: false })

    expect(await lerUso(dir)).toEqual(usoVazio())
  })
})

describe('contarPendentes', () => {
  it('conta tudo quando nada foi traduzido ainda — e não chama o modelo', async () => {
    const dir = await projeto()
    expect(await contarPendentes(dir, eventos(7))).toBe(7)
  })

  it('desconta o que já está no cache', async () => {
    const dir = await projeto()
    await salvarConfig(dir, { traduzirAuto: 'sim', maxTraducoesPorRodada: 4 })
    const agente = agenteFalso()
    const lista = eventos(10)

    await traduzirEventos(dir, lista, { rodar: agente.rodar })

    expect(await contarPendentes(dir, lista)).toBe(6)
  })

  it('devolve zero sem projeto ou sem eventos', async () => {
    expect(await contarPendentes(null, eventos(3))).toBe(0)
    expect(await contarPendentes(await projeto(), [])).toBe(0)
  })
})
