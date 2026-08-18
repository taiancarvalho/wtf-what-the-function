import { describe, expect, it } from 'vitest'

import { arquivosDesatualizados, resumoDesatualizados } from '../src/lib/instalacao'
import type { ItemInstalacao, PacoteInstalacao } from '../src/types/protocol'

/**
 * O defeito: a tela dizia "desatualizado" e não dava saída.
 *
 * `estadoInstalacao` só olha se o arquivo EXISTE. Quando uma versão nova do WTF
 * muda o conteúdo de uma habilidade, o arquivo continua lá — o projeto conta
 * como instalado, a lista mostra o selo de desatualizado em cada linha, e não
 * havia botão nenhum, porque o de atualizar só aparecia para quem estava
 * DESinstalado.
 *
 * Não é cosmético: foi assim que o `wtf-claim.cjs` novo ficou parado no WTF
 * enquanto os projetos seguiam chamando a versão antiga.
 */
const item = (p: Partial<ItemInstalacao>): ItemInstalacao =>
  ({
    destino: 'x',
    origem: 'x',
    titulo: 'x',
    proposito: 'x',
    conteudo: '',
    bytes: 0,
    jaExiste: true,
    igual: true,
    ...p,
  }) as ItemInstalacao

const pacote = (itens: ItemInstalacao[]) => ({ itens }) as PacoteInstalacao

describe('achar o que ficou para trás', () => {
  it('pega o arquivo que existe com conteúdo diferente', () => {
    const r = arquivosDesatualizados(
      pacote([item({ destino: 'a', igual: true }), item({ destino: 'b', igual: false })]),
    )
    expect(r.map((i) => i.destino)).toEqual(['b'])
  })

  /*
   * Ausente não é desatualizado: é outro caminho, o de instalar. Confundir os
   * dois faria a tela oferecer "atualizar" para quem nunca instalou.
   */
  it('o que nunca foi instalado não conta como desatualizado', () => {
    const r = arquivosDesatualizados(pacote([item({ jaExiste: false, igual: false })]))
    expect(r).toHaveLength(0)
  })

  it('arquivo que nem deu para ler fica de fora — não sabemos se está velho', () => {
    const r = arquivosDesatualizados(pacote([item({ igual: false, erro: 'sem permissão' })]))
    expect(r).toHaveLength(0)
  })

  it('tudo em dia devolve lista vazia', () => {
    expect(arquivosDesatualizados(pacote([item({}), item({})]))).toHaveLength(0)
  })

  it('sem pacote (fora do app) não inventa pendência', () => {
    expect(arquivosDesatualizados(null)).toHaveLength(0)
  })

  it('o resumo acerta o plural, e some quando não há nada', () => {
    expect(resumoDesatualizados([item({ igual: false })])).toBe('1 arquivo')
    expect(resumoDesatualizados([item({}), item({})])).toBe('2 arquivos')
    expect(resumoDesatualizados([])).toBeNull()
  })
})
