import { CloudOff, History } from 'lucide-react'
import { LOCALE, useIdioma, useT } from '@/lib/i18n'
import { STATE, type MarkShape } from '@/lib/state'
import type { FeatureState } from '@/types/protocol'

/**
 * O viewBox 24×24 de `STATE[state].shape` é escalado, nunca redesenhado por
 * tamanho — redesenhar transforma o alfabeto em cinco ícones parecidos.
 * `lado` é o desenho; `slot` é a coluna que ele ocupa nas listas.
 */
const TAMANHO = {
  /** Selo dentro de linha de lista. 12px — o menor lugar onde a marca vive. */
  sm: { lado: 12, slot: 16 },
  /** Padrão. */
  md: { lado: 16, slot: 24 },
  /** Cabeçalho de coluna, onde a marca é título e não etiqueta. */
  lg: { lado: 22, slot: 28 },
} as const

export type TamanhoMarca = keyof typeof TAMANHO | number

/**
 * A marca do estado — o alfabeto do produto, igual em todas as telas.
 *
 * A forma ordena, a cor confirma: sem cor nenhuma os cinco estados continuam
 * ordenáveis, porque cada um acrescenta material ao anterior. A geometria vive
 * em `src/lib/state.ts`.
 *
 * Forma nenhuma é lida por leitor de tela, então a marca se anuncia com o nome
 * do estado E a frase que o explica. Havendo texto visível ao lado, passe
 * `decorativa` para não repetir.
 */
export function StateMark({
  state,
  size = 'md',
  decorativa = false,
}: {
  state: FeatureState
  size?: TamanhoMarca
  decorativa?: boolean
}) {
  const t = useT()
  const meta = STATE[state]
  const { lado, slot } =
    typeof size === 'number' ? { lado: size, slot: size } : TAMANHO[size]
  const rotulo = t('estado.comSentido', {
    estado: t(`estado.${state}`),
    sentido: t(`estado.${state}.sentido`),
  })
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center leading-none"
      style={{ width: slot, height: lado, color: meta.color }}
      role={decorativa ? undefined : 'img'}
      aria-label={decorativa ? undefined : rotulo}
      aria-hidden={decorativa || undefined}
      title={decorativa ? undefined : rotulo}
    >
      <MarcaDesenho shape={meta.shape} lado={lado} />
    </span>
  )
}

/**
 * Traduz a geometria declarada em `state.ts` para SVG.
 *
 * Tudo em `currentColor`: a cor entra uma vez, no `span` de cima. Assim, se o
 * ambiente forçar monocromático (alto contraste, impressão), as cinco marcas
 * viram cinco formas da mesma cor — que é exatamente o teste que a progressão
 * precisa passar.
 *
 * As camadas saem na ordem do array: órbita primeiro, núcleo por último.
 */
function MarcaDesenho({ shape, lado }: { shape: readonly MarkShape[]; lado: number }) {
  return (
    <svg
      width={lado}
      height={lado}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {shape.map((camada, i) => {
        if (camada.kind === 'ring') {
          return (
            <circle
              key={i}
              cx="12"
              cy="12"
              r={camada.r}
              fill="none"
              stroke="currentColor"
              strokeWidth={camada.w}
            />
          )
        }
        if (camada.kind === 'half') {
          // Metade DIREITA: arco de 12h a 6h no sentido horário, como um
          // relógio que já andou metade da volta.
          return (
            <path
              key={i}
              d={`M12 ${12 - camada.r}A${camada.r} ${camada.r} 0 0 1 12 ${12 + camada.r}Z`}
              fill="currentColor"
            />
          )
        }
        return <circle key={i} cx="12" cy="12" r={camada.r} fill="currentColor" />
      })}
    </svg>
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

/**
 * Marca + nome do estado. O nome já está visível e é lido pelo leitor de tela,
 * então a marca entra como `decorativa` — repetir "Testado" duas vezes seguidas
 * na leitura em voz alta é ruído, não acessibilidade.
 */
export function StateChip({ state }: { state: FeatureState }) {
  const t = useT()
  const meta = STATE[state]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border py-[3px] pr-2 pl-1.5 text-[11px] font-medium"
      style={{
        color: meta.color,
        borderColor: `color-mix(in oklab, ${meta.color} 40%, transparent)`,
        background: `color-mix(in oklab, ${meta.color} 10%, transparent)`,
      }}
      title={t('estado.comSentido', {
        estado: t(`estado.${state}`),
        sentido: t(`estado.${state}.sentido`),
      })}
    >
      {/* Lado 12 sem folga de slot: dentro da pílula o texto já dá o ritmo. */}
      <StateMark state={state} size={12} decorativa />
      {t(`estado.${state}`)}
    </span>
  )
}
