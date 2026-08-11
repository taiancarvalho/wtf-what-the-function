import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  CloudOff,
  FileText,
  Files,
  FolderTree,
  LayoutList,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { STATE, STATE_ORDER, stateProgress } from '@/lib/state'
import { diaRelativo, plural } from '@/lib/format'
import type { Feature, FeatureState, ProjectSnapshot } from '@/types/protocol'

/**
 * Build Map — "onde estamos na construção do meu software?"
 * Lista densa das features por área. O técnico vive um clique abaixo.
 */

interface Area {
  nome: string
  features: Feature[]
  progresso: number
}

function agrupar(features: Feature[]): Area[] {
  const mapa = new Map<string, Feature[]>()
  for (const f of features) {
    const lista = mapa.get(f.area)
    if (lista) lista.push(f)
    else mapa.set(f.area, [f])
  }
  return [...mapa.entries()].map(([nome, lista]) => ({
    nome,
    features: [...lista].sort(
      (a, b) =>
        STATE_ORDER.indexOf(b.state) - STATE_ORDER.indexOf(a.state) ||
        a.name.localeCompare(b.name, 'pt-BR'),
    ),
    progresso: media(lista),
  }))
}

function media(features: Feature[]): number {
  if (features.length === 0) return 0
  return (
    features.reduce((soma, f) => soma + stateProgress(f.state), 0) /
    features.length
  )
}

function pct(n: number): number {
  return Math.round(n * 100)
}

// ------------------------------------------------------------------ barras

