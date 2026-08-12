import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  CloudOff,
  History,
  Files,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { STATE, STATE_ORDER } from '@/lib/state'
import { RevalidarChip, UnsavedChip } from '@/components/StateMark'
import { diaRelativo, horaDe, plural } from '@/lib/format'
import type { Feature, FeatureState, ProjectSnapshot } from '@/types/protocol'

/** "Agora" do mock. Quando o motor existir, vira Date.now(). */
const AGORA = new Date('2026-08-11T17:00:00-03:00').getTime()

function mexidoHoje(f: Feature): boolean {
  return AGORA - new Date(f.lastTouchedAt).getTime() <= 24 * 60 * 60 * 1000
}

function alerta(f: Feature): boolean {
  return f.attention === 'warning' || f.attention === 'critical'
}

/** Peso visual: quanto de código e de ligação essa parte carrega. */
function peso(f: Feature): number {
  return f.files.length * 2 + f.relatedIds.length
}

function fundo(cor: string, n = 12): string {
  return `color-mix(in oklab, ${cor} ${n}%, transparent)`
}

// ------------------------------------------------------------------ filtros

/**
 * Mesma semântica do Progresso (BuildMap), de propósito — as duas telas leem
 * o mesmo projeto e precisam responder ao mesmo gesto.
 *
 * - ESTADOS (○ ◐ ● ✓ ✓✓) filtram por EXCLUSÃO: começam ligados, clicar esconde.
 * - QUALIFICADORES (fora do plano, não salvo) filtram por INCLUSÃO: clicar
 *   mostra SOMENTE as partes com aquela marca. Por isso ganham anel em vez de
 *   tachado, e vêm depois de uma régua.
 */
interface Filtros {
  estadosOcultos: Set<FeatureState>
  soForaDoPlano: boolean
  soNaoSalvo: boolean
}

function passaNoFiltro(f: Feature, filtros: Filtros): boolean {
  if (filtros.estadosOcultos.has(f.state)) return false
  if (filtros.soForaDoPlano && f.origin !== 'discovered') return false
  if (filtros.soNaoSalvo && !f.unsaved) return false
  return true
}

