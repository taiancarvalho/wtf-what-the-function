import { STATE } from '@/lib/state'
import { montarAssuntos } from '@/lib/assuntos'
import type { Feature, ProjectSnapshot } from '@/types/protocol'

/**
 * O resumo compartilhável.
 *
 * O painel serve a quem está dentro do projeto. Este texto serve a quem está
 * FORA dele: o cliente, o sócio, a pessoa do outro lado do WhatsApp. Por isso
 * ele é texto puro — cola em qualquer lugar, não depende do aplicativo, e pode
 * ser lido inteiro antes de ser enviado.
 *
 * Regras que não se negociam aqui:
 *   - nada de jargão, nem no modo técnico. "Técnico" significa mais números
 *     (quantos arquivos, quais partes), nunca vocabulário de programador;
 *   - nada de identificador interno nem caminho de arquivo: quem lê não tem
 *     como usar isso, e vazar caminho é vazar a estrutura da máquina de alguém;
 *   - se nada aconteceu no período, o texto diz isso. Seção vazia parece defeito
 *     do aplicativo; frase honesta parece uma pessoa falando.
 */
export type PeriodoResumo = 'hoje' | 'semana' | 'tudo'

export interface OpcoesResumo {
  periodo: PeriodoResumo
  tecnico: boolean
  t: (k: string, v?: Record<string, string | number>) => string
  /** Só para teste: o instante que conta como "agora". */
  agora?: Date
}

/** Estados que contam como "já existe e foi verificado". */
const TESTADAS = new Set(['tested', 'validated'])
/** Estados que contam como "existe, falta você conferir". */
const PRONTAS = new Set(['implemented', 'building'])

function inicioDoPeriodo(periodo: PeriodoResumo, agora: Date): number {
  if (periodo === 'tudo') return 0
  if (periodo === 'hoje') {
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()
  }
  return agora.getTime() - 7 * 86_400_000
}

function dentro(iso: string | undefined, desde: number): boolean {
  if (!iso) return false
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) && ms >= desde
}

/** 0..100 — quanto do previsto já andou, na média das partes. */
function porcentagem(features: Feature[]): number {
  if (features.length === 0) return 0
  const ordem = ['planned', 'building', 'implemented', 'tested', 'validated']
  const soma = features.reduce((acc, f) => acc + ordem.indexOf(f.state) / 4, 0)
  return Math.round((soma / features.length) * 100)
}

export function montarResumo(snapshot: ProjectSnapshot, opcoes: OpcoesResumo): string {
  const { periodo, tecnico, t } = opcoes
  const agora = opcoes.agora ?? new Date()
  const desde = inicioDoPeriodo(periodo, agora)
  const rotuloPeriodo = t(`resumo.periodo.${periodo}`)

  const features = snapshot.features ?? []
  const linhas: string[] = []

  linhas.push(t('resumo.titulo', { projeto: snapshot.project.name, periodo: rotuloPeriodo }))
  linhas.push('')

  // ---------------------------------------------------------- onde estamos
  const testadas = features.filter((f) => TESTADAS.has(f.state)).length
  const prontas = features.filter((f) => PRONTAS.has(f.state)).length
  const naoComecaram = features.filter((f) => f.state === 'planned').length

  linhas.push(t('resumo.ondeEstamos', { pct: porcentagem(features) }))
  // "1 partes testadas" denuncia texto de máquina — e este texto vai para um
  // cliente ler. Singular tem chave própria.
  linhas.push(
    `  ${STATE.tested.mark} ${t(testadas === 1 ? 'resumo.testada' : 'resumo.testadas', { n: testadas })}`,
  )
  linhas.push(
    `  ${STATE.implemented.mark} ${t(prontas === 1 ? 'resumo.pronta' : 'resumo.prontas', { n: prontas })}`,
  )
  linhas.push(
    `  ${STATE.planned.mark} ${t(naoComecaram === 1 ? 'resumo.naoComecou' : 'resumo.naoComecaram', { n: naoComecaram })}`,
  )

  // ------------------------------------------------------ o que ficou pronto
  const doPeriodo = (f: Feature) => periodo === 'tudo' || dentro(f.lastTouchedAt, desde)

  const ficaramProntas = features.filter(
    (f) => doPeriodo(f) && (TESTADAS.has(f.state) || f.state === 'implemented'),
  )
  const emAndamento = features.filter((f) => doPeriodo(f) && (f.working || f.state === 'building'))

  // ------------------------------------------------ o que depende da pessoa
  const decisoes = montarAssuntos(snapshot.events ?? [])
    .filter((a) => a.pedeAtencao)
    .filter((a) => periodo === 'tudo' || dentro(a.ultimo.at, desde))

  const vazio =
    ficaramProntas.length === 0 && emAndamento.length === 0 && decisoes.length === 0

  if (vazio) {
    linhas.push('')
    linhas.push(t('resumo.nada', { periodo: rotuloPeriodo }))
  }

  if (ficaramProntas.length > 0) {
    linhas.push('')
    linhas.push(t('resumo.ficouPronto'))
    for (const f of ficaramProntas) linhas.push(itemFeature(f, tecnico, t))
  }

  if (emAndamento.length > 0) {
    linhas.push('')
    linhas.push(t('resumo.emAndamento'))
    for (const f of emAndamento) linhas.push(itemFeature(f, tecnico, t))
  }

  if (decisoes.length > 0) {
    linhas.push('')
    linhas.push(t('resumo.decisao'))
    for (const a of decisoes) {
      const texto = a.motivo || a.ultimo.human?.headline || a.aviso.human?.headline || ''
      if (texto) linhas.push(`  · ${texto}`)
    }
  }

  linhas.push('')
  linhas.push(t('resumo.gerado', { data: dataCurta(agora) }))

  return linhas.join('\n')
}

/**
 * Uma parte, em uma linha. No modo simples: nome e a frase que explica.
 * No modo técnico entram a área do produto e quantos arquivos ela tem — número,
 * nunca caminho.
 */
function itemFeature(
  f: Feature,
  tecnico: boolean,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  const nome = tecnico && f.area ? t('resumo.itemArea', { area: f.area, nome: f.name }) : f.name
  const base = f.summary ? `  · ${nome} — ${f.summary}` : `  · ${nome}`
  if (!tecnico) return base
  const n = f.files?.length ?? 0
  if (n === 0) return base
  return `${base} (${n === 1 ? t('resumo.arquivo1') : t('resumo.arquivos', { n })})`
}

function dataCurta(d: Date): string {
  try {
    return d.toLocaleDateString()
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** Nome do arquivo sugerido no "Baixar". Sem espaço, sem acento, sem barra. */
export function nomeArquivoResumo(nomeProjeto: string, agora = new Date()): string {
  const limpo = nomeProjeto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
  return `${limpo || 'projeto'}-${dia}.md`
}
