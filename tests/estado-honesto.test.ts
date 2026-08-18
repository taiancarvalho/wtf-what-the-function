import { describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { ehTeste, estadoPorEvidencia } from '../electron/translate.js'
import { DICIONARIOS } from '../src/lib/i18n'

const pt = DICIONARIOS['pt-BR']
const en = DICIONARIOS.en
const es = DICIONARIOS.es

/**
 * O estado `tested` prometia mais do que o WTF sabe.
 *
 * `estadoPorEvidencia` promove a `tested` quando `temTeste` é verdadeiro, e
 * `temTeste` vem de `ehTeste`, que olha o NOME do arquivo. O WTF nunca executou
 * teste nenhum — o próprio `translate.js` admite isso no texto da evidência.
 *
 * Mesmo assim a tela dizia "Testado — alguma verificação automática passou", e
 * o tipo prometia "algo verificou (teste, build, browser)". Um `login.test.ts`
 * vazio, ou com um `it.skip()` dentro, produzia o selo mais forte que existe
 * antes da aprovação humana.
 *
 * Vender estado forte com evidência fraca é exatamente o que este produto
 * existe para impedir. Enquanto o WTF não rodar teste de verdade, o nome do
 * estado precisa dizer o que ele realmente sabe: que o teste EXISTE.
 */
describe('o estado não pode prometer verificação que não houve', () => {
  it('um arquivo de teste VAZIO já promove a tested — é só o nome', () => {
    expect(ehTeste('src/login.test.ts')).toBe(true)
    expect(estadoPorEvidencia({ temCodigo: true, temTeste: true, soDocumento: false })).toBe(
      'tested',
    )
  })

  /*
   * O texto é a única defesa enquanto a promoção continuar sendo por nome de
   * arquivo. Se alguém voltar a escrever "passou", "verificou" ou "checou", o
   * selo volta a afirmar o que ninguém provou.
   */
  it('nenhum idioma diz que algo passou, verificou ou foi checado', () => {
    const proibidos = [
      /\bpassou\b/i,
      /\bverifica(ç|c)\w*\s+autom/i,
      /\bpassed\b/i,
      /\bautomatic check\b/i,
      /\bpas(ó|o)\b/i,
      /\bcomprobaci(ó|o)n autom/i,
    ]
    for (const dic of [pt, en, es]) {
      const texto = `${dic['estado.tested']} ${dic['estado.tested.sentido']}`
      for (const re of proibidos) {
        expect(texto, `"${texto}" promete verificação`).not.toMatch(re)
      }
    }
  })

  it('os três idiomas dizem que o teste existe, e que ninguém o rodou', () => {
    expect(pt['estado.tested']).toBe('Tem teste escrito')
    expect(pt['estado.tested.sentido']).toMatch(/não executou/i)
    expect(en['estado.tested.sentido']).toMatch(/did not run/i)
    expect(es['estado.tested.sentido']).toMatch(/no ejecutó/i)
  })
})
