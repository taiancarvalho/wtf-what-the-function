import { useMemo } from 'react'
import { StateMark } from '@/components/StateMark'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CloudOff,
  History,
  Sparkles,
} from 'lucide-react'
import { montarAssuntos } from '@/lib/assuntos'
import { Seguranca } from '@/components/Seguranca'
import { diaRelativo, horaDe } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { STATE, STATE_ORDER } from '@/lib/state'
import { desdeUltimaVisitaDe } from '@/views/Historico'
import type { FeatureState, ProjectSnapshot } from '@/types/protocol'

/**
 * A primeira tela.
 *
 * O feed responde "o que aconteceu" e é ruim para "como está meu projeto".
 * Esta tela existe para a pergunta que alguém faz ao abrir o app de manhã, e
 * responde em cinco segundos, nesta ordem de urgência:
 *
 *   1. o que depende de mim               (só eu posso resolver)
 *   2. o que pode ser perdido             (trabalho sem salvar)
 *   3. o que mudou depois que eu aprovei  (o alerta mais valioso)
 *   4. o que está acontecendo agora
 *   5. como o projeto está no geral
 *
 * Nada aqui é decorativo: se um bloco não tem o que dizer, ele some.
 */
export function Home({
  snapshot,
  onIr,
}: {
  snapshot: ProjectSnapshot
  onIr: (aba: 'timeline' | 'build' | 'mapa' | 'historico') => void
}) {
  const t = useT()

  const assuntos = useMemo(() => montarAssuntos(snapshot.events), [snapshot.events])
  const pendentes = assuntos.filter((a) => a.pedeAtencao)

  const naoSalvos = snapshot.features.reduce((s, f) => s + (f.unsavedCount ?? 0), 0)
  const partesNaoSalvas = snapshot.features.filter((f) => f.unsaved)
  const mudaramDepois = snapshot.features.filter((f) => f.revalidar)
  const emCurso = snapshot.features.filter((f) => f.working)

  const progresso = snapshot.features.length
    ? snapshot.features.reduce(
        (s, f) => s + STATE_ORDER.indexOf(f.state) / (STATE_ORDER.length - 1),
        0,
      ) / snapshot.features.length
    : 0

  const porEstado = STATE_ORDER.map((e) => ({
    estado: e,
    n: snapshot.features.filter((f) => f.state === e).length,
  }))

  const ultimo = snapshot.events[0]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-8 pt-7 pb-24">
        <header className="animate-in-up">
          <h1 className="font-display text-[30px] leading-[1.1] font-semibold">
            {snapshot.project.name}
          </h1>
          <p className="mt-1.5 max-w-[58ch] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            {snapshot.project.pitch}
          </p>
        </header>

        {/* 1. o que depende de você */}
        {pendentes.length > 0 && (
          <Bloco
            cor="var(--color-warn)"
            icone={AlertTriangle}
            titulo={
              pendentes.length === 1
                ? t('home.dependeDeVoce1')
                : t('home.dependeDeVoce', { n: pendentes.length })
            }
            acao={t('home.verNoFeed')}
            onAcao={() => onIr('timeline')}
            delay={0.05}
          >
            <ul className="space-y-2">
              {pendentes.slice(0, 3).map((a) => (
                <li key={a.aviso.id}>
                  <p className="text-[14px] leading-snug font-medium">
                    {a.aviso.human?.headline}
                  </p>
                  {a.motivo && (
                    <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--color-ink-2)]">
                      {a.motivo}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Bloco>
        )}

        {/* 2. o que pode ser perdido */}
        {naoSalvos > 0 && (
          <Bloco
            cor="var(--color-warn)"
            icone={CloudOff}
            titulo={
              naoSalvos === 1
                ? t('home.naoSalvo1')
                : t('home.naoSalvo', { n: naoSalvos })
            }
            delay={0.1}
          >
            <p className="text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              {t('home.naoSalvoNota', {
                partes: partesNaoSalvas.map((f) => f.name).slice(0, 4).join(', '),
              })}
            </p>
          </Bloco>
        )}

        {/* 3. mudou depois que você aprovou */}
        {mudaramDepois.length > 0 && (
          <Bloco
            cor="var(--color-warn)"
            icone={History}
            titulo={
              mudaramDepois.length === 1
                ? t('home.mudouDepois1')
                : t('home.mudouDepois', { n: mudaramDepois.length })
            }
            acao={t('home.verProgresso')}
            onAcao={() => onIr('build')}
            delay={0.15}
          >
            <p className="text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              {mudaramDepois.map((f) => f.name).join(', ')}
            </p>
          </Bloco>
        )}

        {/* 3.5. o que mudou desde a última vez que você olhou */}
        <DesdeQueVoceOlhou snapshot={snapshot} onIr={onIr} />

        {/* 4. acontecendo agora */}
        {emCurso.length > 0 && (
          <Bloco
            cor="var(--color-building)"
            icone={Sparkles}
            titulo={t('home.agora')}
            delay={0.2}
            pulsar
          >
            <ul className="space-y-1.5">
              {emCurso.map((f) => (
                <li key={f.id} className="text-[13.5px] leading-snug">
                  <span className="font-medium">{f.name}</span>
                  {f.workingClaim && (
                    <span className="text-[var(--color-ink-2)]"> — {f.workingClaim}</span>
                  )}
                </li>
              ))}
            </ul>
          </Bloco>
        )}

        <Seguranca snapshot={snapshot} />

        {/* 5. o geral */}
        <section
          className="animate-in-up card mt-4 p-5"
          style={{ animationDelay: '0.25s' }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-[15px] font-medium">{t('home.geral')}</h2>
            <span className="font-mono text-[13px] tabular-nums text-[var(--color-ink-2)]">
              {Math.round(progresso * 100)}%
            </span>
          </div>

          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-paper-3)]">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${Math.round(progresso * 100)}%`,
                background: 'var(--color-accent)',
              }}
            />
          </div>

          <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {porEstado.map(({ estado, n }) => (
              <span
                key={estado}
                className="inline-flex items-center gap-1.5 text-[12.5px]"
                title={t(`estado.${estado}.sentido`)}
              >
                <StateMark state={estado} size="sm" decorativa />
                <span className="font-mono tabular-nums">{n}</span>
                <span className="text-[var(--color-ink-2)]">{t(`estado.${estado}`)}</span>
              </span>
            ))}
          </div>

          <button
            onClick={() => onIr('mapa')}
            className="no-drag mt-4 inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-accent)]"
          >
            {t('home.verMapa')}
            <ArrowRight size={13} />
          </button>
        </section>

        {/* 6. a última coisa que aconteceu */}
        {ultimo?.human && (
          <section
            className="animate-in-up mt-4 border-t pt-4"
            style={{ animationDelay: '0.3s' }}
          >
            <p className="text-[10.5px] tracking-[0.14em] text-[var(--color-ink-3)] uppercase">
              {t('home.ultima')}
            </p>
            <button
              onClick={() => onIr('timeline')}
              className="no-drag mt-1.5 block text-left"
            >
              <p className="font-display text-[16px] leading-snug font-medium">
                {ultimo.human.headline}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--color-ink-3)]">
                {diaRelativo(ultimo.at)} · {horaDe(ultimo.at)}
              </p>
            </button>
          </section>
        )}

        {/* nada a relatar é uma informação boa, e merece ser dita */}
        {pendentes.length === 0 && naoSalvos === 0 && mudaramDepois.length === 0 && (
          <section className="animate-in-up mt-4 flex items-center gap-2.5">
            <CheckCircle2 size={16} style={{ color: 'var(--color-tested)' }} />
            <p className="text-[13.5px] text-[var(--color-ink-2)]">{t('home.tudoEmDia')}</p>
          </section>
        )}
      </div>
    </div>
  )
}

