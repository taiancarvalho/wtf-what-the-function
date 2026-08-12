import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  CloudOff,
  FileText,
  Files,
  FolderTree,
  LayoutList,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { RevalidarChip, UnsavedChip, WorkingChip } from '@/components/StateMark'
import { alternarValidado, podeValidar } from '@/lib/source'
import { STATE, STATE_ORDER, stateProgress } from '@/lib/state'
import { diaRelativo } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { Feature, FeatureState, ProjectSnapshot } from '@/types/protocol'

/**
 * Build Map — "onde estamos na construção do meu software?"
 *
 * Um kanban de cinco colunas, na ordem de `STATE_ORDER`:
 * Planejado → Construindo → Pronto → Testado → Você aprovou.
 * Cada parte do projeto é um card, na coluna do seu estado.
 *
 * NINGUÉM ARRASTA NADA — E ISSO É UMA DECISÃO, NÃO UMA LIMITAÇÃO.
 *
 * Num kanban comum, a posição do card é a OPINIÃO de quem arrastou: alguém
 * move "para pronto" porque acha que está pronto, e o quadro começa a mentir no
 * instante em que alguém esquece de mover. É uma segunda realidade que precisa
 * ser mantida à mão, e que sempre atrasa em relação ao código.
 *
 * Aqui a coluna é DERIVADA de evidência. O estado vem do que foi provado no
 * projeto (a IA declarou, o código existe, o teste passou, você aprovou), então
 * o card anda sozinho quando o código prova que andou. Não existe "arrastar"
 * porque não existe nada para o arrasto significar: mover um card sem mover o
 * software seria falsificar o painel.
 *
 * Por isso a animação importa tanto: ver o card caminhar sozinho para a coluna
 * seguinte é o momento em que a pessoa VÊ a construção acontecer. Cada card usa
 * `layoutId` = id da feature, estável entre colunas, para que a troca de estado
 * vire movimento e não um sumiço com um aparecimento.
 *
 * Os detalhes técnicos continuam vivendo um clique abaixo, dentro do card.
 */

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

/** Curta e suave: o card desliza, nunca salta. */
const TRANSICAO = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 40,
  mass: 0.7,
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

// ------------------------------------------------------------------ filtros