function Barra({ valor, alta = false }: { valor: number; alta?: boolean }) {
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-[var(--color-paper-3)]"
      style={{ height: alta ? 6 : 3 }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${pct(valor)}%`,
          background:
            'linear-gradient(90deg, var(--color-implemented), var(--color-validated))',
        }}
      />
    </div>
  )
}

function Marca({ state }: { state: FeatureState }) {
  const meta = STATE[state]
  return (
    <span
      aria-label={meta.label}
      title={`${meta.label} — ${meta.meaning}`}
      className="inline-flex w-5 shrink-0 justify-center text-[13px] leading-5 tracking-[-0.1em]"
      style={{ color: meta.color }}
    >
      {meta.mark}
    </span>
  )
}

// ------------------------------------------------------------------ filtros

/**
 * Dois eixos de filtro, deliberadamente diferentes:
 *
 * - ESTADOS (○ ◐ ● ✓ ✓✓) funcionam por EXCLUSÃO. Todos começam ligados; clicar
 *   desliga aquele estado e some com as partes dele. É o pedido literal do
 *   usuário: "clico em testado e escondo o que já foi testado".
 * - QUALIFICADORES (fora do plano, não salvo) NÃO são estados — uma parte pode
 *   ter os dois, ou nenhum. Escondê-los não faria sentido como o inverso de um
 *   estado, então eles funcionam por INCLUSÃO: clicar mostra SOMENTE as partes
 *   com aquela marca. Visualmente vêm separados por uma régua e ganham anel de
 *   destaque quando ativos, em vez do tachado usado no desligamento de estado.
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

// ----------------------------------------------------------------- feature

function Linha({
  feature,
  aberta,
  onToggle,
}: {
  feature: Feature
  aberta: boolean
  onToggle: () => void
}) {
  const meta = STATE[feature.state]
  const atencao =
    feature.attention === 'warning' || feature.attention === 'critical'
      ? feature.attention
      : null
  const corAtencao =
    atencao === 'critical' ? 'var(--color-danger)' : 'var(--color-warn)'
  const conferivel =
    feature.state === 'implemented' || feature.state === 'tested'

  return (
    <li
      style={{
        borderLeft: atencao ? `2px solid ${corAtencao}` : '2px solid transparent',
        background: atencao
          ? `color-mix(in oklab, ${corAtencao} 7%, transparent)`
          : undefined,
      }}
    >
      {/* Linha recolhida: continua compacta, mas o alvo inteiro é clicável. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={aberta}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        className="group flex cursor-pointer items-center gap-2 py-[5px] pr-1 pl-1 hover:bg-[color-mix(in_oklab,var(--color-ink-3)_7%,transparent)]"
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          aria-hidden
          className="shrink-0 text-[var(--color-ink-3)] transition-transform duration-200"
          style={{ transform: aberta ? 'rotate(90deg)' : undefined }}
        />

        <Marca state={feature.state} />

        <span
          className={[
            'min-w-0 flex-1 text-[13px] leading-5 text-[var(--color-ink)]',
            aberta ? '' : 'truncate',
          ].join(' ')}
        >
          {feature.name}
          {!aberta && (
            <span className="text-[var(--color-ink-3)]"> — {feature.summary}</span>
          )}
        </span>

        {feature.origin === 'discovered' && (
          <Sparkles
            size={11}
            strokeWidth={1.75}
            aria-label="Não estava no seu plano"
            className="shrink-0 text-[var(--color-ink-3)]"
          />
        )}
        {feature.unsaved && (
          <span
            className="inline-flex shrink-0 items-center gap-[3px] text-[10.5px] tabular-nums"
            style={{ color: 'var(--color-warn)' }}
            title="Arquivos ainda não guardados no histórico do projeto."
            aria-label="ainda não salvo"
          >
            <CloudOff size={11} />
            {feature.unsavedCount && feature.unsavedCount > 1
              ? feature.unsavedCount
              : null}
          </span>
        )}
        {atencao && (
          <AlertTriangle
            size={11}
            strokeWidth={2}
            className="shrink-0"
            style={{ color: corAtencao }}
            aria-label={
              atencao === 'critical'
                ? 'Precisa da sua atenção agora'
                : 'Tem algo aqui para você olhar'
            }
          />
        )}

        <span
          className="hidden w-[70px] shrink-0 truncate text-right text-[10.5px] sm:inline"
          style={{ color: meta.color }}
        >
          {meta.label}
        </span>
        <span className="w-[62px] shrink-0 text-right text-[10.5px] whitespace-nowrap text-[var(--color-ink-3)]">
          {diaRelativo(feature.lastTouchedAt)}
        </span>
        <span className="w-[26px] shrink-0 text-right">
          {conferivel && (
            <button
              type="button"
              onClick={(e) => {
                // Aprovar não pode abrir/fechar a linha.
                e.stopPropagation()
                console.log('conferir e aprovar', feature.id)
              }}
              title="Conferir e aprovar"
              aria-label="Conferir e aprovar"
              className="no-drag rounded-full border border-[var(--color-rule)] px-1.5 py-[1px] text-[10.5px] text-[var(--color-ink-2)] opacity-60 transition group-hover:opacity-100 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              ✓✓
            </button>
          )}
        </span>
      </div>

      {/* Expandido: tudo o que já existe na Feature, sem truncar. */}
      {aberta && (
        <div className="animate-in-up pt-0.5 pr-2 pb-3 pl-[38px]">
          <p className="text-[13px] leading-relaxed text-[var(--color-ink-2)]">
            {feature.summary}
          </p>

          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            <span style={{ color: meta.color }}>{meta.mark} {meta.label}</span>
            {' — '}
            {meta.meaning}
          </p>

          {feature.working && feature.workingClaim && (
            <p
              className="mt-2 text-[11.5px] leading-relaxed"
              style={{ color: 'var(--color-building)' }}
              title="O que a IA declarou ao começar este trabalho."
            >
              A IA está mexendo agora: “{feature.workingClaim}”
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-ink-3)]">
            <span
              className="flex items-center gap-1"
              title="Arquivos que o WTF associou a esta parte"
            >
              <Files size={11} aria-hidden />
              {plural(feature.files.length, 'arquivo', 'arquivos')}
            </span>
            {feature.unsaved && (
              <span
                className="flex items-center gap-1"
                style={{ color: 'var(--color-warn)' }}
                title="Arquivos ainda não guardados no histórico do projeto."
              >
                <CloudOff size={11} aria-hidden />
                {plural(
                  feature.unsavedCount ?? 1,
                  'ainda não salvo',
                  'ainda não salvos',
                )}
              </span>
            )}
            {feature.origin === 'discovered' && (
              <span
                className="flex items-center gap-1"
                title="Esta parte não estava no seu plano — o WTF a descobriu no código."
              >
                <Sparkles size={11} aria-hidden />
                fora do plano
              </span>
            )}
          </div>

          {feature.files.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5">
              <FileText
                size={11}
                aria-hidden
                className="mt-[3px] shrink-0 text-[var(--color-ink-3)]"
              />
              {/* `planRef` não existe no tipo Feature — o que existe são os
                  arquivos que o WTF associou a esta parte. */}
              <span className="font-mono text-[11px] break-all text-[var(--color-ink-3)]">
                {feature.files.join(' · ')}
              </span>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// -------------------------------------------------------------- componente

export function BuildMap({ snapshot }: { snapshot: ProjectSnapshot }) {
  const { features } = snapshot
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [estadosOcultos, setEstadosOcultos] = useState<Set<FeatureState>>(
    new Set(),
  )
  const [soForaDoPlano, setSoForaDoPlano] = useState(false)
  const [soNaoSalvo, setSoNaoSalvo] = useState(false)

  const filtros: Filtros = { estadosOcultos, soForaDoPlano, soNaoSalvo }
  const filtrando =
    estadosOcultos.size > 0 || soForaDoPlano || soNaoSalvo

  const visiveis = useMemo(
    () => features.filter((f) => passaNoFiltro(f, filtros)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [features, estadosOcultos, soForaDoPlano, soNaoSalvo],
  )

  // Áreas sem nenhuma feature visível não aparecem.
  const areas = agrupar(visiveis)
  const areasTotais = new Set(features.map((f) => f.area)).size

  /**
   * A barra geral mede o PROJETO INTEIRO, sempre sobre `features`, nunca sobre
   * `visiveis`. Filtro é uma lente de leitura, não uma mudança do projeto — se
   * a porcentagem pulasse ao esconder "testado", o número deixaria de significar
   * "quanto do meu software está pronto" e viraria um artefato do filtro.
   */
  const geral = media(features)
  const naoSalvas = features.filter((f) => f.unsaved).length
  const escondidas = features.length - visiveis.length

  const contagem = STATE_ORDER.map((state) => ({
    state,
    n: features.filter((f) => f.state === state).length,
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

  function alternarAberta(id: string) {
    setAbertas((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-6 pt-6 pb-12">
        {/* ------------------------------------------------------ cabeçalho */}
        <header className="animate-in-up">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 className="font-display text-[26px] leading-none text-[var(--color-ink)]">
              Onde estamos na construção
            </h1>
            <span
              className="font-display text-[22px] leading-none tabular-nums text-[var(--color-ink)]"
              title="Quanto do projeto inteiro já avançou — não muda com os filtros."
            >
              {pct(geral)}%
            </span>
          </div>

          <div className="mt-2">
            <Barra valor={geral} alta />
          </div>

          {/* Números do projeto, com ícone onde o ícone é inequívoco. */}
          <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px] text-[var(--color-ink-2)]">
            <li
              className="flex items-center gap-1.5"
              title={`${features.length} partes no projeto`}
              aria-label={`${features.length} partes no projeto`}
            >
              <LayoutList
                size={12}
                strokeWidth={1.75}
                aria-hidden
                className="text-[var(--color-ink-3)]"
              />
              <span className="tabular-nums text-[var(--color-ink)]">
                {features.length}
              </span>
              <span className="text-[var(--color-ink-3)]">partes</span>
            </li>
            <li
              className="flex items-center gap-1.5"
              title={`${areasTotais} áreas do produto`}
              aria-label={`${areasTotais} áreas do produto`}
            >
              <FolderTree
                size={12}
                strokeWidth={1.75}
                aria-hidden
                className="text-[var(--color-ink-3)]"
              />
              <span className="tabular-nums text-[var(--color-ink)]">
                {areasTotais}
              </span>
              <span className="text-[var(--color-ink-3)]">áreas</span>
            </li>
            {naoSalvas > 0 && (
              <li
                className="flex items-center gap-1.5"
                style={{ color: 'var(--color-warn)' }}
                title={`${naoSalvas} partes com trabalho ainda não guardado no histórico do projeto`}
                aria-label={`${naoSalvas} partes com trabalho não salvo`}
              >
                <CloudOff size={12} strokeWidth={1.75} aria-hidden />
                <span className="tabular-nums">{naoSalvas}</span>
                <span>com trabalho não salvo</span>
              </li>
            )}
          </ul>

          {/* --------------------------------------- legenda que vira filtro */}
          <div className="rule-double mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2">
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
            <span
              aria-hidden
              className="h-3 w-px bg-[var(--color-rule)]"
            />
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
                soNaoSalvo ? 'border-current' : 'border-transparent hover:border-[var(--color-rule)]',
              ].join(' ')}
              style={{
                color: soNaoSalvo
                  ? 'var(--color-warn)'
                  : 'var(--color-ink-3)',
              }}
            >
              <CloudOff size={11} aria-hidden />
              só não salvo
            </button>
          </div>

          {filtrando && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-3)]">
              <span>
                {escondidas === 0
                  ? 'Filtro ativo — nada escondido.'
                  : `${plural(escondidas, 'parte escondida', 'partes escondidas')} pelo filtro.`}{' '}
                A porcentagem acima continua sendo a do projeto inteiro.
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
        </header>

        {/* ----------------------------------------------------------- áreas */}
        <div className="mt-5 space-y-4">
          {areas.map((area, i) => (
            <section
              key={area.nome}
              className="animate-in-up"
              style={{ animationDelay: `${60 + i * 35}ms` }}
            >
              <div className="rule-double flex items-baseline justify-between gap-3 pt-2">
                <h3 className="font-display text-[15px] text-[var(--color-ink)]">
                  {area.nome}
                </h3>
                <div className="flex items-center gap-2">
                  <div className="w-[110px]">
                    <Barra valor={area.progresso} />
                  </div>
                  <span className="w-[64px] text-right text-[10.5px] tabular-nums text-[var(--color-ink-3)]">
                    {pct(area.progresso)}% · {area.features.length}
                  </span>
                </div>
              </div>

              <ul className="mt-0.5 divide-y divide-[var(--color-rule)]">
                {area.features.map((f) => (
                  <Linha
                    key={f.id}
                    feature={f}
                    aberta={abertas.has(f.id)}
                    onToggle={() => alternarAberta(f.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {areas.length === 0 && (
            <p className="text-[12.5px] text-[var(--color-ink-3)]">
              Nenhuma parte passa pelos filtros atuais.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
