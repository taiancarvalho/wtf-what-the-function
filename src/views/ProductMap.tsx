import { useMemo, useState } from 'react'
import { ApagarGerado } from '@/components/ApagarGerado'
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
import { STATE_ORDER } from '@/lib/state'
import {
  RevalidarChip,
  StateChip,
  StateMark,
  UnsavedChip,
} from '@/components/StateMark'
import { diaRelativo, horaDe } from '@/lib/format'
import { LOCALE, useIdioma, useT } from '@/lib/i18n'
import type { Feature, FeatureState, ProjectSnapshot } from '@/types/protocol'

/**
 * Mapa — "do que o meu software é feito".
 *
 * As partes do produto agrupadas por área, com o estado de cada uma. É o
 * VOCABULÁRIO do projeto: os nomes que o dono usa para falar do próprio
 * software. Por isso o nome da parte é o conteúdo mais forte da tela.
 *
 * Duas regras que a tela não pode quebrar:
 *
 * - A quebra do trilho é por `@container`, nunca por viewport: a lateral pode
 *   estar fechada e o terminal docado à direita, e quem decide se cabem duas
 *   colunas é a largura que sobra aqui.
 * - Seleção é interação, e usa `--color-accent` sobre `--color-accent-soft` —
 *   nunca a cor do estado da parte, senão "aprovado" e "selecionado" saem com
 *   a mesma tinta.
 */

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

/**
 * Tamanho dos ícones-marca da tela.
 *
 * Não é um degrau de tipografia, mas seguia a mesma doença: seis marcas a 10px
 * e oito a 11px, todas do lado de texto que agora tem 13 ou 15px. 13px é o
 * tamanho que o Progresso já usa para a mesma família de marcas — mesma tela,
 * mesmo alfabeto.
 */
const MARCA = 13

// ------------------------------------------------------------------ filtros

