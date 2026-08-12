/**
 * O PASSADO DO PROJETO — sem nunca ter gravado um snapshot.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ISTO É DERIVADO DO GIT, E NÃO DE SNAPSHOTS DIÁRIOS.              ║
 * ║                                                                          ║
 * ║ A saída óbvia seria o WTF gravar todo dia como o projeto estava. Só que  ║
 * ║ um histórico assim começa VAZIO: só teria dados a partir do dia da       ║
 * ║ instalação, e a pessoa que abre o app pela primeira vez — justamente     ║
 * ║ quem mais precisa entender o que aconteceu — não veria nada por semanas. ║
 * ║                                                                          ║
 * ║ Aqui o passado é RECONSTRUÍDO: `git rev-list --before` acha o commit de  ║
 * ║ cada data, `git ls-tree` diz que arquivos existiam ali, e as MESMAS      ║
 * ║ regras de estado do painel de hoje respondem quantas partes havia,       ║
 * ║ quantas tinham código e quantas tinham teste. Funciona retroativamente,  ║
 * ║ no primeiro minuto de uso, em projeto que já existia antes do WTF.       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * GRANULARIDADE ADAPTATIVA — a decisão de desenho mais importante deste
 * arquivo. O projeto real que motivou o recurso tem DOIS DIAS de vida: 87
 * mudanças nesta semana, zero nas anteriores. A maioria dos projetos de vibe
 * coding é assim, nova. Um histórico semanal fixo mostraria a esse projeto uma
 * única barra — informação nenhuma. Então a régua vem da idade real do
 * repositório: por DIA enquanto o projeto é jovem ou curto, por SEMANA quando
 * é longo o bastante para o dia virar ruído.
 *
 * Três arquivos, todos dentro de `<projeto>/.wtf/`:
 *   history.json  — os marcos já calculados (cache, indexado pelo commit)
 *   visitas.json  — quando a pessoa olhou o projeto pela última vez
 *   map.json      — o vocabulário, quando existe (lido, nunca escrito)
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  isGitRepo,
  readCommitBefore,
  readCommitCount,
  readCommits,
  readProjectMeta,
  readTreeFiles,
} from './git.js'
import { classificarPorMapa, readProjectMap } from './map.js'
import { estadoPorEvidencia, partesDeArquivos } from './translate.js'

// ------------------------------------------------------------------ régua

/**
 * Abaixo destes números o projeto é JOVEM: cada dia ainda é uma história
 * distinta e vale um marco. Acima, o dia vira ruído e a semana conta melhor.
 */
const DIAS_PARA_SEMANA = 21
const COMMITS_PARA_SEMANA = 60

/**
 * Teto de marcos. Mais que isto não é histórico, é ruído — e custa caro: cada
 * marco novo é uma ida ao git (`rev-list` + `ls-tree`). Quando estoura, ficam
 * os marcos MAIS RECENTES: ninguém abre o painel para saber do mês passado.
 */
const MAX_MARCOS = 14

