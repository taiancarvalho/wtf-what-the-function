import { useMemo } from 'react'
import { StateMark } from '@/components/StateMark'
import { Loader2 } from 'lucide-react'
import { LOCALE, useIdioma, useT } from '@/lib/i18n'
import { STATE } from '@/lib/state'
import type { MarcoHistorico, ProjectSnapshot } from '@/types/protocol'

/**
 * Histórico — "como este projeto chegou até aqui?".
 *
 * As outras telas respondem sobre o AGORA: o que pede atenção, em que coluna
 * cada parte está. Nenhuma delas responde se o projeto está andando ou parado —
 * e essa é a pergunta que aparece quando alguém volta depois de uma semana.
 *
 * Três leituras da mesma coisa, da mais visual para a mais literal:
 *   1. o gráfico — a forma do crescimento, para quem lê forma
 *   2. o ritmo   — quanta mudança houve, com uma frase honesta em cima
 *   3. a régua   — os mesmos marcos em números, para quem não confia em gráfico
 *
 * O gráfico é desenhado à mão em SVG de propósito: uma biblioteca traria o
 * tema dela junto, e aqui a cor TEM que ser a mesma do resto do app — o verde
 * de "testado" é o mesmo verde em toda tela. Tudo em `var(--color-...)`, então
 * claro e escuro funcionam sem nenhuma media query.
 *
 * ─── o que mudou na superfície ────────────────────────────────────────────
 *
 * 1. TAMANHOS. Esta tela tinha 20 tamanhos escritos à mão (26, 15, 13,5, 13,
 *    12,5, 11,5 e 9px dentro do SVG). Nenhum sobreviveu: tudo caiu nos cinco
 *    degraus da escala. Os 9px do gráfico eram o pior caso — dentro de um
 *    viewBox de 720 que renderiza a ~688px, chegavam ao olho a 8,6px, e
 *    encolhiam mais ainda quando a janela estreitava. Eram justamente os
 *    rótulos que dão ESCALA ao desenho.
 *
 * 2. LARGURA. Era uma coluna centrada de 860px: numa janela de 1440 com a
 *    lateral aberta sobram ~1200, ou seja, ~340px de margem morta. Agora é o
 *    mesmo par leitura + trilho da Home: à esquerda o que se OLHA (o gráfico e
 *    o ritmo, dois desenhos que precisam de largura), à direita os 400px de
 *    trilho com a régua — a lista de marcos em números, que é índice, se
 *    confere linha a linha e é vertical por natureza.
 *
 * 3. RITMO. Blocos separados por 16px, o mesmo valor do respiro interno dos
 *    cartões — com os dois espaços iguais nada agrupava. Agora 8px dentro,
 *    32px entre grupos, e a régua perdeu as linhas divisórias que só existiam
 *    para compensar o espaço uniforme.
 *
 * 4. HIERARQUIA. Havia quatro títulos serifados de 15px (um por seção)
 *    competindo com um h1 de 26px, e cada um deles era MAIOR que o conteúdo
 *    que encabeçava (listas de 12,5px). Agora existe um `text-display` só — o
 *    da tela — e todo título de seção é rótulo de 11px em caixa alta.
 */

const historicoDe = (snapshot: ProjectSnapshot) => snapshot.historico

export const desdeUltimaVisitaDe = (snapshot: ProjectSnapshot) =>
  snapshot.desdeUltimaVisita

// ------------------------------------------------------------------ gráfico

/*
 * Geometria do desenho, em unidades do viewBox.
 *
 * POR QUÊ os rótulos saíram de dentro do SVG: eram `<text fontSize={9}>` — três
 * valores de eixo e até cinco datas — num viewBox de 720 renderizado a ~688px,
 * ou seja, 8,6px de verdade, para um público que não lê código. E o problema
 * não se resolve aumentando o número: qualquer texto dentro do viewBox encolhe
 * junto com ele, então o mesmo gráfico numa janela estreita cairia para 6px.
 *
 * Agora o SVG desenha só as formas, e os rótulos são HTML em `text-meta`
 * (13px), posicionados em PORCENTAGEM da caixa. Porcentagem não escala com o
 * viewBox: o desenho estica, o texto não.
 */
const LARG = 720
const ALT = 156
const TOPO = 8
const BASE = 148
/** Meia bolinha de folga nas pontas, para o ponto extremo não sair cortado. */
const INSET = 3
/** Coluna dos números do eixo, em px de TELA (não escala com o desenho). */
const CALHA = 36
const VAO = 4

interface Serie {
  chave: 'partes' | 'comCodigo' | 'testadas'
  cor: string
  valores: number[]
}

function caminho(valores: number[], x: (i: number) => number, y: (v: number) => number) {
  return valores.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
}

