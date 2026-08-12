import { codigoCurto } from '@/lib/format'
import type { ConfigProjeto, Feature, WtfEvent } from '@/types/protocol'

/**
 * O que fazer com um alerta.
 *
 * Apontar um problema para quem não sabe programar e parar por aí é gerar
 * ansiedade sem oferecer saída. Aqui o painel deixa de só diagnosticar: cada
 * alerta vira uma mensagem pronta, escrita em primeira pessoa, que a pessoa
 * manda para a IA sem precisar saber formular o pedido.
 *
 * As mensagens são montadas aqui, sem modelo: são instantâneas, previsíveis,
 * funcionam offline e não gastam chamada. O que o modelo já escreveu (a
 * manchete, o motivo do alerta) entra como contexto.
 *
 * DOIS IDIOMAS DIFERENTES CONVIVEM NESTE ARQUIVO.
 *
 * O que aparece na TELA (rótulo do botão, a nota embaixo dele) segue o idioma
 * da interface — por isso vem em chave de dicionário, traduzida por quem
 * desenha o botão (`OQueFazer`), não aqui.
 *
 * O CORPO da mensagem segue outro eixo: é instrução para um modelo, não texto
 * para uma pessoa ler numa língua específica. Traduzi-lo para os três idiomas
 * da interface seria triplicar a manutenção de um texto que nenhum humano
 * precisa ler traduzido — e ainda assim erraria, porque a pessoa pode querer
 * a interface em inglês e as explicações em japonês. Em vez disso o corpo fica
 * num texto só e ganha, no fim, um pedido explícito de responder no idioma de
 * CONTEÚDO escolhido (`ConfigProjeto.nomeIdiomaConteudo`).
 */

export interface Acao {
  id: string
  /**
   * Chave do dicionário com o que o botão diz. Verbo, do ponto de vista da
   * pessoa. Quem renderiza traduz — o texto na tela segue a interface.
   */
  chaveRotulo: string
  /** Chave da linha que explica o que vai acontecer se clicar. */
  chaveNota: string
  /** A mensagem que vai para a IA. Já montada, no idioma do conteúdo. */
  mensagem: string
}

/**
 * A linha final da mensagem.
 *
 * A pessoa escolheu, na configuração do projeto, em que língua quer receber as
 * explicações. Como esta mensagem sai em nome dela, ela precisa carregar esse
 * pedido junto — senão a IA responde na língua que ela achar melhor e a pessoa
 * recebe, no próprio terminal, um texto que talvez não consiga ler.
 *
 * Sem config não há pedido: melhor não dizer nada do que chutar uma língua.
 */
function pedidoDeIdioma(config?: ConfigProjeto): string {
  if (!config?.nomeIdiomaConteudo) return ''
  return `\n\nResponda em ${config.nomeIdiomaConteudo}.`
}

/**
 * Fecho da mensagem: contexto técnico e o pedido de retorno ao painel.
 *
 * O pedido de retorno é o que faltava. Sem ele, a IA respondia no terminal e o
 * painel não ficava sabendo de nada — a pessoa pedia, era atendida, voltava ao
 * painel e via tudo igual, sem saber se algo aconteceu. Pior: quando a IA só
 * *verifica* e conclui que estava tudo certo, não há mudança nenhuma no
 * projeto para o painel detectar. O silêncio é indistinguível de falha.
 */
function rodape(codigo: string, parte: string, arquivos: string[] = [], id?: string): string {
  const partes: string[] = []

  partes.push(
    `Ao terminar, avise o painel — inclusive se a conclusão for "não havia problema":\n` +
      `node .wtf/bin/wtf-claim.cjs done --feature ${JSON.stringify(parte)} ` +
      `--text "<o que você concluiu, em uma ou duas frases, sem jargão>"\n` +
      `Comece também com o "start" equivalente se o trabalho for demorado.\n` +
      `Mencione o código ${codigo} no texto, para eu saber a qual aviso isso responde.`,
  )

  if (arquivos.length) {
    partes.push(`Arquivos envolvidos:\n${arquivos.slice(0, 12).map((f) => `- ${f}`).join('\n')}`)
  }
  if (id) partes.push(`Referência interna: ${id}`)
  return `\n\n---\n${partes.join('\n\n')}`
}

/**
 * Ações para um evento que pede atenção.
 * A ordem importa: a primeira é a que a maioria das pessoas quer.
 */
