import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { carregar } from '@/lib/source'
import { montarResumo, nomeArquivoResumo, type PeriodoResumo } from '@/lib/resumo'
import type { ProjectSnapshot } from '@/types/protocol'

const PERIODOS: { id: PeriodoResumo; chave: string }[] = [
  { id: 'hoje', chave: 'compartilhar.hoje' },
  { id: 'semana', chave: 'compartilhar.semana' },
  { id: 'tudo', chave: 'compartilhar.tudo' },
]

/**
 * O resumo que sai do aplicativo.
 *
 * O texto fica VISÍVEL antes de qualquer botão de enviar — mesma regra do
 * `OQueFazer`: ninguém manda para um cliente uma frase que não leu. Copiar e
 * baixar acontecem inteiramente no renderer (área de transferência e `Blob`),
 * sem pedir nada ao processo principal: um resumo é texto, não um privilégio.
 */
export function Compartilhar({ onFechar }: { onFechar: () => void }) {
  const t = useT()
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null)
  const [periodo, setPeriodo] = useState<PeriodoResumo>('semana')
  const [tecnico, setTecnico] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    carregar()
      .then((c) => {
        if (vivo) setSnapshot(c.snapshot)
      })
      .catch(() => {
        if (vivo) setSnapshot(null)
      })
    return () => {
      vivo = false
    }
  }, [])

  const texto = useMemo(
    () => (snapshot ? montarResumo(snapshot, { periodo, tecnico, t }) : ''),
    // `t` muda de identidade a cada render; o idioma é que importa e ele já
    // vem de contexto — por isso a dependência é só o que a pessoa escolheu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, periodo, tecnico],
  )

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setAviso(t('compartilhar.naoCopiou'))
    }
  }

  function baixar() {
    const blob = new Blob([texto], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivoResumo(snapshot?.project.name ?? 'projeto')
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div
      className="animate-in-up absolute top-11 right-0 z-40 w-[430px] max-w-[90vw] rounded-xl border p-3.5 shadow-lg"
      style={{ background: 'var(--color-paper-2)', borderColor: 'var(--color-line)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-[var(--color-ink)]">
            {t('compartilhar.titulo')}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ink-3)]">
            {t('compartilhar.nota')}
          </p>
        </div>
        <button
          onClick={onFechar}
          title={t('compartilhar.fechar')}
          aria-label={t('compartilhar.fechar')}
          className="rounded-md p-1 text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PERIODOS.map((p) => {
          const ativo = p.id === periodo
          return (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className="rounded-full border px-2.5 py-1 text-[12px] transition-colors"
              style={{
                borderColor: ativo
                  ? 'var(--color-accent)'
                  : 'color-mix(in oklab, var(--color-accent) 30%, transparent)',
                background: ativo
                  ? 'color-mix(in oklab, var(--color-accent) 12%, transparent)'
                  : 'transparent',
                color: ativo ? 'var(--color-accent)' : 'var(--color-ink-2)',
              }}
            >
              {t(p.chave)}
            </button>
          )
        })}
      </div>

      <label
        className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12px] text-[var(--color-ink-2)]"
        title={t('compartilhar.tecnicoNota')}
      >
        <input
          type="checkbox"
          checked={tecnico}
          onChange={(e) => setTecnico(e.target.checked)}
          style={{ accentColor: 'var(--color-accent)' }}
        />
        {t('compartilhar.tecnico')}
      </label>

      {/* O texto fica à vista: quem manda precisa ter lido. */}
      <pre className="mt-2.5 max-h-64 overflow-auto rounded-lg border bg-[var(--color-paper-3)] p-3 text-[12px] leading-relaxed whitespace-pre-wrap text-[var(--color-ink-2)]">
        {texto || t('compartilhar.semProjeto')}
      </pre>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          onClick={copiar}
          disabled={!texto}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}
        >
          {copiado ? <Check size={13} /> : <Copy size={13} />}
          {copiado ? t('compartilhar.copiado') : t('compartilhar.copiar')}
        </button>

        <button
          onClick={baixar}
          disabled={!texto}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-50"
        >
          <Download size={13} />
          {t('compartilhar.baixar')}
        </button>
      </div>

      {aviso && <p className="mt-2 text-[12px] text-[var(--color-ink-3)]">{aviso}</p>}
    </div>
  )
}
