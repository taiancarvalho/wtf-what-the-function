/**
 * Avisos que a PESSOA marcou como resolvidos: `<projeto>/.wtf/resolved.json`.
 *
 * Nem todo alerta é respondido pela IA. Às vezes quem lê decide que já entendeu
 * e segue em frente — e isso precisa durar entre uma abertura e outra do app,
 * senão o painel volta a cobrar a mesma coisa para sempre e a pessoa aprende a
 * ignorar alerta, que é o pior desfecho possível.
 *
 * Formato: { v: 1, itens: { "<id do evento>": { at: ISO, por: "usuario" } } }
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const arquivoDe = (dir) => path.join(dir, '.wtf', 'resolved.json')

/**
 * Lê o mapa de resolvidos. Nunca lança: arquivo ausente, JSON quebrado ou
 * formato estranho valem todos a mesma coisa — nada resolvido.
 */
export async function lerResolvidos(dir) {
  if (!dir) return {}
  let bruto
  try {
    bruto = await readFile(arquivoDe(dir), 'utf8')
  } catch {
    return {}
  }

  let dados
  try {
    dados = JSON.parse(bruto)
  } catch {
    return {}
  }
  if (!dados || typeof dados !== 'object') return {}

  const itens = dados.itens
  if (!itens || typeof itens !== 'object') return {}

  // Filtra entrada por entrada: um item podre não derruba os outros.
  const out = {}
  for (const [id, v] of Object.entries(itens)) {
    if (!id || !v || typeof v !== 'object') continue
    const at = typeof v.at === 'string' && !Number.isNaN(new Date(v.at).getTime()) ? v.at : null
    if (!at) continue
    out[id] = { at, por: typeof v.por === 'string' ? v.por : 'usuario' }
  }
  return out
}

/**
 * Marca ou desmarca um evento como resolvido. Devolve o novo estado:
 * `{ resolvido: boolean, itens }`. É a única escrita deste módulo, e só
 * acontece por clique explícito da pessoa.
 */
export async function alternarResolvido(dir, eventId) {
  if (!dir || !eventId) return { resolvido: false, itens: {} }

  const itens = await lerResolvidos(dir)
  let resolvido
  if (itens[eventId]) {
    delete itens[eventId]
    resolvido = false
  } else {
    itens[eventId] = { at: new Date().toISOString(), por: 'usuario' }
    resolvido = true
  }

  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  await writeFile(arquivoDe(dir), `${JSON.stringify({ v: 1, itens }, null, 2)}\n`, 'utf8')

  return { resolvido, itens }
}

/**
 * Carimba `resolvido` nos eventos do snapshot.
 *
 * `human.needsYourAttention` NÃO é apagado de propósito: ele continua contando
 * por que o aviso nasceu, e a pessoa pode reabrir. Quem decide se ainda está
 * pendente é a soma `needsYourAttention && !respondidoPor && !resolvido` —
 * a mesma conta na UI (`Timeline.tsx`) e na contagem do topo.
 */
export function aplicarResolvidos(snapshot, itens) {
  if (!snapshot || !itens || Object.keys(itens).length === 0) return snapshot
  for (const evento of snapshot.events ?? []) {
    const r = itens[evento.id]
    if (!r) continue
    evento.resolvido = { at: r.at, por: r.por }
  }
  return snapshot
}
