import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Blocks,
  FolderTree,
  Library,
  Newspaper,
  Search,
} from 'lucide-react'
import type { ProjectSnapshot } from '@/types/protocol'
import { pedeAtencao } from '@/types/protocol'
import { codigoCurto } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { STATE } from '@/lib/state'

/** As abas para onde um resultado pode levar. */
export type AbaBusca = 'timeline' | 'build' | 'pastas' | 'docs'

type Tipo = 'partes' | 'mudancas' | 'pastas' | 'docs'

interface Resultado {
  chave: string
  tipo: Tipo
  /** O que a pessoa procura de olho: nome, manchete, pasta, assunto. */
  titulo: string
  /** A linha de baixo: resumo, o que mudou, propósito, caminho. */
  detalhe?: string
  /** Código curto do aviso, caminho de arquivo — sempre em fonte mono. */
  mono?: string
  /** Menor é melhor. Ver `pontuar`. */
  peso: number
  aba: AbaBusca
}

const ICONE: Record<Tipo, typeof Newspaper> = {
  partes: Blocks,
  mudancas: Newspaper,
  pastas: FolderTree,
  docs: Library,
}

const ABA_DE: Record<Tipo, AbaBusca> = {
  partes: 'build',
  mudancas: 'timeline',
  pastas: 'pastas',
  docs: 'docs',
}

const ORDEM: Tipo[] = ['partes', 'mudancas', 'pastas', 'docs']

const POR_GRUPO = 5

/**
 * Sem maiúsculas e sem acento.
 *
 * Quem digita com pressa escreve "integracoes" — e tem que achar "Integrações".
 * Comparar as duas pontas normalizadas é o suficiente; não existe correção de
 * digitação aqui, de propósito: busca que adivinha é busca que não se explica.
 */
