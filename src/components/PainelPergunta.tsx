import { useCallback, useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Lightbulb, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useT } from '@/lib/i18n'
import { aoReceberResposta, lerChaves, perguntar, podePerguntar } from '@/lib/source'
import { ConfigChaves } from '@/components/ConfigChaves'
import type { ContextoPergunta, WtfEvent } from '@/types/protocol'

/**
 * "Explique isso" — perguntar sobre UMA mudança, sem sair do painel.
 *
 * Mesmo vocabulário visual do VisualizadorArquivo (mesma largura, mesma borda,
 * mesmo cabeçalho, fecha com Escape): são os dois lados do mesmo gesto — abrir
 * algo ao lado para entender melhor o que o feed acabou de contar.
 */
export function PainelPergunta({
  evento,
  featureNome,
  onFechar,
}: {
  evento: WtfEvent | null
  featureNome?: string
  onFechar: () => void
}) {
  const t = useT()
  const [pergunta, setPergunta] = useState('')
  const [resposta, setResposta] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [incompleta, setIncompleta] = useState(false)
  const [esperando, setEsperando] = useState(false)
  const [temChave, setTemChave] = useState<boolean | null>(null)
  const eventoIdRef = useRef<string | null>(null)

  eventoIdRef.current = evento?.id ?? null

  // Cada mudança é uma conversa nova: trocar de cartão limpa a anterior.
  useEffect(() => {
    setPergunta('')
    setResposta('')
    setErro(null)
    setIncompleta(false)
    setEsperando(false)
  }, [evento?.id])

  useEffect(() => {
    if (!evento) return
    let vivo = true
    lerChaves()
      .then((r) => {
        if (vivo) setTemChave(Object.values(r.chaves).some((c) => c?.tem))
      })
      .catch(() => {
        if (vivo) setTemChave(false)
      })
    return () => {
      vivo = false
    }
  }, [evento])

  // Os pedaços chegam pelo main; só interessam os do cartão aberto agora.
  useEffect(() => {
    return aoReceberResposta((dados) => {
      if (!dados || dados.id !== eventoIdRef.current) return
      if (dados.pedaco) setResposta((r) => r + dados.pedaco)
      if (dados.erro) {
        setErro(dados.erro)
        setEsperando(false)
      }
      if (dados.fim) {
        setIncompleta(!!dados.incompleta)
        setEsperando(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!evento) return
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [evento, onFechar])

  const enviar = useCallback(
    async (texto: string) => {
      const e = evento
      if (!e || !texto.trim() || esperando) return
      setPergunta(texto)
      setResposta('')
      setErro(null)
      setIncompleta(false)
      setEsperando(true)

      const contexto: ContextoPergunta = {
        headline: e.human?.headline,
        what: e.human?.what,
        why: e.human?.why,
        impact: e.human?.impact,
        attentionReason: e.human?.attentionReason,
        claim: e.claim,
        feature: featureNome,
        files: e.technical?.files,
        patch: e.technical?.patch,
      }

      const r = await perguntar({ eventoId: e.id, pergunta: texto, contexto })
      // O erro também chega pelo evento de streaming; aqui é a rede de baixo.
      if (r?.erro) {
        setErro(r.erro)
        setEsperando(false)
      }
    },
    [evento, featureNome, esperando],
  )

  const sugestoes = [
    t('pergunta.sugestao.perigoso'),
    t('pergunta.sugestao.quebrar'),
    t('pergunta.sugestao.fazer'),
  ]

  return (
    <AnimatePresence>
      {evento && (
        <motion.aside
          key="pergunta"
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
            <Lightbulb size={14} className="self-center" style={{ color: 'var(--color-ink-3)' }} />
            <span className="text-[13px] font-medium text-[var(--color-ink)]">
              {t('pergunta.titulo')}
            </span>
            <button
              onClick={onFechar}
              aria-label={t('pergunta.fechar')}
              className="ml-auto -my-1 shrink-0 rounded-md p-1 text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]"
            >
              <X size={15} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {/* De qual mudança estamos falando. Sem isso, a resposta fica solta. */}
            <h2 className="font-display text-[18px] leading-snug font-medium text-balance text-[var(--color-ink)]">
              {evento.human?.headline}
            </h2>
            {featureNome && (
              <p className="mt-1 text-[12px] text-[var(--color-ink-3)]">{featureNome}</p>
            )}

            {podePerguntar() && temChave === false && (
              <div
                className="mt-4 rounded-lg border p-3.5"
                style={{
                  borderColor: 'color-mix(in oklab, var(--color-warn) 38%, transparent)',
                  background: 'color-mix(in oklab, var(--color-warn) 8%, transparent)',
                }}
              >
                <p className="text-[13.5px] font-medium text-[var(--color-ink)]">
                  {t('pergunta.semChave')}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
                  {t('pergunta.semChaveNota')}
                </p>
                <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--color-rule)' }}>
                  <ConfigChaves />
                </div>
              </div>
            )}

            {!podePerguntar() && (
              <p className="mt-4 text-[13px] text-[var(--color-ink-3)]">{t('pergunta.soNoApp')}</p>
            )}

            <div className="mt-5">
              <label
                htmlFor="wtf-pergunta"
                className="text-[10.5px] tracking-[0.14em] text-[var(--color-ink-3)] uppercase"
              >
                {t('pergunta.campo')}
              </label>
              <div className="mt-1.5 flex items-end gap-2">
                <textarea
                  id="wtf-pergunta"
                  rows={2}
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void enviar(pergunta)
                    }
                  }}
                  placeholder={t('pergunta.placeholder')}
                  className="min-h-[3.2rem] flex-1 resize-y rounded-lg border px-3 py-2 text-[13.5px] leading-relaxed outline-none"
                  style={{
                    borderColor: 'var(--color-rule)',
                    background: 'var(--color-paper)',
                    color: 'var(--color-ink)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => void enviar(pergunta)}
                  disabled={esperando || !pergunta.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }}
                >
                  <CornerDownLeft size={12} />
                  {t('pergunta.enviar')}
                </button>
              </div>
            </div>

            <div className="mt-3">
              <span className="text-[10.5px] tracking-[0.14em] text-[var(--color-ink-3)] uppercase">
                {t('pergunta.sugestoes')}
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {sugestoes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={esperando}
                    onClick={() => void enviar(s)}
                    className="rounded-full border px-2.5 py-1 text-[12px] transition-colors hover:bg-[var(--color-paper-3)] disabled:opacity-50"
                    style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink-2)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {esperando && !resposta && (
              <p className="mt-5 text-[13px] text-[var(--color-ink-3)]">{t('pergunta.pensando')}</p>
            )}

            {resposta && (
              <div className="mt-5">
                <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-[var(--color-ink)]">
                  {resposta}
                  {esperando && <span className="pulse-live">▍</span>}
                </p>
                {incompleta && (
                  <p className="mt-2 text-[12px]" style={{ color: 'var(--color-warn)' }}>
                    {t('pergunta.incompleta')}
                  </p>
                )}
                {!esperando && (
                  <p className="mt-3 text-[11.5px] text-[var(--color-ink-3)]">
                    {t('pergunta.ressalva')}
                  </p>
                )}
              </div>
            )}

            {erro && (
              <p
                className="mt-5 text-[13px] leading-relaxed"
                style={{ color: 'var(--color-danger)' }}
              >
                {erro}
              </p>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
