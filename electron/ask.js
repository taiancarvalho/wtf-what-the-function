/**
 * "Explique isso" — a pergunta em linguagem natural sobre UMA mudança.
 *
 * Três decisões que moldam o arquivo:
 *
 *   1. Este módulo não sabe o que é Electron. Recebe a chave e um callback de
 *      pedaço, devolve `{ ok }` ou `{ erro }`. Assim dá para testá-lo com uma
 *      chave falsa sem subir o app — e é exatamente o que fazemos.
 *   2. Streaming. A resposta chega em pedaços porque esperar 20 segundos
 *      olhando para um retângulo vazio é insuportável.
 *   3. Nunca lança. Rede caiu, chave inválida, JSON estranho: tudo vira
 *      `{ erro }` em uma frase que a pessoa entende.
 *
 * Um provedor por função, mesma assinatura. Hoje só OpenRouter funciona; os
 * outros dois existem para o dia em que forem ligados, e falham dizendo isso.
 */

import { registrarPergunta } from './usage.js'

/** Modelo padrão: barato, rápido e bom o suficiente para explicar um diff. */
export const MODELO_PADRAO = 'google/gemini-2.0-flash-001'

/** O diff cru é o pedaço que estoura qualquer orçamento de tokens. */
const LIMITE_DIFF = 6000

const texto = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * O prompt.
 *
 * Só entra aqui o que o painel JÁ mostra daquela mudança. O modelo não abre o
 * repositório, não roda nada, não vê o resto do projeto — e o prompt diz isso
 * com todas as letras, porque a pior resposta possível neste produto é uma
 * invenção convincente sobre o código de alguém.
 */
export function montarPrompt({ contexto, pergunta, idioma }) {
  const c = contexto && typeof contexto === 'object' ? contexto : {}
  const lingua = texto(idioma) || 'português do Brasil'

  const partes = []
  if (texto(c.headline)) partes.push(`MANCHETE: ${texto(c.headline)}`)
  if (texto(c.what)) partes.push(`O QUE MUDOU: ${texto(c.what)}`)
  if (texto(c.why)) partes.push(`POR QUÊ: ${texto(c.why)}`)
  if (texto(c.impact)) partes.push(`IMPACTO: ${texto(c.impact)}`)
  if (texto(c.attentionReason)) partes.push(`ALERTA: ${texto(c.attentionReason)}`)
  if (texto(c.claim)) partes.push(`O QUE A IA DECLAROU: ${texto(c.claim)}`)
  if (texto(c.feature)) partes.push(`PARTE DO PROJETO: ${texto(c.feature)}`)

  const arquivos = Array.isArray(c.files) ? c.files.filter((f) => texto(f)).slice(0, 40) : []
  if (arquivos.length) partes.push(`ARQUIVOS TOCADOS:\n${arquivos.map((f) => `- ${f}`).join('\n')}`)

  const patch = texto(c.patch)
  if (patch) {
    const cortado = patch.length > LIMITE_DIFF
    partes.push(
      `DIFF${cortado ? ' (cortado)' : ''}:\n${patch.slice(0, LIMITE_DIFF)}` +
        (cortado ? '\n[…diff cortado aqui — o restante não foi enviado]' : ''),
    )
  }

  const sistema = [
    `Você explica mudanças de código para uma pessoa que NÃO programa e que é dona do projeto.`,
    `Responda em ${lingua}.`,
    `Regras:`,
    `- Fale do que a mudança significa na prática, não de sintaxe.`,
    `- Nada de jargão sem tradução. Nada de trecho de código na resposta.`,
    `- Seja breve: 2 a 5 frases, ou uma lista curta.`,
    `- NÃO INVENTE. Você só enxerga o contexto abaixo — nem o resto do projeto,`,
    `  nem o histórico. Se a resposta não estiver aí, diga com franqueza que não`,
    `  dá para saber olhando só esta mudança, e diga o que precisaria ser olhado.`,
    `- Não dê garantias de segurança nem diga que "está tudo certo" sem evidência.`,
  ].join('\n')

  const usuario = [
    'CONTEXTO DA MUDANÇA',
    '===================',
    partes.join('\n\n') || '(sem detalhes registrados para esta mudança)',
    '',
    'PERGUNTA DA PESSOA',
    '==================',
    texto(pergunta) || 'Explique esta mudança.',
  ].join('\n')

  return { sistema, usuario }
}

function erroLegivel(status, corpo) {
  const detalhe = texto(
    (() => {
      try {
        const j = JSON.parse(corpo)
        return j?.error?.message ?? j?.error ?? j?.message ?? ''
      } catch {
        return corpo?.slice(0, 300) ?? ''
      }
    })(),
  )
  if (status === 401 || status === 403) {
    return `A chave foi recusada pelo provedor${detalhe ? ` (${detalhe})` : ''}. Confira a chave em Configurações.`
  }
  if (status === 402) return 'A conta do provedor está sem crédito para responder.'
  if (status === 429) return 'O provedor pediu para esperar um pouco (limite de uso). Tente de novo em instantes.'
  if (status >= 500) return 'O provedor está com problema no momento. Tente de novo daqui a pouco.'
  return `O provedor recusou a pergunta (${status})${detalhe ? `: ${detalhe}` : ''}.`
}

