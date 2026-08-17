import { useState } from 'react'
import {
  Check,
  CheckCheck,
  Copy,
  Lightbulb,
  List,
  MessageSquare,
  Save,
  SquareArrowOutUpRight,
  SquareTerminal,
  Wrench,
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import {
  abrirTerminal,
  pedirTerminal,
  podeAbrirTerminal,
  podeTerminalEmbutido,
} from '@/lib/source'
import type { Acao } from '@/lib/acoes'

/**
 * A saída para um alerta.
 *
 * Com o terminal do app aberto, a mensagem é ENTREGUE à sessão que já está
 * rodando: ela entra na fila do agente e é lida quando ele terminar o turno.
 * Antes isto era impossível — a IA morava numa janela de fora, e "copiar" era
 * o único caminho até ela. Copiar continua existindo, porque quem trabalha com
 * a sessão fora do app precisa dele, mas deixou de ser o caminho principal.
 */
/** O desenho do rótulo de cada ação. Ver o botão abaixo. */
const ICONES = {
  wrench: Wrench,
  lightbulb: Lightbulb,
  'check-check': CheckCheck,
  save: Save,
  list: List,
} as const

export function OQueFazer({ acoes }: { acoes: Acao[] }) {
  const t = useT()
  const [escolhida, setEscolhida] = useState<Acao | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  if (acoes.length === 0) return null

  async function copiar(a: Acao) {
    try {
      await navigator.clipboard.writeText(a.mensagem)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setAviso(t('acao.naoCopiou'))
    }
  }

  /**
   * O caminho principal: a IA abre no terminal DENTRO do app, sem trocar de
   * janela. Quem prefere a janela nativa tem o botão discreto ao lado.
   */
  function abrirAqui(a: Acao) {
    pedirTerminal(a.mensagem)
    setAviso(t('acao.abriuAqui', { agente: t('acao.aIA') }))
  }


  async function abrirNoSistema(a: Acao) {
    const r = await abrirTerminal(a.mensagem)
    if (r?.erro) setAviso(r.erro)
    else setAviso(t('acao.abriuComMensagem', { agente: r?.agente ?? t('acao.aIA') }))
  }

  return (
    <div className="mt-4 border-t pt-3.5">
      <p className="text-[10.5px] tracking-[0.14em] text-[var(--color-ink-3)] uppercase">
        {t('acao.oQueFazer')}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {acoes.map((a) => {
          const ativa = escolhida?.id === a.id
          const Icone = a.icone ? ICONES[a.icone] : null
          return (
            <button
              key={a.id}
              type="button"
              title={t(a.chaveNota)}
              aria-pressed={ativa}
              onClick={() => {
                setEscolhida(ativa ? null : a)
                setCopiado(false)
                setAviso(null)
              }}
              /*
               * Rótulo com ícone, sem contorno: quatro pílulas contornadas em
               * carmim disputavam a atenção com o alerta logo acima, e o que
               * pede decisão é o alerta, não a lista de saídas.
               *
               * A escolhida ganha CAMPO de cor em vez de borda — é ela que
               * abre o texto abaixo, e o campo liga as duas coisas.
               */
              className="no-drag gap-hair text-meta inline-flex cursor-default items-center rounded-full px-2.5 py-1.5 transition-colors"
              style={
                ativa
                  ? {
                      background: 'color-mix(in oklab, var(--color-accent) 12%, transparent)',
                      color: 'var(--color-accent)',
                    }
                  : { color: 'var(--color-ink-2)' }
              }
              onMouseEnter={(e) => {
                if (!ativa) e.currentTarget.style.background = 'var(--color-paper-3)'
              }}
              onMouseLeave={(e) => {
                if (!ativa) e.currentTarget.style.background = 'transparent'
              }}
            >
              {Icone && <Icone size={12.5} className="shrink-0" />}
              {t(a.chaveRotulo)}
            </button>
          )
        })}
      </div>

      {escolhida && (
        <div className="animate-in-up mt-3">
          <p className="text-[12.5px] leading-snug text-[var(--color-ink-2)]">
            {t(escolhida.chaveNota)}
          </p>

          {/* A mensagem fica visível: a pessoa precisa poder ler o que vai
              mandar em seu nome antes de mandar. */}
          <pre className="mt-2 max-h-52 overflow-auto rounded-lg border bg-[var(--color-paper-3)] p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
            {escolhida.mensagem}
          </pre>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {podeTerminalEmbutido() && (
              <button
                onClick={() => abrirAqui(escolhida)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
                style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}
              >
                <SquareTerminal size={13} />
                {t('acao.abrirIA')}
              </button>
            )}

            {podeAbrirTerminal() && (
              <button
                onClick={() => abrirNoSistema(escolhida)}
                title={t('acao.abrirNoSistema')}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
              >
                <SquareArrowOutUpRight size={13} />
                {t('acao.abrirNoSistema')}
              </button>
            )}

            <button
              onClick={() => copiar(escolhida)}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
            >
              {copiado ? <Check size={13} /> : <Copy size={13} />}
              {copiado ? t('acao.copiado') : t('acao.copiar')}
            </button>

            <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--color-ink-3)]">
              <MessageSquare size={11} />
              {t('acao.colar')}
            </span>
          </div>

          {aviso && (
            <p className="mt-2 text-[12px] text-[var(--color-ink-3)]">{aviso}</p>
          )}
        </div>
      )}
    </div>
  )
}
