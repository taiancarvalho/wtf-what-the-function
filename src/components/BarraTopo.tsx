import { useEffect, useState } from 'react'
import { RefreshCw, Share2, SquareTerminal } from 'lucide-react'
import { useT } from '@/lib/i18n'
import {
  abrirTerminal,
  pedirTerminal,
  podeAbrirTerminal,
  podeTerminalEmbutido,
} from '@/lib/source'
import { Compartilhar } from '@/components/Compartilhar'

/**
 * A faixa do topo: onde você está, à esquerda; o que dá para fazer, à direita.
 *
 * POR QUÊ ela deixou de ser só um canto: eram 46px de altura atravessando
 * 1253px de largura com três botões grudados na direita — 84% de faixa vazia,
 * igual em todas as nove abas. A faixa equivalente do Linear é usada de ponta
 * a ponta, com o nome do que se está vendo à esquerda e o contador vivo. Aqui
 * ela recebeu três coisas, nessa ordem de leitura: o nome da seção, a frase que
 * explica para que ela serve (a mesma legenda que saiu de baixo dos 9 itens do
 * menu) e o número que importa nesta tela — "Acontecendo · o que a IA mexeu ·
 * 12 mudanças".
 *
 * A faixa inteira continua sendo a alça de arrastar a janela; só os botões
 * repõem `no-drag`.
 *
 * "Atualizar" é redundante por design: o painel já se atualiza sozinho quando o
 * projeto muda. O botão existe porque, para quem não programa, ver um botão de
 * atualizar é a diferença entre confiar no painel e desconfiar dele.
 */
export function BarraTopo({
  secao,
  nota,
  contagem,
  atualizando,
  atualizadoEm,
  onAtualizar,
}: {
  /** Nome da aba aberta, já traduzido. */
  secao: string
  /** A frase de uma linha que diz para que essa aba serve. */
  nota: string
  /** O número vivo da seção. `null` quando a seção não tem número nenhum. */
  contagem: string | null
  atualizando: boolean
  atualizadoEm: number
  onAtualizar: () => void
}) {
  const t = useT()
  const [aviso, setAviso] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const [compartilhando, setCompartilhando] = useState(false)

  // relógio só para o "há X" não congelar
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  /*
   * "Trabalhar" abre a IA DENTRO do app.
   *
   * Este botão nasceu antes do terminal embutido e continuou abrindo o
   * terminal do sistema mesmo depois dele existir — o app ganhou um shell
   * próprio e o botão principal seguia mandando a pessoa para fora.
   * Segurando Alt/Option, abre no terminal do sistema, para quem prefere.
   */
  async function aoAbrirTerminal(evento?: { altKey?: boolean }) {
    if (podeTerminalEmbutido() && !evento?.altKey) {
      pedirTerminal()
      return
    }
    const r = await abrirTerminal()
    if (r?.erro) setAviso(r.erro)
    else if (r?.agente) setAviso(t('topo.agenteAbriu', { agente: r.agente }))
    else setAviso(t('topo.terminalAberto'))
  }

  const segundos = Math.floor((agora - atualizadoEm) / 1000)
  const quando =
    segundos < 20
      ? t('topo.agora')
      : segundos < 90
        ? t('topo.hum')
        : t('topo.minutos', { n: Math.floor(segundos / 60) })

  return (
    <div className="gap-card flex h-full items-center px-5">
      {/*
        Onde você está. Um só tamanho para as três informações — o degrau de
        metadado (13px) —, separadas por tinta: o nome em tinta cheia, a
        explicação em tinta quieta, o número de volta na tinta de leitura,
        porque é ele que muda sozinho enquanto a pessoa olha.

        Nada aqui é alerta, então nada aqui usa a cor de alerta: um contador
        não é um aviso, e pintá-lo de carmim faria toda tela parecer um
        problema.
      */}
      <p className="gap-item text-meta flex min-w-0 flex-1 items-baseline truncate">
        <span className="shrink-0 font-medium text-[var(--color-ink)]">{secao}</span>
        {nota && (
          <span className="min-w-0 truncate text-[var(--color-ink-3)]">
            <span aria-hidden className="mr-item">
              ·
            </span>
            {nota}
          </span>
        )}
        {contagem && (
          <span className="shrink-0 text-[var(--color-ink-2)]">
            <span aria-hidden className="mr-item text-[var(--color-ink-3)]">
              ·
            </span>
            {contagem}
          </span>
        )}
      </p>

      {/* As ações. `relative` porque o painel de compartilhar se pendura na
          borda direita deste grupo, e `no-drag` porque tudo aqui é clicável —
          o resto da faixa continua arrastando a janela. */}
      <div className="no-drag gap-item relative z-30 flex shrink-0 items-center">
        {aviso && (
          <span
            className="animate-in-up text-meta max-w-[300px] truncate rounded-full border bg-[var(--color-paper-2)] px-3 py-1.5 text-[var(--color-ink-2)]"
            title={aviso}
          >
            {aviso}
          </span>
        )}

        <span className="text-meta mr-hair text-[var(--color-ink-3)]">
          {t('topo.atualizado', { quando })}
        </span>

        <Botao
          titulo={t('topo.atualizar')}
          onClick={onAtualizar}
          aria-label={t('topo.atualizarRotulo')}
        >
          <RefreshCw
            size={15}
            className={atualizando ? 'animate-spin' : undefined}
            strokeWidth={2}
          />
        </Botao>

        <Botao
          titulo={t('compartilhar.titulo')}
          onClick={() => setCompartilhando((v) => !v)}
          aria-label={t('compartilhar.abrir')}
        >
          <Share2 size={15} strokeWidth={2} />
        </Botao>

        {podeAbrirTerminal() && (
          <Botao
            titulo={t('topo.trabalharDica')}
            onClick={(e) => void aoAbrirTerminal(e)}
            destaque
          >
            <SquareTerminal size={15} strokeWidth={2} />
            <span className="text-meta font-medium">{t('topo.trabalhar')}</span>
          </Botao>
        )}

        {compartilhando && <Compartilhar onFechar={() => setCompartilhando(false)} />}
      </div>
    </div>
  )
}

function Botao({
  children,
  titulo,
  onClick,
  destaque,
}: {
  children: React.ReactNode
  titulo: string
  onClick: (evento: React.MouseEvent) => void
  destaque?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      title={titulo}
      onClick={onClick}
      className="no-drag gap-hair flex items-center rounded-full border px-2.5 py-1.5 transition-colors"
      style={
        destaque
          ? {
              borderColor: 'color-mix(in oklab, var(--color-accent) 40%, transparent)',
              background: 'color-mix(in oklab, var(--color-accent) 11%, transparent)',
              color: 'var(--color-accent)',
            }
          : {
              background: 'color-mix(in oklab, var(--color-paper-2) 80%, transparent)',
              color: 'var(--color-ink-2)',
            }
      }
    >
      {children}
    </button>
  )
}
