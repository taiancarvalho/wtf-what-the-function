import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { apagarGerado, podeApagarGerado } from '@/lib/source'
import { useT } from '@/lib/i18n'

/**
 * A saída para um documento que a IA escreveu e a pessoa não quis.
 *
 * O botão de desinstalar já existia, mas ele desliga o WTF — é outra coisa.
 * Quem pediu o mapa das pastas, olhou e achou que não serve para o seu jeito
 * de trabalhar não deveria ter que desligar o painel inteiro para se livrar
 * de um arquivo, nem ir procurá-lo no computador.
 *
 * Dois cliques, sempre. Apagar é irreversível fora do Git, e um ícone de
 * lixeira que apaga no primeiro clique apaga por engano mais cedo ou mais
 * tarde. O segundo clique diz o nome do arquivo: é a última chance de ver que
 * é outro o alvo.
 */
export function ApagarGerado({
  chave,
  arquivo,
  onApagou,
}: {
  chave: string
  /** O caminho, como a pessoa o veria no computador. Aparece na confirmação. */
  arquivo: string
  onApagou: () => void
}) {
  const t = useT()
  const [confirmando, setConfirmando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!podeApagarGerado()) return null

  async function apagar() {
    setApagando(true)
    setErro(null)
    try {
      const r = await apagarGerado(chave)
      if (r.erro) setErro(r.erro)
      else onApagou()
    } finally {
      setApagando(false)
      setConfirmando(false)
    }
  }

  if (!confirmando) {
    return (
      <button
        onClick={() => setConfirmando(true)}
        title={t('apagar.titulo', { arquivo })}
        aria-label={t('apagar.titulo', { arquivo })}
        className="no-drag shrink-0 rounded-md p-1 text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-paper-3)] hover:text-[var(--color-danger)]"
      >
        <Trash2 size={13} />
      </button>
    )
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-[var(--color-ink-2)]">
        {t('apagar.confirmar', { arquivo })}
      </span>
      <button
        onClick={apagar}
        disabled={apagando}
        className="no-drag inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium disabled:opacity-60"
        style={{ background: 'var(--color-danger)', color: 'var(--color-paper)' }}
      >
        {apagando && <Loader2 size={11} className="animate-spin" />}
        {t('apagar.sim')}
      </button>
      <button
        onClick={() => setConfirmando(false)}
        className="no-drag rounded-md border px-2 py-1 text-[12px] text-[var(--color-ink-2)]"
      >
        {t('apagar.nao')}
      </button>
      {erro && (
        <span className="text-[11.5px]" style={{ color: 'var(--color-warn)' }}>
          {erro}
        </span>
      )}
    </span>
  )
}
