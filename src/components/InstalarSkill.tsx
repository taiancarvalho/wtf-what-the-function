import { useState } from 'react'
import { Check, Compass, Plug, Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { alternarInstalacao, mapearProjeto, podeInstalar, type Carga } from '@/lib/source'
import type { EstadoInstalacao } from '@/types/protocol'

/**
 * O onboarding. Sem isto o WTF só enxerga o Git — ou seja, só o que já
 * aconteceu. Com isto, a IA passa a declarar o que VAI fazer, que é o único
 * jeito de existir o estado "◐ Construindo".
 */
export function InstalarSkill({
  instalacao,
  onMudou,
}: {
  instalacao: EstadoInstalacao | undefined
  onMudou: (c: Carga) => void
}) {
  const t = useT()
  const [ocupado, setOcupado] = useState(false)

  if (!podeInstalar() || !instalacao) return null

  async function agir(acao: 'instalar' | 'desinstalar') {
    setOcupado(true)
    try {
      const nova = await alternarInstalacao(acao)
      if (nova) onMudou(nova)
    } finally {
      setOcupado(false)
    }
  }

  if (instalacao.instalado) {
    return (
      <>
        {/* Partida a frio: o projeto já existia antes do WTF chegar. */}
        {!instalacao.mapeado && <CardMapear />}

        <div className="mt-4 flex items-start gap-2">
          <Check size={13} className="mt-[3px] shrink-0" style={{ color: 'var(--color-tested)' }} />
          <div className="min-w-0">
            <p className="text-[12px] leading-snug text-[var(--color-ink-2)]">
              {t('instalar.ligado')}
            </p>
            <button
              onClick={() => agir('desinstalar')}
              disabled={ocupado}
              className="no-drag mt-0.5 text-[11.5px] text-[var(--color-ink-3)] underline underline-offset-2 hover:text-[var(--color-ink-2)]"
            >
              {t('instalar.desligar')}
            </button>
          </div>
        </div>
      </>
    )
  }

  /*
   * Quem já ligou o WTF aqui não é perguntado de novo.
   *
   * Uma skill nova fazia o projeto inteiro voltar a parecer desligado — a
   * pessoa via "o WTF não avisa neste projeto" num projeto que ela habilitou
   * e que estava funcionando. Aqui a diferença aparece: falta UMA peça, e o
   * botão diz o que ele faz.
   */
  const atualizando = instalacao.desatualizado

  return (
    <div
      className="mt-4 rounded-lg border p-3"
      style={{
        borderColor: 'color-mix(in oklab, var(--color-accent) 34%, transparent)',
        background: 'color-mix(in oklab, var(--color-accent) 7%, transparent)',
      }}
      data-slot="instalar"
    >
      <p className="text-[12.5px] leading-snug font-medium">
        {t(atualizando ? 'instalar.temNovidade' : 'instalar.naoAvisa')}
      </p>
      <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ink-2)]">
        {t(atualizando ? 'instalar.temNovidadeNota' : 'instalar.naoAvisaNota')}
      </p>
      <button
        onClick={() => agir('instalar')}
        disabled={ocupado}
        className="no-drag mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-opacity disabled:opacity-60"
        style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}
      >
        {ocupado ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Plug size={13} />
        )}
        {t(atualizando ? 'instalar.atualizar' : 'instalar.ligar')}
      </button>
    </div>
  )
}

/**
 * Partida a frio. O WTF chegou depois que o projeto já existia, então ele não
 * sabe do que o projeto é feito — só enxerga arquivos. Pedimos ao próprio
 * agente que leia o plano e o código e escreva o vocabulário.
 *
 * O agente nomeia as partes. Quem decide o estado delas continua sendo o WTF.
 */
function CardMapear() {
  const t = useT()
  const [enviado, setEnviado] = useState(false)

  async function mapear() {
    await mapearProjeto()
    setEnviado(true)
  }

  return (
    <div
      className="mt-4 rounded-lg border p-3"
      style={{
        borderColor: 'color-mix(in oklab, var(--color-implemented) 40%, transparent)',
        background: 'color-mix(in oklab, var(--color-implemented) 8%, transparent)',
      }}
    >
      <p className="text-[12.5px] leading-snug font-medium">
        {t('instalar.antesDoWtf')}
      </p>
      <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ink-2)]">
        {enviado ? t('instalar.mapeando') : t('instalar.mapearNota')}
      </p>
      {!enviado && (
        <button
          onClick={mapear}
          className="no-drag mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium"
          style={{ background: 'var(--color-implemented)', color: 'var(--color-paper)' }}
        >
          <Compass size={13} />
          {t('instalar.mapear')}
        </button>
      )}
    </div>
  )
}
