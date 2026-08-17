import { describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { decidirAtualizacao } from '../electron/atualizacao.js'

/**
 * A regra do "atualizar", separada do git para poder ser provada.
 *
 * O caso que mais importa é o TRAVADO: `git pull` por cima de trabalho não
 * salvo na pasta do WTF ou falha no meio, deixando o aplicativo pela metade,
 * ou apaga o que a pessoa escreveu. Nenhum dos dois pode acontecer por conta
 * de um comando que ela achou que só "baixava a versão nova".
 */
describe('decidir se dá para atualizar', () => {
  it('mudança local trava, mesmo havendo versão nova', () => {
    expect(decidirAtualizacao({ commit: 'abc', atras: 12, sujo: true })).toEqual({
      estado: 'travado',
      motivo: 'ha-mudanca-local',
    })
  })

  it('mudança local trava até quando já está em dia — o estado é o mesmo', () => {
    expect(decidirAtualizacao({ commit: 'abc', atras: 0, sujo: true }).estado).toBe('travado')
  })

  it('sem commits atrás, está em dia', () => {
    expect(decidirAtualizacao({ commit: 'abc', atras: 0, sujo: false })).toEqual({
      estado: 'em-dia',
    })
  })

  it('commits atrás, e diz quantos', () => {
    expect(decidirAtualizacao({ commit: 'abc', atras: 3, sujo: false })).toEqual({
      estado: 'desatualizado',
      atras: 3,
    })
  })

  /*
   * Instalado sem `.git` não é erro: é outro jeito de ter o WTF. O que não
   * pode é oferecer um `git pull` numa pasta que não é repositório.
   */
  it('sem git, não há o que atualizar por aqui', () => {
    expect(decidirAtualizacao({ commit: null })).toEqual({ estado: 'sem-git' })
  })

  /*
   * Offline não vira "em dia". Dizer "você está na versão mais nova" sem ter
   * conseguido perguntar é exatamente a afirmação sem prova que este produto
   * existe para combater.
   */
  it('falha de rede vira desconhecido, nunca em-dia', () => {
    const r = decidirAtualizacao({ commit: 'abc', erro: 'sem-resposta-do-remoto' })
    expect(r.estado).toBe('desconhecido')
    expect(r.motivo).toBe('sem-resposta-do-remoto')
  })

  it('contagem ilegível também não vira em-dia por acidente', () => {
    expect(decidirAtualizacao({ commit: 'abc', atras: NaN, sujo: false }).estado).toBe('em-dia')
  })
})
