import { useCallback, useEffect, useRef, useState } from 'react'
import { SquareArrowOutUpRight, X } from 'lucide-react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useT } from '@/lib/i18n'
import {
  abrirTerminal,
  aoSairDoTerminal,
  aoTerminarTerminal,
  terminalAbrir,
  terminalEncerrar,
  terminalEscrever,
  terminalRedimensionar,
} from '@/lib/source'

const ALTURA_PADRAO = 320
const ALTURA_MIN = 140

/** Lê uma cor do sistema visual do app. O terminal não inventa paleta própria. */
function token(nome: string, alternativa: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim()
  return v || alternativa
}

/**
 * O tema do xterm, montado a partir dos tokens do app.
 *
 * Um terminal com fundo preto dentro de um app cor de papel parece um buraco
 * na tela. As cores ANSI ficam: são elas que o programa lá dentro escolhe, e
 * repintá-las seria mentir sobre a saída. O que vem do app é a moldura —
 * fundo, tinta, cursor e seleção.
 */
function temaDoApp() {
  return {
    background: token('--color-paper-2', '#efe9dc'),
    foreground: token('--color-ink', '#1c1917'),
    cursor: token('--color-accent', '#a2522a'),
    cursorAccent: token('--color-paper-2', '#efe9dc'),
    selectionBackground: token('--color-accent-soft', '#e8d3c4'),
  }
}

/**
 * O shell dentro do app — como no VS Code.
 *
 * O pseudo-terminal roda no processo principal (o preload é sandboxed); aqui
 * só entram e saem bytes. Nada de sequestrar teclas: `Ctrl+C`, setas e tudo
 * mais vão direto para o processo, que é o ponto de ter um terminal de verdade
 * em vez de uma caixinha que finge ser um.
 */
