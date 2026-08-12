import { useState } from 'react'
import { Check, Globe, Loader2 } from 'lucide-react'
import { IDIOMAS, IDIOMAS_CONTEUDO, useT, type Idioma } from '@/lib/i18n'
import type { ConfigProjeto } from '@/types/protocol'

/**
 * Escolha de idioma.
 *
 * Dois campos, porque são duas coisas diferentes: a língua do APLICATIVO (só
 * as três que alguém revisou de verdade) e a língua em que a IA ESCREVE, que
 * pode ser qualquer uma. Dá para ter o app em inglês e as explicações em
 * chinês — é o caso de quem usa um app em inglês mas quer entender o próprio
 * software na própria língua.
 *
 * Trocar a língua das explicações reescreve a instrução dentro da skill
 * instalada, então o agente passa a responder naquela língua sem que ninguém
 * precise pedir.
 */
export function EscolherIdioma({
  config,
  onSalvar,
}: {
  config: ConfigProjeto | undefined
  onSalvar: (parcial: Partial<ConfigProjeto>) => Promise<void>
}) {
  const t = useT()
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [outro, setOutro] = useState('')

  const interfaceAtual = (config?.idiomaInterface ?? 'pt-BR') as Idioma
  const conteudoAtual = config?.nomeIdiomaConteudo ?? 'português do Brasil'

  async function salvar(parcial: Partial<ConfigProjeto>) {
    setSalvando(true)
    try {
      await onSalvar(parcial)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mt-4 border-t pt-3">
      <button
        onClick={() => setAberto((v) => !v)}
        className="no-drag flex w-full items-center gap-2 text-[12px] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink-2)]"
      >
        <Globe size={13} className="shrink-0" />
        <span className="truncate">{conteudoAtual}</span>
        {salvando && <Loader2 size={11} className="ml-auto animate-spin" />}
      </button>

      {aberto && (
        <div className="animate-in-up mt-3 space-y-3">
          <div>
            <p className="text-[10.5px] tracking-[0.12em] text-[var(--color-ink-3)] uppercase">
              {t('idioma.interface')}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {IDIOMAS.map((i) => {
                const ativo = i.id === interfaceAtual
                return (
                  <button
                    key={i.id}
                    onClick={() => salvar({ idiomaInterface: i.id })}
                    className="rounded-md border px-2 py-1 text-[11.5px] transition-colors"
                    style={{
                      borderColor: ativo
                        ? 'var(--color-accent)'
                        : 'color-mix(in oklab, var(--color-rule) 100%, transparent)',
                      color: ativo ? 'var(--color-accent)' : 'var(--color-ink-2)',
                    }}
                  >
                    {i.nomeProprio}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-[10.5px] tracking-[0.12em] text-[var(--color-ink-3)] uppercase">
              {t('idioma.conteudo')}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink-3)]">
              {t('idioma.conteudoNota')}
            </p>

            <div className="mt-1.5 flex flex-wrap gap-1">
              {IDIOMAS_CONTEUDO.map((i) => {
                const ativo = i.nome === conteudoAtual
                return (
                  <button
                    key={i.codigo}
                    onClick={() =>
                      salvar({ idiomaConteudo: i.codigo, nomeIdiomaConteudo: i.nome })
                    }
                    className="rounded-md border px-2 py-1 text-[11.5px] transition-colors"
                    style={{
                      borderColor: ativo ? 'var(--color-accent)' : 'var(--color-rule)',
                      color: ativo ? 'var(--color-accent)' : 'var(--color-ink-2)',
                    }}
                  >
                    {i.nome}
                  </button>
                )
              })}
            </div>

            {/* Qualquer língua serve: a lista é atalho, não limite. */}
            <div className="mt-2 flex gap-1.5">
              <input
                value={outro}
                onChange={(e) => setOutro(e.target.value)}
                placeholder={t('idioma.outro')}
                className="min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-[11.5px] outline-none placeholder:text-[var(--color-ink-3)]"
              />
              <button
                onClick={() => {
                  const nome = outro.trim()
                  if (!nome) return
                  salvar({ idiomaConteudo: nome.slice(0, 24), nomeIdiomaConteudo: nome })
                  setOutro('')
                }}
                disabled={!outro.trim()}
                className="rounded-md border px-2 py-1 text-[11.5px] text-[var(--color-ink-2)] disabled:opacity-40"
              >
                <Check size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
