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
import { RevalidarChip, StateMark, UnsavedChip, WorkingChip } from '@/components/StateMark'
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
 * Ninguém arrasta card, e isso é a decisão: num kanban comum a posição é
 * opinião de quem moveu, e o quadro mente assim que alguém esquece de mover.
 * Aqui a coluna é derivada de evidência, e o card anda sozinho quando o código
 * prova que andou.
 *
 * Cada card usa `layoutId` = id da feature, estável entre colunas, para a troca
 * de estado virar movimento em vez de um sumiço seguido de um aparecimento.
 *
 * Nenhuma coluna tem largura fixa: a grade preenche a faixa disponível.
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

/**
 * Teto de largura de coluna. Sem ele, esconder estados deixa 2 ou 3 colunas e
 * `1fr` estica cada uma até a linha de texto do card ficar larga demais.
 */
const COLUNA_MAX = 420
/** Piso: abaixo disso o card não comporta nome + frase. Aí a faixa rola. */
const COLUNA_MIN = 180

// ------------------------------------------------------------------ barras

/**
 * A barra do topo: um CENSO, não um termômetro.
 *
 * Cinco segmentos na ordem de `STATE_ORDER`, cada um na cor do seu estado e
 * com a largura da sua contagem — a versão de 8px do quadro logo abaixo.
 *
 * Nunca use degradê aqui: interpolar entre dois tokens inventa uma sexta cor
 * de estado que não existe em lugar nenhum do produto.
 *
 * `aria-hidden` porque a régua-legenda logo abaixo já anuncia exatamente as
 * mesmas contagens, e ela é focável — repetir seria ler o mesmo censo duas
 * vezes seguidas.
 */
function BarraEstados({
  contagem,
  total,
}: {
  contagem: { state: FeatureState; n: number }[]
  total: number
}) {
  const t = useT()
  return (
    <div
      aria-hidden
      className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-paper-3)]"
    >
      {total > 0 &&
        contagem.map(({ state, n }) =>
          n === 0 ? null : (
            <div
              key={state}
              /* O segmento cresce/encolhe junto com o card que trocou de
                 coluna — mesma duração da animação do quadro. */
              className="h-full transition-[flex-basis] duration-700 ease-out"
              style={{
                flexGrow: 0,
                flexBasis: `${(n / total) * 100}%`,
                /* 3px: uma parte só, num projeto de 200, ainda precisa deixar
                   marca. Sem isto o segmento arredonda para zero e some. */
                minWidth: 3,
                background: STATE[state].color,
              }}
              title={`${n} · ${t(`estado.${state}`)}`}
            />
          ),
        )}
    </div>
  )
}

// ------------------------------------------------------------------ filtros

