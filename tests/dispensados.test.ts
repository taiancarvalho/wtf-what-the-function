import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import {
  alternarDispensado,
  lerDispensados,
  lerPropostas,
  removerProposta,
  separarDispensados,
} from '../electron/dispensados.js'

let raiz: string
let n = 0
const projeto = () => path.join(raiz, `p${n++}`)

const achado = (extra = {}) => ({
  tipo: 'email',
  arquivo: 'src/lib/auth-providers.ts',
  linha: 14,
  trecho: 'onb•••@resend.dev',
  rotulo: 'E-mail de uma pessoa',
  confianca: 'media',
  ...extra,
})

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-disp-'))
})
afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

describe('marcar um achado como falso alarme', () => {
  it('sai da lista de achados e aparece na de dispensados', async () => {
    const dir = projeto()
    await alternarDispensado(dir, achado())
    const out = separarDispensados({ achados: [achado()] }, await lerDispensados(dir))
    expect(out.achados).toHaveLength(0)
    expect(out.dispensados).toHaveLength(1)
  })

  it('clicar de novo desfaz', async () => {
    const dir = projeto()
    await alternarDispensado(dir, achado())
    expect((await alternarDispensado(dir, achado())).dispensado).toBe(false)
    const out = separarDispensados({ achados: [achado()] }, await lerDispensados(dir))
    expect(out.achados).toHaveLength(1)
  })

  /**
   * A regra que sustenta o recurso inteiro. Sem ela, dispensar um e-mail em
   * `auth.ts:14` calaria aquela linha para sempre — e o dia em que alguém
   * colasse ali uma chave de verdade seria o dia em que o painel ficaria mudo.
   */
  it('a dispensa CADUCA quando o valor daquele lugar muda', async () => {
    const dir = projeto()
    await alternarDispensado(dir, achado())

    const dispensados = await lerDispensados(dir)
    const mesmoLugarOutroValor = achado({ trecho: 'AKIA••••••••••••XY' })
    const out = separarDispensados({ achados: [mesmoLugarOutroValor] }, dispensados)

    expect(out.achados, 'valor novo no mesmo lugar tem que voltar a avisar').toHaveLength(1)
    expect(out.dispensados).toHaveLength(0)
  })

  it('não dispensa achado parecido de outro arquivo', async () => {
    const dir = projeto()
    await alternarDispensado(dir, achado())
    const outro = achado({ arquivo: 'src/pages/Contato.tsx' })
    expect(separarDispensados({ achados: [outro] }, await lerDispensados(dir)).achados).toHaveLength(1)
  })

  it('o que vai para o disco é só o trecho MASCARADO', async () => {
    const dir = projeto()
    await alternarDispensado(dir, achado())
    const bruto = await readFile(path.join(dir, '.wtf', 'seguranca-dispensada.json'), 'utf8')
    // O mascarado tem os pontos no meio; o valor inteiro nunca passou por aqui.
    expect(bruto).toContain('•')
    expect(bruto).not.toContain('onboarding@resend.dev')
  })

  it('arquivo corrompido vale o mesmo que nenhuma dispensa', async () => {
    const out = separarDispensados({ achados: [achado()] }, {})
    expect(out.achados).toHaveLength(1)
    expect(await lerDispensados(projeto())).toEqual({})
  })
})

/**
 * A IA propõe, a pessoa confirma.
 *
 * A varredura acerta o formato e erra o contexto, e quem sabe julgar isso é
 * quem lê o código. Mas deixar a IA arquivar sozinha o próprio alerta de
 * segurança seria ela corrigindo a própria prova — o contrário do que este
 * painel faz. Então ela escreve o motivo, e a decisão continua sendo um clique
 * de quem manda no projeto.
 */
describe('propostas de falso positivo', () => {
  const proposta = (dir: string, arquivo: string, linha: number, motivo: string) =>
    import('node:fs/promises').then(async (fs) => {
      const p = path.join(dir, '.wtf')
      await fs.mkdir(p, { recursive: true })
      let itens: Record<string, unknown> = {}
      try {
        itens = JSON.parse(await fs.readFile(path.join(p, 'seguranca-propostas.json'), 'utf8')).itens
      } catch {
        /* primeiro */
      }
      itens[`${arquivo}:${linha}`] = { at: new Date().toISOString(), motivo, por: 'claude-code' }
      await fs.writeFile(
        path.join(p, 'seguranca-propostas.json'),
        JSON.stringify({ v: 1, itens }),
        'utf8',
      )
    })

  it('a proposta viaja junto do achado, sem tirá-lo da lista', async () => {
    const dir = projeto()
    await proposta(dir, 'src/lib/auth-providers.ts', 14, 'É o e-mail institucional exigido por lei.')

    const out = separarDispensados({ achados: [achado()] }, {}, await lerPropostas(dir))

    // Continua na lista: propor não é dispensar.
    expect(out.achados).toHaveLength(1)
    expect(out.achados[0].proposta.motivo).toContain('institucional')
    expect(out.dispensados).toHaveLength(0)
  })

  it('proposta SEM motivo é ignorada — ninguém decide sem saber por quê', async () => {
    const dir = projeto()
    await proposta(dir, 'src/lib/auth-providers.ts', 14, '   ')
    expect(await lerPropostas(dir)).toEqual({})
  })

  it('proposta de outra linha não gruda no achado errado', async () => {
    const dir = projeto()
    await proposta(dir, 'src/lib/auth-providers.ts', 99, 'outro lugar')
    const out = separarDispensados({ achados: [achado()] }, {}, await lerPropostas(dir))
    expect(out.achados[0].proposta).toBeUndefined()
  })

  it('aceitar consome a proposta e dispensa o achado', async () => {
    const dir = projeto()
    await proposta(dir, 'src/lib/auth-providers.ts', 14, 'exigido por lei')

    await alternarDispensado(dir, achado(), 'exigido por lei')
    await removerProposta(dir, 'src/lib/auth-providers.ts', 14)

    const out = separarDispensados({ achados: [achado()] }, await lerDispensados(dir), await lerPropostas(dir))
    expect(out.achados).toHaveLength(0)
    expect(out.dispensados).toHaveLength(1)
    expect(await lerPropostas(dir)).toEqual({})
  })

  it('recusar tira a proposta e MANTÉM o aviso de pé', async () => {
    const dir = projeto()
    await proposta(dir, 'src/lib/auth-providers.ts', 14, 'acho que não é nada')
    await removerProposta(dir, 'src/lib/auth-providers.ts', 14)

    const out = separarDispensados({ achados: [achado()] }, await lerDispensados(dir), await lerPropostas(dir))
    expect(out.achados).toHaveLength(1)
    expect(out.achados[0].proposta).toBeUndefined()
  })
})
