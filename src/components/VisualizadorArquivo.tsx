import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useT } from '@/lib/i18n'
import { lerArquivo, type ArquivoAberto } from '@/lib/source'

/**
 * O arquivo real do projeto, aberto ao lado — para ler sem sair do app.
 * Nível 5 de profundidade: depois do caminho, o próprio código.
 */
export function VisualizadorArquivo({
  caminho,
  onFechar,
}: {
  caminho: string | null
  onFechar: () => void
}) {
  const t = useT()
  const [arquivo, setArquivo] = useState<ArquivoAberto | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!caminho) {
      setArquivo(null)
      return
    }
    let vivo = true
    setCarregando(true)
    setArquivo(null)
    lerArquivo(caminho)
      .then((r) => {
        if (vivo) setArquivo(r)
      })
      .catch((e: unknown) => {
        if (vivo) {
          setArquivo({ caminho, erro: e instanceof Error ? e.message : String(e) })
        }
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [caminho])

  useEffect(() => {
    if (!caminho) return
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [caminho, onFechar])

  const corte = caminho ? caminho.lastIndexOf('/') : -1
  const pasta = caminho && corte > 0 ? caminho.slice(0, corte + 1) : ''
  const nome = caminho ? caminho.slice(corte + 1) : ''

  const linhas = arquivo?.conteudo ? arquivo.conteudo.split('\n') : null

  return (
    <AnimatePresence>
      {caminho && (
        <motion.aside
          key="visualizador"
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="no-drag fixed top-0 right-0 bottom-0 z-40 flex w-[46vw] max-w-[760px] min-w-[420px] flex-col border-l"
          style={{
            borderColor: 'var(--color-rule)',
            background: 'var(--color-paper-2)',
            boxShadow: '-14px 0 34px -22px rgb(0 0 0 / 0.45)',
          }}
        >
          <header
            className="flex items-baseline gap-2.5 border-b px-4 py-3"
            style={{ borderColor: 'var(--color-rule)' }}
          >
            <span className="truncate font-mono text-[13px] font-medium text-[var(--color-ink)]">
              {nome}
            </span>
            {pasta && (
              <span className="truncate font-mono text-[11px] text-[var(--color-ink-3)]">
                {pasta}
              </span>
            )}
            <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-ink-3)]">
              {linhas
                ? (arquivo?.linhas ?? linhas.length) === 1
                  ? t('arquivo.umaLinha')
                  : t('arquivo.linhas', { n: arquivo?.linhas ?? linhas.length })
                : ''}
            </span>
            <button
              onClick={onFechar}
              aria-label={t('arquivo.fechar')}
              className="-my-1 shrink-0 rounded-md p-1 text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]"
            >
              <X size={15} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {carregando && (
              <p className="px-4 py-4 text-[13px] text-[var(--color-ink-3)]">{t('arquivo.abrindo')}</p>
            )}

            {!carregando && arquivo?.erro && (
              <p
                className="px-4 py-4 text-[13px] leading-relaxed"
                style={{ color: 'var(--color-danger)' }}
              >
                {arquivo.erro}
              </p>
            )}

            {!carregando && !arquivo?.erro && arquivo?.binario && (
              <p className="px-4 py-4 text-[13px] text-[var(--color-ink-3)]">
                {t('arquivo.naoEhTexto')}
              </p>
            )}

            {!carregando && !arquivo?.erro && linhas && (
              <div className="overflow-x-auto">
                <pre className="min-w-full py-2 font-mono text-[12px] leading-[1.65]">
                  {linhas.map((linha, i) => (
                    <div key={i} className="flex">
                      <span
                        aria-hidden
                        className="sticky left-0 w-[3.5rem] shrink-0 pr-3 text-right tabular-nums select-none"
                        style={{
                          color: 'var(--color-ink-3)',
                          background: 'var(--color-paper-2)',
                        }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="pr-6 whitespace-pre"
                        style={{
                          color: /^\s*(\/\/|\/\*|\*|#)/.test(linha)
                            ? 'var(--color-ink-3)'
                            : 'var(--color-ink)',
                        }}
                      >
                        {linha || ' '}
                      </span>
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