/**
 * Mesma semântica do Progresso (BuildMap), de propósito — as duas telas leem
 * o mesmo projeto e precisam responder ao mesmo gesto.
 *
 * - ESTADOS filtram por EXCLUSÃO: começam ligados, clicar esconde.
 * - QUALIFICADORES (fora do plano, não salvo) filtram por INCLUSÃO: clicar
 *   mostra SOMENTE as partes com aquela marca. Por isso ganham anel em vez de
 *   tachado, e vêm num grupo separado.
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
  const t = useT()
  const idioma = useIdioma()
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
    return (id: string) => m.get(id) ?? t('mapa.parteDesconhecida')
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {/* Mesma moldura da Início: 1200 de teto, 40 de respiro lateral, e o
          `@container` que decide a quebra pela largura que sobra. */}
      <div className="@container mx-auto max-w-[1200px] px-10 pt-7 pb-group">
        {/* ---------------------------------------------------- cabeçalho */}
        <header className="animate-in-up">
          <div className="flex flex-wrap items-center gap-item">
            {/* O único `text-display` da tela. Era 26px/400 numa serifa que
                pesa 600 na lateral do app — o título da tela perdia para a
                navegação. Agora é o degrau de manchete, e sozinho. */}
            <h1 className="font-display text-display text-[var(--color-ink)]">
              {t('mapa.tituloProjeto', { projeto: snapshot.project.name })}
            </h1>
            <ApagarGerado chave="mapa" arquivo=".wtf/map.json" onApagou={() => {}} />
          </div>
          <p className="text-meta mt-hair text-[var(--color-ink-3)]">
            {t('progresso.partes', { n: snapshot.features.length })} ·{' '}
            {t('progresso.areas', { n: areasTotais })} ·{' '}
            {tocadasHoje === 1
              ? t('mapa.mexidaHoje')
              : t('mapa.mexidasHoje', { n: tocadasHoje })}
          </p>
        </header>

        {/*
          960px é onde a conta fecha, medida por dentro (o `@container` já
          desconta o respiro lateral): 528 de leitura + 32 entre as colunas +
          400 de trilho — os mesmos números da Início, porque as duas telas
          precisam parecer o mesmo produto. Abaixo disso o trilho desce para o
          fim e vira uma faixa só.
        */}
        <div className="mt-group grid grid-cols-1 items-start gap-group @min-[960px]:grid-cols-[minmax(0,1fr)_400px]">
          {/* ─── leitura: os distritos, que são o vocabulário do projeto ─── */}
          <div className="@container min-w-0">
            {/* A grade quebra pela largura da COLUNA, não da janela: com o
                trilho aberto sobram ~688px aqui e cabem duas colunas de 328;
                sem o trilho (janela estreita) a mesma regra dá uma coluna só.
                Antes era `sm:`/`xl:`, que mede o monitor e ignora o terminal
                docado à direita.
                gap-card (16) entre distritos e p-card (16) dentro deles: quem
                agrupa é a borda do cartão. O degrau de 32 fica para a distância
                até o cabeçalho e até o trilho. */}
            <div className="grid gap-card @min-[560px]:grid-cols-2 @min-[900px]:grid-cols-3">
              {distritos.map((d, i) => (
                <section
                  key={d.area}
                  className="card animate-in-up p-card"
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  {/* O nome da área virou rótulo. Era `font-display` 13px, ou
                      seja, MAIOR e mais decorado que o nome da parte (12px) —
                      a moldura pesando mais que o conteúdo. */}
                  <div className="flex items-baseline justify-between gap-item">
                    <h2 className="label min-w-0 truncate text-[var(--color-ink-2)]">
                      {d.area}
                    </h2>
                    <span className="text-meta shrink-0 font-mono tabular-nums text-[var(--color-ink-3)]">
                      {d.features.length}
                    </span>
                  </div>

                  {/* 8px entre irmãos da mesma lista, metade do respiro do
                      cartão (16) — é essa diferença que faz a lista ser lida
                      como um bloco só. */}
                  <ul className="mt-item flex flex-col gap-item">
                    {d.features.map((f) => {
                      const selecionada = f.id === abertoId
                      return (
                        <li key={f.id}>
                          <button
                            onClick={() => setAbertoId(selecionada ? null : f.id)}
                            title={f.name}
                            aria-pressed={selecionada}
                            className={[
                              f.working ? 'pulse-live' : '',
                              'flex w-full items-center gap-hair rounded-card px-item py-hair text-left transition-colors duration-150',
                              selecionada
                                ? ''
                                : 'hover:bg-[color-mix(in_oklab,var(--color-ink-3)_10%,transparent)]',
                            ].join(' ')}
                            style={{
                              /* Saíram daqui duas pinturas de estado que
                                 sobravam: o fundo tingido a 12% e o filete de
                                 3px à esquerda, ambos na cor do estado. A marca
                                 de estado ao lado JÁ é a cor e a forma — com as
                                 três coisas juntas, cinco tinturas empilhadas
                                 viravam remendo e ainda brigavam com a marca de
                                 alerta, que também tinge fundo. Quem diz o
                                 estado é a geometria; o fundo fica livre para
                                 dizer a única coisa que sobrou: qual linha está
                                 aberta. */
                              /* Seleção é interação, não estado: accent-soft é
                                 o token de realce de fundo. Antes o anel era
                                 pintado com a cor do estado, o que fazia
                                 terracota significar "você aprovou" e
                                 "selecionado" na mesma tela. */
                              background: selecionada
                                ? 'var(--color-accent-soft)'
                                : undefined,
                              boxShadow: selecionada
                                ? `0 0 0 1px ${fundo('var(--color-accent)', 35)}`
                                : undefined,
                            }}
                          >
                            <StateMark state={f.state} size="sm" decorativa />
                            {/* O nome da parte é O conteúdo desta tela: é a
                                palavra que o dono usa para falar do próprio
                                software. Subiu de 12px para o degrau de
                                leitura. */}
                            <span className="text-lead min-w-0 flex-1 truncate text-[var(--color-ink)]">
                              {f.name}
                            </span>
                            {f.origin === 'discovered' && (
                              <Sparkles
                                size={MARCA}
                                strokeWidth={1.75}
                                className="shrink-0 text-[var(--color-ink-3)]"
                                aria-label={t('marca.foraDoPlano')}
                              />
                            )}
                            {mexidoHoje(f) && (
                              /* Tinta neutra, não accent: accent agora é a cor
                                 da interação (linha ativa, botão, seleção). Um
                                 relógio pintado de accent seria a marca mais
                                 forte da linha sem ser a mais importante. */
                              <Clock3
                                size={MARCA}
                                className="shrink-0 text-[var(--color-ink-2)]"
                                aria-label={t('mapa.mexidoHoje')}
                              />
                            )}
                            {f.unsaved && (
                              <CloudOff
                                size={MARCA}
                                className="shrink-0 text-[var(--color-danger)]"
                                aria-label={t('marca.naoSalvo')}
                              />
                            )}
                            {f.revalidar && (
                              <span
                                className="shrink-0 text-[var(--color-danger)]"
                                aria-label={t('marca.revalidar')}
                                title={
                                  f.validadoEm
                                    ? t('marca.revalidarDesde', {
                                        quando: new Date(
                                          f.validadoEm,
                                        ).toLocaleString(LOCALE[idioma]),
                                      })
                                    : t('marca.revalidarSemData')
                                }
                              >
                                <History size={MARCA} aria-hidden />
                              </span>
                            )}
                            {alerta(f) && (
                              /* Um alerta é um alerta: warn e danger estavam a
                                 ΔE 16 um do outro e ninguém lê dois níveis a
                                 essa distância. O que separa crítico de aviso
                                 aqui é o texto lido em voz alta, não um segundo
                                 vermelho — mesma decisão do Progresso. */
                              <AlertTriangle
                                size={MARCA}
                                strokeWidth={2}
                                className="shrink-0 text-[var(--color-danger)]"
                                aria-label={
                                  f.attention === 'critical'
                                    ? t('marca.atencaoCritica')
                                    : t('marca.atencaoAviso')
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
            </div>

            {distritos.length === 0 && (
              <p className="text-lead text-[var(--color-ink-3)]">
                {t('filtro.nenhuma')}
              </p>
            )}
          </div>

          {/* ─── trilho: o censo do projeto e a parte aberta ───
              Grudado no topo enquanto a grade rola: os distritos podem passar
              de três fileiras, e sem isto clicar numa parte lá embaixo abriria
              o detalhe fora da vista. O teto de altura é a altura exata da
              área de rolagem (a janela menos os 46px da barra do topo), para
              que um painel comprido — `Ver a parte técnica` aberto com dezenas
              de arquivos — role dentro do trilho em vez de ter o fim cortado.
              Só a partir de 960px: abaixo disso o trilho desce e é a página
              inteira que rola. */}
          <aside className="min-w-0 space-y-group @min-[960px]:sticky @min-[960px]:top-0 @min-[960px]:max-h-[calc(100vh-46px)] @min-[960px]:overflow-y-auto">
            {/*
              O censo dos cinco estados, que é também o filtro.

              POR QUÊ saiu da faixa horizontal: em fila, os cinco contadores
              quebravam em duas linhas irregulares e os números caíam em
              colunas diferentes — ninguém compara "4" com "2" se eles não
              estão alinhados. Em pé, viram a mesma tabela de estado que a
              Início mostra no trilho dela, com os números na mesma calha.
            */}
            <section className="animate-in-up card p-card">
              <ul className="space-y-item">
                {contagem.map(({ state, n }) => {
                  const oculto = estadosOcultos.has(state)
                  return (
                    <li key={state}>
                      <button
                        type="button"
                        onClick={() => alternarEstado(state)}
                        aria-pressed={!oculto}
                        title={
                          oculto
                            ? t('filtro.mostrarDeNovo', {
                                estado: t(`estado.${state}`),
                              })
                            : t('filtro.esconder', {
                                estado: t(`estado.${state}`).toLowerCase(),
                                sentido: t(`estado.${state}.sentido`),
                              })
                        }
                        className={[
                          'text-meta flex w-full items-center gap-item rounded-card px-hair py-[2px] text-left transition hover:bg-[color-mix(in_oklab,var(--color-ink-3)_10%,transparent)]',
                          oculto ? 'opacity-40 line-through' : '',
                        ].join(' ')}
                      >
                        <StateMark state={state} size="sm" decorativa />
                        <span className="min-w-0 flex-1 truncate text-[var(--color-ink-2)]">
                          {t(`estado.${state}`)}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-[var(--color-ink)]">
                          {n}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {/* Qualificadores: filtro por inclusão, e por isso outro grupo.
                  16px do censo, 8px entre eles — o dobro por fora do que há
                  por dentro. A régua vertical que os separava antes virou
                  desnecessária. */}
              <div className="mt-card flex flex-wrap items-center gap-item">
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
                  <Sparkles size={MARCA} strokeWidth={1.75} aria-hidden />
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
                    color: soNaoSalvo
                      ? 'var(--color-danger)'
                      : 'var(--color-ink-3)',
                  }}
                >
                  <CloudOff size={MARCA} aria-hidden />
                  {t('filtro.soNaoSalvo')}
                </button>
              </div>

              {/* As duas marcas que os distritos usam e que não são filtro —
                  aqui só para leitura, como sempre foram. */}
              <div className="text-meta mt-card flex flex-wrap items-center gap-x-card gap-y-item text-[var(--color-ink-3)]">
                <span
                  className="flex items-center gap-hair"
                  title={t('feed.precisaAtencao')}
                >
                  <AlertTriangle
                    size={MARCA}
                    strokeWidth={2}
                    aria-hidden
                    className="text-[var(--color-danger)]"
                  />
                  {t('mapa.atencao')}
                </span>
                <span
                  className="flex items-center gap-hair"
                  title={t('mapa.hojeDica')}
                >
                  <Clock3
                    size={MARCA}
                    aria-hidden
                    className="text-[var(--color-ink-2)]"
                  />
                  {t('mapa.hoje')}
                </span>
              </div>

              {filtrando && (
                <p className="text-meta mt-card flex flex-wrap items-center gap-item text-[var(--color-ink-3)]">
                  <span>
                    {escondidas === 0
                      ? t('filtro.nadaEscondido')
                      : escondidas === 1
                        ? t('filtro.escondida')
                        : t('filtro.escondidas', { n: escondidas })}{' '}
                    {t('mapa.notaNumeros')}
                  </span>
                  <button
                    type="button"
                    onClick={limpar}
                    className="flex items-center gap-hair rounded-full border border-[var(--color-rule)] px-1.5 py-[1px] text-[var(--color-ink-2)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    title={t('progresso.limparFiltros')}
                    aria-label={t('progresso.limparFiltros')}
                  >
                    <RotateCcw size={MARCA} aria-hidden />
                    {t('filtro.limpar')}
                  </button>
                </p>
              )}
            </section>

            {/* --------------------------------------------------- detalhe
                O painel deixou de ser uma terceira coluna que só existia em
                `lg:` e quando havia parte aberta — ele mora no trilho, abaixo
                do censo, como o detalhe do Acontecendo. Numa janela estreita
                desce junto com o trilho em vez de simplesmente sumir: antes,
                abaixo de 1024px, clicar numa parte não mostrava nada. */}
            <AnimatePresence>
              {aberta && (
                <motion.section
                  key={aberta.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="card p-card"
                >
                  <div className="flex items-start justify-between gap-item">
                    <div className="min-w-0">
                      {/* Era 10px com espacejamento à mão; `.label` é
                          exatamente isso, 11px, no piso de leitura. */}
                      <p className="label text-[var(--color-ink-3)]">
                        {aberta.area}
                      </p>
                      <h3 className="font-display text-title mt-hair text-[var(--color-ink)]">
                        {aberta.name}
                      </h3>
                    </div>
                    <button
                      onClick={() => setAbertoId(null)}
                      aria-label={t('geral.fechar')}
                      className="no-drag shrink-0 rounded-full p-hair text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* A frase que explica a parte para quem não programa: é o
                      texto que mais importa deste painel, e estava a 13px,
                      abaixo do nome da área. Vai para o degrau de leitura. */}
                  <p className="text-lead mt-item text-[var(--color-ink-2)]">
                    {aberta.summary}
                  </p>

                  <div className="mt-card flex flex-wrap items-center gap-item">
                    {/* O selo do estado agora é o componente compartilhado:
                        antes esta tela redesenhava a pílula à mão, com outra
                        conta de cor, e ficava um degrau fora dos selos vizinhos
                        (não salvo, revalidar). */}
                    <StateChip state={aberta.state} />
                    {aberta.unsaved && (
                      <UnsavedChip quantos={aberta.unsavedCount} />
                    )}
                    {aberta.revalidar && (
                      <RevalidarChip desde={aberta.validadoEm} />
                    )}
                    {alerta(aberta) && (
                      <span
                        className="text-micro inline-flex items-center gap-hair rounded-full px-2 py-[3px]"
                        style={{
                          color: 'var(--color-danger)',
                          background: fundo('var(--color-danger)', 13),
                        }}
                        title={
                          aberta.attention === 'critical'
                            ? t('marca.atencaoCritica')
                            : t('marca.atencaoAviso')
                        }
                      >
                        <AlertTriangle size={11} strokeWidth={2} aria-hidden />
                        {t('mapa.atencao')}
                      </span>
                    )}
                  </div>

                  {/* O que o estado significa de verdade — mesmo texto do
                      Progresso. Era 11,5px: uma frase inteira, para quem não lê
                      código, num tamanho abaixo do que o app admite. */}
                  <p className="text-meta mt-item text-[var(--color-ink-3)]">
                    {t(`estado.${aberta.state}.sentido`)}
                  </p>

                  {aberta.working && aberta.workingClaim && (
                    <p
                      className="text-meta mt-item"
                      style={{ color: 'var(--color-building)' }}
                      title={t('marca.mexendoDica')}
                    >
                      {t('marca.mexendoClaim', { claim: aberta.workingClaim })}
                    </p>
                  )}

                  <div className="text-meta mt-card flex flex-wrap items-center gap-x-card gap-y-hair text-[var(--color-ink-3)]">
                    <span
                      className="flex items-center gap-hair"
                      title={t('geral.arquivosDica')}
                    >
                      <Files size={MARCA} aria-hidden />
                      {aberta.files.length === 1
                        ? t('geral.arquivo')
                        : t('geral.arquivos', { n: aberta.files.length })}
                    </span>
                    {aberta.unsaved && (
                      <span
                        className="flex items-center gap-hair"
                        style={{ color: 'var(--color-danger)' }}
                        title={t('marca.naoSalvoDica')}
                      >
                        <CloudOff size={MARCA} aria-hidden />
                        {(aberta.unsavedCount ?? 1) === 1
                          ? t('marca.naoSalvo')
                          : t('marca.naoSalvos', { n: aberta.unsavedCount ?? 1 })}
                      </span>
                    )}
                    {aberta.origin === 'discovered' && (
                      <span
                        className="flex items-center gap-hair"
                        title={t('marca.foraDoPlanoDica')}
                      >
                        <Sparkles size={MARCA} strokeWidth={1.75} aria-hidden />
                        {t('marca.foraDoPlanoCurto')}
                      </span>
                    )}
                    <span>
                      {t('mapa.mexidoEm', {
                        dia: diaRelativo(aberta.lastTouchedAt),
                        hora: horaDe(aberta.lastTouchedAt),
                      })}
                    </span>
                  </div>

                  {/* "Ligado a" é outro grupo: 32px o separa do bloco de
                      metadados. Com esse degrau a régua dupla que fazia o
                      corte deixou de ser necessária. */}
                  <div className="mt-group">
                    <p className="label text-[var(--color-ink-3)]">
                      {t('mapa.ligadoA')}
                    </p>
                    {aberta.relatedIds.length === 0 ? (
                      <p className="text-meta mt-item text-[var(--color-ink-3)]">
                        {t('mapa.nada')}
                      </p>
                    ) : (
                      <ul className="mt-item space-y-item">
                        {aberta.relatedIds.map((id) => (
                          <li key={id}>
                            <button
                              onClick={() => setAbertoId(id)}
                              className="text-meta flex items-center gap-hair text-left text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-accent)]"
                            >
                              <ArrowUpRight
                                size={MARCA}
                                aria-hidden
                                className="shrink-0"
                              />
                              {nomeDe(id)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* O técnico continua um clique abaixo. */}
                  <details className="mt-group">
                    <summary className="text-meta cursor-default list-none text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink-2)]">
                      {t('feed.verTecnico')}
                    </summary>
                    {aberta.files.length === 0 ? (
                      <p className="text-meta mt-item text-[var(--color-ink-3)]">
                        {t('mapa.semArquivos')}
                      </p>
                    ) : (
                      <ul className="mt-item space-y-hair">
                        {aberta.files.map((arq) => (
                          <li
                            key={arq}
                            className="text-meta font-mono break-all text-[var(--color-ink-3)]"
                          >
                            {arq}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </motion.section>
              )}
            </AnimatePresence>
          </aside>
        </div>
      </div>
    </div>
  )
}