/**
 * Dois eixos de filtro, deliberadamente diferentes:
 *
 * - ESTADOS funcionam por EXCLUSÃO. Todos começam ligados; clicar desliga
 *   aquele estado. Num kanban, esconder um estado é esconder a COLUNA inteira
 *   — então a coluna some, e a contagem de escondidas diz quantas partes foram
 *   embora com ela.
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
  /* Um alerta é um alerta: `--color-warn` virou apelido de `--color-danger` no
     sistema novo (os dois níveis estavam a ΔE 1,1 do terracota de aprovação, ou
     seja, "perigo" e "você aprovou" eram a mesma cor). O que separa aviso de
     crítico aqui é o texto do aria-label, não um segundo vermelho. */
  const corAtencao = 'var(--color-danger)'
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
      /* p-card (16px) e não p-2 (8px): o respiro interno do cartão é um degrau
         do sistema, e é ele que separa o card do card vizinho (gap 8px) — o
         espaço DENTRO precisa ser maior que o espaço ENTRE, senão a lista não
         agrupa. */
      className="card cursor-pointer p-card hover:bg-[color-mix(in_oklab,var(--color-ink-3)_6%,transparent)]"
      style={{
        borderLeft: atencao
          ? `2px solid ${corAtencao}`
          : '2px solid transparent',
        /* 14% e não 7%: a 7% o color-mix rendia 3 pontos de RGB de diferença
           contra o fundo do cartão — um tint que ninguém enxerga não é sinal,
           é enfeite. 14% é o primeiro valor em que a mancha aparece nos dois
           temas sem competir com o filete da borda. */
        background: atencao
          ? `color-mix(in oklab, ${corAtencao} 14%, transparent)`
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
        <div className="flex items-start gap-item">
          {/* text-title (19px/500) e não 12,5px/400: este nome é O conteúdo da
              tela. Antes o texto mais forte da página era o nome do projeto na
              lateral (21px), e o cabeçalho da coluna estava a 0,5px do nome da
              parte — mesma cor, mesmo peso. Agora a distância entre coluna
              (11px caixa alta) e card (19px) é impossível de confundir. */}
          <h3 className="text-title min-w-0 flex-1 text-[var(--color-ink)]">
            {feature.name}
          </h3>
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
              /* O botão deixou de ser o glifo "✓✓": desde o sistema novo, ✓✓
                 não é mais a marca de "você aprovou" (ela virou geometria) —
                 manter o glifo aqui seria ensinar um alfabeto que não existe
                 mais. O botão mostra a MARCA do estado que ele produz. */
              className="no-drag flex shrink-0 items-center justify-center rounded-full border p-1 transition hover:border-[var(--color-validated)]"
              style={{
                borderColor: validada
                  ? 'var(--color-validated)'
                  : 'var(--color-rule)',
              }}
            >
              <span
                className={
                  validada
                    ? ''
                    : 'opacity-45 transition group-hover:opacity-100'
                }
              >
                <StateMark state="validated" size={14} decorativa />
              </span>
            </button>
          )}
        </div>

        {/* A frase que explica a parte para quem não programa. Ela já existia
            em `feature.summary` e só aparecia depois de um clique — ou seja, a
            informação mais humana do quadro estava escondida atrás de uma
            interação. Fechado, ela cabe em duas linhas; aberto, vai inteira. */}
        {feature.summary && (
          <p
            className={[
              'text-lead mt-hair text-[var(--color-ink-2)]',
              aberta ? '' : 'line-clamp-2',
            ].join(' ')}
          >
            {feature.summary}
          </p>
        )}

        {/* Marcas: eixos que não são o estado, e por isso não mudam de coluna. */}
        {(feature.origin === 'discovered' ||
          feature.unsaved ||
          feature.working ||
          feature.revalidar ||
          atencao) && (
          <div className="mt-item flex flex-wrap items-center gap-hair">
            {feature.origin === 'discovered' && (
              <span
                className="text-meta inline-flex items-center gap-hair text-[var(--color-ink-3)]"
                title={t('marca.foraDoPlanoDica')}
              >
                <Sparkles size={12} strokeWidth={1.75} aria-hidden />
                {t('marca.foraDoPlanoCurto')}
              </span>
            )}
            {feature.unsaved && <UnsavedChip quantos={feature.unsavedCount} />}
            {feature.working && <WorkingChip desde={feature.workingSince} />}
            {feature.revalidar && <RevalidarChip desde={feature.validadoEm} />}
            {atencao && (
              <AlertTriangle
                size={13}
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

        {/* Rodapé do card: área e data. text-meta (13px) — eram 10,5px, e
            havia 38 usos desse tamanho no app carregando informação real para
            quem não lê código. Abaixo de 11px a pessoa não lê, adivinha. */}
        <div className="text-meta mt-item flex items-center gap-item text-[var(--color-ink-3)]">
          <span className="min-w-0 flex-1 truncate" title={feature.area}>
            {feature.area}
          </span>
          <span className="shrink-0 whitespace-nowrap">
            {diaRelativo(feature.lastTouchedAt)}
          </span>
        </div>

        {/* Expandido: o que é técnico continua um clique abaixo. */}
        {aberta && (
          <div className="animate-in-up mt-card">
            <p className="text-meta text-[var(--color-ink-3)]">
              <span
                className="inline-flex items-center gap-hair"
                style={{ color: meta.color }}
              >
                <StateMark state={feature.state} size="sm" decorativa />
                {t(`estado.${feature.state}`)}
              </span>
              {' — '}
              {t(`estado.${feature.state}.sentido`)}
            </p>

            {feature.working && feature.workingClaim && (
              <p
                className="text-meta mt-item"
                style={{ color: 'var(--color-building)' }}
                title={t('marca.mexendoDica')}
              >
                {t('marca.mexendoClaim', { claim: feature.workingClaim })}
              </p>
            )}

            <div className="text-meta mt-item flex flex-wrap items-center gap-x-card gap-y-hair text-[var(--color-ink-3)]">
              <span
                className="flex items-center gap-hair"
                title={t('geral.arquivosDica')}
              >
                <Files size={13} aria-hidden />
                {feature.files.length === 1
                  ? t('geral.arquivo')
                  : t('geral.arquivos', { n: feature.files.length })}
              </span>
              {feature.unsaved && (
                <span
                  className="flex items-center gap-hair"
                  style={{ color: 'var(--color-danger)' }}
                  title={t('marca.naoSalvoDica')}
                >
                  <CloudOff size={13} aria-hidden />
                  {(feature.unsavedCount ?? 1) === 1
                    ? t('marca.naoSalvo')
                    : t('marca.naoSalvos', { n: feature.unsavedCount ?? 1 })}
                </span>
              )}
            </div>

            {feature.files.length > 0 && (
              <div className="mt-item flex items-start gap-hair">
                <FileText
                  size={13}
                  aria-hidden
                  className="mt-[2px] shrink-0 text-[var(--color-ink-3)]"
                />
                {/* `planRef` não existe no tipo Feature — o que existe são os
                    arquivos que o WTF associou a esta parte. */}
                <span className="text-meta font-mono break-all text-[var(--color-ink-3)]">
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
    /* Sem `w-[250px] shrink-0`: a largura vem da grade do quadro. Cinco
       colunas fixas de 250px numa faixa de ~1250px deixavam sobra morta à
       direita e espremiam o card em 234px de conteúdo. */
    <section className="flex h-full min-w-0 flex-col">
      <div
        className="flex shrink-0 items-center gap-hair pt-item pb-item"
        /* O filete do cabeçalho é a cor do estado, e é o MESMO segmento da
           barra lá em cima: quem olha a barra reconhece a coluna sem ler.
           Antes era a régua neutra `rule-double` — e era ela, não a
           tipografia, que separava cabeçalho de card. */
        style={{ borderTop: `2px solid ${meta.color}` }}
        title={t('estado.comSentido', {
          estado: t(`estado.${state}`),
          sentido: t(`estado.${state}.sentido`),
        })}
      >
        <StateMark state={state} size="lg" decorativa />
        {/* `.label` (11px, caixa alta, peso 600): rótulo de coluna é moldura,
            não conteúdo. Antes era 13px serifado — 0,5px de diferença do nome
            da parte, mesmo peso e mesma cor. */}
        <h2 className="label min-w-0 flex-1 truncate text-[var(--color-ink-2)]">
          {t(`estado.${state}`)}
        </h2>
        <span className="text-meta shrink-0 tabular-nums text-[var(--color-ink-3)]">
          {features.length}
        </span>
      </div>

      {/* Cada coluna rola sozinha: uma coluna cheia não empurra as outras.
          gap-item (8px) entre cards, metade do respiro interno deles (16px) e
          metade do vão entre colunas (16px) — a hierarquia de espaço é o que
          faz a coluna ser lida como um grupo. */}
      <ul className="flex min-h-0 flex-1 flex-col gap-item overflow-y-auto pt-card pb-group">
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

        {/* Coluna vazia continua aparecendo: "nada testado" é uma informação.
            Sem `opacity-70`: ink-3 já é o degrau mais quieto a 4,60:1, e a
            opacidade derrubava essa frase para ~3,4:1. */}
        {features.length === 0 && (
          <li className="text-meta text-[var(--color-ink-3)]">
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
        {/* Uma manchete só, e sozinha na linha. Antes o título (26px, peso
            400 — mais leve que o nome do projeto na lateral) dividia a linha
            com "42%" em 22px da mesma serifa: duas coisas grandes disputando o
            mesmo lugar, e um contador nunca ganha de um título. Agora o título
            é o único `text-display` da tela e a porcentagem desceu para
            metadado, encostada na barra que ela resume. */}
        <h1 className="font-display text-display text-[var(--color-ink)]">
          {t('progresso.titulo')}
        </h1>

        <div className="mt-card flex items-center gap-item">
          <BarraEstados contagem={contagem} total={features.length} />
          <span
            className="text-meta shrink-0 tabular-nums text-[var(--color-ink-2)]"
            title={t('progresso.geralDica')}
          >
            {pct(geral)}%
          </span>
        </div>

        {/* --------------------------------------- legenda que vira filtro
            Fica colada na barra de propósito: são os mesmos cinco números, na
            mesma ordem e nas mesmas cores. A barra mostra a proporção, a
            legenda dá o número e liga/desliga a coluna. */}
        <div className="rule-double mt-card flex flex-wrap items-center gap-x-card gap-y-hair pt-item">
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
                  'text-meta flex items-center gap-hair rounded-full px-1.5 py-[2px] transition hover:bg-[color-mix(in_oklab,var(--color-ink-3)_12%,transparent)]',
                  oculto ? 'opacity-40 line-through' : '',
                ].join(' ')}
              >
                <StateMark state={state} size="sm" decorativa />
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
              'text-meta flex items-center gap-hair rounded-full border px-1.5 py-[2px] transition',
              soForaDoPlano
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-ink-3)] hover:border-[var(--color-rule)]',
            ].join(' ')}
          >
            <Sparkles size={13} strokeWidth={1.75} aria-hidden />
            {t('filtro.soForaDoPlano')}
          </button>
          <button
            type="button"
            onClick={() => setSoNaoSalvo((v) => !v)}
            aria-pressed={soNaoSalvo}
            title={t('filtro.soNaoSalvoDica')}
            className={[
              'text-meta flex items-center gap-hair rounded-full border px-1.5 py-[2px] transition',
              soNaoSalvo
                ? 'border-current'
                : 'border-transparent hover:border-[var(--color-rule)]',
            ].join(' ')}
            style={{
              color: soNaoSalvo ? 'var(--color-danger)' : 'var(--color-ink-3)',
            }}
          >
            <CloudOff size={13} aria-hidden />
            {t('filtro.soNaoSalvo')}
          </button>
        </div>

        {/* Números do projeto. Descem para depois da legenda porque a legenda
            é que responde a pergunta da tela ("quanto está em cada estado");
            estes são o contexto dela. */}
        <ul className="text-meta mt-item flex flex-wrap items-center gap-x-card gap-y-hair text-[var(--color-ink-3)]">
          <li
            className="flex items-center gap-hair"
            title={t('progresso.partes', { n: features.length })}
            aria-label={t('progresso.partes', { n: features.length })}
          >
            <LayoutList size={13} strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums text-[var(--color-ink-2)]">
              {features.length}
            </span>
            {t('progresso.palavraPartes')}
          </li>
          <li
            className="flex items-center gap-hair"
            title={t('progresso.areas', { n: areasTotais })}
            aria-label={t('progresso.areas', { n: areasTotais })}
          >
            <FolderTree size={13} strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums text-[var(--color-ink-2)]">
              {areasTotais}
            </span>
            {t('progresso.palavraAreas')}
          </li>
          {naoSalvas > 0 && (
            <li
              className="flex items-center gap-hair"
              style={{ color: 'var(--color-danger)' }}
              title={t('progresso.comNaoSalvo', { n: naoSalvas })}
              aria-label={t('progresso.comNaoSalvo', { n: naoSalvas })}
            >
              <CloudOff size={13} strokeWidth={1.75} aria-hidden />
              <span className="tabular-nums">{naoSalvas}</span>
              {t('progresso.palavraNaoSalvo')}
            </li>
          )}
          <li title={t('progresso.semArrastarDica')}>
            {t('progresso.semArrastar')}
          </li>
        </ul>

        {filtrando && (
          <p className="text-meta mt-item flex flex-wrap items-center gap-item text-[var(--color-ink-3)]">
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
              className="flex items-center gap-hair rounded-full border border-[var(--color-rule)] px-1.5 py-[1px] text-[var(--color-ink-2)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              title={t('progresso.limparFiltros')}
              aria-label={t('progresso.limparFiltros')}
            >
              <RotateCcw size={12} aria-hidden />
              {t('filtro.limpar')}
            </button>
          </p>
        )}
      </header>

      {/* ---------------------------------------------------------- quadro
          mt-group (32px): o quadro é outro grupo, e o degrau entre grupos é o
          dobro do maior espaço que existe dentro deles (16px). */}
      <div className="mt-group min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6">
        {colunas.length === 0 ? (
          <p className="text-lead text-[var(--color-ink-3)]">
            {t('filtro.nenhuma')}
          </p>
        ) : (
          /* Grade que preenche a largura, em vez de cinco colunas de 250px
             fixos. Na captura medida, a faixa do quadro tem ~1430px: cinco
             colunas de 250 + quatro vãos de 16 davam 1314 e deixavam 116px
             de faixa morta à direita. Com `1fr` cada coluna vira ~273px e a
             sobra é zero, em qualquer largura de janela. O `maxWidth` é o teto
             de leitura — quando a pessoa esconde estados e sobram 2 colunas, a
             grade para de esticar em vez de virar duas faixas de 700px. */
          <div
            className="grid h-full gap-card"
            style={{
              gridTemplateColumns: `repeat(${colunas.length}, minmax(${COLUNA_MIN}px, 1fr))`,
              maxWidth: colunas.length * COLUNA_MAX + (colunas.length - 1) * 16,
            }}
          >
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
