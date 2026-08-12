import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerUpLeft,
  FileText,
  FolderTree,
  Hammer,
  Languages,
  Lightbulb,
  Loader2,
  PackagePlus,
  PackageMinus,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  ThumbsUp,
} from 'lucide-react'
import { StateChip, UnsavedChip, WorkingChip } from '@/components/StateMark'
import { VisualizadorArquivo } from '@/components/VisualizadorArquivo'
import { PainelPergunta } from '@/components/PainelPergunta'
import { OQueFazer } from '@/components/OQueFazer'
import { acoesDeNaoSalvo, acoesDoEvento } from '@/lib/acoes'
import { codigoCurto, diaRelativo, horaDe } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  alternarResolvido,
  podePerguntar,
  podeResolver,
  podeResponderTraducao,
  responderTraducao,
  traducaoPendentes,
} from '@/lib/source'
import { AGENT_LABEL } from '@/lib/state'
import { montarAssuntos, type Assunto } from '@/lib/assuntos'
import type { EventType, Feature, ProjectSnapshot, WtfEvent } from '@/types/protocol'

/**
 * A tela principal. O feed do seu software.
 *
 * Quatro níveis de profundidade, revelados um por vez:
 *   1. manchete  — sempre visível
 *   2. detalhes  — ao escolher o cartão (no trilho da direita, ou dentro do
 *                  cartão quando não há largura para o trilho)
 *   3. técnico   — atrás de "Ver parte técnica"
 *   4. código    — atrás de "Ver o código"
 *
 * ─── o que mudou depois do diagnóstico (.gauntlet/diagnostico/RESUMO.md) ───
 *
 * POR QUÊ a tela deixou de ser uma coluna centrada: 41% da janela era papel em
 * branco — uma coluna de 652px numa tela de 1456. A leitura desceu para a
 * esquerda (a linha de texto continua com a mesma medida) e os 400px que
 * sobravam viraram um trilho com o índice de dias, o filtro de atenção e o
 * DETALHE do cartão escolhido. Antes o detalhe abria DENTRO do cartão e
 * empurrava o resto do feed para centenas de pixels abaixo: ler uma mudança
 * custava perder a fila inteira de vista.
 *
 * POR QUÊ os tamanhos de letra encolheram para cinco: havia quatro tamanhos
 * (14,5 / 14 / 13,5 / 13px) fazendo o MESMO papel — parágrafo que a pessoa lê.
 * Diferença de 0,5px não comunica hierarquia, só ruído. Agora todo parágrafo é
 * `text-lead`, todo metadado é `text-meta`, todo rótulo é `.label`.
 *
 * POR QUÊ o espaçamento passou a usar os quatro degraus: toda separação era
 * 16px — o mesmo valor do respiro interno dos cartões. Se o espaço DENTRO de um
 * grupo é igual ao espaço ENTRE grupos, nada agrupa. Aqui: `item` (8) entre
 * cartões irmãos, `card` (16) dentro do cartão, `group` (32) entre os dias.
 *
 * POR QUÊ o cartão escolhido não é mais um cartão tingido: escolha e alerta
 * estavam disputando o mesmo canal. O cartão escolhido ganhava um campo de cor
 * no fundo; o selo de atenção também é cor. Como o cartão que a pessoa abre é,
 * quase sempre, justamente o que pede atenção, os dois efeitos caíam juntos e
 * não dava para saber qual deles pintou aquele cartão.
 *
 * E não bastaria trocar o fundo por uma tinta neutra: um campo claro cercado
 * por um contorno saturado é lido com a cor do contorno (é o efeito aquarela —
 * a matiz da borda "vaza" para dentro do campo que ela fecha). Como a borda
 * carmim do alerta continua ali — ela é o sinal mais importante da tela, e não
 * se apaga —, qualquer preenchimento dentro dela voltaria a parecer rosado.
 *
 * Então a escolha saiu da cor e virou GEOMETRIA: um filete de tinta neutra na
 * beirada DIREITA do cartão, virado para o trilho, com o filete gêmeo no topo
 * do detalhe. Os dois se encaram através da calha e formam a ponte "este
 * cartão alimenta aquele painel". A cor voltou a significar uma coisa só:
 * carmim é atenção, e nada mais.
 */

const ICONE: Record<EventType, typeof Hammer> = {
  'work.started': Hammer,
  'work.progress': Sparkles,
  'work.completed': Sparkles,
  'evidence.found': Search,
  'risk.raised': ShieldAlert,
  'risk.cleared': ShieldAlert,
  'docs.reorganized': FolderTree,
  'user.validated': ThumbsUp,
}

/**
 * A partir de que largura a tela vira duas colunas.
 *
 * 400 de trilho + 640 de leitura. Abaixo disso o trilho roubaria medida da
 * linha de texto, que é o único número desta tela que NÃO pode encolher — então
 * volta a ser uma coluna só, com o detalhe abrindo dentro do cartão, como antes.
 * A conta é feita sobre a largura REAL do painel (não da janela), porque a
 * lateral e o terminal encostado à direita comem espaço sem a janela mudar.
 */
const LARGURA_PARA_TRILHO = 1040

