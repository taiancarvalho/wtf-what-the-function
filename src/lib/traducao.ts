/**
 * Quando a tela deve OFERECER a tradução.
 *
 * A pergunta existe porque traduzir consome a assinatura de quem tem plano
 * limitado, e gastar sem perguntar é o que este produto existe para combater.
 * Mas ela é uma pergunta, e pergunta respondida não se repete: quem disse
 * "sempre" já autorizou, quem disse "nunca" já recusou, e voltar a perguntar
 * nas duas ignora a resposta que a pessoa deu.
 *
 * O que fazia isso acontecer: a tela olhava só a contagem de pendentes. Como o
 * teto por rodada é 8, um projeto com mais de 8 mudanças por traduzir SEMPRE
 * tem pendentes — então a faixa reaparecia a cada abertura, mesmo depois de
 * "sempre traduzir", e a única forma de calá-la seria traduzir tudo.
 */
export type RespostaTraducaoSalva = 'perguntar' | 'sim' | 'nao' | undefined

export interface EstadoTraducao {
  /** Mudanças ainda em linguagem de commit. */
  pendentes: number
  /** Há uma IA instalada capaz de traduzir. */
  disponivel: boolean
  /** O que a pessoa já respondeu, se respondeu. */
  auto?: RespostaTraducaoSalva
}

/** `perguntar` é o único estado em que a faixa tem o que perguntar. */
export function deveOferecerTraducao({ pendentes, disponivel, auto }: EstadoTraducao): boolean {
  if (!disponivel) return false
  if (pendentes <= 0) return false
  // Ausente vale `perguntar`: é o padrão de quem nunca respondeu.
  return (auto ?? 'perguntar') === 'perguntar'
}

/**
 * O que dizer a quem já autorizou e ainda tem fila.
 *
 * Some com a pergunta, mas não com a informação: as mudanças estão em
 * linguagem de commit por um motivo, e sumir em silêncio faria parecer que a
 * tradução simplesmente não funciona.
 */
export function traducaoEmFila({ pendentes, disponivel, auto }: EstadoTraducao): boolean {
  return disponivel && pendentes > 0 && auto === 'sim'
}
