import { describe, expect, it } from 'vitest'

import { deveOferecerTraducao, traducaoEmFila } from '../src/lib/traducao'

/**
 * O bug que este arquivo existe para não deixar voltar.
 *
 * A faixa de "traduzir" reaparecia a cada abertura da tela, mesmo depois de
 * "sempre traduzir". A tela decidia só pela contagem de pendentes — e como o
 * teto por rodada é 8, um projeto com mais de 8 mudanças por traduzir tem
 * pendentes para sempre. O `auto` com a resposta da pessoa já chegava do
 * processo principal, e era ignorado.
 */
describe('quando oferecer a tradução', () => {
  const base = { pendentes: 12, disponivel: true }

  it('oferece a quem ainda não respondeu', () => {
    expect(deveOferecerTraducao({ ...base, auto: 'perguntar' })).toBe(true)
  })

  it('resposta ausente vale por "ainda não respondeu"', () => {
    expect(deveOferecerTraducao(base)).toBe(true)
  })

  it('NÃO pergunta de novo a quem disse sempre — o bug', () => {
    expect(deveOferecerTraducao({ ...base, auto: 'sim' })).toBe(false)
  })

  it('NÃO pergunta de novo a quem disse nunca', () => {
    expect(deveOferecerTraducao({ ...base, auto: 'nao' })).toBe(false)
  })

  /*
   * O teto por rodada é o que fazia o bug ser permanente: com fila sempre
   * cheia, "some quando não houver pendentes" nunca chegava.
   */
  it('a fila continuar cheia não devolve a pergunta a quem já respondeu', () => {
    for (const pendentes of [1, 8, 9, 500]) {
      expect(deveOferecerTraducao({ pendentes, disponivel: true, auto: 'sim' })).toBe(false)
    }
  })

  it('sem IA instalada não há o que oferecer', () => {
    expect(deveOferecerTraducao({ pendentes: 12, disponivel: false, auto: 'perguntar' })).toBe(false)
  })

  it('sem pendentes não há o que oferecer', () => {
    expect(deveOferecerTraducao({ pendentes: 0, disponivel: true, auto: 'perguntar' })).toBe(false)
  })
})

/**
 * Sumir com a pergunta não pode virar sumir com a informação: quem autorizou e
 * ainda tem fila precisa saber por que aquelas linhas seguem em linguagem de
 * commit, senão parece que a tradução não funciona.
 */
describe('avisar que a fila está andando', () => {
  it('avisa quem autorizou e ainda tem fila', () => {
    expect(traducaoEmFila({ pendentes: 30, disponivel: true, auto: 'sim' })).toBe(true)
  })

  it('não avisa quem ainda vai ser perguntado', () => {
    expect(traducaoEmFila({ pendentes: 30, disponivel: true, auto: 'perguntar' })).toBe(false)
  })

  it('não avisa quem recusou: fila parada não é fila andando', () => {
    expect(traducaoEmFila({ pendentes: 30, disponivel: true, auto: 'nao' })).toBe(false)
  })

  it('sem fila, nada a dizer', () => {
    expect(traducaoEmFila({ pendentes: 0, disponivel: true, auto: 'sim' })).toBe(false)
  })
})
