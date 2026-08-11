/**
 * O mapa do projeto (`.wtf/map.json`) — vocabulário, não estado.
 *
 * A IA escreve o mapa: quais partes existem, como se chamam, que arquivos e
 * testes pertencem a cada uma. O WTF continua calculando o ESTADO por
 * evidência no repositório. Nenhum campo do mapa promove nada.
 *
 *      mapa (a IA)     →  quais são as features e como se chamam
 *      commits (o git) →  o que está provado sobre cada uma
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

// ------------------------------------------------------------------ leitura

const RE_ACENTO = /[\u0300-\u036f]/g
const semAcento = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(RE_ACENTO, '')

/** id estável: minúsculo, sem acento, sem espaço. */
const normalizarId = (s) =>
  semAcento(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const textoOk = (v) => typeof v === 'string' && v.trim() !== ''

/**
 * Lê e valida `<dir>/.wtf/map.json`.
 * Ausência de mapa é normal — retorna `null` sem reclamar.
 */
export async function readProjectMap(dir) {
  let cru
  try {
    cru = await readFile(path.join(dir, '.wtf', 'map.json'), 'utf8')
  } catch {
    return null
  }

  let doc
  try {
    doc = JSON.parse(cru)
  } catch {
    return null
  }

  if (!doc || typeof doc !== 'object') return null
  if (doc.v !== 1) return null
  if (!Array.isArray(doc.features)) return null

  const vistos = new Set()
  const features = []
  for (const f of doc.features) {
    // Feature malformada é descartada em silêncio: o mapa é opinião da IA,
    // não pode derrubar o painel.
    if (!f || typeof f !== 'object') continue
    if (!textoOk(f.id) || !textoOk(f.area) || !textoOk(f.name) || !textoOk(f.summary)) continue
    if (!Array.isArray(f.paths)) continue

    const id = normalizarId(f.id)
    if (!id || vistos.has(id)) continue // o primeiro com aquele id vence
    vistos.add(id)

    features.push({
      id,
      area: f.area.trim(),
      name: f.name.trim(),
      summary: f.summary.trim(),
      paths: f.paths.filter((p) => textoOk(p)),
      tests: Array.isArray(f.tests) ? f.tests.filter((p) => textoOk(p)) : [],
      planRef: textoOk(f.planRef) ? f.planRef.trim() : undefined,
      planStatus: textoOk(f.planStatus) ? f.planStatus.trim() : undefined,
      related: Array.isArray(f.related) ? f.related.filter(textoOk).map(normalizarId) : [],
    })
  }

  if (features.length === 0) return null

  return {
    v: 1,
    generatedAt: textoOk(doc.generatedAt) ? doc.generatedAt : undefined,
    by: textoOk(doc.by) ? doc.by : undefined,
    project: doc.project && typeof doc.project === 'object' ? doc.project : {},
    features,
  }
}

// --------------------------------------------------------------------- glob

/**
 * Glob simples e próprio: só `**`, `*` e caminho literal.
 * Sem chaves, sem colchetes — o mapa não precisa disso e o que não se entende
 * não se finge entender.
 */
function globParaRegex(glob) {
  let re = '^'
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') i++ // `**/` também casa com nada
        re += '(?:.*)'
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(re + '$')
}

const cacheGlob = new Map()
function casa(glob, caminho) {
  let re = cacheGlob.get(glob)
  if (!re) {
    re = globParaRegex(glob.replace(/^\.\//, ''))
    cacheGlob.set(glob, re)
  }
  // Um diretório listado sem `**` ainda cobre o que está dentro dele.
  return re.test(caminho) || (glob.endsWith('/') && caminho.startsWith(glob))
}

const casaAlgum = (globs, caminho) => globs.some((g) => casa(g, caminho))

// ----------------------------------------------------------------- aplicação

const ID_SOBRA = 'f-outros'

/**
 * Reescreve o snapshot usando o mapa como fonte da verdade sobre QUAIS são as
 * features e COMO se chamam. O estado continua vindo dos commits.
 */
export function aplicarMapa(snapshot, mapa, commits, arquivosRastreados, arquivosDeTrabalho) {
  if (!mapa || !Array.isArray(mapa.features) || mapa.features.length === 0) return snapshot

  const base = structuredClone(snapshot) // nada de mutar o que veio de fora
  const lista = Array.isArray(commits) ? commits : []
  const rastreados = Array.isArray(arquivosRastreados) ? arquivosRastreados : []

  /*
   * !! TRABALHO EM ANDAMENTO — POR QUE ISTO EXISTE !!
   *
   * O painel precisa enxergar o que está sendo feito AGORA. Quem faz vibe
   * coding fica horas sem commitar, e é justamente nessas horas que abre o
   * painel: se só o histórico contasse, a IA criaria uma pasta inteira de
   * arquivos novos e o painel continuaria dizendo "planejado".
   *
   * Mas mostrar não é o bastante: esses arquivos AINDA NÃO ESTÃO SALVOS no
   * histórico e podem ser perdidos (um reset, um checkout, um clean). Por
   * isso a feature carrega `unsaved`/`unsavedCount` — o painel promete o que
   * existe no disco e avisa, na mesma linha, o que ainda não está a salvo.
   */
  const naoSalvos = arquivosDeTrabalho && typeof arquivosDeTrabalho === 'object'
    ? [
        ...(Array.isArray(arquivosDeTrabalho.untracked) ? arquivosDeTrabalho.untracked : []),
        ...(Array.isArray(arquivosDeTrabalho.modified) ? arquivosDeTrabalho.modified : []),
      ]
    : []

  // claims da IA são o único estado que sobrevive à troca de features
  const claimsPorNome = new Map()
  for (const f of snapshot.features ?? []) {
    if (f.working || f.workingSince || f.workingClaim) {
      claimsPorNome.set(semAcento(f.name), {
        working: f.working,
        workingSince: f.workingSince,
        workingClaim: f.workingClaim,
      })
    }
  }

  const acc = new Map()
  for (const f of mapa.features) {
    acc.set(f.id, { def: f, arquivos: new Set(), testes: new Set(), ultimo: null, naoSalvos: new Set() })
  }

  /*
   * EXISTÊNCIA vem do disco; DATA vem dos commits.
   *
   * Antes isto se apoiava só no histórico recente, e o efeito era perverso:
   * uma parte antiga e estável — que ninguém precisa tocar há semanas — some
   * da janela de commits e aparecia como "nunca construída". Quanto mais
   * madura a feature, mais provável de sumir. Agora `git ls-files` responde o
   * que existe hoje, e os commits respondem apenas quando mexeram por último.
   */
  for (const caminho of rastreados) {
    for (const a of acc.values()) {
      if (casaAlgum(a.def.paths, caminho)) a.arquivos.add(caminho)
      if (casaAlgum(a.def.tests, caminho)) a.testes.add(caminho)
    }
  }

  // Arquivos do disco valem EXISTÊNCIA igual aos rastreados — só ficam
  // marcados como ainda não salvos no histórico.
  for (const caminho of naoSalvos) {
    for (const a of acc.values()) {
      const noCodigo = casaAlgum(a.def.paths, caminho)
      const noTeste = casaAlgum(a.def.tests, caminho)
      if (!noCodigo && !noTeste) continue
      if (noCodigo) a.arquivos.add(caminho)
      if (noTeste) a.testes.add(caminho)
      a.naoSalvos.add(caminho)
    }
  }

  let maisAntigo = null
  for (const c of lista) {
    if (c.at && (!maisAntigo || new Date(c.at) < new Date(maisAntigo))) maisAntigo = c.at
    for (const arq of c.files ?? []) {
      const caminho = typeof arq === 'string' ? arq : arq.path
      if (!caminho) continue
      // um arquivo pode pertencer a várias partes — não há exclusividade
      for (const a of acc.values()) {
        const noCodigo = casaAlgum(a.def.paths, caminho)
        const noTeste = casaAlgum(a.def.tests, caminho)
        if (!noCodigo && !noTeste) continue
        if (noCodigo) a.arquivos.add(caminho)
        if (noTeste) a.testes.add(caminho)
        if (c.at && (!a.ultimo || new Date(c.at) > new Date(a.ultimo))) a.ultimo = c.at
      }
    }
  }

  const fallbackData =
    maisAntigo ??
    base.project?.createdAt ??
    (base.events ?? []).map((e) => e.at).sort()[0] ??
    new Date().toISOString()

  const features = []
  for (const a of acc.values()) {
    const { def } = a
    const temCodigo = a.arquivos.size > 0
    const temTeste = a.testes.size > 0

    /**
     * ESTADO = EVIDÊNCIA. NUNCA VEM DO MAPA.
     * `planStatus` diz apenas o que está escrito no plano — se a story foi
     * marcada "done", isso não prova nada sobre o código. Ele só decide o
     * `origin` e fica guardado em `planStatus` como informação, jamais como
     * promoção de estado.
     */
    const state = temCodigo ? (temTeste ? 'tested' : 'implemented') : 'planned'

    const claim = claimsPorNome.get(semAcento(def.name))

    features.push({
      id: def.id,
      area: def.area,
      name: def.name,
      state,
      origin: def.planRef || def.planStatus ? 'planned' : 'discovered',
      summary: def.summary,
      relatedIds: def.related.filter((id) => id !== def.id && acc.has(id)),
      files: [...new Set([...a.arquivos, ...a.testes])].slice(0, 40), // arquivos reais, não globs
      lastTouchedAt: a.ultimo ?? fallbackData,
      attention: 'none',
      planRef: def.planRef,
      planStatus: def.planStatus, // informativo apenas
      // Só aparecem quando há de fato trabalho fora do histórico.
      ...(a.naoSalvos.size > 0 ? { unsaved: true, unsavedCount: a.naoSalvos.size } : {}),
      ...(claim ?? {}),
    })
  }

  // ------------------------------------------------- reatribuição de eventos
  // Cada evento vai para a feature que cobre mais dos arquivos que ele tocou.
  let precisouSobra = false
  const eventos = (base.events ?? []).map((e) => {
    const arquivos = e.technical?.files ?? []
    let melhor = null
    let placar = 0
    for (const a of acc.values()) {
      const n = arquivos.filter(
        (p) => casaAlgum(a.def.paths, p) || casaAlgum(a.def.tests, p),
      ).length
      if (n > placar) {
        placar = n
        melhor = a.def.id
      }
    }
    if (!melhor) precisouSobra = true
    return { ...e, featureId: melhor ?? ID_SOBRA }
  })

  // A gaveta de sobra só existe se algum evento realmente cair nela.
  if (precisouSobra) {
    features.push({
      id: ID_SOBRA,
      area: 'Bastidores',
      name: 'Outros arquivos',
      state: 'implemented',
      origin: 'discovered',
      summary: 'Arquivos que ainda não pertencem a nenhuma parte mapeada.',
      relatedIds: [],
      files: [],
      lastTouchedAt: fallbackData,
      attention: 'none',
    })
  }

  base.features = features
  base.events = eventos
  if (textoOk(mapa.project?.pitch)) base.project.pitch = mapa.project.pitch.trim()

  return base
}
