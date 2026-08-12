/**
 * O que a PESSOA aprovou: `<projeto>/.wtf/validated.json`.
 *
 * `validated` é o quinto estado — e o único que não vem de evidência de máquina.
 * Git prova que o código existe; teste prova que ele roda. Nenhum dos dois prova
 * que aquilo é o que a pessoa pediu. Essa distância é o produto.
 *
 * Formato: { v: 1, itens: { "<id da feature>": { at: ISO, assinatura: string } } }
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const arquivoDe = (dir) => path.join(dir, '.wtf', 'validated.json')

/**
 * A "fotografia" da feature no momento da aprovação: quais arquivos ela tinha e
 * quando foi tocada pela última vez. Não é criptografia — é só um jeito estável
 * de perguntar depois "isto ainda é o mesmo que ela viu?".
 */
export function assinaturaDe(feature) {
  if (!feature) return ''
  const arquivos = Array.isArray(feature.files) ? [...feature.files].sort() : []
  const base = `${arquivos.join('|')}|${feature.lastTouchedAt ?? ''}`
  // Hash simples (djb2). Determinístico e suficiente para comparar igualdade.
  let h = 5381
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(36)}-${arquivos.length}`
}

/**
 * Lê o mapa de aprovações. Nunca lança: arquivo ausente, JSON quebrado ou
 * formato estranho valem todos a mesma coisa — nada aprovado.
 */
export async function lerValidados(dir) {
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

  // Entrada por entrada: um item podre não derruba os outros.
  const out = {}
  for (const [id, v] of Object.entries(itens)) {
    if (!id || !v || typeof v !== 'object') continue
    const at = typeof v.at === 'string' && !Number.isNaN(new Date(v.at).getTime()) ? v.at : null
    if (!at) continue
    out[id] = { at, assinatura: typeof v.assinatura === 'string' ? v.assinatura : '' }
  }
  return out
}

/**
 * Aprova ou desfaz a aprovação de uma feature. Devolve `{ validado, itens }`.
 * É a única escrita deste módulo, e só acontece por clique explícito da pessoa.
 */
export async function alternarValidado(dir, featureId, assinatura) {
  if (!dir || !featureId) return { validado: false, itens: {} }

  const itens = await lerValidados(dir)
  const anterior = itens[featureId]
  let validado

  /*
   * Alternar leva a assinatura em conta, e não só a existência da entrada.
   *
   * Quando a parte muda depois de aprovada, a entrada antiga continua no
   * arquivo (é ela que guarda o "você tinha aprovado em..."). Se o clique
   * olhasse só para a existência, quem clicasse em "aprovar de novo" estaria
   * na verdade APAGANDO a aprovação — o contrário do que pediu.
   *
   * Então: mesma assinatura significa desfazer uma aprovação que está
   * valendo. Assinatura diferente significa aprovar de novo o que mudou.
   */
  const vigente = anterior && anterior.assinatura === (assinatura ?? '')
  if (vigente) {
    delete itens[featureId]
    validado = false
  } else {
    itens[featureId] = { at: new Date().toISOString(), assinatura: assinatura ?? '' }
    validado = true
  }

  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  await writeFile(arquivoDe(dir), `${JSON.stringify({ v: 1, itens }, null, 2)}\n`, 'utf8')

  return { validado, itens }
}

/**
 * Carimba `validated` nas features aprovadas.
 *
 * ===================================================================
 * POR QUE A APROVAÇÃO EXPIRA QUANDO A PARTE MUDA
 * ===================================================================
 * Uma aprovação vale para o que a pessoa VIU naquele momento — aqueles
 * arquivos, aquele estado. Se a IA mexeu naquela parte depois, a aprovação
 * antiga não pode continuar valendo: o painel passaria a AFIRMAR que a pessoa
 * aprovou algo que ela nunca viu. Isso seria mentir com a cara de certeza, que
 * é exatamente o que este produto existe para não fazer.
 *
 * Então, assinatura diferente = a feature volta ao estado que a evidência
 * calcula, e ganha `revalidar: true` + `validadoEm` (quando ela aprovou antes).
 * Esse é o alerta mais valioso do produto: "isto mudou depois que você aprovou".
 * ===================================================================
 *
 * Aprovar algo que nem foi construído não faz sentido: `validated` só é aplicado
 * sobre `implemented` ou `tested`. Fora disso, ignoramos em silêncio.
 */
export function aplicarValidados(snapshot, itens) {
  if (!snapshot || !itens || Object.keys(itens).length === 0) return snapshot
  for (const feature of snapshot.features ?? []) {
    const v = itens[feature.id]
    if (!v) continue
    if (feature.state !== 'implemented' && feature.state !== 'tested') continue

    if (assinaturaDe(feature) === v.assinatura) {
      feature.state = 'validated'
    } else {
      feature.revalidar = true
      feature.validadoEm = v.at
    }
  }
  return snapshot
}
