import { useEffect, useState } from 'react'
import { KeyRound, Lock, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { apagarChave, lerChaves, podePerguntar, salvarChave } from '@/lib/source'
import type { EstadoChaves, ProvedorChave } from '@/types/protocol'

/**
 * A chave que faz o "Explique isso" funcionar.
 *
 * Duas coisas precisam ficar EXPLÍCITAS na tela, e não escondidas num tooltip:
 * onde a chave é guardada (fora da pasta do projeto, cifrada) e o que acontece
 * quando o sistema não oferece cofre (ela vale só nesta sessão). Chave de API é
 * dinheiro da pessoa; ela merece saber onde a dela está.
 */
export function ConfigChaves({ provedor = 'openrouter' }: { provedor?: ProvedorChave }) {
  const t = useT()
  const [estado, setEstado] = useState<EstadoChaves | null>(null)
  const [valor, setValor] = useState('')
  const [editando, setEditando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    lerChaves()
      .then((r) => {
        if (vivo) setEstado(r)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  if (!podePerguntar()) {
    return (
      <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
        {t('chaves.soNoApp')}
      </p>
    )
  }

  const atual = estado?.chaves?.[provedor]
  const nomeProvedor = provedor === 'openrouter' ? 'OpenRouter' : provedor
  const mostrarCampo = editando || !atual?.tem

  async function salvar() {
    if (!valor.trim()) return
    setOcupado(true)
    setAviso(null)
    try {
      const r = await salvarChave(provedor, valor)
      if (r.erro) setAviso(r.erro)
      else if (r.aviso) setAviso(r.aviso)
      if (r.chaves) setEstado({ chaves: r.chaves, podeGuardar: r.podeGuardar, onde: r.onde })
      // A chave sai do estado do React assim que o main a recebe: nada de
      // deixá-la viva na memória do renderer mais tempo do que o necessário.
      setValor('')
      setEditando(false)
    } finally {
      setOcupado(false)
    }
  }

  async function apagar() {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await apagarChave(provedor)
      if (r.erro) setAviso(r.erro)
      setEstado(r)
      setEditando(false)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="no-drag">
      <h3 className="font-display flex items-center gap-2 text-[15px] font-medium text-[var(--color-ink)]">
        <KeyRound size={14} style={{ color: 'var(--color-ink-3)' }} />
        {t('chaves.titulo')}
      </h3>

      <p className="mt-1.5 flex gap-2 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
        <Lock size={13} className="mt-[3px] shrink-0" style={{ color: 'var(--color-ink-3)' }} />
        <span>{t('chaves.nota')}</span>
      </p>

      {atual?.tem && (
        <p className="mt-3 font-mono text-[12px] text-[var(--color-ink-2)]">
          {t('chaves.atual', { mascara: atual.mascara })}
        </p>
      )}
      {atual?.tem && !atual.guardada && (
        <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--color-warn)' }}>
          {t('chaves.soNestaSessao')}
        </p>
      )}

      {estado && !estado.podeGuardar && (
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-warn)' }}>
          {t('chaves.semCofre')}
        </p>
      )}

      {mostrarCampo ? (
        <div className="mt-3">
          <label
            htmlFor="wtf-chave"
            className="text-[10.5px] tracking-[0.14em] text-[var(--color-ink-3)] uppercase"
          >
            {t('chaves.campo', { provedor: nomeProvedor })}
          </label>
          <input
            id="wtf-chave"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void salvar()
            }}
            placeholder={t('chaves.placeholder')}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 font-mono text-[12.5px] outline-none"
            style={{
              borderColor: 'var(--color-rule)',
              background: 'var(--color-paper)',
              color: 'var(--color-ink)',
            }}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={ocupado || !valor.trim()}
              className="rounded-full border px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }}
            >
              {ocupado ? t('chaves.salvando') : t('chaves.salvar')}
            </button>
            {atual?.tem && (
              <button
                type="button"
                onClick={() => {
                  setEditando(false)
                  setValor('')
                }}
                className="text-[12.5px] text-[var(--color-ink-3)]"
              >
                {t('chaves.cancelar')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded-full border px-3 py-1.5 text-[12.5px]"
            style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }}
          >
            {t('chaves.trocar')}
          </button>
          <button
            type="button"
            onClick={() => void apagar()}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 text-[12.5px] disabled:opacity-50"
            style={{ color: 'var(--color-danger)' }}
          >
            <Trash2 size={12} />
            {t('chaves.apagar')}
          </button>
        </div>
      )}

      {aviso && (
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-warn)' }}>
          {aviso}
        </p>
      )}

      {estado?.onde && (
        <p className="mt-2 truncate font-mono text-[11px] text-[var(--color-ink-3)]">
          {t('chaves.onde', { caminho: estado.onde })}
        </p>
      )}
    </section>
  )
}
