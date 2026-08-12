import { useEffect, useState } from 'react'
import { RefreshCw, Share2, SquareTerminal } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { abrirTerminal, podeAbrirTerminal } from '@/lib/source'
import { Compartilhar } from '@/components/Compartilhar'

/**
 * Ações da janela, no canto superior direito.
 *
 * "Atualizar" é redundante por design: o painel já se atualiza sozinho quando o
 * projeto muda. O botão existe porque, para quem não programa, ver um botão de
 * atualizar é a diferença entre confiar no painel e desconfiar dele.
 */
export function BarraTopo({
  atualizando,
  atualizadoEm,
  onAtualizar,
}: {
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

  async function aoAbrirTerminal() {
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
    <div className="no-drag absolute top-2 right-5 z-30 flex items-center gap-2">
      {aviso && (
        <span
          className="animate-in-up max-w-[300px] truncate rounded-full border bg-[var(--color-paper-2)] px-3 py-1.5 text-[12px] text-[var(--color-ink-2)]"
          title={aviso}
        >
          {aviso}
        </span>
      )}

      <span className="mr-0.5 text-[11.5px] text-[var(--color-ink-3)]">
        {t('topo.atualizado', { quando })}
      </span>

      <Botao
        titulo={t('topo.atualizar')}
        onClick={onAtualizar}
        aria-label={t('topo.atualizarRotulo')}
      >
        <RefreshCw
          size={14.5}
          className={atualizando ? 'animate-spin' : undefined}
          strokeWidth={2}
        />
      </Botao>

      <Botao
        titulo={t('compartilhar.titulo')}
        onClick={() => setCompartilhando((v) => !v)}
        aria-label={t('compartilhar.abrir')}
      >
        <Share2 size={14.5} strokeWidth={2} />
      </Botao>

      {podeAbrirTerminal() && (
        <Botao
          titulo={t('topo.trabalharDica')}
          onClick={aoAbrirTerminal}
          destaque
        >
          <SquareTerminal size={14.5} strokeWidth={2} />
          <span className="text-[12.5px] font-medium">{t('topo.trabalhar')}</span>
        </Botao>
      )}

      {compartilhando && <Compartilhar onFechar={() => setCompartilhando(false)} />}
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
  onClick: () => void
  destaque?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      title={titulo}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition-colors"
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
