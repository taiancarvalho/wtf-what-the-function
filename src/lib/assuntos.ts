import { codigoCurto } from '@/lib/format'
import type { WtfEvent } from '@/types/protocol'

/**
 * Assunto — um aviso e tudo que veio depois dele.
 *
 * Antes, cada declaração da IA virava um cartão solto. Quando a pessoa pedia
 * "confere o XVFT", a resposta nascia como um item NOVO da fila — muitas vezes
 * também marcado como "precisa de atenção" — e o aviso original continuava lá.
 * A fila só crescia, e quem olhava não tinha como saber que aquilo era a mesma
 * conversa.
 *
 * Aqui um aviso e suas respostas viram UMA coisa só. O feed mostra o aviso; as
 * respostas aparecem dentro dele. A contagem do topo conta assuntos em aberto,
 * nunca eventos — três respostas continuam sendo um assunto.
 */
export interface Assunto {
  /** O aviso que abriu o assunto. É ele que aparece na lista. */
  aviso: WtfEvent
  /** As respostas, da mais antiga para a mais recente. */
  respostas: WtfEvent[]
  /** O evento mais recente do assunto — o aviso, se ninguém respondeu. */
  ultimo: WtfEvent
  /** O assunto continua na fila de coisas que pedem atenção. */
  pedeAtencao: boolean
  /** Houve resposta e ainda depende de uma decisão da pessoa. */
  aguardando: boolean
  /** Houve resposta e nada ficou pendente. */
  respondido: boolean
  /** O que a pessoa precisa ler quando o assunto ainda depende dela. */
  motivo?: string
}

/**
 * Sobe a cadeia até o aviso que abriu o assunto.
 *
 * A resposta de uma resposta continua caindo no mesmo assunto: seguimos os
 * códigos citados até chegar a um evento que não responde a ninguém. O conjunto
 * de visitados evita laço infinito se dois eventos se citarem mutuamente —
 * nesse caso paramos onde estamos em vez de rodar para sempre.
 */
function raizDe(evento: WtfEvent, porCodigo: Map<string, WtfEvent>): WtfEvent {
  const visitados = new Set<string>([evento.id])
  let atual = evento
  while (atual.respondeA) {
    const anterior = porCodigo.get(atual.respondeA)
    if (!anterior || visitados.has(anterior.id)) break
    visitados.add(anterior.id)
    atual = anterior
  }
  return atual
}

const maisAntigoPrimeiro = (a: WtfEvent, b: WtfEvent) =>
  new Date(a.at).getTime() - new Date(b.at).getTime()

/**
 * Junta os eventos em assuntos, preservando a ordem em que eles chegaram
 * (a lista vem do mais recente para o mais antigo).
 */
export function montarAssuntos(eventos: WtfEvent[]): Assunto[] {
  const porCodigo = new Map<string, WtfEvent>()
  for (const e of eventos) {
    const c = codigoCurto(e.id)
    if (!porCodigo.has(c)) porCodigo.set(c, e)
  }

  const raizes: WtfEvent[] = []
  const respostasPor = new Map<string, WtfEvent[]>()

  for (const e of eventos) {
    // Sem código citado, o evento abre um assunto próprio.
    if (!e.respondeA) {
      raizes.push(e)
      continue
    }
    const raiz = raizDe(e, porCodigo)
    // Aviso citado não encontrado (ou cadeia em círculo): vira assunto próprio,
    // senão a resposta sumiria do painel sem aparecer em lugar nenhum.
    if (raiz.id === e.id) {
      raizes.push(e)
      continue
    }
    const lista = respostasPor.get(raiz.id)
    if (lista) lista.push(e)
    else respostasPor.set(raiz.id, [e])
  }

  return raizes.map((aviso) => {
    const respostas = (respostasPor.get(aviso.id) ?? []).slice().sort(maisAntigoPrimeiro)
    const ultimo = respostas.at(-1) ?? aviso

    // A regra do desfecho, em uma frase: quem decide se o assunto continua
    // cobrando é a ÚLTIMA resposta, não o aviso original.
    //
    // Se a última resposta veio marcada como "precisa de atenção", a IA
    // devolveu algo para a pessoa decidir → o assunto fica "Aguardando sua
    // decisão" e continua contando como UMA pendência (nunca duas), e o texto
    // que a pessoa lê é o motivo dessa resposta.
    // Se a resposta não deixou nada pendente, o assunto está "Respondido pela
    // IA" e sai da conta.
    // Marcar o aviso como resolvido à mão fecha o assunto inteiro, tenha ele
    // respostas ou não.
    const resolvidoAMao = !!aviso.resolvido
    const pendente = !!ultimo.human?.needsYourAttention
    const pedeAtencao = !resolvidoAMao && pendente

    return {
      aviso,
      respostas,
      ultimo,
      pedeAtencao,
      aguardando: respostas.length > 0 && pedeAtencao,
      respondido: respostas.length > 0 && !pendente,
      motivo: ultimo.human?.attentionReason,
    }
  })
}