export function Timeline({
  snapshot,
  onMudou,
}: {
  snapshot: ProjectSnapshot
  /** Chamado quando algo escrito em disco pede uma releitura do projeto. */
  onMudou?: () => void
}) {
  const t = useT()
  const [aberto, setAberto] = useState<string | null>(snapshot.events[1]?.id ?? null)
  const [soAtencao, setSoAtencao] = useState(false)
  const [arquivoAberto, setArquivoAberto] = useState<string | null>(null)
  // A mudança sobre a qual se está perguntando. Um painel de cada vez.
  const [perguntandoSobre, setPerguntandoSobre] = useState<WtfEvent | null>(null)

  const raiz = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  // Medido antes da pintura para a tela não nascer numa coluna e pular para
  // duas no quadro seguinte.
  useLayoutEffect(() => {
    const el = raiz.current
    if (!el) return
    setLargura(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width
      if (typeof w === 'number') setLargura(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const comTrilho = largura >= LARGURA_PARA_TRILHO

  const featurePorId = useMemo(
    () => new Map(snapshot.features.map((f) => [f.id, f])),
    [snapshot.features],
  )

  /*
   * O feed lista ASSUNTOS, não eventos.
   *
   * Um aviso e as respostas que ele recebeu são a mesma conversa: aparecem como
   * um cartão só. Sem isso, cada pedido feito à IA criava uma linha nova na
   * fila, e quanto mais a pessoa usasse o produto, mais pendências ela
   * acumularia — o oposto do que este painel existe para fazer.
   */
  const assuntos = useMemo(() => montarAssuntos(snapshot.events), [snapshot.events])

  const visiveis = soAtencao ? assuntos.filter((a) => a.pedeAtencao) : assuntos
  const precisamAtencao = assuntos.filter((a) => a.pedeAtencao).length

  // agrupa por dia, mantendo a ordem já invertida do mock
  const dias: { chave: string; rotulo: string; assuntos: Assunto[] }[] = []
  for (const a of visiveis) {
    const rotulo = diaRelativo(a.aviso.at)
    const ultimo = dias.at(-1)
    if (ultimo?.rotulo === rotulo) ultimo.assuntos.push(a)
    else dias.push({ chave: `${rotulo}-${dias.length}`, rotulo, assuntos: [a] })
  }

  // O cartão escolhido é procurado entre os VISÍVEIS: se o filtro de atenção
  // tirou da lista o cartão que estava aberto, o trilho não pode continuar
  // mostrando o detalhe de algo que sumiu da tela.
  const escolhido = visiveis.find((a) => a.aviso.id === aberto) ?? null

  // Clicar um dia no índice leva a leitura até ele. Sem `behavior: 'smooth'`:
  // o deslize animado é ignorado nesta janela (medido — o feed simplesmente
  // não saía do lugar), e um índice que não leva a lugar nenhum é pior do que
  // não ter índice. O salto seco também orienta melhor: a pessoa clicou num
  // dia, ela quer estar naquele dia.
  const coluna = useRef<HTMLDivElement>(null)
  function irParaDia(chave: string) {
    const secao = coluna.current?.querySelector(`[data-dia="${CSS.escape(chave)}"]`)
    if (!secao || !coluna.current) return
    const alto =
      coluna.current.scrollTop +
      secao.getBoundingClientRect().top -
      coluna.current.getBoundingClientRect().top
    coluna.current.scrollTop = alto
  }

  const filtro =
    precisamAtencao > 0 ? (
      <FiltroAtencao
        ligado={soAtencao}
        quantos={precisamAtencao}
        onAlternar={() => setSoAtencao((v) => !v)}
      />
    ) : null

  return (
    <div ref={raiz} className="h-full min-h-0">
      <div className="flex h-full min-h-0">
        {/* ─────────────────────────────────────────────── coluna de leitura ─
            Alinhada à esquerda, não centrada. A medida da linha (720 menos os
            32 de respiro de cada lado) é a mesma de antes — o que sumiu foi a
            margem morta que existia dos dois lados dela. */}
        <div ref={coluna} className="min-w-0 flex-1 overflow-y-auto">
          <div className="pt-group px-group max-w-[720px] pb-[calc(var(--spacing-group)*3)]">
            <header className="animate-in-up mb-group">
              {/* Uma manchete por tela: `text-display`. Antes era 27px com a
                  entrelinha escrita à mão ao lado; agora o degrau traz o
                  tamanho, o peso e a entrelinha juntos. */}
              <h1 className="font-display text-display">
                {t('feed.titulo', { projeto: snapshot.project.name })}
              </h1>

              <AgoraMesmo features={snapshot.features} />

              <FaixaTraducao onTraduziu={onMudou} />

              {/* Sem trilho, o filtro continua no cabeçalho, onde sempre esteve. */}
              {!comTrilho && filtro && <div className="mt-card">{filtro}</div>}
            </header>

            {dias.map((dia) => (
              <section key={dia.chave} data-dia={dia.chave} className="mb-group">
                <div className="rule-double pt-item pb-item px-item -mx-item bg-[var(--color-paper)]/92 mb-card sticky top-0 z-10 backdrop-blur-sm">
                  {/* POR QUÊ `.label`: o rótulo do dia estava a 13px em serifa
                      com 0,1em de espacejamento — tamanho de corpo fazendo
                      papel de etiqueta. */}
                  <h2 className="label text-[var(--color-ink-3)]">{dia.rotulo}</h2>
                </div>

                <ol className="relative">
                  {/* o fio da linha do tempo */}
                  <span
                    aria-hidden
                    className="absolute top-2 bottom-2 left-[7px] w-px"
                    style={{ background: 'var(--color-rule)' }}
                  />
                  {dia.assuntos.map((a, i) => (
                    <Cartao
                      key={a.aviso.id}
                      assunto={a}
                      feature={featurePorId.get(a.aviso.featureId)}
                      aberto={aberto === a.aviso.id}
                      comTrilho={comTrilho}
                      onToggle={() => setAberto(aberto === a.aviso.id ? null : a.aviso.id)}
                      onAbrirArquivo={setArquivoAberto}
                      onPerguntar={setPerguntandoSobre}
                      onMudou={onMudou}
                      delay={i * 0.045}
                    />
                  ))}
                </ol>
              </section>
            ))}

            {snapshot.events.length === 0 ? (
              /* Projeto sem nenhuma versão salva ainda — o primeiro minuto de
                 vida de todo projeto, e uma hora provável de alguém abrir o WTF. */
              <div className="card p-card mt-card text-center">
                <p className="font-display text-title">{t('feed.vazioTitulo')}</p>
                <p className="mt-hair text-lead mx-auto max-w-[46ch] text-[var(--color-ink-2)]">
                  {t('feed.vazioTexto')}
                </p>
              </div>
            ) : (
              <p className="mt-group text-meta text-center text-[var(--color-ink-3)]">
                {t('feed.comeco')}
              </p>
            )}
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────── trilho ─
            Os 400px que antes eram margem. Índice de dias e filtro em cima
            (não rolam junto com o feed), detalhe embaixo com rolagem própria:
            ler uma mudança longa deixou de custar a fila de vista. */}
        {comTrilho && (
          <aside
            className="flex w-[400px] shrink-0 flex-col border-l"
            style={{ borderColor: 'var(--color-rule)' }}
          >
            <div className="p-card shrink-0 border-b" style={{ borderColor: 'var(--color-rule)' }}>
              {filtro}
              <ul className={`max-h-[30vh] overflow-y-auto ${filtro ? 'mt-card' : ''}`}>
                {dias.map((dia) => (
                  <li key={dia.chave}>
                    <button
                      type="button"
                      onClick={() => irParaDia(dia.chave)}
                      className="no-drag gap-item px-hair py-item flex w-full cursor-pointer items-baseline justify-between rounded text-left transition-colors hover:bg-[var(--color-paper-3)]"
                    >
                      <span className="label text-[var(--color-ink-2)]">{dia.rotulo}</span>
                      <span className="text-meta tabular-nums text-[var(--color-ink-3)]">
                        {dia.assuntos.length}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div id="trilho-detalhe" className="min-h-0 flex-1 overflow-y-auto">
              {escolhido?.aviso.human && (
                <>
                  {/* O cabeçalho do detalhe não tingia nada — aqui a cor já
                      significava uma coisa só (o selo de atenção é atenção).
                      O que faltava era o outro lado da ponte: sem marca de
                      ancoragem, quem ligava este painel ao cartão de origem era
                      o fundo tingido lá do feed. Este filete gêmeo encara o do
                      cartão escolhido através da calha e faz esse trabalho sem
                      pedir cor emprestada ao alerta. */}
                  <div className="p-card relative">
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{ background: 'var(--color-accent)' }}
                    />
                    <LinhaMeta
                      evento={escolhido.aviso}
                      feature={featurePorId.get(escolhido.aviso.featureId)}
                    />
                    <h2 className="font-display text-title mt-item text-balance">
                      {escolhido.aviso.human.headline}
                    </h2>
                    <Selos
                      assunto={escolhido}
                      feature={featurePorId.get(escolhido.aviso.featureId)}
                    />
                  </div>
                  <Detalhes
                    assunto={escolhido}
                    evento={escolhido.aviso}
                    feature={featurePorId.get(escolhido.aviso.featureId)}
                    onAbrirArquivo={setArquivoAberto}
                    onPerguntar={setPerguntandoSobre}
                    onMudou={onMudou}
                  />
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      <VisualizadorArquivo caminho={arquivoAberto} onFechar={() => setArquivoAberto(null)} />
      <PainelPergunta
        evento={perguntandoSobre}
        featureNome={
          perguntandoSobre ? featurePorId.get(perguntandoSobre.featureId)?.name : undefined
        }
        temBtw={snapshot.instalacao?.btw}
        onFechar={() => setPerguntandoSobre(null)}
      />
    </div>
  )
}

/**
 * "Só o que pede atenção". Mora no trilho quando há trilho, no cabeçalho quando
 * não há — a mesma peça nos dois lugares, para o filtro não mudar de forma
 * quando a janela muda de tamanho.
 */
function FiltroAtencao({
  ligado,
  quantos,
  onAlternar,
}: {
  ligado: boolean
  quantos: number
  onAlternar: () => void
}) {
  const t = useT()
  return (
    <button
      onClick={onAlternar}
      aria-pressed={ligado}
      className="no-drag gap-item text-meta inline-flex items-center rounded-full border px-3 py-1.5 transition-colors"
      style={{
        borderColor: ligado
          ? 'var(--color-danger)'
          : 'color-mix(in oklab, var(--color-danger) 35%, transparent)',
        background: ligado
          ? 'color-mix(in oklab, var(--color-danger) 13%, transparent)'
          : 'transparent',
        color: 'var(--color-danger)',
      }}
    >
      <AlertTriangle size={14} />
      {ligado
        ? t('feed.filtrando')
        : quantos === 1
          ? t('feed.pedeAtencao')
          : t('feed.pedemAtencao', { n: quantos })}
    </button>
  )
}

/**
 * A porta para traduzir o que ainda está em linguagem de commit.
 *
 * Um projeto que já existia antes do WTF chega com o histórico inteiro por
 * traduzir — e o feed, que é a tela principal, aparece escrito para quem
 * programa. Havia um aviso para isso, mas ele só era EMPURRADO quando a
 * leitura de fundo topava com pendências: quem abrisse a aba depois não via
 * nada, e ficava sem saber que existia um jeito de melhorar aquilo.
 *
 * Agora a tela pergunta ao abrir. E pergunta o custo junto: traduzir consome a
 * assinatura de quem tem plano limitado, então a pessoa decide antes, não
 * depois.
 */
function FaixaTraducao({ onTraduziu }: { onTraduziu?: () => void }) {
  const t = useT()
  const [pendentes, setPendentes] = useState(0)
  const [indo, setIndo] = useState(false)
  const [feito, setFeito] = useState(false)

  useEffect(() => {
    let vivo = true
    void traducaoPendentes().then((r) => {
      if (vivo && r.disponivel) setPendentes(r.pendentes)
    })
    return () => {
      vivo = false
    }
  }, [])

  if (pendentes === 0 || !podeResponderTraducao()) return null

  async function traduzir(resposta: 'agora' | 'sempre') {
    setIndo(true)
    try {
      await responderTraducao(resposta)
      setFeito(true)
      // A tradução acontece em segundo plano e avisa o painel quando termina;
      // aqui só pedimos uma releitura para o que já ficou pronto aparecer.
      onTraduziu?.()
    } finally {
      setIndo(false)
    }
  }

  if (feito) {
    return <p className="mt-card text-meta text-[var(--color-ink-3)]">{t('traduzir.emCurso')}</p>
  }

  return (
    <div
      className="animate-in-up mt-card p-card rounded-xl border"
      style={{
        borderColor: 'color-mix(in oklab, var(--color-accent) 32%, transparent)',
        background: 'color-mix(in oklab, var(--color-accent) 6%, transparent)',
      }}
    >
      <p className="gap-hair text-lead flex items-center font-medium">
        <Languages size={14} className="shrink-0 text-[var(--color-accent)]" />
        {t('traduzir.titulo', { n: pendentes })}
      </p>
      <p className="mt-hair text-lead max-w-[58ch] text-[var(--color-ink-2)]">
        {t('traduzir.nota')}
      </p>
      <div className="mt-card gap-item flex flex-wrap">
        <button
          onClick={() => void traduzir('agora')}
          disabled={indo}
          className="no-drag gap-hair text-meta inline-flex items-center rounded-md px-3 py-1.5 font-medium disabled:opacity-60"
          style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}
        >
          {indo ? <Loader2 size={13} className="animate-spin" /> : <Languages size={13} />}
          {t('traduzir.agora')}
        </button>
        <button
          onClick={() => void traduzir('sempre')}
          disabled={indo}
          className="no-drag text-meta rounded-md border px-3 py-1.5 text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-60"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          {t('traduzir.sempre')}
        </button>
      </div>
    </div>
  )
}

/**
 * O que a IA declarou que está fazendo e ainda não terminou.
 * É a resposta para "o que está acontecendo neste exato momento?" — a pergunta
 * de quem fica olhando o painel enquanto o agente trabalha.
 */
function AgoraMesmo({ features }: { features: Feature[] }) {
  const t = useT()
  // Duas formas de "em curso": a IA declarou, ou há arquivo mexido sem salvar.
  // A segunda pega o trabalho que ninguém anunciou — que é a maioria.
  const emCurso = features.filter((f) => f.working || f.unsaved)
  if (emCurso.length === 0) return null

  const naoSalvos = emCurso.reduce((soma, f) => soma + (f.unsavedCount ?? 0), 0)

  return (
    <div
      className="animate-in-up mt-card p-card rounded-xl border"
      style={{
        borderColor: 'color-mix(in oklab, var(--color-building) 42%, transparent)',
        background: 'color-mix(in oklab, var(--color-building) 8%, transparent)',
      }}
    >
      <div className="gap-item flex items-center">
        <span
          className="pulse-live h-2 w-2 rounded-full"
          style={{ background: 'var(--color-building)' }}
        />
        {/* POR QUÊ `.label`: era 11px com 0,14em de espacejamento escrito à mão.
            O rótulo compensa o tamanho com peso, não com caixa alta esticada. */}
        <span className="label" style={{ color: 'var(--color-building)' }}>
          {t('feed.agora')}
        </span>
      </div>

      {naoSalvos > 0 && (
        <p className="mt-item text-lead text-[var(--color-ink-2)]">
          {naoSalvos === 1 ? t('feed.naoSalvo') : t('feed.naoSalvos', { n: naoSalvos })}
        </p>
      )}

      <ul className="mt-card space-y-item">
        {emCurso.map((f) => (
          <li key={f.id}>
            {/* 16px não existe na escala. O nome fica no degrau de leitura e se
                separa do resto por família e peso, não por meio pixel a mais. */}
            <p className="font-display text-lead font-medium">{f.name}</p>
            {f.workingClaim && (
              <p className="mt-hair text-lead text-[var(--color-ink-2)]">{f.workingClaim}</p>
            )}
            <p className="mt-hair text-meta text-[var(--color-ink-3)]">
              {f.working && f.workingSince
                ? t('feed.comecou', {
                    dia: diaRelativo(f.workingSince).toLowerCase(),
                    hora: horaDe(f.workingSince),
                  })
                : (f.unsavedCount ?? 0) === 1
                  ? t('feed.mexidoSemAviso')
                  : t('feed.mexidosSemAviso', { n: f.unsavedCount ?? 0 })}
            </p>
          </li>
        ))}
      </ul>

      {naoSalvos > 0 && <OQueFazer acoes={acoesDeNaoSalvo(features)} />}
    </div>
  )
}

/**
 * A linha de identificação do cartão: código, hora, parte do produto, quem fez.
 *
 * Vive em dois lugares — no cartão do feed e no topo do detalhe, no trilho —
 * porque o detalhe fora do cartão precisa dizer de qual cartão ele é.
 */
function LinhaMeta({ evento, feature }: { evento: WtfEvent; feature: Feature | undefined }) {
  const t = useT()
  return (
    <div className="gap-item text-meta flex flex-wrap items-baseline text-[var(--color-ink-3)]">
      <CodigoCopiavel codigo={codigoCurto(evento.id)} />
      <span className="font-mono tabular-nums">{horaDe(evento.at)}</span>
      {feature && (
        <>
          <span aria-hidden>·</span>
          <span className="font-medium text-[var(--color-ink-2)]">{feature.name}</span>
        </>
      )}
      <span aria-hidden>·</span>
      <span>
        {evento.source === 'user'
          ? t('feed.voce')
          : evento.source === 'wtf'
            ? 'WTF'
            : AGENT_LABEL[evento.agent ?? 'desconhecido']}
      </span>
    </div>
  )
}

/** Os selos do assunto: estado, atenção, desfecho, respostas. */
function Selos({ assunto, feature }: { assunto: Assunto; feature: Feature | undefined }) {
  const t = useT()
  const evento = assunto.aviso
  const atencao = assunto.pedeAtencao
  // O aviso existiu, mas o ciclo fechou. O cartão precisa dizer isso — senão
  // não dá para distinguir "resolvido" de "ninguém nunca olhou".
  const fechado = !atencao && (assunto.respondido || !!evento.resolvido)

  // Sem selo nenhum não sobra uma fileira vazia cobrando 16px de respiro. Se os
  // dois espaços fossem iguais nada agruparia; se um deles não tiver conteúdo,
  // pior ainda — vira buraco no meio do cartão.
  if (!feature && !atencao && !fechado && assunto.respostas.length === 0) return null

  return (
    /* `item` (8) e não `card` (16): os selos pertencem à manchete, são a mesma
       ideia. O 16 fica reservado para o respiro DENTRO do cartão — se os dois
       fossem iguais, o cartão viraria três linhas soltas em vez de um bloco. */
    <div className="mt-item gap-item flex flex-wrap items-center">
      {feature?.working && <WorkingChip desde={feature.workingSince} />}
      {feature && <StateChip state={feature.state} />}
      {feature?.unsaved && <UnsavedChip quantos={feature.unsavedCount} />}
      {atencao && (
        /* 11px é o piso da escala, e é onde os selos vizinhos (estado, mexendo,
           não salvo) já vivem — este acompanha a fileira em vez de destoar. */
        <span
          className="gap-hair inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-medium"
          style={{
            color: 'var(--color-danger)',
            background: 'color-mix(in oklab, var(--color-danger) 13%, transparent)',
          }}
        >
          <AlertTriangle size={11} />
          {/*
            A diferença que o rótulo precisa carregar: "precisa da sua
            atenção" é o aviso ainda aberto; "respondido — falta você
            decidir" é a IA tendo respondido E levantado um ponto novo.
            Enquanto os dois diziam a mesma coisa, trabalho feito parecia
            trabalho ignorado, e a pessoa concluía que o painel não viu.
          */}
          {assunto.aguardando ? t('feed.aguardando') : t('feed.precisaAtencao')}
        </span>
      )}
      {fechado && <SeloFechado evento={evento} />}
      {assunto.respostas.length > 0 && (
        <span className="gap-hair inline-flex items-center text-[11px] text-[var(--color-ink-3)]">
          <CornerUpLeft size={11} />
          {assunto.respostas.length === 1
            ? t('feed.resposta')
            : t('feed.respostas', { n: assunto.respostas.length })}
        </span>
      )}
    </div>
  )
}

function Cartao({
  assunto,
  feature,
  aberto,
  comTrilho,
  onToggle,
  onAbrirArquivo,
  onPerguntar,
  onMudou,
  delay,
}: {
  assunto: Assunto
  feature: Feature | undefined
  aberto: boolean
  comTrilho: boolean
  onToggle: () => void
  onAbrirArquivo: (caminho: string) => void
  onPerguntar: (evento: WtfEvent) => void
  onMudou?: () => void
  delay: number
}) {
  const evento = assunto.aviso
  const h = evento.human
  const Icone = ICONE[evento.type]
  const atencao = assunto.pedeAtencao
  const cor = atencao ? 'var(--color-danger)' : 'var(--color-ink-3)'
  // Com trilho, o cartão não abre: ele fica ESCOLHIDO, e o detalhe aparece do
  // lado. Sem a marca de escolha, o clique pareceria não ter feito nada.
  const escolhido = aberto && comTrilho

  return (
    /* POR QUÊ `pb-item` (8) e não 16: 16 é o respiro DENTRO do cartão. Se o
       espaço entre dois cartões fosse igual ao de dentro de um, o dia inteiro
       viraria uma lista uniforme sem começo nem fim. */
    <li className="animate-in-up pb-item relative pl-9" style={{ animationDelay: `${delay}s` }}>
      {/* marcador na linha */}
      <span
        className="absolute top-[17px] left-0 grid h-[15px] w-[15px] place-items-center rounded-full border"
        style={{ borderColor: cor, background: 'var(--color-paper)', color: cor }}
      >
        <Icone size={8.5} strokeWidth={2.6} />
      </span>

      <article
        className="card relative overflow-hidden transition-[border-color,box-shadow] duration-200"
        style={{
          /* A borda e a sombra respondem SÓ ao significado. Antes elas também
             mudavam quando o cartão era escolhido — e no cartão que pede
             atenção a borda de escolha era sobrescrita pela de alerta, de modo
             que sobrava o fundo tingido como única marca de escolha. Justamente
             a marca que ninguém conseguia atribuir a uma causa. */
          borderColor: atencao
            ? 'color-mix(in oklab, var(--color-danger) 42%, transparent)'
            : undefined,
          boxShadow: atencao
            ? '0 1px 0 0 color-mix(in oklab, var(--color-danger) 14%, transparent)'
            : undefined,
        }}
      >
        {/* O filete de ancoragem. Fica à DIREITA, e não à esquerda, por dois
            motivos: à esquerda ele encostaria no fio e no marcador da linha do
            tempo e seria lido como enfeite da linha, não como escolha; à
            direita ele aponta para o trilho, que é para onde o detalhe foi.
            Tinta neutra (`accent` é o marrom-tinta de interação deste sistema,
            não uma matiz de sinal) e canal próprio: forma e posição. Um
            daltônico não precisa enxergar cor nenhuma para ver que esta barra
            existe e as outras não. */}
        {escolhido && (
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 w-[3px]"
            style={{ background: 'var(--color-accent)' }}
          />
        )}

        <button
          onClick={onToggle}
          className="no-drag p-card block w-full text-left"
          aria-expanded={aberto}
          aria-controls={comTrilho ? 'trilho-detalhe' : undefined}
        >
          <div className="gap-item flex items-start">
            <div className="min-w-0 flex-1">
              <LinhaMeta evento={evento} feature={feature} />
            </div>
            {/* Para baixo quando o detalhe abre aqui; para o lado quando ele
                abre no trilho. A seta aponta para onde a informação vai nascer. */}
            {comTrilho ? (
              <ChevronRight
                size={15}
                className="mt-hair shrink-0 text-[var(--color-ink-3)] transition-opacity duration-200"
                style={{ opacity: escolhido ? 1 : 0.35 }}
              />
            ) : (
              <ChevronDown
                size={15}
                className="mt-hair shrink-0 text-[var(--color-ink-3)] transition-transform duration-300"
                style={{ transform: aberto ? 'rotate(180deg)' : undefined }}
              />
            )}
          </div>

          {/* NÍVEL 1 — a manchete.
              POR QUÊ sem `leading-snug`: a entrelinha vinha escrita ao lado do
              tamanho e brigava com o degrau. `text-title` já traz 19px, peso
              500 e entrelinha 1,25 — manchete curta; é o corpo (`text-lead`,
              1,5) que quer respiro, não ela. */}
          <h3 className="font-display text-title mt-item text-balance">{h?.headline}</h3>

          <Selos assunto={assunto} feature={feature} />
        </button>

        {/* Sem trilho, o detalhe volta a abrir aqui dentro, como sempre foi. */}
        {aberto && h && !comTrilho && (
          <Detalhes
            assunto={assunto}
            evento={evento}
            feature={feature}
            onAbrirArquivo={onAbrirArquivo}
            onPerguntar={onPerguntar}
            onMudou={onMudou}
          />
        )}
      </article>
    </li>
  )
}

/**
 * O código do aviso — e o clique que faltava.
 *
 * Ele existe para ser CITADO: é dizendo "confere o XVFT" que a pessoa amarra o
 * pedido a este cartão, e é citando o mesmo código que a IA fecha o ciclo. Só
 * que o código ficava ali como enfeite, e copiá-lo exigia selecionar quatro
 * caracteres de 10px com o mouse. Agora um clique copia.
 *
 * `stopPropagation` porque ele mora dentro do botão que abre o cartão: sem
 * isso, copiar abriria e fecharia o cartão junto — dois efeitos para um clique
 * é a definição de interface que age sozinha.
 */
function CodigoCopiavel({ codigo }: { codigo: string }) {
  const t = useT()
  const [copiado, setCopiado] = useState(false)

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        void navigator.clipboard.writeText(codigo).then(() => {
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        })
      }}
      title={t('feed.codigoDica')}
      /* POR QUÊ subiu de 10,5px para o piso de 11px (`text-micro`): é o texto
         que a pessoa vai LER em voz alta para a IA. Abaixo de 11px ela não lê,
         adivinha — e um código adivinhado errado não fecha ciclo nenhum. */
      className="no-drag text-micro cursor-pointer rounded border px-1.5 py-px font-mono transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
    >
      {copiado ? t('feed.copiado') : codigo}
    </span>
  )
}

/**
 * O selo que ocupa o lugar do "Precisa da sua atenção" quando o ciclo fechou.
 * Discreto de propósito: não é uma comemoração, é só o alerta parando de cobrar.
 */
function SeloFechado({ evento }: { evento: WtfEvent }) {
  const t = useT()
  const pelaIA = !!evento.respondidoPor
  const quando = evento.respondidoPor?.at ?? evento.resolvido?.at

  return (
    <span
      className="gap-hair inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-medium"
      style={{
        color: 'var(--color-ink-2)',
        background: 'color-mix(in oklab, var(--color-tested) 12%, transparent)',
      }}
    >
      {pelaIA ? <CheckCircle2 size={11} /> : <Check size={11} />}
      {pelaIA ? t('feed.respondidoIA') : t('feed.resolvidoVoce')}
      {quando && (
        <span style={{ color: 'var(--color-ink-3)' }}>
          ·{' '}
          {t('feed.diaHora', {
            dia: diaRelativo(quando).toLowerCase(),
            hora: horaDe(quando),
          })}
        </span>
      )}
    </span>
  )
}

/** Botão de fechar o ciclo à mão, para o aviso que a IA nunca vai responder. */
function BotaoResolver({ evento, onMudou }: { evento: WtfEvent; onMudou?: () => void }) {
  const t = useT()
  const [ocupado, setOcupado] = useState(false)
  const jaResolvido = !!evento.resolvido

  async function clicar() {
    setOcupado(true)
    try {
      await alternarResolvido(evento.id)
      onMudou?.()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <button
      type="button"
      onClick={clicar}
      disabled={ocupado}
      className="no-drag mt-card gap-hair text-meta inline-flex cursor-default items-center rounded-full border px-3 py-1.5 transition-colors disabled:opacity-50"
      style={{ color: 'var(--color-ink-2)' }}
    >
      {jaResolvido ? <RotateCcw size={13} /> : <Check size={13} />}
      {jaResolvido ? t('feed.reabrir') : t('feed.marcarResolvido')}
    </button>
  )
}

/** NÍVEL 2 — o que mudou, por quê, e o que isso afeta. */
function Detalhes({
  assunto,
  evento,
  feature,
  onAbrirArquivo,
  onPerguntar,
  onMudou,
}: {
  assunto: Assunto
  feature?: Feature
  evento: WtfEvent
  onAbrirArquivo: (caminho: string) => void
  onPerguntar: (evento: WtfEvent) => void
  onMudou?: () => void
}) {
  const t = useT()
  const h = evento.human!
  const tec = evento.technical
  const atencao = assunto.pedeAtencao
  const resp = evento.respondidoPor

  return (
    <div className="animate-in-up p-card border-t">
      {/* Perguntar sobre ESTA mudança, com as próprias palavras. Discreto: é
          uma saída para quem ficou com dúvida, não o assunto do cartão. */}
      {podePerguntar() && (
        <div className="mb-card flex justify-end">
          <button
            type="button"
            onClick={() => onPerguntar(evento)}
            title={t('pergunta.abrir')}
            className="no-drag gap-hair text-meta inline-flex cursor-default items-center rounded-full px-2 py-1 text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink-2)]"
          >
            <Lightbulb size={12.5} />
            {t('pergunta.abrir')}
          </button>
        </div>
      )}

      {/* Este cartão é a resposta de outro aviso — dá para voltar lá pelo código. */}
      {evento.respondeA && (
        <p className="mb-card gap-hair text-meta inline-flex items-center text-[var(--color-ink-3)]">
          <CornerUpLeft size={13} className="shrink-0" />
          {t('feed.respondeAo')}{' '}
          <span className="text-micro rounded border px-1.5 py-px font-mono">
            {evento.respondeA}
          </span>
        </p>
      )}

      {/* POR QUÊ todo parágrafo daqui para baixo é `text-lead`: eram quatro
          tamanhos (14,5 / 14 / 13,5 / 13px) para o mesmo papel — o texto que a
          pessoa lê para entender o que a IA fez. */}
      <p className="text-lead text-pretty text-[var(--color-ink)]">{h.what}</p>
      <Bloco titulo={t('feed.porque')}>{h.why}</Bloco>
      <Bloco titulo={t('feed.paraVoce')}>{h.impact}</Bloco>

      {h.affects.length > 0 && (
        <div className="mt-card gap-hair flex flex-wrap">
          {h.affects.map((a) => (
            <span
              key={a}
              className="text-meta rounded-md border px-2 py-[3px] text-[var(--color-ink-2)]"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {/* A resposta da IA, no próprio aviso. É o que fecha o ciclo aos olhos
          de quem lê: o alerta e o desfecho no mesmo lugar. */}
      {resp && (
        <div
          className="mt-card gap-item p-card flex rounded-lg border"
          style={{
            borderColor: 'color-mix(in oklab, var(--color-tested) 38%, transparent)',
            background: 'color-mix(in oklab, var(--color-tested) 8%, transparent)',
          }}
        >
          <CheckCircle2
            size={15}
            className="mt-[3px] shrink-0"
            style={{ color: 'var(--color-tested)' }}
          />
          <div className="min-w-0">
            <Rotulo>
              {t('feed.respondidoIAEm', {
                dia: diaRelativo(resp.at).toLowerCase(),
                hora: horaDe(resp.at),
              })}
            </Rotulo>
            <p className="mt-hair text-lead text-[var(--color-ink)]">{resp.texto}</p>
          </div>
        </div>
      )}

      {atencao && h.attentionReason && (
        <div
          className="mt-card gap-item p-card flex rounded-lg border"
          style={{
            borderColor: 'color-mix(in oklab, var(--color-danger) 38%, transparent)',
            background: 'color-mix(in oklab, var(--color-danger) 8%, transparent)',
          }}
        >
          <AlertTriangle
            size={15}
            className="mt-[3px] shrink-0"
            style={{ color: 'var(--color-danger)' }}
          />
          <p className="text-lead text-[var(--color-ink)]">{h.attentionReason}</p>
        </div>
      )}

      {/* Diagnóstico sem saída é só ansiedade: todo alerta oferece uma ação. */}
      {/* O que fazer vem da ÚLTIMA resposta — é ela que contém o que ficou
          pendente —, mas citando o código do aviso que abriu o assunto, para a
          próxima resposta da IA cair aqui e não abrir conversa nova. */}
      {atencao && (
        <OQueFazer
          acoes={acoesDoEvento(assunto.ultimo, feature, codigoCurto(assunto.aviso.id))}
        />
      )}

      {/* A segunda forma de fechar: a IA nunca vai responder tudo, e a pessoa
          precisa poder dizer "já vi, pode parar de me cobrar". */}
      {h.needsYourAttention && !evento.respondidoPor && podeResolver() && (
        <BotaoResolver evento={evento} onMudou={onMudou} />
      )}

      {/* o que o agente realmente disse — guardado como dito */}
      {evento.claim && (
        <details className="group mt-card">
          <summary className="no-drag gap-hair text-meta inline-flex cursor-default list-none items-center text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
            <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
            {t('feed.oQueIADisse')}
          </summary>
          <blockquote
            className="mt-item text-lead border-l-2 py-1 pl-3 text-[var(--color-ink-2)] italic"
            style={{ borderColor: 'var(--color-rule)' }}
          >
            {evento.claim}
          </blockquote>
        </details>
      )}

      {/* como o WTF chegou nessa conclusão */}
      <details className="group mt-item">
        <summary className="no-drag gap-hair text-meta inline-flex cursor-default list-none items-center text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
          <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
          {t('feed.comoSabe')}
        </summary>
        <ul className="mt-item space-y-item">
          {evento.evidence.map((ev) => (
            <li key={ev.id} className="gap-item text-lead flex items-start">
              <span
                className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    ev.confidence >= 0.8
                      ? 'var(--color-tested)'
                      : ev.confidence >= 0.5
                        ? 'var(--color-implemented)'
                        : 'var(--color-planned)',
                }}
              />
              <span className="text-[var(--color-ink-2)]">{ev.detail}</span>
            </li>
          ))}
        </ul>
      </details>

      {/* NÍVEL 3 — técnico */}
      {tec && (
        <details className="group mt-item">
          <summary className="no-drag gap-hair text-meta inline-flex cursor-default list-none items-center text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
            <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
            {t('feed.verTecnico')}
          </summary>

          <div className="mt-item p-card rounded-lg border">
            <div className="text-meta flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
              <span className="text-[var(--color-ink-2)]">
                {tec.filesChanged === 1
                  ? t('geral.arquivo')
                  : t('geral.arquivos', { n: tec.filesChanged })}
              </span>
              <span style={{ color: 'var(--color-tested)' }}>+{tec.insertions}</span>
              <span style={{ color: 'var(--color-danger)' }}>−{tec.deletions}</span>
            </div>

            <ul className="mt-item text-meta space-y-0.5 font-mono text-[var(--color-ink-3)]">
              {tec.files.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    onClick={() => onAbrirArquivo(f)}
                    title={t('feed.abrirArquivo')}
                    className="no-drag gap-hair flex w-full cursor-pointer items-center rounded px-1 py-[1px] text-left underline decoration-dotted underline-offset-[3px] transition-colors hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]"
                    style={{ textDecorationColor: 'var(--color-rule)' }}
                  >
                    <FileText size={11} className="shrink-0" />
                    <span className="truncate">{f}</span>
                  </button>
                </li>
              ))}
            </ul>

            {(tec.dependenciesAdded.length > 0 || tec.dependenciesRemoved.length > 0) && (
              <ul className="mt-item text-meta space-y-0.5 font-mono">
                {tec.dependenciesAdded.map((d) => (
                  <li
                    key={d}
                    className="gap-hair flex items-center"
                    style={{ color: 'var(--color-tested)' }}
                  >
                    <PackagePlus size={11} className="shrink-0" />
                    {d}
                  </li>
                ))}
                {tec.dependenciesRemoved.map((d) => (
                  <li
                    key={d}
                    className="gap-hair flex items-center"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <PackageMinus size={11} className="shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            )}

            {/* NÍVEL 4 — o código cru */}
            {tec.patch && (
              <details className="group/code mt-card">
                <summary className="no-drag text-meta cursor-default list-none text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
                  {t('feed.verCodigo')}
                </summary>
                <pre className="mt-item text-meta max-h-72 overflow-auto rounded-md border bg-[var(--color-paper-3)] p-3 font-mono">
                  {tec.patch.split('\n').map((linha, i) => (
                    <div
                      key={i}
                      style={{
                        color: linha.startsWith('+')
                          ? 'var(--color-tested)'
                          : linha.startsWith('-')
                            ? 'var(--color-danger)'
                            : linha.startsWith('@@')
                              ? 'var(--color-implemented)'
                              : 'var(--color-ink-3)',
                      }}
                    >
                      {linha || ' '}
                    </div>
                  ))}
                </pre>
              </details>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-card first:mt-0">
      <Rotulo>{titulo}</Rotulo>
      <p className="mt-hair text-lead text-pretty text-[var(--color-ink)]">{children}</p>
    </div>
  )
}

/**
 * POR QUÊ virou `.label`: POR QUÊ / PARA VOCÊ / O QUE FAZER estavam a 10,5px
 * com 0,14em de espacejamento. O piso da escala agora é 11px, e o rótulo
 * compensa o tamanho pequeno com peso (600) em vez de caixa alta esticada.
 */
function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="label text-[var(--color-ink-3)]">{children}</span>
}
