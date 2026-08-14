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
 *
 * Duas colunas, e a divisão tem critério: à esquerda o que se LÊ (o que pede
 * decisão, em frases inteiras); à direita, 400px do que se CONFERE de relance.
 *
 * A quebra é por `@container`, nunca por viewport: a lateral pode estar
 * fechada e o terminal docado à direita, e quem decide se cabem duas colunas é
 * a largura que sobra aqui, não o tamanho do monitor.
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

  /*
   * POR QUÊ 6 e não 1: o bloco chamava-se "última coisa que aconteceu" e
   * ocupava um bloco inteiro para uma linha só — era o texto MAIOR da tela
   * (16px serifa) sendo, ao mesmo tempo, a informação menos urgente dela.
   * No trilho ele cabe como lista, e seis linhas respondem "o dia rendeu?"
   * sem que ninguém precise abrir o feed.
   */
  const ultimos = useMemo(
    () => snapshot.events.filter((e) => !!e.human?.headline).slice(0, 6),
    [snapshot.events],
  )

  /*
   * A mesma conta que o componente de Segurança faz para decidir se aparece.
   * Ela é repetida aqui por um motivo de layout: sem saber de antemão que o
   * bloco vai sumir, o trilho abriria um buraco de 32px onde não há nada.
   */
  const avisosSeguranca =
    (snapshot.segredos?.achados?.length ?? 0) + (snapshot.expostos?.achados?.length ?? 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="@container mx-auto max-w-[1200px] px-10 pt-7 pb-group">
        {/*
          A frase do projeto mora AQUI, e só aqui.
          
          Ela aparecia duas vezes — na lateral e neste cabeçalho — e a correção
          quase a apagou do aplicativo: quem enxugou a lateral tirou de lá
          contando que ficaria nesta tela, e quem enxugou esta tela tirou daqui
          contando que ficaria na lateral. Cada lado assumiu que o outro
          guardava, e a frase sumiu das duas.
          
          Ela fica na tela de resumo porque é o que o software É — a única
          linha que responde "do que se trata este projeto?" para quem abriu o
          painel pela primeira vez. A lateral é navegação e não deve carregar
          isso; esta tela é justamente o lugar de dizer o que a coisa é antes
          de contar o que aconteceu nela.
        */}
        <header className="animate-in-up">
          <h1 className="font-display text-display">{snapshot.project.name}</h1>
          {snapshot.project.pitch && (
            <p className="text-lead mt-hair max-w-[60ch] text-[var(--color-ink-2)]">
              {snapshot.project.pitch}
            </p>
          )}
        </header>

        {/*
          960px é onde a conta fecha, e é medida por dentro (a pergunta do
          `@container` já desconta o respiro lateral): 528 de leitura + 32 entre
          as colunas + 400 de trilho. 528px é o piso em que uma frase inteira
          ainda tem medida de leitura; abaixo disso as duas colunas voltam a ser
          uma, e o trilho desce para o fim. Numa janela de 1440 com a lateral
          aberta sobram 1120 por dentro, e a coluna de leitura dá 688px — quase
          a mesma medida de texto de antes, agora sem os 600px de margem morta
          que a crítica mediu em 41% da janela.
        */}
        <div className="mt-group grid grid-cols-1 items-start gap-group @min-[960px]:grid-cols-[minmax(0,1fr)_400px]">
          {/* ─── leitura: o que depende de uma decisão sua ─── */}
          <div className="min-w-0 space-y-group">
            {/* 1. o que depende de você */}
            {pendentes.length > 0 && (
              <Bloco
                cor="var(--color-danger)"
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
                {/*
                  POR QUÊ 6 e não 3: o título prometia 4 e a lista entregava 3.
                  Um contador que a própria tela desmente ensina a não confiar
                  no contador. Com o trilho levando o estado embora, esta coluna
                  tem altura de sobra para cumprir o que o título diz.
                */}
                <ul className="space-y-item">
                  {pendentes.slice(0, 6).map((a) => (
                    <li key={a.aviso.id}>
                      {/*
                        POR QUÊ o item ficou maior que o título do bloco: antes
                        era o contrário — título 13px semibold, itens 14px. O
                        container era menor que o conteúdo dele. Agora o título
                        é rótulo (11px caixa alta) e o item é o degrau de
                        leitura, que é o que a pessoa de fato lê.
                      */}
                      <p className="text-lead">{a.aviso.human?.headline}</p>
                      {a.motivo && (
                        <p className="mt-hair text-meta text-[var(--color-ink-2)]">
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
                cor="var(--color-danger)"
                icone={CloudOff}
                titulo={
                  naoSalvos === 1
                    ? t('home.naoSalvo1')
                    : t('home.naoSalvo', { n: naoSalvos })
                }
                delay={0.1}
              >
                <p className="text-lead text-[var(--color-ink-2)]">
                  {t('home.naoSalvoNota', {
                    partes: partesNaoSalvas.map((f) => f.name).slice(0, 4).join(', '),
                  })}
                </p>
              </Bloco>
            )}

            {/* 3. mudou depois que você aprovou */}
            {mudaramDepois.length > 0 && (
              <Bloco
                cor="var(--color-danger)"
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
                <p className="text-lead text-[var(--color-ink-2)]">
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
                <ul className="space-y-item">
                  {emCurso.map((f) => (
                    <li key={f.id} className="text-lead">
                      {/* O que separa o nome da frase é a tinta, não o peso:
                          combinar um degrau da escala com um peso avulso é
                          justamente como nasceram os 20 tamanhos antigos. */}
                      <span>{f.name}</span>
                      {f.workingClaim && (
                        <span className="text-[var(--color-ink-2)]"> — {f.workingClaim}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Bloco>
            )}

            {/* nada a relatar é uma informação boa, e merece ser dita */}
            {pendentes.length === 0 && naoSalvos === 0 && mudaramDepois.length === 0 && (
              <section className="animate-in-up flex items-center gap-item">
                <CheckCircle2
                  size={16}
                  className="shrink-0"
                  style={{ color: 'var(--color-tested)' }}
                />
                <p className="text-lead text-[var(--color-ink-2)]">{t('home.tudoEmDia')}</p>
              </section>
            )}
          </div>

          {/* ─── trilho: o estado do projeto, que se confere, não se lê ─── */}
          <aside className="min-w-0 space-y-group">
            {/* 5. o geral */}
            <section
              className="animate-in-up card p-card"
              style={{ animationDelay: '0.25s' }}
            >
              {/*
                POR QUÊ o título encolheu e o número cresceu: "Como está o
                projeto" era 15px e a manchete do último evento, o bloco menos
                urgente da tela, era 16px serifa. O título de um bloco não
                disputa tamanho com o conteúdo — ele é rótulo. Quem carrega o
                peso aqui é o número.
              */}
              <div className="flex items-baseline justify-between gap-item">
                <h2 className="label text-[var(--color-ink-3)]">{t('home.geral')}</h2>
                <span className="text-title font-mono tabular-nums">
                  {Math.round(progresso * 100)}%
                </span>
              </div>

              <div className="mt-item h-1.5 overflow-hidden rounded-full bg-[var(--color-paper-3)]">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${Math.round(progresso * 100)}%`,
                    background: 'var(--color-accent)',
                  }}
                />
              </div>

              {/*
                POR QUÊ virou lista em pé: em fila, os cinco contadores
                quebravam em duas linhas irregulares e os números caíam em
                colunas diferentes — ninguém compara "4" com "2" se eles não
                estão alinhados. Empilhados, o trilho ganha uma tabela de
                estado que se lê de cima a baixo em um olhar.
              */}
              <ul className="mt-card space-y-item">
                {porEstado.map(({ estado, n }) => (
                  <li
                    key={estado}
                    className="flex items-center gap-item text-meta"
                    title={t(`estado.${estado}.sentido`)}
                  >
                    <StateMark state={estado} size="sm" decorativa />
                    <span className="min-w-0 flex-1 truncate text-[var(--color-ink-2)]">
                      {t(`estado.${estado}`)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => onIr('mapa')}
                className="no-drag mt-card inline-flex items-center gap-hair text-meta text-[var(--color-accent)]"
              >
                {t('home.verMapa')}
                <ArrowRight size={13} />
              </button>
            </section>

            {/* Segurança: o `mt-4` que o componente carrega vem de antes da
                escala de espaço; aqui quem separa os blocos é o trilho, com
                32px — o dobro do respiro interno dos cartões. */}
            {avisosSeguranca > 0 && (
              <div className="[&>section]:mt-0">
                <Seguranca snapshot={snapshot} />
              </div>
            )}

            {/* 6. as últimas coisas que aconteceram */}
            {ultimos.length > 0 && (
              <section
                className="animate-in-up card p-card"
                style={{ animationDelay: '0.3s' }}
              >
                <h2 className="label text-[var(--color-ink-3)]">
                  {t('nav.acontecendo.nota')}
                </h2>
                <ul className="mt-item space-y-item">
                  {ultimos.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => onIr('timeline')}
                        className="no-drag block w-full text-left"
                      >
                        {/* Duas linhas, não uma: numa coluna de 400px a maior
                            parte destas frases não cabe em 45 caracteres, e
                            uma manchete cortada no meio ("o login passou a
                            guardar sua identificação de forma ma…") obriga
                            justamente a pessoa que não lê código a abrir o
                            feed para descobrir o fim da frase. Em duas linhas
                            quase todas cabem inteiras, e o teto continua
                            existindo para nenhuma delas dominar a lista. */}
                        <p className="text-lead line-clamp-2">{e.human?.headline}</p>
                        <p className="mt-hair text-meta text-[var(--color-ink-3)]">
                          {diaRelativo(e.at)} · {horaDe(e.at)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
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
        <p className="text-lead text-[var(--color-ink-2)]">{t('desde.boasVindasNota')}</p>
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
        <p className="text-meta text-[var(--color-ink-3)]">
          {t('desde.periodo', {
            dia: diaRelativo(d.desdeEm).toLowerCase(),
            hora: horaDe(d.desdeEm),
          })}
        </p>
      )}

      {numeros.length > 0 && (
        <p className="mt-hair text-lead">{numeros.join(' · ')}</p>
      )}

      {/* As marcas de estado dizem a distância percorrida sem precisar de
          adjetivo: "● → ✓" é a frase inteira, e é a mesma em qualquer idioma. */}
      {d.partesQueMudaram.length > 0 && (
        <ul className="mt-card space-y-item">
          {d.partesQueMudaram.slice(0, 5).map((p) => (
            <li key={p.nome} className="flex items-baseline gap-item text-lead">
              <span className="min-w-0 flex-1 truncate">{p.nome}</span>
              <span className="shrink-0 whitespace-nowrap">
                <Marca estado={p.de} />
                <span className="mx-hair text-[var(--color-ink-3)]">→</span>
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
  if (!meta) return <span className="text-meta text-[var(--color-ink-3)]">{estado}</span>
  return <StateMark state={estado as FeatureState} size="sm" decorativa />
}

/**
 * O cartão de um assunto da coluna de leitura.
 *
 * O título é `.label`, não manchete: é a etiqueta do grupo, e cede tamanho
 * para o conteúdo.
 *
 * O espaço entre grupos é sempre o dobro do maior espaço dentro deles, senão
 * nada agrupa. Ele mora no `space-y-group` das colunas, e não em cada bloco,
 * para um bloco que some não deixar o buraco dele para trás.
 */
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
      className="animate-in-up rounded-card border p-card"
      style={{
        animationDelay: `${delay}s`,
        borderColor: `color-mix(in oklab, ${cor} 40%, transparent)`,
        background: `color-mix(in oklab, ${cor} 7%, transparent)`,
      }}
    >
      <div className="flex items-center gap-hair">
        {pulsar ? (
          <span className="pulse-live h-2 w-2 rounded-full" style={{ background: cor }} />
        ) : (
          <Icone size={13} style={{ color: cor }} className="shrink-0" />
        )}
        <h2 className="label" style={{ color: cor }}>
          {titulo}
        </h2>
        {acao && (
          <button
            onClick={onAcao}
            className="no-drag ml-auto inline-flex items-center gap-hair text-meta text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
          >
            {acao}
            <ArrowRight size={13} />
          </button>
        )}
      </div>
      <div className="mt-item">{children}</div>
    </section>
  )
}