/**
 * "O que mudou desde a última vez que você olhou".
 *
 * É o bloco que responde à pergunta de quem some por dois dias e volta. Vem
 * depois dos três blocos de urgência de propósito: nada aqui é uma emergência,
 * e ele não pode roubar o olho de algo que depende de uma decisão.
 *
 * Se não há nada novo, o bloco NÃO É RENDERIZADO. Uma linha dizendo "nada
 * mudou" custaria uma leitura por dia para não informar nada — e a Home inteira
 * é construída em cima de blocos que somem quando não têm o que dizer.
 */
function DesdeQueVoceOlhou({
  snapshot,
  onIr,
}: {
  snapshot: ProjectSnapshot
  onIr: (aba: 'timeline' | 'build' | 'mapa' | 'historico') => void
}) {
  const t = useT()
  const d = desdeUltimaVisitaDe(snapshot)
  if (!d) return null

  // Primeira visita: números vazios seriam mentira ("0 mudanças" sugere que o
  // projeto parou). O que cabe aqui é dizer o que este bloco vai virar.
  if (d.primeira) {
    return (
      <Bloco
        cor="var(--color-implemented)"
        icone={Clock}
        titulo={t('desde.boasVindas')}
        delay={0.18}
      >
        <p className="text-[13px] leading-relaxed text-[var(--color-ink-2)]">
          {t('desde.boasVindasNota')}
        </p>
      </Bloco>
    )
  }

  const nada =
    d.commits === 0 &&
    d.arquivos === 0 &&
    d.avisosNovos === 0 &&
    d.pedemDecisao === 0 &&
    d.partesQueMudaram.length === 0
  if (nada) return null

  const numeros: string[] = []
  if (d.commits > 0) {
    numeros.push(
      d.commits === 1 ? t('desde.mudanca1') : t('desde.commits', { n: d.commits }),
    )
  }
  if (d.arquivos > 0) {
    numeros.push(
      d.arquivos === 1 ? t('desde.arquivo1') : t('desde.arquivos', { n: d.arquivos }),
    )
  }
  if (d.avisosNovos > 0) {
    numeros.push(
      d.avisosNovos === 1 ? t('desde.aviso1') : t('desde.avisos', { n: d.avisosNovos }),
    )
  }
  if (d.pedemDecisao > 0) {
    numeros.push(
      d.pedemDecisao === 1
        ? t('desde.decisao1')
        : t('desde.decisoes', { n: d.pedemDecisao }),
    )
  }

  return (
    <Bloco
      cor="var(--color-implemented)"
      icone={Clock}
      titulo={t('desde.titulo')}
      acao={t('desde.verHistorico')}
      onAcao={() => onIr('historico')}
      delay={0.18}
    >
      {d.desdeEm && (
        <p className="text-[12px] text-[var(--color-ink-3)]">
          {t('desde.periodo', {
            dia: diaRelativo(d.desdeEm).toLowerCase(),
            hora: horaDe(d.desdeEm),
          })}
        </p>
      )}

      {numeros.length > 0 && (
        <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--color-ink)]">
          {numeros.join(' · ')}
        </p>
      )}

      {/* As marcas de estado dizem a distância percorrida sem precisar de
          adjetivo: "● → ✓" é a frase inteira, e é a mesma em qualquer idioma. */}
      {d.partesQueMudaram.length > 0 && (
        <ul className="mt-2 space-y-1">
          {d.partesQueMudaram.slice(0, 5).map((p) => (
            <li key={p.nome} className="flex items-baseline gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate">{p.nome}</span>
              <span className="shrink-0 font-mono text-[12px] whitespace-nowrap">
                <Marca estado={p.de} />
                <span className="mx-1 text-[var(--color-ink-3)]">→</span>
                <Marca estado={p.para} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  )
}

/** Só desenha se o estado for um dos conhecidos — o motor pode mandar outro. */
function Marca({ estado }: { estado: string }) {
  const meta = STATE[estado as FeatureState]
  if (!meta) return <span className="text-[var(--color-ink-3)]">{estado}</span>
  return <StateMark state={estado as FeatureState} size="sm" decorativa />
}

function Bloco({
  cor,
  icone: Icone,
  titulo,
  acao,
  onAcao,
  children,
  delay,
  pulsar,
}: {
  cor: string
  icone: typeof AlertTriangle
  titulo: string
  acao?: string
  onAcao?: () => void
  children: React.ReactNode
  delay: number
  pulsar?: boolean
}) {
  return (
    <section
      className="animate-in-up mt-4 rounded-xl border p-4"
      style={{
        animationDelay: `${delay}s`,
        borderColor: `color-mix(in oklab, ${cor} 40%, transparent)`,
        background: `color-mix(in oklab, ${cor} 7%, transparent)`,
      }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        {pulsar ? (
          <span className="pulse-live h-2 w-2 rounded-full" style={{ background: cor }} />
        ) : (
          <Icone size={14} style={{ color: cor }} className="shrink-0" />
        )}
        <h2 className="text-[13px] font-semibold" style={{ color: cor }}>
          {titulo}
        </h2>
        {acao && (
          <button
            onClick={onAcao}
            className="no-drag ml-auto inline-flex items-center gap-1 text-[12px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
          >
            {acao}
            <ArrowRight size={12} />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