/**
 * OpenRouter. `HTTP-Referer` e `X-Title` são os cabeçalhos que eles pedem para
 * identificar o aplicativo — sem eles a chamada funciona, mas o app não
 * aparece nos rankings e no painel de uso da pessoa.
 */
async function perguntarOpenRouter({ chave, modelo, sistema, usuario, aoPedaco, sinal }) {
  let resposta
  try {
    resposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: sinal,
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/wtf-app',
        'X-Title': 'WTF',
      },
      body: JSON.stringify({
        model: modelo,
        stream: true,
        max_tokens: 700,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: usuario },
        ],
      }),
    })
  } catch (erro) {
    if (erro?.name === 'AbortError') return { cancelado: true }
    return { erro: 'Não foi possível falar com o provedor. Verifique sua conexão.' }
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '')
    return { erro: erroLegivel(resposta.status, corpo) }
  }
  if (!resposta.body) return { erro: 'O provedor respondeu vazio.' }

  const leitor = resposta.body.getReader()
  const decodificador = new TextDecoder()
  let sobra = ''
  let recebeu = false

  try {
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      sobra += decodificador.decode(value, { stream: true })

      // SSE: eventos separados por linha em branco, dados em linhas `data: `.
      const linhas = sobra.split('\n')
      sobra = linhas.pop() ?? ''
      for (const linha of linhas) {
        const l = linha.trim()
        if (!l.startsWith('data:')) continue
        const dado = l.slice(5).trim()
        if (!dado || dado === '[DONE]') continue
        try {
          const j = JSON.parse(dado)
          const pedaco = j?.choices?.[0]?.delta?.content
          if (typeof pedaco === 'string' && pedaco) {
            recebeu = true
            aoPedaco(pedaco)
          }
        } catch {
          // Linha de keep-alive ou comentário do provedor: ignorar é o certo.
        }
      }
    }
  } catch (erro) {
    if (erro?.name === 'AbortError') return { cancelado: true }
    if (!recebeu) return { erro: 'A conexão caiu antes da resposta começar.' }
    // Já havia texto na tela: melhor entregar o que veio do que apagar tudo.
    return { ok: true, incompleta: true }
  }

  if (!recebeu) return { erro: 'O provedor não devolveu nenhuma resposta.' }
  return { ok: true }
}

/** Estrutura pronta; ligar quando houver por que ligar. */
async function perguntarAnthropic() {
  return { erro: 'Por enquanto o WTF só sabe perguntar pelo OpenRouter.' }
}

async function perguntarOpenAI() {
  return { erro: 'Por enquanto o WTF só sabe perguntar pelo OpenRouter.' }
}

const PROVEDORES = {
  openrouter: perguntarOpenRouter,
  anthropic: perguntarAnthropic,
  openai: perguntarOpenAI,
}

/**
 * Faz a pergunta. `aoPedaco(texto)` é chamado a cada pedaço que chega.
 * Devolve `{ ok }`, `{ cancelado }` ou `{ erro }` — nunca lança.
 */
export async function perguntar({
  provedor = 'openrouter',
  chave,
  modelo,
  contexto,
  pergunta,
  idioma,
  aoPedaco,
  sinal,
  dir,
}) {
  const fn = PROVEDORES[texto(provedor) || 'openrouter']
  if (!fn) return { erro: 'Provedor desconhecido.' }
  if (!texto(chave)) {
    return { erro: 'Nenhuma chave configurada. Informe uma chave para poder perguntar.' }
  }

  const { sistema, usuario } = montarPrompt({ contexto, pergunta, idioma })

  /*
   * Cada pergunta consome créditos da chave DA PESSOA. Contar não é
   * telemetria: o número fica no projeto dela, é ela quem lê, e é a única
   * forma de ninguém ser pego desprevenido pela fatura. Contamos antes de
   * enviar, porque a chamada que falha no meio também pode ter sido cobrada.
   * `dir` ausente (uso fora do app, testes) simplesmente não conta nada.
   */
  if (texto(dir)) {
    try {
      await registrarPergunta(dir, texto(provedor) || 'openrouter')
    } catch {
      /* contar nunca pode impedir a pessoa de perguntar */
    }
  }

  try {
    return await fn({
      chave: texto(chave),
      modelo: texto(modelo) || MODELO_PADRAO,
      sistema,
      usuario,
      aoPedaco: typeof aoPedaco === 'function' ? aoPedaco : () => {},
      sinal,
    })
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
}
