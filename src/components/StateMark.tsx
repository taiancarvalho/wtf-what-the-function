import { CloudOff, History } from 'lucide-react'
import { LOCALE, useIdioma, useT } from '@/lib/i18n'
import { STATE } from '@/lib/state'
import type { FeatureState } from '@/types/protocol'

/** O símbolo do estado. Igual em todas as telas — é o alfabeto do produto. */
export function StateMark({
  state,
  size = 'md',
}: {
  state: FeatureState
  size?: 'sm' | 'md'
}) {
  const t = useT()
  const meta = STATE[state]
  return (
    <span
      title={t('estado.comSentido', {
        estado: t(`estado.${state}`),
        sentido: t(`estado.${state}.sentido`),
      })}
      style={{ color: meta.color }}
      className={
        size === 'sm'
          ? 'inline-block w-4 shrink-0 text-center text-[11px] leading-none tracking-[-0.1em]'
          : 'inline-block w-6 shrink-0 text-center text-sm leading-none tracking-[-0.1em]'
      }
    >
      {meta.mark}
    </span>
  )
}

/**
 * "Mexendo agora" é um eixo diferente do estado.
 * Estado = o que foi provado. Este selo = o que está acontecendo neste momento.
 */
export function WorkingChip({ desde }: { desde?: string }) {
  const t = useT()
  const idioma = useIdioma()
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium"
      style={{
        color: 'var(--color-building)',
        background: 'color-mix(in oklab, var(--color-building) 14%, transparent)',
      }}
      title={
        desde
          ? t('marca.mexendoDesde', {
              quando: new Date(desde).toLocaleString(LOCALE[idioma]),
            })
          : undefined
      }
    >
      <span
        className="pulse-live h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--color-building)' }}
      />
      {t('marca.mexendo')}
    </span>
  )
}

/**
 * Trabalho que existe no computador mas ainda não entrou no histórico do
 * projeto. Some sozinho quando alguém salva (commit). Enquanto está aqui, pode
 * ser perdido — e o dono do projeto merece saber disso sem precisar entender
 * o que é um commit.
 */
export function UnsavedChip({ quantos }: { quantos?: number }) {
  const t = useT()
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium"
      style={{
        color: 'var(--color-warn)',
        background: 'color-mix(in oklab, var(--color-warn) 12%, transparent)',
      }}
      title={t('marca.naoSalvoDica')}
    >
      <CloudOff size={11} />
      {quantos && quantos > 1 ? t('marca.naoSalvos', { n: quantos }) : t('marca.naoSalvo')}
    </span>
  )
}

/**
 * A aprovação da pessoa vale para o que ela VIU. Se a IA mexeu nesta parte
 * depois, dizer "você aprovou" seria mentira — então o selo vira um convite a
 * olhar de novo. É o alerta mais valioso do painel.
 */
export function RevalidarChip({ desde }: { desde?: string }) {
  const t = useT()
  const idioma = useIdioma()
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium"
      style={{
        color: 'var(--color-warn)',
        background: 'color-mix(in oklab, var(--color-warn) 12%, transparent)',
      }}
      title={
        desde
          ? t('marca.revalidarDesde', {
              quando: new Date(desde).toLocaleString(LOCALE[idioma]),
            })
          : t('marca.revalidarSemData')
      }
    >
      <History size={11} />
      {t('marca.revalidar')}
    </span>
  )
}

export function StateChip({ state }: { state: FeatureState }) {
  const t = useT()
  const meta = STATE[state]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11px] font-medium"
      style={{
        color: meta.color,
        borderColor: `color-mix(in oklab, ${meta.color} 40%, transparent)`,
        background: `color-mix(in oklab, ${meta.color} 10%, transparent)`,
      }}
    >
      <span className="tracking-[-0.1em]">{meta.mark}</span>
      {t(`estado.${state}`)}
    </span>
  )
}