export function ProductMap({ snapshot }: { snapshot: ProjectSnapshot }) {
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [estadosOcultos, setEstadosOcultos] = useState<Set<FeatureState>>(
    new Set(),
  )
  const [soForaDoPlano, setSoForaDoPlano] = useState(false)
  const [soNaoSalvo, setSoNaoSalvo] = useState(false)

  const filtrando = estadosOcultos.size > 0 || soForaDoPlano || soNaoSalvo

  const visiveis = useMemo(
    () =>
      snapshot.features.filter((f) =>
        passaNoFiltro(f, { estadosOcultos, soForaDoPlano, soNaoSalvo }),
      ),
    [snapshot.features, estadosOcultos, soForaDoPlano, soNaoSalvo],
  )

  // Distritos sem nenhuma parte visível não aparecem.
  const distritos = useMemo(() => {
    const mapa = new Map<string, Feature[]>()
    for (const f of visiveis) {
      const lista = mapa.get(f.area) ?? []
      lista.push(f)
      mapa.set(f.area, lista)
    }
    return [...mapa.entries()].map(([area, features]) => ({
      area,
      features: [...features].sort((a, b) => peso(b) - peso(a)),
    }))
  }, [visiveis])

  const nomeDe = useMemo(() => {
    const m = new Map(snapshot.features.map((f) => [f.id, f.name]))
    return (id: string) => m.get(id) ?? 'Parte desconhecida'
  }, [snapshot.features])

  const aberta = snapshot.features.find((f) => f.id === abertoId) ?? null

  /**
   * Os números do cabeçalho medem o PROJETO INTEIRO, nunca o recorte visível:
   * filtro é lente de leitura, não mudança do projeto.
   */
  const areasTotais = new Set(snapshot.features.map((f) => f.area)).size
  const tocadasHoje = snapshot.features.filter(mexidoHoje).length
  const escondidas = snapshot.features.length - visiveis.length

  const contagem = STATE_ORDER.map((state) => ({
    state,
    n: snapshot.features.filter((f) => f.state === state).length,
  }))

  function alternarEstado(state: FeatureState) {
    setEstadosOcultos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(state)) proximo.delete(state)
      else proximo.add(state)
      return proximo
    })
  }

  function limpar() {
    setEstadosOcultos(new Set())
    setSoForaDoPlano(false)
    setSoNaoSalvo(false)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1180px] gap-6 px-6 py-6">
        <div className="min-w-0 flex-1">
          {/* ---------------------------------------------------- cabeçalho */}
          <header className="animate-in-up flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="font-display text-[26px] leading-none text-[var(--color-ink)]">
              Do que o {snapshot.project.name} é feito
            </h1>
            <p className="text-[12px] text-[var(--color-ink-3)]">
              {plural(snapshot.features.length, 'parte', 'partes')} ·{' '}
              {plural(areasTotais, 'área', 'áreas')} ·{' '}
              {plural(tocadasHoje, 'mexida hoje', 'mexidas hoje')}
            </p>
          </header>

          {/* --------------------------------------- legenda que vira filtro */}
          <div className="rule-double animate-in-up mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2">
            {contagem.map(({ state, n }) => {
              const oculto = estadosOcultos.has(state)
              return (
                <button
                  key={state}
                  type="button"
                  onClick={() => alternarEstado(state)}
                  aria-pressed={!oculto}
                  title={
                    oculto
                      ? `Mostrar de novo: ${STATE[state].label}`
                      : `Esconder ${STATE[state].label.toLowerCase()} — ${STATE[state].meaning}`
                  }
                  className={[
                    'flex items-baseline gap-1 rounded-full px-1.5 py-[2px] text-[11px] transition hover:bg-[color-mix(in_oklab,var(--color-ink-3)_12%,transparent)]',
                    oculto ? 'opacity-40 line-through' : '',
                  ].join(' ')}
                >
                  <span
                    className="tracking-[-0.1em]"
                    style={{ color: STATE[state].color }}
                  >
                    {STATE[state].mark}
                  </span>
                  <span className="tabular-nums text-[var(--color-ink)]">
                    {n}
                  </span>
                  <span className="text-[var(--color-ink-3)]">
                    {STATE[state].label.toLowerCase()}
                  </span>
                </button>
              )
            })}

            {/* Qualificadores: filtro positivo, visualmente separado. */}
            <span aria-hidden className="h-3 w-px bg-[var(--color-rule)]" />
            <button
              type="button"
              onClick={() => setSoForaDoPlano((v) => !v)}
              aria-pressed={soForaDoPlano}
              title="Mostrar somente as partes que não estavam no seu plano — o WTF as descobriu no código."
              className={[
                'flex items-center gap-1 rounded-full border px-1.5 py-[2px] text-[11px] transition',
                soForaDoPlano
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-ink-3)] hover:border-[var(--color-rule)]',
              ].join(' ')}
            >
              <Sparkles size={11} strokeWidth={1.75} aria-hidden />
              só fora do plano
            </button>
            <button
              type="button"
              onClick={() => setSoNaoSalvo((v) => !v)}
              aria-pressed={soNaoSalvo}
              title="Mostrar somente as partes com arquivos ainda não guardados no histórico do projeto."
              className={[
                'flex items-center gap-1 rounded-full border px-1.5 py-[2px] text-[11px] transition',
                soNaoSalvo
                  ? 'border-current'
                  : 'border-transparent hover:border-[var(--color-rule)]',
              ].join(' ')}
              style={{
                color: soNaoSalvo ? 'var(--color-warn)' : 'var(--color-ink-3)',
              }}
            >
              <CloudOff size={11} aria-hidden />
              só não salvo
            </button>

            {/* Marcas que os blocos usam, aqui só para leitura. */}
            <span aria-hidden className="h-3 w-px bg-[var(--color-rule)]" />
            <span
              className="flex items-center gap-1 text-[11px] text-[var(--color-ink-3)]"
              title="Precisa da sua atenção"
            >
              <AlertTriangle
                size={11}
                aria-hidden
                className="text-[var(--color-warn)]"
              />
              atenção
            </span>
            <span
              className="flex items-center gap-1 text-[11px] text-[var(--color-ink-3)]"
              title="Mexido nas últimas 24 horas"
            >
              <Clock3
                size={11}
                aria-hidden
                className="text-[var(--color-accent)]"
              />
              hoje
            </span>
          </div>

          {filtrando && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-3)]">
              <span>
                {escondidas === 0
                  ? 'Filtro ativo — nada escondido.'
                  : `${plural(escondidas, 'parte escondida', 'partes escondidas')} pelo filtro.`}{' '}
                Os números acima continuam sendo os do projeto inteiro.
              </span>
              <button
                type="button"
                onClick={limpar}
                className="flex items-center gap-1 rounded-full border border-[var(--color-rule)] px-1.5 py-[1px] text-[var(--color-ink-2)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                title="Limpar filtros"
                aria-label="Limpar filtros"
              >
                <RotateCcw size={10} aria-hidden />
                limpar filtros
              </button>
            </p>
          )}

          {/* ---------------------------------------------------- distritos */}
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {distritos.map((d, i) => (
              <section
                key={d.area}
                className="card animate-in-up p-2.5"
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <h2 className="font-display truncate text-[13px] text-[var(--color-ink)]">
                    {d.area}
                  </h2>
                  <span className="text-[10px] tabular-nums text-[var(--color-ink-3)]">
                    {d.features.length}
                  </span>
                </div>

                <ul className="flex flex-col gap-1">
                  {d.features.map((f) => {
                    const meta = STATE[f.state]
                    const selecionada = f.id === abertoId
                    return (
                      <li key={f.id}>
                        <button
                          onClick={() => setAbertoId(selecionada ? null : f.id)}
                          title={f.name}
                          className={[
                            f.working ? 'pulse-live' : '',
                            'flex w-full items-center gap-1.5 rounded-[6px] border border-l-[3px] px-1.5 py-[3px] text-left transition-colors duration-150 hover:border-[var(--color-ink-3)]',
                          ].join(' ')}
                          style={{
                            background: fundo(meta.color),
                            borderColor: 'var(--color-rule)',
                            borderLeftColor: meta.color,
                            boxShadow: selecionada
                              ? `0 0 0 1.5px ${meta.color}`
                              : undefined,
                          }}
                        >
                          <span
                            aria-hidden
                            className="w-3 shrink-0 text-center text-[11px] leading-none tracking-[-0.1em]"
                            style={{ color: meta.color }}
                          >
                            {meta.mark}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] leading-[18px] text-[var(--color-ink)]">
                            {f.name}
                          </span>
                          {f.origin === 'discovered' && (
                            <Sparkles
                              size={10}
                              className="shrink-0 text-[var(--color-ink-3)]"
                              aria-label="Não estava no seu plano"
                            />
                          )}
                          {mexidoHoje(f) && (
                            <Clock3
                              size={10}
                              className="shrink-0 text-[var(--color-accent)]"
                              aria-label="mexido hoje"
                            />
                          )}
                          {f.unsaved && (
                            <CloudOff
                              size={10}
                              className="shrink-0 text-[var(--color-warn)]"
                              aria-label="ainda não salvo"
                            />
                          )}
                          {f.revalidar && (
                            <span
                              className="shrink-0 text-[var(--color-warn)]"
                              aria-label="Mudou depois que você aprovou"
                              title={
                                f.validadoEm
                                  ? `Você tinha aprovado em ${new Date(f.validadoEm).toLocaleString('pt-BR')}. Depois disso esta parte mudou.`
                                  : 'Esta parte mudou depois que você aprovou.'
                              }
                            >
                              <History size={10} aria-hidden />
                            </span>
                          )}
                          {alerta(f) && (
                            <AlertTriangle
                              size={10}
                              aria-label="precisa da sua atenção"
                              className={
                                f.attention === 'critical'
                                  ? 'shrink-0 text-[var(--color-danger)]'
                                  : 'shrink-0 text-[var(--color-warn)]'
                              }
                            />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}

            {distritos.length === 0 && (
              <p className="text-[12.5px] text-[var(--color-ink-3)]">
                Nenhuma parte passa pelos filtros atuais.
              </p>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------- painel */}
        <AnimatePresence>
          {aberta && (
            <motion.aside
              key={aberta.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="card sticky top-0 hidden h-fit w-[300px] shrink-0 p-4 lg:block"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] tracking-[0.16em] text-[var(--color-ink-3)] uppercase">
                    {aberta.area}
                  </p>
                  <h3 className="font-display mt-0.5 text-[18px] leading-tight text-[var(--color-ink)]">
                    {aberta.name}
                  </h3>
                </div>
                <button
                  onClick={() => setAbertoId(null)}
                  aria-label="Fechar"
                  className="rounded-full p-1 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                >
                  <X size={15} />
                </button>
              </div>

              <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                {aberta.summary}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11px] font-medium"
                  style={{
                    color: STATE[aberta.state].color,
                    borderColor: fundo(STATE[aberta.state].color, 40),
                    background: fundo(STATE[aberta.state].color, 10),
                  }}
                  title={STATE[aberta.state].meaning}
                >
                  <span className="tracking-[-0.1em]">
                    {STATE[aberta.state].mark}
                  </span>
                  {STATE[aberta.state].label}
                </span>
                {aberta.unsaved && <UnsavedChip quantos={aberta.unsavedCount} />}
                {aberta.revalidar && <RevalidarChip desde={aberta.validadoEm} />}
                {alerta(aberta) && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-medium"
                    style={{
                      color: 'var(--color-warn)',
                      background: fundo('var(--color-warn)', 13),
                    }}
                  >
                    <AlertTriangle size={11} aria-hidden />
                    atenção
                  </span>
                )}
              </div>

              {/* O que o estado significa de verdade — mesmo texto do Progresso. */}
              <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
                {STATE[aberta.state].meaning}
              </p>

              {aberta.working && aberta.workingClaim && (
                <p
                  className="mt-2 text-[11.5px] leading-relaxed"
                  style={{ color: 'var(--color-building)' }}
                  title="O que a IA declarou ao começar este trabalho."
                >
                  A IA está mexendo agora: “{aberta.workingClaim}”
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-ink-3)]">
                <span
                  className="flex items-center gap-1"
                  title="Arquivos que o WTF associou a esta parte"
                >
                  <Files size={11} aria-hidden />
                  {plural(aberta.files.length, 'arquivo', 'arquivos')}
                </span>
                {aberta.unsaved && (
                  <span
                    className="flex items-center gap-1"
                    style={{ color: 'var(--color-warn)' }}
                    title="Arquivos ainda não guardados no histórico do projeto."
                  >
                    <CloudOff size={11} aria-hidden />
                    {plural(
                      aberta.unsavedCount ?? 1,
                      'ainda não salvo',
                      'ainda não salvos',
                    )}
                  </span>
                )}
                {aberta.origin === 'discovered' && (
                  <span
                    className="flex items-center gap-1"
                    title="Esta parte não estava no seu plano — o WTF a descobriu no código."
                  >
                    <Sparkles size={11} aria-hidden />
                    fora do plano
                  </span>
                )}
              </div>

              <p className="mt-3 text-[11px] text-[var(--color-ink-3)]">
                Mexido {diaRelativo(aberta.lastTouchedAt)} às{' '}
                {horaDe(aberta.lastTouchedAt)}
              </p>

              <div className="rule-double mt-3 pt-2">
                <p className="text-[10px] tracking-[0.16em] text-[var(--color-ink-3)] uppercase">
                  Ligado a
                </p>
                {aberta.relatedIds.length === 0 ? (
                  <p className="mt-1 text-[12px] text-[var(--color-ink-3)]">
                    Nada.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {aberta.relatedIds.map((id) => (
                      <li key={id}>
                        <button
                          onClick={() => setAbertoId(id)}
                          className="flex items-center gap-1.5 text-[12.5px] text-[var(--color-ink-2)] hover:text-[var(--color-accent)]"
                        >
                          <ArrowUpRight size={12} aria-hidden className="shrink-0" />
                          {nomeDe(id)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <details className="mt-3 border-t border-[var(--color-rule)] pt-2">
                <summary className="cursor-default list-none text-[11.5px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
                  Ver parte técnica
                </summary>
                {aberta.files.length === 0 ? (
                  <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-3)]">
                    Nenhum arquivo ainda.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-0.5">
                    {aberta.files.map((arq) => (
                      <li
                        key={arq}
                        className="font-mono text-[11px] break-all text-[var(--color-ink-3)]"
                      >
                        {arq}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
