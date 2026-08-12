import { describe, expect, it } from 'vitest'
import { DICIONARIOS } from '../src/lib/i18n'

const pt = DICIONARIOS['pt-BR']
const en = DICIONARIOS.en
const es = DICIONARIOS.es

/**
 * Os três dicionários são listas longas, editadas por inserção no meio. É fácil
 * acrescentar uma chave em dois e esquecer o terceiro — e mais fácil ainda
 * colocar o texto certo no idioma errado, o que já aconteceu: uma frase em
 * português foi parar no bloco do espanhol e ninguém veria até um usuário
 * espanhol abrir a tela.
 */
describe('os três idiomas andam juntos', () => {
  it('toda chave do português existe nos outros dois', () => {
    const faltamEn = Object.keys(pt).filter((k) => !(k in en))
    const faltamEs = Object.keys(pt).filter((k) => !(k in es))
    expect(faltamEn, `sem tradução em inglês: ${faltamEn.join(', ')}`).toEqual([])
    expect(faltamEs, `sem tradução em espanhol: ${faltamEs.join(', ')}`).toEqual([])
  })

  it('nenhum dicionário tem chave que os outros não tenham', () => {
    const sobrandoEn = Object.keys(en).filter((k) => !(k in pt))
    const sobrandoEs = Object.keys(es).filter((k) => !(k in pt))
    expect(sobrandoEn, `só existe em inglês: ${sobrandoEn.join(', ')}`).toEqual([])
    expect(sobrandoEs, `só existe em espanhol: ${sobrandoEs.join(', ')}`).toEqual([])
  })

  it('nenhum texto foi parar no bloco do idioma errado', () => {
    // Heurística estreita, e é a que pega o erro real: inserir um bloco na
    // posição errada troca frases inteiras de idioma, e estas marcas são
    // exclusivas de uma língua ou da outra.
    const noEspanhol = Object.entries(pt).filter(([, v]) => / a la | de la |¿|ñ/.test(v))
    const noPortugues = Object.entries(es).filter(([, v]) => / para a | não | você /.test(v))
    expect(noEspanhol.map(([k]) => k), 'texto em espanhol dentro do português').toEqual([])
    expect(noPortugues.map(([k]) => k), 'texto em português dentro do espanhol').toEqual([])
  })
})
