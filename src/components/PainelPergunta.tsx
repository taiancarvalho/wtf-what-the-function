import { useCallback, useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Lightbulb, SquareTerminal, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useT } from '@/lib/i18n'
import {
  aoPedirTraducao,
  aoReceberResposta,
  lerChaves,
  lerConfig,
  pedirTerminal,
  perguntar,
  podePerguntar,
  podeTerminalEmbutido,
  salvarConfig,
} from '@/lib/source'
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
  temBtw,
  onFechar,
}: {
  evento: WtfEvent | null
  featureNome?: string
  /** Se o comando `/btw` existe neste projeto. Ver `perguntarNoTerminal`. */
  temBtw?: boolean
  onFechar: () => void
}) {
  const t = useT()
  const [pergunta, setPergunta] = useState('')
  const [resposta, setResposta] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [incompleta, setIncompleta] = useState(false)
  const [esperando, setEsperando] = useState(false)
  const [temChave, setTemChave] = useState<boolean | null>(null)
  /*
   * O aviso de custo. Perguntar consome créditos da chave DA PESSOA, e ela
   * precisa saber disso antes da primeira vez — nunca depois da fatura. Uma
   * vez aceito, fica gravado no projeto e não aparece mais: repetir o aviso a
   * cada pergunta viraria mais um "OK, OK, OK" sem informação nenhuma.
   */
  const [avisoAceito, setAvisoAceito] = useState<boolean | null>(null)
  /** Pergunta que ficou esperando a pessoa aceitar o aviso. */
  const [aguardandoAviso, setAguardandoAviso] = useState<string | null>(null)
  /** Aviso discreto: há mudanças sem tradução porque ninguém autorizou o gasto. */
  const [traducaoPendente, setTraducaoPendente] = useState(false)
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

  useEffect(() => {
    if (!evento) return
    let vivo = true
    lerConfig()
      .then((c) => {
        // Fora do app não há config; aí não há custo nenhum a avisar, porque
        // também não há como perguntar.
        if (vivo) setAvisoAceito(c ? c.avisoCustoAceito === true : true)
      })
      .catch(() => {
        if (vivo) setAvisoAceito(false)
      })
    return () => {
      vivo = false
    }
  }, [evento])

  useEffect(() => aoPedirTraducao((d) => setTraducaoPendente((d?.pendentes ?? 0) > 0)), [])

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

  const enviarDeVerdade = useCallback(
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

  /**
   * O outro caminho: perguntar à IA que já está aberta no terminal do app.
   *
   * Este painel nasceu quando a única forma de responder aqui dentro era uma
   * chave de API — e por isso ele pedia uma. Com o terminal embutido, a mesma
   * pergunta chega ao agente que a pessoa já paga, sem chave nenhuma e sem
   * fatura nova. A chave continua existindo para quem prefere a resposta
   * formatada no painel e sem ocupar o agente, mas deixou de ser obrigatória.
   *
   * Tudo em UMA linha de propósito: com `/btw`, o que vem depois do comando é
   * o argumento dele, e quebras de linha no meio arriscam o corpo se perder.
   */
  const perguntarNoTerminal = useCallback(
    (texto: string) => {
      const e = evento
      if (!e || !texto.trim()) return
      const partes = [
        featureNome ? `sobre "${featureNome}"` : '',
        e.human?.headline ? `— ${e.human.headline}` : '',
        e.human?.attentionReason ? `(${e.human.attentionReason})` : '',
      ].filter(Boolean)
      const contexto = partes.length ? `${partes.join(' ')}: ` : ''
      const corpo = `${contexto}${texto.trim()}`
      pedirTerminal(
        temBtw
          ? `/btw ${corpo}`
          : `${corpo} — responda em palavras simples, não altere nenhum arquivo, ` +
            `e se estiver no meio de outro trabalho volte para ele depois.`,
      )
      setPergunta('')
      onFechar()
    },
    [evento, featureNome, temBtw, onFechar],
  )

  /**
   * A porta de entrada. A primeira pergunta não sai sem a pessoa confirmar que
   * entendeu que aquilo gasta os créditos dela. Depois de aceito, passa direto.
   */
  const enviar = useCallback(
    async (texto: string) => {
      if (!texto.trim() || esperando) return
      if (avisoAceito === false) {
        setAguardandoAviso(texto)
        setPergunta(texto)
        return
      }
      await enviarDeVerdade(texto)
    },
    [avisoAceito, esperando, enviarDeVerdade],
  )

  /** A pessoa aceitou o aviso: grava e manda a pergunta que ficou esperando. */
  const aceitarAviso = useCallback(async () => {
    const texto = aguardandoAviso
    setAvisoAceito(true)
    setAguardandoAviso(null)
    try {
      await salvarConfig({ avisoCustoAceito: true })
    } catch {
      /* não conseguir gravar não pode impedir a pergunta já autorizada */
    }
    if (texto) await enviarDeVerdade(texto)
  }, [aguardandoAviso, enviarDeVerdade])

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

            {/*
              Sem chave e SEM terminal, a chave é a única saída — só aí o
              pedido de configurá-la faz sentido. Com o terminal aberto, exigir
              uma chave para responder uma pergunta seria cobrar por algo que a
              pessoa já tem instalado na própria máquina.
            */}
            {podePerguntar() && temChave === false && !podeTerminalEmbutido() && (
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

            {/*
              O aviso de custo, uma única vez. Aparece ANTES de a pergunta sair,
              nunca depois — é a diferença entre avisar e prestar contas.
            */}
            {aguardandoAviso !== null && (
              <div
                className="mt-4 rounded-lg border p-3.5"
                style={{
                  borderColor: 'color-mix(in oklab, var(--color-warn) 38%, transparent)',
                  background: 'color-mix(in oklab, var(--color-warn) 8%, transparent)',
                }}
              >
                <p className="text-[13.5px] font-medium text-[var(--color-ink)]">
                  {t('pergunta.aviso.titulo')}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
                  {t('pergunta.aviso.texto')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void aceitarAviso()}
                    className="rounded-full border px-3 py-1.5 text-[12.5px]"
                    style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                  >
                    {t('pergunta.aviso.aceitar')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAguardandoAviso(null)}
                    className="rounded-full border px-3 py-1.5 text-[12.5px]"
                    style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink-2)' }}
                  >
                    {t('pergunta.aviso.cancelar')}
                  </button>
                </div>
              </div>
            )}

            {/* Discreto de propósito: informa sem interromper o que a pessoa veio fazer. */}
            {traducaoPendente && (
              <p className="mt-3 text-[11.5px] text-[var(--color-ink-3)]">
                {t('pergunta.aviso.pendente')}
              </p>
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
                {/*
                  Com terminal, ele é o botão PRINCIPAL: responde pelo agente
                  que a pessoa já paga. A chave vira o caminho de quem prefere
                  a resposta aqui dentro — deixou de ser o pedágio de entrada.
                */}
                {podeTerminalEmbutido() && (
                  <button
                    type="button"
                    onClick={() => perguntarNoTerminal(pergunta)}
                    disabled={!pergunta.trim()}
                    title={t('pergunta.noTerminalNota')}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-opacity disabled:opacity-50"
                    style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}
                  >
                    <SquareTerminal size={12} />
                    {t('pergunta.noTerminal')}
                  </button>
                )}

                {temChave !== false && (
                  <button
                    type="button"
                    onClick={() => void enviar(pergunta)}
                    disabled={esperando || !pergunta.trim()}
                    title={t('pergunta.comChaveNota')}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-50"
                    style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }}
                  >
                    <CornerDownLeft size={12} />
                    {t('pergunta.enviar')}
                  </button>
                )}
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
                    onClick={() =>
                      temChave === false && podeTerminalEmbutido()
                        ? perguntarNoTerminal(s)
                        : void enviar(s)
                    }
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