export function acoesDoEvento(
  evento: WtfEvent,
  feature?: Feature,
  codigoDoAssunto?: string,
  config?: ConfigProjeto,
): Acao[] {
  const h = evento.human
  if (!h) return []

  /*
   * O código citado é sempre o do AVISO que abriu o assunto, nunca o da última
   * resposta. Se cada resposta trouxesse um código novo, a próxima resposta da
   * IA cairia num assunto diferente e a conversa se fragmentaria de novo — o
   * mesmo problema voltando pela porta dos fundos.
   */
  const codigo = codigoDoAssunto ?? codigoCurto(evento.id)
  const parte = feature?.name ?? 'esta parte do projeto'
  const arquivos = evento.technical?.files ?? []
  const motivo = h.attentionReason ?? ''

  const contexto =
    `Contexto (aviso ${codigo}, levantado pelo WTF, um painel que acompanha o projeto):\n` +
    `Parte do produto: ${parte}\n` +
    `Mudança: ${h.headline}\n` +
    (motivo ? `Ponto de atenção: ${motivo}\n` : '')

  const acoes: Acao[] = [
    {
      id: 'resolver',
      chaveRotulo: 'acao.resolver',
      chaveNota: 'acao.resolver.nota',
      mensagem:
        `${contexto}\n` +
        `Preciso que você cuide desse ponto de atenção.\n\n` +
        `Antes de alterar qualquer coisa: verifique se o problema realmente existe, ` +
        `me explique em palavras simples o que você encontrou e o que pretende fazer, ` +
        `e só mexa depois que eu confirmar. ` +
        `Se for um alarme falso, diga isso claramente em vez de mexer no código à toa.` +
        rodape(codigo, parte, arquivos, evento.id) +
        pedidoDeIdioma(config),
    },
    {
      id: 'explicar',
      chaveRotulo: 'acao.explicar',
      chaveNota: 'acao.explicar.nota',
      mensagem:
        `${contexto}\n` +
        `Me explique isso em palavras simples, como se eu não soubesse programar.\n\n` +
        `Quero entender: o que exatamente muda para quem usa o produto, ` +
        `qual é o risco de verdade (e se é grave ou não), e o que costuma ser feito ` +
        `nesses casos. Não altere nenhum arquivo — é só explicação.` +
        rodape(codigo, parte, arquivos, evento.id) +
        pedidoDeIdioma(config),
    },
    {
      id: 'verificar',
      chaveRotulo: 'acao.verificar',
      chaveNota: 'acao.verificar.nota',
      mensagem:
        `${contexto}\n` +
        `Confira se isso está mesmo funcionando e me mostre a prova.\n\n` +
        `Rode os testes que cobrem essa parte, ou crie um teste se não existir. ` +
        `Me mostre a saída real do que você rodou. ` +
        `Se não der para provar que funciona, diga isso com clareza em vez de afirmar que está pronto.` +
        rodape(codigo, parte, arquivos, evento.id) +
        pedidoDeIdioma(config),
    },
  ]

  return acoes
}

/** Ações para trabalho que existe no disco e ainda não foi salvo. */
export function acoesDeNaoSalvo(features: Feature[], config?: ConfigProjeto): Acao[] {
  const partes = features.filter((f) => f.unsaved).map((f) => f.name)
  const total = features.reduce((soma, f) => soma + (f.unsavedCount ?? 0), 0)
  if (total === 0) return []

  const lista = partes.length
    ? `As partes com trabalho não guardado são: ${partes.join(', ')}.\n`
    : ''

  return [
    {
      id: 'salvar',
      chaveRotulo: 'acao.salvar',
      chaveNota: 'acao.salvar.nota',
      mensagem:
        `Contexto (isto foi levantado pelo WTF, um painel que acompanha o projeto):\n` +
        `Existem ${total} arquivos alterados ou criados que ainda não foram salvos no histórico do projeto.\n` +
        lista +
        `\nRevise o que está pendente e guarde no histórico.\n\n` +
        `Antes de guardar: me diga em palavras simples o que foi feito e se ficou algo pela metade. ` +
        `Separe em partes que façam sentido para uma pessoa, em vez de guardar tudo de uma vez. ` +
        `Não guarde nada que pareça arquivo temporário, de teste manual ou com senha dentro.` +
        pedidoDeIdioma(config),
    },
    {
      id: 'resumir-pendente',
      chaveRotulo: 'acao.resumirPendente',
      chaveNota: 'acao.resumirPendente.nota',
      mensagem:
        `Contexto (isto foi levantado pelo WTF, um painel que acompanha o projeto):\n` +
        `Existem ${total} arquivos alterados ou criados que ainda não foram salvos no histórico.\n` +
        lista +
        `\nMe explique, em palavras simples, o que está em aberto agora.\n\n` +
        `Quero saber: o que já está terminado, o que ficou pela metade, ` +
        `e se tem alguma coisa aí que possa quebrar o que já funcionava. ` +
        `Não altere nem guarde nada — é só um resumo.` +
        pedidoDeIdioma(config),
    },
  ]
}