export function TerminalEmbutido({
  projeto,
  mensagem,
  onFechar,
}: {
  projeto: string
  mensagem?: string
  onFechar: () => void
}) {
  const t = useT()
  const caixa = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const idRef = useRef<string | null>(null)
  /** O último tamanho JÁ aplicado. Ver o porquê em `ajustar`. */
  const ultimoTamanho = useRef({ cols: 0, rows: 0 })
  const [altura, setAltura] = useState(ALTURA_PADRAO)
  const [aviso, setAviso] = useState<string | null>(null)

  /**
   * Recalcula colunas e linhas e avisa o shell.
   *
   * Duas travas, e as duas foram pagas com janela congelada:
   *
   *  1. a medida é conferida antes de ser usada — com a caixa ainda sem
   *     tamanho, a proposta vem absurda, e um terminal de dez mil colunas
   *     trava tudo;
   *  2. tamanho igual ao último NÃO é reaplicado. Redimensionar faz o programa
   *     lá dentro redesenhar a tela inteira, o redesenho mexe no layout, e o
   *     observador dispara de novo: sem esta comparação, os dois processos
   *     ficam girando a 100% de CPU para sempre.
   */
  const ajustar = useCallback(() => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit) return
    const proposta = fit.proposeDimensions()
    if (
      !proposta ||
      !Number.isFinite(proposta.cols) ||
      !Number.isFinite(proposta.rows) ||
      proposta.cols < 2 ||
      proposta.rows < 2 ||
      proposta.cols > 500 ||
      proposta.rows > 200
    ) {
      return
    }
    if (proposta.cols === ultimoTamanho.current.cols && proposta.rows === ultimoTamanho.current.rows) {
      return
    }
    ultimoTamanho.current = { cols: proposta.cols, rows: proposta.rows }
    term.resize(proposta.cols, proposta.rows)
    if (idRef.current) void terminalRedimensionar(idRef.current, term.cols, term.rows)
  }, [])

  // Monta o terminal e abre a sessão. Roda uma vez: a sessão é este painel.
  useEffect(() => {
    const alvo = caixa.current
    if (!alvo) return
    let vivo = true

    const term = new XTerm({
      /*
       * A fonte é escrita por extenso, e NÃO como `var(--font-mono)`.
       *
       * O xterm mede a largura do caractere num canvas, e o canvas não resolve
       * variável de CSS: a medida voltava zero, o `fit()` calculava um número
       * infinito de colunas e a janela inteira congelava. É a mesma família do
       * resto do app — só que num valor que o canvas entende.
       */
      fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
      fontSize: 12.5,
      lineHeight: 1.3,
      cursorBlink: true,
      allowProposedApi: true,
      theme: temaDoApp(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(alvo)
    termRef.current = term
    fitRef.current = fit
    ajustar()
    // Acessibilidade: quem abriu o terminal quer digitar nele, não caçar o foco.
    term.focus()

    term.onData((dados) => {
      if (idRef.current) void terminalEscrever(idRef.current, dados)
    })

    const pararSaida = aoSairDoTerminal(({ id, dados }) => {
      if (id === idRef.current) term.write(dados)
    })
    const pararFim = aoTerminarTerminal(({ id }) => {
      if (id !== idRef.current) return
      idRef.current = null
      term.write(`\r\n\x1b[2m${t('terminal.encerrado')}\x1b[0m\r\n`)
    })

    void terminalAbrir({
      mensagem,
      cols: term.cols,
      rows: term.rows,
    }).then((s) => {
      if (!vivo) {
        // O painel fechou antes de a sessão nascer: não deixa processo solto.
        if (s.id) void terminalEncerrar(s.id)
        return
      }
      if (s.erro || !s.id) {
        setAviso(s.erro ?? t('terminal.naoAbriu'))
        return
      }
      idRef.current = s.id
    })

    return () => {
      vivo = false
      pararSaida()
      pararFim()
      if (idRef.current) void terminalEncerrar(idRef.current)
      idRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // `mensagem` e `t` são a foto do momento em que o painel abriu; reabrir a
    // sessão porque o idioma mudou seria matar o trabalho em andamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Janela ou painel mudou de tamanho → recalcula as colunas e avisa o shell.
  useEffect(() => {
    const alvo = caixa.current
    if (!alvo) return
    // Com atraso: durante um arrasto chegam dezenas de medidas por segundo, e
    // cada uma custaria um redesenho da tela inteira do programa lá dentro.
    let atraso: ReturnType<typeof setTimeout> | null = null
    const adiar = () => {
      if (atraso) clearTimeout(atraso)
      atraso = setTimeout(() => {
        atraso = null
        ajustar()
      }, 120)
    }
    const observer = new ResizeObserver(adiar)
    observer.observe(alvo)
    window.addEventListener('resize', adiar)
    return () => {
      if (atraso) clearTimeout(atraso)
      observer.disconnect()
      window.removeEventListener('resize', adiar)
    }
  }, [ajustar])

  // Claro ↔ escuro: o terminal acompanha o resto do app na hora.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const trocar = () => {
      if (termRef.current) termRef.current.options.theme = temaDoApp()
    }
    mq.addEventListener('change', trocar)
    return () => mq.removeEventListener('change', trocar)
  }, [])

  /** Arrastar a borda de cima muda a altura do painel. */
  function arrastar(ev: React.MouseEvent) {
    ev.preventDefault()
    const inicioY = ev.clientY
    const inicioAltura = altura
    const mover = (e: MouseEvent) => {
      const nova = inicioAltura + (inicioY - e.clientY)
      setAltura(Math.max(ALTURA_MIN, Math.min(window.innerHeight - 120, nova)))
    }
    const soltar = () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
      ajustar()
    }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
  }

  return (
    <section
      aria-label={t('terminal.regiao', { projeto })}
      className="no-drag flex shrink-0 flex-col border-t"
      style={{ height: altura, borderColor: 'var(--color-rule)', background: 'var(--color-paper-2)' }}
    >
      {/* a borda de cima é a alça: arrastar muda a altura */}
      <div
        onMouseDown={arrastar}
        role="separator"
        aria-orientation="horizontal"
        title={t('terminal.arrastar')}
        className="h-1.5 shrink-0"
        style={{ cursor: 'ns-resize' }}
      />

      <header
        className="flex items-center gap-2 px-4 pb-1.5"
        style={{ borderColor: 'var(--color-rule)' }}
      >
        <span className="text-[10.5px] tracking-[0.14em] text-[var(--color-ink-3)] uppercase">
          {t('terminal.titulo')}
        </span>
        <span className="truncate font-mono text-[11.5px] text-[var(--color-ink-2)]">
          {projeto}
        </span>

        <button
          onClick={() => void abrirTerminal(mensagem)}
          title={t('terminal.noSistema')}
          aria-label={t('terminal.noSistema')}
          className="ml-auto shrink-0 rounded-md p-1 text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]"
        >
          <SquareArrowOutUpRight size={14} />
        </button>
        <button
          onClick={onFechar}
          title={t('terminal.fechar')}
          aria-label={t('terminal.fechar')}
          className="shrink-0 rounded-md p-1 text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]"
        >
          <X size={15} />
        </button>
      </header>

      {aviso && (
        <p className="px-4 pb-1.5 text-[12px]" style={{ color: 'var(--color-warn)' }}>
          {aviso}
        </p>
      )}

      <div ref={caixa} className="min-h-0 flex-1 px-2 pb-2" />
    </section>
  )
}