function normal(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Relevância em uma frase: começar vale mais que conter, e o nome vale mais
 * que a descrição.
 *
 * 0 e 1 são os campos fortes (nome, manchete, código); 2 e 3 os fracos
 * (resumo, o que mudou, caminho). `null` quer dizer que não bate.
 */
function pontuar(termo: string, fortes: string[], fracos: string[]): number | null {
  for (const campo of fortes) {
    const n = normal(campo)
    if (n.startsWith(termo)) return 0
    if (n.includes(termo)) return 1
  }
  for (const campo of fracos) {
    const n = normal(campo)
    if (n.startsWith(termo)) return 2
    if (n.includes(termo)) return 3
  }
  return null
}

/**
 * A busca do painel.
 *
 * Um campo só para as quatro coisas que existem aqui: partes, mudanças, pastas
 * e documentos. Tudo já está no snapshot, em memória — nada é buscado no disco.
 * O caminho mais importante é o código curto do aviso ("W34K"): é assim que
 * alguém reencontra o que citou numa conversa com a IA.
 */
export function Busca({
  snapshot,
  aberta,
  onFechar,
  onIr,
}: {
  snapshot: ProjectSnapshot
  aberta: boolean
  onFechar: () => void
  onIr: (aba: AbaBusca) => void
}) {
  const t = useT()
  const [termo, setTermo] = useState('')
  const [foco, setFoco] = useState(0)

  const campo = useRef<HTMLInputElement | null>(null)
  const caixa = useRef<HTMLDivElement | null>(null)
  const itens = useRef<(HTMLButtonElement | null)[]>([])

  // Toda abertura começa limpa: reaproveitar o termo anterior faz a pessoa
  // apagar antes de digitar, e o campo já vem focado para receber a digitação.
  useEffect(() => {
    if (!aberta) return
    setTermo('')
    setFoco(0)
    campo.current?.focus()
  }, [aberta])

  // Escape e clique fora: as duas saídas que todo mundo tenta sem pensar.
  useEffect(() => {
    if (!aberta) return
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    function fora(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) onFechar()
    }
    document.addEventListener('keydown', tecla)
    document.addEventListener('mousedown', fora)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('mousedown', fora)
    }
  }, [aberta, onFechar])

  const grupos = useMemo(() => montar(snapshot, termo), [snapshot, termo])

  /** A lista achatada — é ela que o teclado percorre, atravessando os grupos. */
  const lista = useMemo(() => grupos.flatMap((g) => g.itens), [grupos])

  useEffect(() => {
    setFoco(0)
  }, [termo])

  // O item em foco tem que estar visível: navegar às cegas não é navegar.
  useEffect(() => {
    itens.current[foco]?.scrollIntoView({ block: 'nearest' })
  }, [foco, lista])

  if (!aberta) return null

  function escolher(r: Resultado) {
    onIr(r.aba)
    onFechar()
  }

  function navegar(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (lista.length === 0) return
      e.preventDefault()
      const passo = e.key === 'ArrowDown' ? 1 : -1
      setFoco((i) => (i + passo + lista.length) % lista.length)
    } else if (e.key === 'Enter') {
      const alvo = lista[foco]
      if (alvo) {
        e.preventDefault()
        escolher(alvo)
      }
    }
  }

  let indice = -1

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      style={{ background: 'color-mix(in oklab, var(--color-ink) 22%, transparent)' }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={t('busca.titulo')}
        onKeyDown={navegar}
        className="animate-in-up w-[560px] max-w-[92vw] overflow-hidden rounded-2xl border shadow-lg"
        style={{ background: 'var(--color-paper)', borderColor: 'var(--color-rule)' }}
      >
        <div
          className="flex items-center gap-2.5 border-b px-4 py-3"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          <Search size={15} className="shrink-0" style={{ color: 'var(--color-ink-3)' }} />
          <input
            ref={campo}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder={t('busca.placeholder')}
            aria-label={t('busca.titulo')}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--color-ink-3)]"
            style={{ color: 'var(--color-ink)' }}
          />
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {lista.length === 0 && (
            <p className="px-4 py-6 text-center text-[12.5px] leading-snug text-[var(--color-ink-3)]">
              {t('busca.nada', { termo })}
            </p>
          )}

          {grupos.map((g) => {
            const Icone = ICONE[g.tipo]
            return (
              <div key={g.tipo} className="pb-1">
                <p className="flex items-baseline gap-2 px-4 pt-2 pb-1">
                  <span className="text-[10.5px] tracking-[0.12em] text-[var(--color-ink-3)] uppercase">
                    {t(`busca.grupo.${g.tipo}`)}
                  </span>
                  <span className="text-[11px] text-[var(--color-ink-3)]">
                    {g.total > g.itens.length
                      ? t('busca.deTotal', { n: g.itens.length, total: g.total })
                      : t('busca.total', { n: g.total })}
                  </span>
                </p>

                {g.itens.map((r) => {
                  indice += 1
                  const i = indice
                  const ativo = i === foco
                  return (
                    <button
                      key={r.chave}
                      ref={(el) => {
                        itens.current[i] = el
                      }}
                      role="option"
                      aria-selected={ativo}
                      onMouseEnter={() => setFoco(i)}
                      onClick={() => escolher(r)}
                      className="mx-1.5 flex w-[calc(100%-12px)] items-start gap-2.5 rounded-lg px-2.5 py-2 text-left"
                      style={{
                        background: ativo
                          ? 'color-mix(in oklab, var(--color-accent) 10%, transparent)'
                          : 'transparent',
                      }}
                    >
                      <Icone
                        size={14}
                        className="mt-[3px] shrink-0"
                        style={{ color: ativo ? 'var(--color-accent)' : 'var(--color-ink-3)' }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className="min-w-0 truncate text-[13.5px] leading-tight font-medium"
                            style={{ color: ativo ? 'var(--color-accent)' : 'var(--color-ink)' }}
                          >
                            {r.titulo}
                          </span>
                          {r.mono && (
                            <span className="shrink-0 font-mono text-[10.5px] text-[var(--color-ink-3)]">
                              {r.mono}
                            </span>
                          )}
                        </span>
                        {r.detalhe && (
                          <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-[var(--color-ink-2)]">
                            {r.detalhe}
                          </span>
                        )}
                      </span>
                      <span className="mt-[3px] shrink-0 text-[10.5px] text-[var(--color-ink-3)]">
                        {t(`busca.leva.${r.tipo}`)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        <p
          className="border-t px-4 py-2 text-[11px] text-[var(--color-ink-3)]"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          {t('busca.rodape')}
        </p>
      </div>
    </div>
  )
}

interface Grupo {
  tipo: Tipo
  /** Quantos existem ao todo — o corte para 5 não pode esconder o tamanho. */
  total: number
  itens: Resultado[]
}

/**
 * Monta os grupos.
 *
 * Sem termo, a tela não fica vazia: mostra as partes que pedem atenção e as
 * mudanças mais recentes. Quem abriu a busca sem saber o que procurar continua
 * recebendo a resposta mais provável.
 */
function montar(snapshot: ProjectSnapshot, bruto: string): Grupo[] {
  const termo = normal(bruto.trim())
  const vazio = termo.length === 0

  const partes: Resultado[] = []
  const mudancas: Resultado[] = []
  const pastas: Resultado[] = []
  const docs: Resultado[] = []

  for (const f of snapshot.features) {
    const base = {
      chave: `parte:${f.id}`,
      tipo: 'partes' as const,
      titulo: f.name,
      detalhe: f.summary,
      mono: undefined,
      aba: ABA_DE.partes,
    }
    if (vazio) {
      // Sem termo: só o que pede atenção, e só se pedir mesmo.
      const chama =
        f.attention === 'warning' || f.attention === 'critical' || f.revalidar || f.working
      if (chama) {
        partes.push({ ...base, detalhe: `${STATE[f.state].mark} ${f.area} · ${f.summary}`, peso: 0 })
      }
      continue
    }
    const peso = pontuar(termo, [f.name, f.area], [f.summary])
    if (peso !== null) partes.push({ ...base, detalhe: `${f.area} · ${f.summary}`, peso })
  }

  for (const e of snapshot.events) {
    const codigo = codigoCurto(e.id)
    const titulo = e.human?.headline ?? e.claim ?? codigo
    const base = {
      chave: `evento:${e.id}`,
      tipo: 'mudancas' as const,
      titulo,
      detalhe: e.human?.what ?? e.claim,
      mono: codigo,
      aba: ABA_DE.mudancas,
    }
    if (vazio) {
      // Sem termo: as mais recentes primeiro, com quem pede decisão na frente.
      mudancas.push({ ...base, peso: pedeAtencao(e) ? 0 : 1 })
      continue
    }
    const peso = pontuar(termo, [codigo, titulo], [e.human?.what ?? '', e.claim ?? ''])
    if (peso !== null) mudancas.push({ ...base, peso })
  }

  if (!vazio) {
    for (const l of snapshot.pastas?.linhas ?? []) {
      if (l.tipo === 'vazia' || !l.nome) continue
      const peso = pontuar(termo, [l.nome], [l.proposito])
      if (peso !== null) {
        pastas.push({
          chave: `pasta:${l.nome}:${l.prefixo}`,
          tipo: 'pastas',
          titulo: l.nome,
          detalhe: l.proposito,
          peso,
          aba: ABA_DE.pastas,
        })
      }
    }

    for (const a of snapshot.documentos?.mapa?.assuntos ?? []) {
      const peso = pontuar(termo, [a.assunto], [a.resumo, a.vigente ?? ''])
      if (peso !== null) {
        docs.push({
          chave: `assunto:${a.assunto}`,
          tipo: 'docs',
          titulo: a.assunto,
          detalhe: a.resumo,
          mono: a.vigente,
          peso,
          aba: ABA_DE.docs,
        })
      }
    }

    const vistos = new Set(docs.map((d) => d.chave))
    for (const fam of snapshot.documentos?.varredura.familias ?? []) {
      for (const arq of fam.arquivos) {
        const chave = `doc:${arq.caminho}`
        if (vistos.has(chave)) continue
        const peso = pontuar(termo, [fam.base], [arq.caminho])
        if (peso !== null) {
          vistos.add(chave)
          docs.push({
            chave,
            tipo: 'docs',
            titulo: fam.base,
            mono: arq.caminho,
            peso,
            aba: ABA_DE.docs,
          })
        }
      }
    }
  }

  const cru: Record<Tipo, Resultado[]> = { partes, mudancas, pastas, docs }

  return ORDEM.map((tipo) => {
    const todos = cru[tipo].slice().sort((a, b) => a.peso - b.peso)
    return { tipo, total: todos.length, itens: todos.slice(0, POR_GRUPO) }
  }).filter((g) => g.itens.length > 0)
}
