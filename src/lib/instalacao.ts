import type { ItemInstalacao, PacoteInstalacao } from '@/types/protocol'

/**
 * Quais arquivos instalados ficaram para trás.
 *
 * `estadoInstalacao` responde se a peça EXISTE, e é o que decide entre "ligar o
 * WTF aqui" e "já está ligado". Só que uma versão nova do WTF muda o CONTEÚDO
 * das habilidades e do CLI — o arquivo continua lá, com texto velho. Para
 * aquele cálculo o projeto segue instalado, e a tela não tinha o que oferecer:
 * mostrava o selo "desatualizado" em cada linha e nenhum botão.
 *
 * Foi assim que a resolução dos arquivos por `git status` ficou parada: o
 * `wtf-claim.cjs` novo estava no WTF, e os projetos seguiam chamando o antigo.
 */
export function arquivosDesatualizados(pacote: PacoteInstalacao | null): ItemInstalacao[] {
  if (!pacote?.itens) return []
  // `jaExiste` importa: o que nunca foi instalado não está desatualizado, está
  // ausente — e isso é outro caminho, o de instalar.
  return pacote.itens.filter((i) => i.jaExiste && !i.igual && !i.erro)
}

/** Frase curta para a tela, já no plural certo. */
export function resumoDesatualizados(itens: ItemInstalacao[]): string | null {
  if (itens.length === 0) return null
  return itens.length === 1 ? '1 arquivo' : `${itens.length} arquivos`
}
