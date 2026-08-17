/**
 * "Explique isso" — a pergunta em linguagem natural sobre UMA mudança.
 *
 * Três decisões que moldam o arquivo:
 *
 *   1. Quem responde é a IA que a pessoa já tem instalada, em modo headless —
 *      a mesma que traduz o histórico. Não há chave para cadastrar, conta para
 *      criar nem fatura nova: se o agente roda no terminal, ele responde aqui.
 *   2. Streaming. A resposta é repassada conforme sai, porque esperar 20
 *      segundos olhando para um retângulo vazio é insuportável.
 *   3. Nunca lança. Agente ausente, saída vazia, processo morto: tudo vira
 *      `{ erro }` em uma frase que a pessoa entende.
 */

import { spawn } from 'node:child_process'

import { detectarAgente } from './terminal.js'
import { registrarPergunta } from './usage.js'

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

/**
 * A pergunta vai para a IA que a pessoa JÁ tem instalada, em modo headless.
 *
 * `aoPedaco(texto)` é chamado conforme a resposta sai. Devolve `{ ok }`,
 * `{ cancelado }` ou `{ erro }` — nunca lança.
 */
export async function perguntar({ contexto, pergunta, idioma, aoPedaco, sinal, dir }) {
  const agente = await detectarAgente()
  if (!agente) {
    return {
      erro: 'Nenhuma IA encontrada no seu computador. Instale o Claude Code, o Codex, o Gemini ou o opencode.',
    }
  }

  const { sistema, usuario } = montarPrompt({ contexto, pergunta, idioma })

  /*
   * Contar não é telemetria: o número fica no projeto da pessoa e é ela quem
   * lê. `dir` ausente (testes) simplesmente não conta nada.
   */
  if (texto(dir)) {
    try {
      await registrarPergunta(dir, agente.id || agente.cmd)
    } catch {
      /* contar nunca pode impedir a pessoa de perguntar */
    }
  }

  const emitir = typeof aoPedaco === 'function' ? aoPedaco : () => {}

  return new Promise((resolve) => {
    let filho
    try {
      filho = spawn(agente.caminho, agente.headless(`${sistema}\n\n${usuario}`, null), {
        cwd: texto(dir) || undefined,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (erro) {
      resolve({ erro: String(erro?.message ?? erro) })
      return
    }

    let saiu = ''
    let erroSaida = ''
    let cancelado = false

    const cancelar = () => {
      cancelado = true
      filho.kill()
    }
    sinal?.addEventListener?.('abort', cancelar, { once: true })

    /*
     * Repassado conforme chega: alguns CLIs vão escrevendo, outros cospem tudo
     * no fim. Nos que escrevem, a pessoa vê a resposta nascendo em vez de um
     * retângulo vazio por vinte segundos.
     */
    filho.stdout.on('data', (b) => {
      const pedaco = String(b)
      saiu += pedaco
      emitir(pedaco)
    })
    filho.stderr.on('data', (b) => {
      erroSaida += String(b)
    })

    filho.on('error', (erro) => resolve({ erro: String(erro?.message ?? erro) }))
    filho.on('close', (codigo) => {
      sinal?.removeEventListener?.('abort', cancelar)
      if (cancelado) return resolve({ cancelado: true })
      if (saiu.trim()) return resolve({ ok: true })
      const motivo = erroSaida.trim().split('\n').pop() || `o agente saiu com ${codigo}`
      resolve({ erro: `A IA não respondeu: ${motivo}` })
    })
  })
}
