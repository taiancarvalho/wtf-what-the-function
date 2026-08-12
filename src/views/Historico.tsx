import { useMemo } from 'react'
import { StateMark } from '@/components/StateMark'
import { Loader2, TrendingUp } from 'lucide-react'
import { LOCALE, useIdioma, useT } from '@/lib/i18n'
import { STATE } from '@/lib/state'
import type { Historico, MarcoHistorico, ProjectSnapshot } from '@/types/protocol'

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
 */

const historicoDe = (snapshot: ProjectSnapshot) => snapshot.historico

export const desdeUltimaVisitaDe = (snapshot: ProjectSnapshot) =>
  snapshot.desdeUltimaVisita

// ------------------------------------------------------------------ gráfico

const L = 34 // espaço da coluna de números, à esquerda
const R = 8
const TOPO = 10
const BASE = 150
const LARG = 720

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
  const x = (i: number) => (n === 1 ? (L + LARG - R) / 2 : L + (i * (LARG - R - L)) / (n - 1))
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
      <svg
        viewBox={`0 0 ${LARG} 172`}
        className="h-auto w-full"
        role="img"
        aria-label={t('hist.evolucao')}
      >
        {/* três réguas discretas: sem grade, só o suficiente para dar escala */}
        {[0, 0.5, 1].map((f) => {
          const valor = Math.round(teto * f)
          return (
            <g key={f}>
              <line
                x1={L}
                x2={LARG - R}
                y1={y(valor)}
                y2={y(valor)}
                stroke="var(--color-rule)"
                strokeWidth={1}
              />
              <text
                x={L - 6}
                y={y(valor) + 3.5}
                textAnchor="end"
                fontSize={9}
                fill="var(--color-ink-3)"
              >
                {valor}
              </text>
            </g>
          )
        })}

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

        {[...indices]
          .sort((a, b) => a - b)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y={168}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              fontSize={9}
              fill="var(--color-ink-3)"
            >
              {rotulo(marcos[i].em)}
            </text>
          ))}
      </svg>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <li key={s.chave} className="flex items-center gap-1.5 text-[11.5px]">
            <span
              aria-hidden
              className="h-[2px] w-4 rounded-full"
              style={{ background: s.cor }}
            />
            <span className="text-[var(--color-ink-2)]">{t(`hist.serie.${s.chave}`)}</span>
            <span className="font-mono tabular-nums text-[var(--color-ink)]">
              {s.valores[s.valores.length - 1]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// -------------------------------------------------------------------- ritmo

function Ritmo({ marcos, frase }: { marcos: MarcoHistorico[]; frase: string }) {
  const maior = Math.max(1, ...marcos.map((m) => m.arquivos))

  return (
    <div>
      <p className="text-[13.5px] leading-snug text-[var(--color-ink)]">{frase}</p>
      <div className="mt-2.5 flex h-[52px] items-end gap-[3px]">
        {marcos.map((m) => (
          <div
            key={m.em}
            className="min-w-0 flex-1 rounded-t-[2px]"
            title={`${m.arquivos}`}
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-8 pt-6 pb-24">
        <header className="animate-in-up">
          <h1 className="font-display flex items-center gap-2.5 text-[26px] leading-none">
            <TrendingUp size={22} strokeWidth={1.9} className="text-[var(--color-ink-3)]" />
            {t('hist.titulo')}
          </h1>
          <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            {t('hist.paraQue')}
          </p>
        </header>

        {/* Ainda calculando não esconde o que já existe: o pouco que há já
            responde alguma coisa, e sumir com ele parece defeito. */}
        {historico && (historico.frio || historico.desatualizado) && (
          <p className="animate-in-up mt-4 flex items-center gap-2 text-[12.5px] text-[var(--color-ink-3)]">
            <Loader2 size={13} className="animate-spin" aria-hidden />
            {t('hist.calculando')}
          </p>
        )}

        {!historico || marcos.length === 0 ? (
          <section className="animate-in-up card mt-5 p-5">
            <h2 className="font-display text-[15px] font-medium">{t('hist.vazioTitulo')}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              {t('hist.vazioTexto')}
            </p>
          </section>
        ) : (
          <>
            {/* ------------------------------------------------- gráfico */}
            <section className="animate-in-up card mt-5 p-5" style={{ animationDelay: '0.05s' }}>
              <h2 className="font-display text-[15px] font-medium">{t('hist.evolucao')}</h2>
              {marcos.length < 3 ? (
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                  {t('hist.poucaHistoria')}
                </p>
              ) : (
                <div className="mt-3">
                  <Grafico marcos={marcos} rotulo={rotulo} />
                </div>
              )}
            </section>

            {/* --------------------------------------------------- ritmo */}
            <section className="animate-in-up card mt-4 p-5" style={{ animationDelay: '0.1s' }}>
              <h2 className="font-display text-[15px] font-medium">{t('hist.ritmo')}</h2>
              <div className="mt-2.5">
                <Ritmo marcos={marcos} frase={frase} />
              </div>
            </section>

            {/* --------------------------------------------------- régua */}
            <section className="animate-in-up mt-4" style={{ animationDelay: '0.15s' }}>
              <h2 className="font-display text-[15px] font-medium">{t('hist.regua')}</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
                {t('hist.reguaNota')}
              </p>
              <ul className="mt-3">
                {[...marcos].reverse().map((m) => (
                  <li
                    key={m.em}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t py-2 text-[12.5px]"
                  >
                    <span className="w-[110px] shrink-0 text-[var(--color-ink)]">
                      {diaLongo.format(new Date(m.em))}
                    </span>
                    <span className="flex items-center gap-1.5 text-[var(--color-ink-2)]">
                      <StateMark state="planned" size="sm" decorativa />
                      {t('hist.marcoPartes', { n: m.partes })}
                    </span>
                    <span className="flex items-center gap-1.5 text-[var(--color-ink-2)]">
                      <StateMark state="tested" size="sm" decorativa />
                      {t('hist.marcoTestadas', { n: m.testadas })}
                    </span>
                    <span className="ml-auto font-mono text-[11.5px] tabular-nums text-[var(--color-ink-3)]">
                      {t('hist.marcoMudancas', { n: m.arquivos })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
