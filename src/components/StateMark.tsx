import { CloudOff } from 'lucide-react'
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
  const meta = STATE[state]
  return (
    <span
      title={`${meta.label} — ${meta.meaning}`}
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
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium"
      style={{
        color: 'var(--color-building)',
        background: 'color-mix(in oklab, var(--color-building) 14%, transparent)',
      }}
      title={desde ? `A IA começou este trabalho em ${new Date(desde).toLocaleString('pt-BR')}` : undefined}
    >
      <span
        className="pulse-live h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--color-building)' }}
      />
      A IA está mexendo agora
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
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium"
      style={{
        color: 'var(--color-warn)',
        background: 'color-mix(in oklab, var(--color-warn) 12%, transparent)',
      }}
      title="Arquivos criados ou alterados que ainda não foram guardados no histórico do projeto."
    >
      <CloudOff size={11} />
      {quantos && quantos > 1 ? `${quantos} ainda não salvos` : 'ainda não salvo'}
    </span>
  )
}

export function StateChip({ state }: { state: FeatureState }) {
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
      {meta.label}
    </span>
  )
}
