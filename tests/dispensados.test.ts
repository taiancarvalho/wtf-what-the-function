import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { alternarDispensado, lerDispensados, separarDispensados } from '../electron/dispensados.js'

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