/**
 * Dois eixos de filtro, deliberadamente diferentes:
 *
 * - ESTADOS (○ ◐ ● ✓ ✓✓) funcionam por EXCLUSÃO. Todos começam ligados; clicar
 *   desliga aquele estado. Num kanban, esconder um estado é esconder a COLUNA
 *   inteira — então a coluna some, e a contagem de escondidas diz quantas
 *   partes foram embora com ela.
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

// -------------------------------------------------------------------- card

function Card({
  feature,
  aberta,
  onToggle,
  onAprovar,
}: {
  feature: Feature
  aberta: boolean
  onToggle: () => void
  onAprovar: () => void
}) {
  const t = useT()
  const meta = STATE[feature.state]
  const atencao =
    feature.attention === 'warning' || feature.attention === 'critical'
      ? feature.attention
      : null
  const corAtencao =
    atencao === 'critical' ? 'var(--color-danger)' : 'var(--color-warn)'
  const validada = feature.state === 'validated'
  const conferivel =
    podeValidar() &&
    (validada || feature.state === 'implemented' || feature.state === 'tested')

  return (
    <motion.li
      /* `layoutId` = id da feature: estável entre colunas, é o que faz o card
         CAMINHAR quando o estado muda em vez de piscar de um lado para o outro. */
      layout
      layoutId={feature.id}
      transition={TRANSICAO}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card cursor-pointer p-2 hover:bg-[color-mix(in_oklab,var(--color-ink-3)_6%,transparent)]"
      style={{
        borderLeft: atencao
          ? `2px solid ${corAtencao}`
          : '2px solid transparent',
        background: atencao
          ? `color-mix(in oklab, ${corAtencao} 7%, transparent)`
          : undefined,
      }}
    >
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
        className="group"
      >
        <div className="flex items-start gap-1.5">
          <span className="min-w-0 flex-1 text-[12.5px] leading-[17px] text-[var(--color-ink)]">
            {feature.name}
          </span>
          <span className="w-[26px] shrink-0 text-right">
            {conferivel && (
              <button
                type="button"
                onClick={(e) => {
                  // Aprovar não pode abrir/fechar o card.
                  e.stopPropagation()
                  onAprovar()
                }}
                title={
                  validada
                    ? t('progresso.desfazerAprovacao')
                    : t('progresso.aprovar')
                }
                aria-label={
                  validada
                    ? t('progresso.desfazerAprovacao')
                    : t('progresso.aprovar')
                }
                className="no-drag rounded-full border px-1.5 py-[1px] text-[10.5px] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                style={
                  validada
                    ? {
                        borderColor: 'var(--color-validated)',
                        color: 'var(--color-validated)',
                      }
                    : {
                        borderColor: 'var(--color-rule)',
                        color: 'var(--color-ink-2)',
                        opacity: 0.6,
                      }
                }
              >
                ✓✓
              </button>
            )}
          </span>
        </div>

        {/* A área não vira sub-cabeçalho dentro da coluna (poluiria); ela viaja
            junto do card, que é onde a informação é lida. */}
        <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-[var(--color-ink-3)]">
          <span className="min-w-0 flex-1 truncate" title={feature.area}>
            {feature.area}
          </span>
          <span className="shrink-0 whitespace-nowrap">
            {diaRelativo(feature.lastTouchedAt)}
          </span>
        </div>

        {/* Marcas: eixos que não são o estado, e por isso não mudam de coluna. */}
        {(feature.origin === 'discovered' ||
          feature.unsaved ||
          feature.working ||
          feature.revalidar ||
          atencao) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {feature.origin === 'discovered' && (
              <span
                className="inline-flex items-center gap-1 text-[10.5px] text-[var(--color-ink-3)]"
                title={t('marca.foraDoPlanoDica')}
              >
                <Sparkles size={10} strokeWidth={1.75} aria-hidden />
                {t('marca.foraDoPlanoCurto')}
              </span>
            )}
            {feature.unsaved && <UnsavedChip quantos={feature.unsavedCount} />}
            {feature.working && <WorkingChip desde={feature.workingSince} />}
            {feature.revalidar && <RevalidarChip desde={feature.validadoEm} />}
            {atencao && (
              <AlertTriangle
                size={11}
                strokeWidth={2}
                className="shrink-0"
                style={{ color: corAtencao }}
                aria-label={
                  atencao === 'critical'
                    ? t('marca.atencaoCritica')
                    : t('marca.atencaoAviso')
                }
              />
            )}
          </div>
        )}

        {/* Expandido: tudo o que a versão em lista já mostrava, sem truncar. */}
        {aberta && (
          <div className="animate-in-up mt-2">
            <p className="text-[12px] leading-relaxed text-[var(--color-ink-2)]">
              {feature.summary}
            </p>

            <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-3)]">
              <span style={{ color: meta.color }}>
                {meta.mark} {t(`estado.${feature.state}`)}
              </span>
              {' — '}
              {t(`estado.${feature.state}.sentido`)}
            </p>

            {feature.working && feature.workingClaim && (
              <p
                className="mt-2 text-[11px] leading-relaxed"
                style={{ color: 'var(--color-building)' }}
                title={t('marca.mexendoDica')}
              >
                {t('marca.mexendoClaim', { claim: feature.workingClaim })}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[var(--color-ink-3)]">
              <span
                className="flex items-center gap-1"
                title={t('geral.arquivosDica')}
              >
                <Files size={11} aria-hidden />
                {feature.files.length === 1
                  ? t('geral.arquivo')
                  : t('geral.arquivos', { n: feature.files.length })}
              </span>
              {feature.unsaved && (
                <span
                  className="flex items-center gap-1"
                  style={{ color: 'var(--color-warn)' }}
                  title={t('marca.naoSalvoDica')}
                >
                  <CloudOff size={11} aria-hidden />
                  {(feature.unsavedCount ?? 1) === 1
                    ? t('marca.naoSalvo')
                    : t('marca.naoSalvos', { n: feature.unsavedCount ?? 1 })}
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
                <span className="font-mono text-[10.5px] break-all text-[var(--color-ink-3)]">
                  {feature.files.join(' · ')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.li>
  )
}

// ------------------------------------------------------------------ coluna

function Coluna({
  state,
  features,
  abertas,
  onToggle,
  onAprovar,
}: {
  state: FeatureState
  features: Feature[]
  abertas: Set<string>
  onToggle: (id: string) => void
  onAprovar: (id: string) => void
}) {
  const t = useT()
  const meta = STATE[state]

  return (
    <section className="flex h-full w-[250px] min-w-0 shrink-0 flex-col">
      <div
        className="rule-double flex shrink-0 items-baseline gap-1.5 pt-2 pb-1.5"
        title={t('estado.comSentido', {
          estado: t(`estado.${state}`),
          sentido: t(`estado.${state}.sentido`),
        })}
      >
        <span
          aria-hidden
          className="tracking-[-0.1em]"
          style={{ color: meta.color }}
        >
          {meta.mark}
        </span>
        <h2 className="font-display min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink)]">
          {t(`estado.${state}`)}
        </h2>
        <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--color-ink-3)]">
          {features.length}
        </span>
      </div>

      {/* Cada coluna rola sozinha: uma coluna cheia não empurra as outras. */}
      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pt-1.5 pb-4">
        <AnimatePresence initial={false} mode="popLayout">
          {features.map((f) => (
            <Card
              key={f.id}
              feature={f}
              aberta={abertas.has(f.id)}
              onToggle={() => onToggle(f.id)}
              onAprovar={() => onAprovar(f.id)}
            />
          ))}
        </AnimatePresence>

        {/* Coluna vazia continua aparecendo: "nada testado" é uma informação. */}
        {features.length === 0 && (
          <li className="text-[11px] text-[var(--color-ink-3)] opacity-70">
            {t('progresso.colunaVazia')}
          </li>
        )}
      </ul>
    </section>
  )
}

// -------------------------------------------------------------- componente

export function BuildMap({
  snapshot,
  onMudou,
}: {
  snapshot: ProjectSnapshot
  onMudou?: () => void
}) {
  const t = useT()
  const { features } = snapshot
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [estadosOcultos, setEstadosOcultos] = useState<Set<FeatureState>>(
    new Set(),
  )
  const [soForaDoPlano, setSoForaDoPlano] = useState(false)
  const [soNaoSalvo, setSoNaoSalvo] = useState(false)

  const filtros: Filtros = { estadosOcultos, soForaDoPlano, soNaoSalvo }
  const filtrando = estadosOcultos.size > 0 || soForaDoPlano || soNaoSalvo

  const visiveis = useMemo(
    () => features.filter((f) => passaNoFiltro(f, filtros)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [features, estadosOcultos, soForaDoPlano, soNaoSalvo],
  )

  /**
   * Colunas visíveis. Esconder um estado é esconder a coluna dele — o inverso
   * seria uma coluna vazia mentindo que não há nada naquele estado.
   */
  const colunas = useMemo(() => {
    const porEstado = new Map<FeatureState, Feature[]>()
    for (const f of visiveis) {
      const lista = porEstado.get(f.state)
      if (lista) lista.push(f)
      else porEstado.set(f.state, [f])
    }
    return STATE_ORDER.filter((s) => !estadosOcultos.has(s)).map((state) => ({
      state,
      // O agrupamento por área não se perde: dentro da coluna, os cards vêm
      // ordenados por área (e a área aparece em cada card).
      features: (porEstado.get(state) ?? []).sort(
        (a, b) =>
          a.area.localeCompare(b.area, 'pt-BR') ||
          a.name.localeCompare(b.name, 'pt-BR'),
      ),
    }))
  }, [visiveis, estadosOcultos])

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
  const colunasOcultas = estadosOcultos.size

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
    // A página nunca rola na horizontal: só a faixa das colunas rola.
    <div className="flex h-full flex-col overflow-hidden">
      {/* ------------------------------------------------------ cabeçalho */}
      <header className="animate-in-up shrink-0 px-6 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="font-display text-[26px] leading-none text-[var(--color-ink)]">
            {t('progresso.titulo')}
          </h1>
          <span
            className="font-display text-[22px] leading-none tabular-nums text-[var(--color-ink)]"
            title={t('progresso.geralDica')}
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
            title={t('progresso.partes', { n: features.length })}
            aria-label={t('progresso.partes', { n: features.length })}
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
            <span className="text-[var(--color-ink-3)]">
              {t('progresso.palavraPartes')}
            </span>
          </li>
          <li
            className="flex items-center gap-1.5"
            title={t('progresso.areas', { n: areasTotais })}
            aria-label={t('progresso.areas', { n: areasTotais })}
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
            <span className="text-[var(--color-ink-3)]">
              {t('progresso.palavraAreas')}
            </span>
          </li>
          {naoSalvas > 0 && (
            <li
              className="flex items-center gap-1.5"
              style={{ color: 'var(--color-warn)' }}
              title={t('progresso.comNaoSalvo', { n: naoSalvas })}
              aria-label={t('progresso.comNaoSalvo', { n: naoSalvas })}
            >
              <CloudOff size={12} strokeWidth={1.75} aria-hidden />
              <span className="tabular-nums">{naoSalvas}</span>
              <span>{t('progresso.palavraNaoSalvo')}</span>
            </li>
          )}
          <li
            className="text-[var(--color-ink-3)]"
            title={t('progresso.semArrastarDica')}
          >
            {t('progresso.semArrastar')}
          </li>
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
                    ? t('filtro.mostrarDeNovo', { estado: t(`estado.${state}`) })
                    : t('filtro.esconderColuna', {
                        estado: t(`estado.${state}`).toLowerCase(),
                        sentido: t(`estado.${state}.sentido`),
                      })
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
                <span className="tabular-nums text-[var(--color-ink)]">{n}</span>
                <span className="text-[var(--color-ink-3)]">
                  {t(`estado.${state}`).toLowerCase()}
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
            title={t('filtro.soForaDoPlanoDica')}
            className={[
              'flex items-center gap-1 rounded-full border px-1.5 py-[2px] text-[11px] transition',
              soForaDoPlano
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-ink-3)] hover:border-[var(--color-rule)]',
            ].join(' ')}
          >
            <Sparkles size={11} strokeWidth={1.75} aria-hidden />
            {t('filtro.soForaDoPlano')}
          </button>
          <button
            type="button"
            onClick={() => setSoNaoSalvo((v) => !v)}
            aria-pressed={soNaoSalvo}
            title={t('filtro.soNaoSalvoDica')}
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
            {t('filtro.soNaoSalvo')}
          </button>
        </div>

        {filtrando && (
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-3)]">
            <span>
              {escondidas === 0
                ? t('filtro.nadaEscondido')
                : escondidas === 1
                  ? t('filtro.escondida')
                  : t('filtro.escondidas', { n: escondidas })}{' '}
              {colunasOcultas === 1
                ? t('filtro.colunaOculta')
                : colunasOcultas > 1
                  ? t('filtro.colunasOcultas', { n: colunasOcultas })
                  : ''}{' '}
              {t('progresso.notaPorcentagem')}
            </span>
            <button
              type="button"
              onClick={limpar}
              className="flex items-center gap-1 rounded-full border border-[var(--color-rule)] px-1.5 py-[1px] text-[var(--color-ink-2)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              title={t('progresso.limparFiltros')}
              aria-label={t('progresso.limparFiltros')}
            >
              <RotateCcw size={10} aria-hidden />
              {t('filtro.limpar')}
            </button>
          </p>
        )}
      </header>

      {/* ---------------------------------------------------------- quadro */}
      <div className="mt-3 min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6">
        {colunas.length === 0 ? (
          <p className="text-[12.5px] text-[var(--color-ink-3)]">
            {t('filtro.nenhuma')}
          </p>
        ) : (
          <div className="flex h-full gap-4">
            {colunas.map((c) => (
              <Coluna
                key={c.state}
                state={c.state}
                features={c.features}
                abertas={abertas}
                onToggle={alternarAberta}
                onAprovar={(id) => {
                  void alternarValidado(id).then(() => onMudou?.())
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