function Grafico({ marcos, rotulo }: { marcos: MarcoHistorico[]; rotulo: (iso: string) => string }) {
  const t = useT()

  const series: Serie[] = [
    { chave: 'partes', cor: STATE.planned.color, valores: marcos.map((m) => m.partes) },
    { chave: 'comCodigo', cor: STATE.implemented.color, valores: marcos.map((m) => m.comCodigo) },
    { chave: 'testadas', cor: STATE.tested.color, valores: marcos.map((m) => m.testadas) },
  ]

  // O teto nunca é o valor máximo exato: a linha encostando na borda parece
  // cortada, e o projeto parece ter parado de crescer quando não parou.
  const maior = Math.max(1, ...series.flatMap((s) => s.valores))
  const teto = Math.ceil(maior * 1.15) || 1

  const n = marcos.length
  const x = (i: number) => (n === 1 ? LARG / 2 : INSET + (i * (LARG - 2 * INSET)) / (n - 1))
  const y = (v: number) => BASE - (v / teto) * (BASE - TOPO)

  // Com 14 marcos, um ponto por marco vira ruído; com 3, sem ponto ninguém
  // enxerga que há dados. Então o ponto aparece só quando cabe.
  const pontos = n <= 8

  // Datas: extremos sempre; no meio, no máximo três, espaçadas por igual.
  const indices = new Set<number>([0, n - 1])
  if (n > 3) {
    const quantos = Math.min(3, n - 2)
    for (let k = 1; k <= quantos; k++) {
      indices.add(Math.round((k * (n - 1)) / (quantos + 1)))
    }
  }

  return (
    <div>
      {/*
        A legenda subiu para ANTES do desenho, e o número veio antes do nome.
        POR QUÊ: é a mesma forma da legenda de Progresso ("4 planejado"), e
        assim as três cores já estão explicadas quando o olho chega no gráfico
        — antes era preciso desenhar sentido para trás, olhando as linhas
        primeiro e a chave depois. Era também o último texto de 11,5px da tela.
      */}
      <ul className="mb-card flex flex-wrap items-center gap-x-card gap-y-hair">
        {series.map((s) => (
          <li key={s.chave} className="text-meta flex items-center gap-hair">
            <span aria-hidden className="h-[2px] w-4 rounded-full" style={{ background: s.cor }} />
            <span className="font-mono tabular-nums text-[var(--color-ink)]">
              {s.valores[s.valores.length - 1]}
            </span>
            <span className="text-[var(--color-ink-3)]">{t(`hist.serie.${s.chave}`)}</span>
          </li>
        ))}
      </ul>

      {/*
        Grade de duas colunas e duas linhas: a calha dos números do eixo (36px
        de tela, fixos) e o desenho; embaixo, a faixa das datas alinhada com o
        desenho. A célula da calha estica até a altura do SVG, e é por isso que
        o `top` em porcentagem dos números cai exatamente sobre cada régua.
      */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `${CALHA}px minmax(0,1fr)`, columnGap: VAO }}
      >
        <div className="relative">
          {[0, 0.5, 1].map((f) => {
            const valor = Math.round(teto * f)
            return (
              <span
                key={f}
                className="text-meta absolute right-0 tabular-nums text-[var(--color-ink-3)]"
                style={{ top: `${(y(valor) / ALT) * 100}%`, transform: 'translateY(-50%)' }}
              >
                {valor}
              </span>
            )
          })}
        </div>

        <svg
          viewBox={`0 0 ${LARG} ${ALT}`}
          className="h-auto w-full"
          role="img"
          aria-label={t('hist.evolucao')}
        >
          {/* três réguas discretas: sem grade, só o suficiente para dar escala */}
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={0}
              x2={LARG}
              y1={y(Math.round(teto * f))}
              y2={y(Math.round(teto * f))}
              stroke="var(--color-rule)"
              strokeWidth={1}
            />
          ))}

          {/* a área só existe sob "partes": ela é o tamanho do projeto, o fundo
              contra o qual as outras duas linhas são lidas */}
          <path
            d={`${caminho(series[0].valores, x, y)} L${x(n - 1)},${BASE} L${x(0)},${BASE} Z`}
            fill={`color-mix(in oklab, ${series[0].cor} 14%, transparent)`}
            stroke="none"
          />

          {series.map((s) => (
            <g key={s.chave}>
              <path
                d={caminho(s.valores, x, y)}
                fill="none"
                stroke={s.cor}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {(pontos || n === 1) &&
                s.valores.map((v, i) => (
                  <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={s.cor}>
                    <title>{`${t(`hist.serie.${s.chave}`)}: ${v} · ${rotulo(marcos[i].em)}`}</title>
                  </circle>
                ))}
            </g>
          ))}
        </svg>

        {/* célula vazia sob a calha */}
        <div />

        <div className="relative h-5">
          {[...indices]
            .sort((a, b) => a - b)
            .map((i) => (
              <span
                key={i}
                className="text-meta absolute top-0 whitespace-nowrap text-[var(--color-ink-3)]"
                style={{
                  left: `${(x(i) / LARG) * 100}%`,
                  transform:
                    i === 0 ? 'none' : i === n - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                }}
              >
                {rotulo(marcos[i].em)}
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- ritmo

function Ritmo({
  marcos,
  frase,
  rotulo,
  poucaHistoria,
}: {
  marcos: MarcoHistorico[]
  frase: string
  rotulo: (iso: string) => string
  /** Sem gráfico acima não há eixo com que alinhar — aí a barra começa na
      margem do cartão, como qualquer outro conteúdo. */
  poucaHistoria: boolean
}) {
  const t = useT()
  const maior = Math.max(1, ...marcos.map((m) => m.arquivos))

  return (
    <div>
      <p className="text-lead">{frase}</p>
      {/*
        As barras começam onde o desenho de cima começa (calha + vão = 40px).
        POR QUÊ: são os MESMOS marcos, na mesma ordem, do mesmo período — os
        dois blocos compartilham eixo do tempo. Alinhados, as datas escritas
        embaixo do gráfico também servem para as barras, e a pausa que aparece
        como planalto na linha aparece como barra baixa aqui, na mesma altura
        da tela. Desalinhados, eram dois gráficos sem relação aparente.
      */}
      <div
        className="mt-card flex h-[52px] items-end gap-hair"
        style={{ marginLeft: poucaHistoria ? 0 : CALHA + VAO }}
      >
        {marcos.map((m) => (
          <div
            key={m.em}
            className="min-w-0 flex-1 rounded-t-[2px]"
            title={`${rotulo(m.em)} · ${t('hist.marcoMudancas', { n: m.arquivos })}`}
            style={{
              /* 2px de piso: um marco com zero mudança precisa continuar
                 ocupando lugar, senão a barra some e a pausa some junto */
              height: `${Math.max(2, (m.arquivos / maior) * 52)}px`,
              background:
                m.arquivos === 0
                  ? 'var(--color-rule)'
                  : `color-mix(in oklab, var(--color-accent) ${35 + Math.round((m.arquivos / maior) * 55)}%, transparent)`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// -------------------------------------------------------------- componente

export function Historico({ snapshot }: { snapshot: ProjectSnapshot }) {
  const t = useT()
  const idioma = useIdioma()
  const historico = historicoDe(snapshot)

  const dia = useMemo(
    () => new Intl.DateTimeFormat(LOCALE[idioma], { day: 'numeric', month: 'short' }),
    [idioma],
  )
  const diaLongo = useMemo(
    () => new Intl.DateTimeFormat(LOCALE[idioma], { day: 'numeric', month: 'long' }),
    [idioma],
  )
  const rotulo = (iso: string) => dia.format(new Date(iso))

  const marcos = historico?.marcos ?? []
  const total = marcos.reduce((s, m) => s + m.arquivos, 0)
  const g = historico?.granularidade ?? 'dia'

  const periodo =
    marcos.length === 1
      ? t(g === 'dia' ? 'hist.periodo.dia' : 'hist.periodo.semana')
      : t(g === 'dia' ? 'hist.periodo.dias' : 'hist.periodo.semanas', { n: marcos.length })

  const frase =
    total === 0
      ? t('hist.ritmo.nada', { periodo })
      : total === 1
        ? t('hist.ritmo.uma', { periodo })
        : t('hist.ritmo.muitas', { n: total, periodo })

  const vazio = !historico || marcos.length === 0
  /* Com menos de 3 marcos não há gráfico — e a frase que entra no lugar dele
     (`hist.poucaHistoria`) promete que "os marcos que existem estão logo
     abaixo, em números". Num trilho à direita ela mentiria. Então neste caso
     a tela volta a ser uma coluna só, na medida de leitura: a régua fica
     mesmo logo abaixo, e não há dado suficiente para ocupar duas colunas. */
  const poucaHistoria = marcos.length < 3

  return (
    <div className="h-full overflow-y-auto">
      {/* Mesma moldura da Home: 1200 de teto, 40 de respiro lateral, e a quebra
          medida por `@container` — quem decide se cabem duas colunas é a
          largura que SOBRA aqui (a lateral pode estar fechada, o terminal pode
          estar docado à direita), não o tamanho do monitor. */}
      <div className="@container mx-auto max-w-[1200px] px-10 pt-7 pb-group">
        <header className="animate-in-up">
          {/* O único `text-display` da tela. Perdeu o ícone de gráfico que o
              acompanhava: a manchete das outras duas telas refeitas é só
              palavra, e o mesmo ícone já identifica esta aba na lateral. */}
          <h1 className="font-display text-display">{t('hist.titulo')}</h1>
          <p className="text-lead mt-hair max-w-[60ch] text-[var(--color-ink-2)]">
            {t('hist.paraQue')}
          </p>

          {/* Ainda calculando não esconde o que já existe: o pouco que há já
              responde alguma coisa, e sumir com ele parece defeito. */}
          {historico && (historico.frio || historico.desatualizado) && (
            <p className="text-meta mt-item flex items-center gap-hair text-[var(--color-ink-3)]">
              <Loader2 size={13} className="animate-spin" aria-hidden />
              {t('hist.calculando')}
            </p>
          )}
        </header>

        {vazio ? (
          <section className="animate-in-up card mt-group max-w-[60ch] p-card">
            {/* Aqui o título NÃO é rótulo: nesta tela sem dados ele é o próprio
                conteúdo, e é a única coisa que a pessoa vem ler. */}
            <h2 className="font-display text-title">{t('hist.vazioTitulo')}</h2>
            <p className="text-lead mt-item text-[var(--color-ink-2)]">{t('hist.vazioTexto')}</p>
          </section>
        ) : (
          /* 960px é onde a conta fecha, medida por dentro: 528 de leitura + 32
             entre as colunas + 400 de trilho. Abaixo disso o trilho desce e
             vira o terceiro bloco de uma coluna só. */
          <div
            className={[
              'mt-group grid grid-cols-1 items-start gap-group',
              poucaHistoria
                ? 'max-w-[680px]'
                : '@min-[960px]:grid-cols-[minmax(0,1fr)_400px]',
            ].join(' ')}
          >
            {/* ─── o que se olha: dois desenhos do mesmo período ─── */}
            <div className="min-w-0 space-y-group">
              {/* ----------------------------------------------- gráfico */}
              <section className="animate-in-up card p-card" style={{ animationDelay: '0.05s' }}>
                {/* O título de bloco é rótulo, e 8px o separam do conteúdo:
                    era serifa de 15px com 12px de respiro, ou seja, maior que
                    a lista que encabeçava e igualmente distante dela. */}
                <h2 className="label text-[var(--color-ink-3)]">{t('hist.evolucao')}</h2>
                <div className="mt-item">
                  {poucaHistoria ? (
                    <p className="text-lead text-[var(--color-ink-2)]">{t('hist.poucaHistoria')}</p>
                  ) : (
                    <Grafico marcos={marcos} rotulo={rotulo} />
                  )}
                </div>
              </section>

              {/* ------------------------------------------------- ritmo */}
              <section className="animate-in-up card p-card" style={{ animationDelay: '0.1s' }}>
                <h2 className="label text-[var(--color-ink-3)]">{t('hist.ritmo')}</h2>
                <div className="mt-item">
                  <Ritmo marcos={marcos} frase={frase} rotulo={rotulo} poucaHistoria={poucaHistoria} />
                </div>
              </section>
            </div>

            {/* ─── trilho: a régua, que se confere linha a linha ─── */}
            <aside className="min-w-0">
              <section className="animate-in-up card p-card" style={{ animationDelay: '0.15s' }}>
                <h2 className="label text-[var(--color-ink-3)]">{t('hist.regua')}</h2>
                <p className="text-meta mt-hair text-[var(--color-ink-2)]">{t('hist.reguaNota')}</p>

                {/* Sem `border-t` em cada linha: a divisória existia porque
                    tudo estava a 16px e nada agrupava. Com 8px entre marcos
                    dentro do cartão e 32px entre cartões, a lista já se lê
                    como um bloco — e 14 filetes cinza a menos é a metade da
                    tinta desta coluna. */}
                <ul className="mt-card space-y-item">
                  {[...marcos].reverse().map((m) => (
                    <li
                      key={m.em}
                      className="text-meta flex flex-wrap items-center gap-x-item gap-y-hair tabular-nums"
                    >
                      <span className="min-w-[96px] shrink-0">
                        {diaLongo.format(new Date(m.em))}
                      </span>
                      <span className="flex items-center gap-hair text-[var(--color-ink-2)]">
                        <StateMark state="planned" size="sm" decorativa />
                        {t('hist.marcoPartes', { n: m.partes })}
                      </span>
                      <span className="flex items-center gap-hair text-[var(--color-ink-2)]">
                        <StateMark state="tested" size="sm" decorativa />
                        {t('hist.marcoTestadas', { n: m.testadas })}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[var(--color-ink-3)]">
                        {t('hist.marcoMudancas', { n: m.arquivos })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
