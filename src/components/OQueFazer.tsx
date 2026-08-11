import { useState } from 'react'
import { Check, Copy, MessageSquare, SquareTerminal } from 'lucide-react'
import { abrirTerminal, podeAbrirTerminal } from '@/lib/source'
import type { Acao } from '@/lib/acoes'

/**
 * A saída para um alerta.
 *
 * Duas formas de agir, porque há dois jeitos de trabalhar: abrir a IA numa
 * janela nova já com a mensagem escrita, ou copiar a mensagem para colar numa
 * sessão que já está aberta. Não é possível injetar texto numa sessão em
 * andamento — daí o "copiar" existir como caminho de primeira classe, e não
 * como consolo.
 */
export function OQueFazer({ acoes }: { acoes: Acao[] }) {
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
      setAviso('Não consegui copiar. Selecione o texto abaixo e copie à mão.')
    }
  }

  async function abrir(a: Acao) {
    const r = await abrirTerminal(a.mensagem)
    if (r?.erro) setAviso(r.erro)
    else setAviso(`${r?.agente ?? 'A IA'} abriu numa janela nova com a mensagem.`)
  }

  return (
    <div className="mt-4 border-t pt-3.5">
      <p className="text-[10.5px] tracking-[0.14em] text-[var(--color-ink-3)] uppercase">
        O que fazer
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {acoes.map((a) => {
          const ativa = escolhida?.id === a.id
          return (
            <button
              key={a.id}
              title={a.nota}
              onClick={() => {
                setEscolhida(ativa ? null : a)
                setCopiado(false)
                setAviso(null)
              }}
              className="rounded-full border px-3 py-1.5 text-[12.5px] transition-colors"
              style={{
                borderColor: ativa
                  ? 'var(--color-accent)'
                  : 'color-mix(in oklab, var(--color-accent) 32%, transparent)',
                background: ativa
                  ? 'color-mix(in oklab, var(--color-accent) 12%, transparent)'
                  : 'transparent',
                color: 'var(--color-accent)',
              }}
            >
              {a.rotulo}
            </button>
          )
        })}
      </div>

      {escolhida && (
        <div className="animate-in-up mt-3">
          <p className="text-[12.5px] leading-snug text-[var(--color-ink-2)]">
            {escolhida.nota}
          </p>

          {/* A mensagem fica visível: a pessoa precisa poder ler o que vai
              mandar em seu nome antes de mandar. */}
          <pre className="mt-2 max-h-52 overflow-auto rounded-lg border bg-[var(--color-paper-3)] p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
            {escolhida.mensagem}
          </pre>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {podeAbrirTerminal() && (
              <button
                onClick={() => abrir(escolhida)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
                style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}
              >
                <SquareTerminal size={13} />
                Abrir a IA com essa mensagem
              </button>
            )}

            <button
              onClick={() => copiar(escolhida)}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
            >
              {copiado ? <Check size={13} /> : <Copy size={13} />}
              {copiado ? 'Copiado' : 'Copiar mensagem'}
            </button>

            <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--color-ink-3)]">
              <MessageSquare size={11} />
              para colar numa conversa já aberta
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