const DIA_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD` no fuso local — o dia como a pessoa o vive, não em UTC. */
function diaDe(data) {
  const d = data instanceof Date ? data : new Date(data)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

const ehData = (v) => typeof v === 'string' && !Number.isNaN(new Date(v).getTime())

/**
 * Os pontos no tempo que valem a pena olhar.
 *
 * Do primeiro commit até hoje, no passo que a idade do repositório pedir.
 * Repositório sem commit nenhum devolve lista vazia — e isso não é erro, é o
 * primeiro minuto de vida de todo projeto.
 */
export async function marcosDe(dir, agora = new Date()) {
  const vazio = { granularidade: 'dia', datas: [], commits: 0, dias: 0 }
  if (!dir || !(await isGitRepo(dir))) return vazio

  let primeiro = null
  try {
    primeiro = (await readProjectMeta(dir)).firstCommitAt
  } catch {
    return vazio
  }
  if (!ehData(primeiro)) return vazio

  const total = await readCommitCount(dir)
  const inicio = new Date(primeiro)
  const fim = agora instanceof Date ? agora : new Date(agora)
  const dias = Math.max(0, Math.floor((fim.getTime() - inicio.getTime()) / DIA_MS))

  // Jovem OU curto: qualquer um dos dois basta. Um projeto de dois meses com 12
  // commits também não tem o que mostrar semana a semana.
  const granularidade =
    dias < DIAS_PARA_SEMANA || total < COMMITS_PARA_SEMANA ? 'dia' : 'semana'
  const passo = granularidade === 'dia' ? 1 : 7

  const datas = []
  const cursor = new Date(inicio)
  // Guarda-chuva contra relógio maluco (commit com data no futuro, fuso
  // estranho): o laço nunca roda mais que um punhado de vezes além do teto.
  let voltas = 0
  while (cursor <= fim && voltas < 4000) {
    datas.push(diaDe(cursor))
    cursor.setDate(cursor.getDate() + passo)
    voltas++
  }

  // Hoje entra sempre: o marco mais importante é o de agora.
  const hoje = diaDe(fim)
  if (datas[datas.length - 1] !== hoje) datas.push(hoje)

  return { granularidade, datas: datas.slice(-MAX_MARCOS), commits: total, dias }
}

/**
 * O instante que representa um marco: o fim daquele dia — ou AGORA, se o marco
 * for hoje (senão o marco de hoje ignoraria tudo o que foi feito nesta manhã).
 */
function limiteDe(data, agora) {
  const fim = agora instanceof Date ? agora : new Date(agora)
  return data === diaDe(fim) ? fim.toISOString() : `${data}T23:59:59`
}

// --------------------------------------------------------------- contagem

/**
 * Quantas partes existiam, quantas tinham código, quantas tinham teste.
 *
 * Com mapa, pelas features do mapa; sem mapa, pela classificação heurística de
 * translate.js — o histórico precisa valer também para quem nunca rodou o
 * onboarding. Nos DOIS caminhos o estado sai de `estadoPorEvidencia`, a mesma
 * função que decide o estado no painel de hoje.
 */
export function contarPartes(arquivos, mapa) {
  const lista = Array.isArray(arquivos) ? arquivos : []

  if (mapa && Array.isArray(mapa.features) && mapa.features.length > 0) {
    const acc = classificarPorMapa(mapa.features, lista)
    let comCodigo = 0
    let testadas = 0
    for (const a of acc.values()) {
      const state = estadoPorEvidencia({
        temCodigo: a.arquivos.size > 0,
        temTeste: a.testes.size > 0,
        soDocumento: false,
      })
      if (state !== 'planned') comCodigo++
      if (state === 'tested') testadas++
    }
    // Com mapa, o total de partes é o do mapa: uma parte planejada e ainda sem
    // um arquivo sequer EXISTE — é justamente o estado 'planned'.
    return {
      arquivos: lista.length,
      partes: acc.size,
      comCodigo,
      testadas,
      fonte: 'mapa',
    }
  }

  const partes = partesDeArquivos(lista)
  return {
    arquivos: lista.length,
    partes: partes.length,
    comCodigo: partes.filter((p) => p.state !== 'planned').length,
    testadas: partes.filter((p) => p.state === 'tested').length,
    fonte: 'heuristica',
  }
}

// ------------------------------------------------------------------ cache

const arquivoCache = (dir) => path.join(dir, '.wtf', 'history.json')

/**
 * A assinatura do mapa. Quando o mapa muda, os nomes e os recortes das partes
 * mudam junto — e todo marco calculado com o mapa antigo passa a mentir. Então
 * a assinatura entra no cache e a divergência invalida tudo de uma vez.
 */
function assinaturaDoMapa(mapa) {
  if (!mapa || !Array.isArray(mapa.features)) return 'sem-mapa'
  const cru = JSON.stringify(
    mapa.features.map((f) => [f.id, f.paths, f.tests]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  )
  return createHash('sha1').update(cru).digest('hex').slice(0, 16)
}

/** Lê `.wtf/history.json`. Tolerante como os outros módulos: nunca lança. */
export async function lerCacheHistorico(dir) {
  if (!dir) return null
  let bruto
  try {
    bruto = await readFile(arquivoCache(dir), 'utf8')
  } catch {
    return null
  }
  let dados
  try {
    dados = JSON.parse(bruto)
  } catch {
    return null
  }
  if (!dados || typeof dados !== 'object' || dados.v !== 1) return null
  if (!Array.isArray(dados.marcos)) return null

  const marcos = dados.marcos.filter(
    (m) => m && typeof m === 'object' && typeof m.em === 'string',
  )
  return {
    v: 1,
    geradoEm: ehData(dados.geradoEm) ? dados.geradoEm : null,
    granularidade: dados.granularidade === 'semana' ? 'semana' : 'dia',
    mapa: typeof dados.mapa === 'string' ? dados.mapa : 'sem-mapa',
    marcos,
  }
}

async function gravarCache(dir, dados) {
  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  await writeFile(arquivoCache(dir), `${JSON.stringify(dados, null, 2)}\n`, 'utf8')
}

/**
 * O histórico SEM ir ao git: só o que já está no cache.
 *
 * É isto que entra no caminho crítico da abertura do painel. Reconstruir 14
 * marcos são ~28 chamadas ao git; fazer isso a cada pintura da tela seria
 * inaceitável. Frio ou desatualizado, devolve o que tem e sinaliza — quem
 * chama recalcula em segundo plano e avisa a tela depois.
 */
export async function historicoRapido(dir, agora = new Date()) {
  const cache = await lerCacheHistorico(dir)
  const mapa = await readProjectMap(dir)
  const assinatura = assinaturaDoMapa(mapa)

  if (!cache) {
    return { granularidade: 'dia', marcos: [], geradoEm: null, frio: true, desatualizado: true }
  }

  // Mapa diferente invalida tudo; e um cache de ontem não conhece o dia de hoje.
  const desatualizado =
    cache.mapa !== assinatura || !cache.geradoEm || diaDe(cache.geradoEm) !== diaDe(agora)

  return {
    granularidade: cache.granularidade,
    marcos: cache.marcos,
    geradoEm: cache.geradoEm,
    frio: false,
    desatualizado,
  }
}

/**
 * Reconstrói o histórico de verdade, reaproveitando o cache.
 *
 * A chave do reaproveitamento é o HASH DO COMMIT do marco: um marco cujo
 * commit não mudou tem, por definição, exatamente a mesma árvore de arquivos —
 * recalculá-lo daria o mesmo número. Na prática, abrir o painel duas vezes no
 * mesmo dia só recalcula o marco de hoje.
 */
export async function reconstruirHistorico(dir, agora = new Date()) {
  if (!dir || !(await isGitRepo(dir))) {
    return { granularidade: 'dia', marcos: [], geradoEm: null, frio: false, desatualizado: false }
  }

  const { granularidade, datas } = await marcosDe(dir, agora)
  const mapa = await readProjectMap(dir)
  const assinatura = assinaturaDoMapa(mapa)

  const cache = await lerCacheHistorico(dir)
  // Só reaproveita o que foi calculado com o MESMO mapa.
  const guardados = new Map()
  if (cache && cache.mapa === assinatura) {
    for (const m of cache.marcos) if (m.commit) guardados.set(m.commit, m)
  }

  const marcos = []
  for (const data of datas) {
    const commit = await readCommitBefore(dir, limiteDe(data, agora))
    // Nada existia ainda nessa data — marco sem passado não é marco.
    if (!commit) continue

    const guardado = guardados.get(commit)
    if (guardado) {
      marcos.push({ ...guardado, em: data })
      continue
    }

    const arquivos = await readTreeFiles(dir, commit)
    const contagem = contarPartes(arquivos, mapa)
    const marco = { em: data, commit, ...contagem }
    marcos.push(marco)
    guardados.set(commit, marco)
  }

  const doc = {
    v: 1,
    geradoEm: (agora instanceof Date ? agora : new Date(agora)).toISOString(),
    granularidade,
    mapa: assinatura,
    marcos,
  }

  try {
    await gravarCache(dir, doc)
  } catch {
    // Cache é conforto, não verdade: sem poder gravar (disco cheio, pasta só
    // de leitura) o histórico continua correto, só volta a custar caro.
  }

  return {
    granularidade,
    marcos,
    geradoEm: doc.geradoEm,
    frio: false,
    desatualizado: false,
  }
}

// ---------------------------------------------------------------- visitas

const arquivoVisitas = (dir) => path.join(dir, '.wtf', 'visitas.json')

/**
 * Duas aberturas dentro desta janela são a MESMA visita.
 *
 * Sem isto, o recurso se autodestruiria: o painel relê o projeto a cada
 * mudança de arquivo, e cada releitura empurraria `anteriorEm` para "cinco
 * segundos atrás". O resumo "o que aconteceu desde a última vez" compararia o
 * agora com o agora e viria SEMPRE VAZIO — a marca apagada antes de ser usada.
 */
const JANELA_SESSAO_MS = 30 * 60 * 1000

/** Lê `.wtf/visitas.json`. Nunca lança; ausência = nunca visitou. */
export async function lerVisitas(dir) {
  const vazio = { v: 1, ultimaVisitaEm: null, anteriorEm: null }
  if (!dir) return vazio
  let bruto
  try {
    bruto = await readFile(arquivoVisitas(dir), 'utf8')
  } catch {
    return vazio
  }
  let dados
  try {
    dados = JSON.parse(bruto)
  } catch {
    return vazio
  }
  if (!dados || typeof dados !== 'object') return vazio
  return {
    v: 1,
    ultimaVisitaEm: ehData(dados.ultimaVisitaEm) ? dados.ultimaVisitaEm : null,
    anteriorEm: ehData(dados.anteriorEm) ? dados.anteriorEm : null,
  }
}

/**
 * Registra que a pessoa olhou o projeto agora.
 *
 * `anteriorEm` só ROTACIONA quando a visita anterior está fora da janela de
 * sessão. É essa preservação que dá ao resumo contra o que comparar — leia o
 * comentário de `JANELA_SESSAO_MS` antes de mexer nesta regra.
 */
export async function registrarVisita(dir, agora = new Date()) {
  if (!dir) return { v: 1, ultimaVisitaEm: null, anteriorEm: null }
  const quando = (agora instanceof Date ? agora : new Date(agora)).toISOString()
  const atual = await lerVisitas(dir)

  const mesmaSessao =
    atual.ultimaVisitaEm &&
    new Date(quando).getTime() - new Date(atual.ultimaVisitaEm).getTime() < JANELA_SESSAO_MS

  const novo = {
    v: 1,
    ultimaVisitaEm: quando,
    anteriorEm: mesmaSessao ? atual.anteriorEm : atual.ultimaVisitaEm,
  }

  try {
    await mkdir(path.join(dir, '.wtf'), { recursive: true })
    await writeFile(arquivoVisitas(dir), `${JSON.stringify(novo, null, 2)}\n`, 'utf8')
  } catch {
    // Não poder gravar a marca não pode impedir a pessoa de ver o projeto.
  }
  return novo
}

/** O aviso pede uma decisão da pessoa? A mesma soma usada no resto do app. */
const pedeDecisao = (e) =>
  Boolean(e?.human?.needsYourAttention) && !e?.respondidoPor && !e?.resolvido

/**
 * O QUE ACONTECEU DESDE A ÚLTIMA VEZ QUE VOCÊ OLHOU.
 *
 * A pergunta mais útil do painel — e a única que ninguém consegue responder
 * lendo o repositório sozinho, porque depende de uma informação que só o WTF
 * tem: quando a pessoa olhou.
 *
 * Na PRIMEIRA visita devolve `{ primeira: true }` e nada mais. Inventar uma
 * comparação ali ("47 mudanças desde a última vez!") seria mentir para alguém
 * que nunca esteve aqui.
 */
export async function desdeAUltimaVisita(dir, opcoes = {}) {
  const { snapshot = null, agora = new Date() } = opcoes
  const nada = {
    primeira: false,
    desdeEm: null,
    commits: 0,
    arquivos: 0,
    partesQueMudaram: [],
    avisosNovos: 0,
    pedemDecisao: 0,
  }

  if (!dir || !(await isGitRepo(dir))) return { ...nada, primeira: true }

  const visitas = await lerVisitas(dir)
  const desdeEm = visitas.anteriorEm
  if (!desdeEm) return { ...nada, primeira: true }

  const corte = new Date(desdeEm).getTime()

  // ------------------------------------------------ o que o git registrou
  let commits = []
  try {
    commits = await readCommits(dir, 120)
  } catch {
    commits = []
  }
  const novos = commits.filter((c) => c.at && new Date(c.at).getTime() > corte)
  const arquivos = new Set()
  for (const c of novos) {
    for (const f of c.files ?? []) if (f?.path) arquivos.add(f.path)
  }

  // -------------------------------------------- o que mudou de estado
  // O passado vem da mesma máquina do histórico: a árvore do commit que era o
  // HEAD naquele instante, medida com as mesmas regras de hoje.
  const mapa = await readProjectMap(dir)
  const partesQueMudaram = []
  const commitAntes = await readCommitBefore(dir, new Date(desdeEm).toISOString())
  const commitAgora = await readCommitBefore(
    dir,
    (agora instanceof Date ? agora : new Date(agora)).toISOString(),
  )

  if (commitAntes && commitAgora && commitAntes !== commitAgora) {
    const antes = await estadosEm(dir, commitAntes, mapa)
    const depois = await estadosEm(dir, commitAgora, mapa)
    for (const [id, info] of depois) {
      const anterior = antes.get(id)
      const de = anterior?.state ?? 'planned'
      if (de !== info.state) {
        partesQueMudaram.push({ id, nome: info.nome, de, para: info.state })
      }
    }
  }

  // ------------------------------------------------- o que pede decisão
  const eventos = Array.isArray(snapshot?.events) ? snapshot.events : []
  const noIntervalo = eventos.filter((e) => e?.at && new Date(e.at).getTime() > corte)

  return {
    primeira: false,
    desdeEm,
    commits: novos.length,
    arquivos: arquivos.size,
    partesQueMudaram: partesQueMudaram.slice(0, 20),
    avisosNovos: noIntervalo.filter((e) => e?.human?.needsYourAttention).length,
    pedemDecisao: noIntervalo.filter(pedeDecisao).length,
  }
}

/** Estado de cada parte num commit: `Map<id, { nome, state }>`. */
async function estadosEm(dir, commit, mapa) {
  const arquivos = await readTreeFiles(dir, commit)
  const out = new Map()

  if (mapa && Array.isArray(mapa.features) && mapa.features.length > 0) {
    for (const a of classificarPorMapa(mapa.features, arquivos).values()) {
      out.set(a.def.id, {
        nome: a.def.name,
        state: estadoPorEvidencia({
          temCodigo: a.arquivos.size > 0,
          temTeste: a.testes.size > 0,
          soDocumento: false,
        }),
      })
    }
    return out
  }

  for (const p of partesDeArquivos(arquivos)) {
    out.set(p.id, { nome: p.name, state: p.state })
  }
  return out
}
