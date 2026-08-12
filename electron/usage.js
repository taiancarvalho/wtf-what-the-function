/**
 * Contador de consumo: `<projeto>/.wtf/usage.json`.
 *
 * Por que este arquivo existe
 * ===========================
 * O WTF nasceu para acabar com o "OK, OK, OK sem saber o que está acontecendo".
 * Um app assim não pode ser o próprio exemplo do problema: gastar a assinatura
 * ou os créditos da pessoa sem ela ver. Então tudo que consome recurso dela é
 * contado aqui, em números que ela consegue abrir e conferir.
 *
 * Duas contas diferentes, de propósito:
 *   traducoes — usa o CLI que ela já tem instalado. Não gera fatura, mas
 *               consome a assinatura de quem tem plano limitado.
 *   perguntas — usa a chave dela num provedor pago. Custo direto, por pergunta.
 *
 * `cache` é o número que mais importa mostrar: é a prova de que o app
 * reaproveita o que já traduziu em vez de gastar de novo. Sem ele, a economia
 * é invisível e a pessoa não tem como saber se o app é cuidadoso ou perdulário.
 *
 * Formato:
 *   { v: 1,
 *     traducoes: { chamadas, eventos, cache },
 *     perguntas: { chamadas, porProvedor: { openrouter: 3, ... } },
 *     desde: ISO }
 *
 * Como os outros módulos de estado, este é TOLERANTE: arquivo ausente, JSON
 * quebrado ou formato estranho valem todos a mesma coisa — o contador zerado.
 * Nunca lança. Perder a contagem é chato; derrubar o painel por causa dela
 * seria muito pior.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const arquivoDe = (dir) => path.join(dir, '.wtf', 'usage.json')

/** Contador zerado. `desde` só é preenchido quando algo de fato é gravado. */
export function usoVazio(desde) {
  return {
    v: 1,
    traducoes: { chamadas: 0, eventos: 0, cache: 0 },
    perguntas: { chamadas: 0, porProvedor: {} },
    desde: typeof desde === 'string' && desde ? desde : null,
  }
}

/** Número inteiro não-negativo, ou 0. Nunca NaN, nunca negativo. */
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function normalizar(dados) {
  const b = dados && typeof dados === 'object' ? dados : {}
  const t = b.traducoes && typeof b.traducoes === 'object' ? b.traducoes : {}
  const p = b.perguntas && typeof b.perguntas === 'object' ? b.perguntas : {}
  const bruto = p.porProvedor && typeof p.porProvedor === 'object' ? p.porProvedor : {}

  const porProvedor = {}
  for (const [nome, valor] of Object.entries(bruto)) {
    if (typeof nome !== 'string' || !nome.trim()) continue
    const n = num(valor)
    if (n > 0) porProvedor[nome.trim()] = n
  }

  return {
    v: 1,
    traducoes: {
      chamadas: num(t.chamadas),
      eventos: num(t.eventos),
      cache: num(t.cache),
    },
    perguntas: { chamadas: num(p.chamadas), porProvedor },
    desde: typeof b.desde === 'string' && b.desde ? b.desde : null,
  }
}

/**
 * Lê o contador. Nunca lança — sem projeto, sem arquivo ou com arquivo
 * corrompido devolve o contador zerado.
 */
export async function lerUso(dir) {
  if (!dir) return usoVazio()
  let bruto
  try {
    bruto = await readFile(arquivoDe(dir), 'utf8')
  } catch {
    return usoVazio()
  }
  try {
    return normalizar(JSON.parse(bruto))
  } catch {
    return usoVazio()
  }
}

async function gravar(dir, uso) {
  try {
    await mkdir(path.join(dir, '.wtf'), { recursive: true })
    await writeFile(arquivoDe(dir), `${JSON.stringify(uso, null, 2)}\n`, 'utf8')
  } catch {
    /* contar é serviço secundário: falhar aqui não pode quebrar nada */
  }
}

/**
 * Soma ao contador de traduções e devolve o contador final.
 *
 * @param {string} dir
 * @param {{chamadas?: number, eventos?: number, cache?: number}} delta
 */
export async function registrarTraducao(dir, delta = {}) {
  const atual = await lerUso(dir)
  const chamadas = num(delta.chamadas)
  const eventos = num(delta.eventos)
  const cache = num(delta.cache)
  if (chamadas + eventos + cache === 0) return atual

  const final = {
    ...atual,
    traducoes: {
      chamadas: atual.traducoes.chamadas + chamadas,
      eventos: atual.traducoes.eventos + eventos,
      cache: atual.traducoes.cache + cache,
    },
    desde: atual.desde || new Date().toISOString(),
  }
  if (dir) await gravar(dir, final)
  return final
}

/**
 * Soma uma pergunta paga ao contador. O provedor entra separado porque o custo
 * de cada um é diferente e a pessoa precisa saber de qual chave dela saiu.
 */
export async function registrarPergunta(dir, provedor) {
  const atual = await lerUso(dir)
  const nome = typeof provedor === 'string' && provedor.trim() ? provedor.trim() : 'desconhecido'

  const final = {
    ...atual,
    perguntas: {
      chamadas: atual.perguntas.chamadas + 1,
      porProvedor: {
        ...atual.perguntas.porProvedor,
        [nome]: (atual.perguntas.porProvedor[nome] ?? 0) + 1,
      },
    },
    desde: atual.desde || new Date().toISOString(),
  }
  if (dir) await gravar(dir, final)
  return final
}

/** Zera o contador. Existe para a pessoa poder recomeçar a medição. */
export async function zerarUso(dir) {
  const vazio = usoVazio()
  if (dir) await gravar(dir, vazio)
  return vazio
}
