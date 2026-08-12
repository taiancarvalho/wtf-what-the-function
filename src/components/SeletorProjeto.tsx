import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  FolderOpen,
  FolderSearch,
  Loader2,
  Pin,
  PinOff,
  PlugZap,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import {
  abrirProjeto,
  escolherProjeto,
  esquecerProjeto,
  fixarProjeto,
  listarProjetos,
  type Carga,
} from '@/lib/source'
import type { ProjetoConhecido } from '@/types/protocol'
import { useT } from '@/lib/i18n'

/** Fixados primeiro; o resto na ordem em que veio. */
function ordenar(lista: ProjetoConhecido[]): ProjetoConhecido[] {
  return [...lista].sort((a, b) => Number(!!b.fixado) - Number(!!a.fixado))
}

/**
 * O seletor de projetos.
 *
 * O nome do projeto atual é o botão: quem quer trocar procura o nome, não um
 * menu escondido. A lista responde de relance a uma pergunta só — onde tem
 * algo me esperando — com o número de pendências na cor de atenção e um ponto
 * pulsando onde a IA está mexendo agora.
 */
export function SeletorProjeto({
  nome,
  caminho,
  onTrocou,
}: {
  nome: string
  caminho: string
  onTrocou: (c: Carga) => void
}) {
  const t = useT()
  const [aberto, setAberto] = useState(false)
  const [projetos, setProjetos] = useState<ProjetoConhecido[]>([])
  const [carregando, setCarregando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [foco, setFoco] = useState(0)

  const caixa = useRef<HTMLDivElement | null>(null)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      setProjetos(ordenar((await listarProjetos()).projetos))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (!aberto) return
    setConfirmando(null)
    setFoco(0)
    void recarregar()
  }, [aberto, recarregar])

  // Escape e clique fora: as duas saídas que todo mundo tenta sem pensar.
  useEffect(() => {
    if (!aberto) return
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    function fora(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('keydown', tecla)
    document.addEventListener('mousedown', fora)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('mousedown', fora)
    }
  }, [aberto])

  async function escolher(p: ProjetoConhecido) {
    if (p.sumiu) return
    setOcupado(p.caminho)
    try {
      const nova = await abrirProjeto(p.caminho)
      if (nova) {
        onTrocou(nova)
        setAberto(false)
      }
    } finally {
      setOcupado(null)
    }
  }

  async function abrirOutra() {
    const nova = await escolherProjeto()
    if (nova) {
      onTrocou(nova)
      setAberto(false)
    }
  }

  async function fixar(p: ProjetoConhecido) {
    await fixarProjeto(p.caminho, !p.fixado)
    await recarregar()
  }

  async function esquecer(p: ProjetoConhecido) {
    await esquecerProjeto(p.caminho)
    setConfirmando(null)
    await recarregar()
  }

  function navegar(e: React.KeyboardEvent) {
    if (projetos.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const passo = e.key === 'ArrowDown' ? 1 : -1
      setFoco((i) => (i + passo + projetos.length) % projetos.length)
    } else if (e.key === 'Enter') {
      const alvo = projetos[foco]
      if (alvo) {
        e.preventDefault()
        void escolher(alvo)
      }
    }
  }

  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        title={t('projetos.trocar')}
        className="no-drag group flex w-full items-start gap-1.5 text-left"
      >
        <h1 className="font-display mt-0.5 min-w-0 text-[21px] leading-tight font-semibold">
          {nome}
        </h1>
        <ChevronDown
          size={15}
          strokeWidth={2.2}
          className="mt-[9px] shrink-0 transition-transform"
          style={{
            color: 'var(--color-ink-3)',
            transform: aberto ? 'rotate(180deg)' : undefined,
          }}
        />
      </button>

      {aberto && (
        <div
          onKeyDown={navegar}
          tabIndex={-1}
          className="no-drag animate-in-up absolute top-full left-0 z-30 mt-2 w-[264px] overflow-hidden rounded-xl border shadow-lg"
          style={{ background: 'var(--color-paper)', borderColor: 'var(--color-rule)' }}
        >
          <p className="px-3 pt-2.5 pb-1 text-[10.5px] tracking-[0.12em] text-[var(--color-ink-3)] uppercase">
            {t('projetos.titulo')}
          </p>

          <div className="max-h-[300px] overflow-y-auto pb-1">
            {carregando && projetos.length === 0 && (
              <p className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-[var(--color-ink-3)]">
                <Loader2 size={12} className="animate-spin" />
                {t('projetos.carregando')}
              </p>
            )}

            {!carregando && projetos.length === 0 && (
              <p className="px-3 py-2 text-[12px] leading-snug text-[var(--color-ink-3)]">
                {t('projetos.vazio')}
              </p>
            )}

            {projetos.map((p, i) => {
              const atual = p.caminho === caminho
              if (confirmando === p.caminho) {
                return (
                  <div
                    key={p.caminho}
                    className="mx-1 my-0.5 rounded-lg px-2.5 py-2"
                    style={{
                      background: 'color-mix(in oklab, var(--color-warn) 9%, transparent)',
                    }}
                  >
                    <p className="text-[11.5px] leading-snug text-[var(--color-ink-2)]">
                      {t('projetos.esquecerNota')}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        onClick={() => esquecer(p)}
                        className="rounded-md px-2 py-1 text-[11.5px] font-medium"
                        style={{ background: 'var(--color-warn)', color: 'var(--color-paper)' }}
                      >
                        {t('projetos.esquecerConfirmar')}
                      </button>
                      <button
                        onClick={() => setConfirmando(null)}
                        className="rounded-md border px-2 py-1 text-[11.5px] text-[var(--color-ink-2)]"
                        style={{ borderColor: 'var(--color-rule)' }}
                      >
                        {t('projetos.cancelar')}
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={p.caminho}
                  onMouseEnter={() => setFoco(i)}
                  className="group/item relative mx-1 my-0.5 rounded-lg"
                  style={{
                    background:
                      foco === i
                        ? 'color-mix(in oklab, var(--color-accent) 9%, transparent)'
                        : 'transparent',
                    opacity: p.sumiu ? 0.55 : 1,
                  }}
                >
                  <button
                    onClick={() => escolher(p)}
                    disabled={!!p.sumiu}
                    className="flex w-full items-start gap-2 px-2.5 py-2 text-left"
                  >
                    <span className="mt-[5px] flex h-2 w-2 shrink-0 items-center justify-center">
                      {p.resumo?.ativo && (
                        <span
                          className="pulse-live h-2 w-2 rounded-full"
                          style={{ background: 'var(--color-building)' }}
                          title={t('projetos.resumo?.ativo')}
                        />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {p.fixado && (
                          <Pin size={10} className="shrink-0" style={{ color: 'var(--color-ink-3)' }} />
                        )}
                        <span
                          className="block truncate text-[13px] leading-tight font-medium"
                          style={{ color: atual ? 'var(--color-accent)' : 'var(--color-ink)' }}
                        >
                          {p.nome}
                        </span>
                      </span>

                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {(p.resumo?.pendencias ?? 0) > 0 && (
                          <span
                            className="text-[11.5px] font-medium"
                            style={{ color: 'var(--color-warn)' }}
                          >
                            {t('(projetos.resumo?.pendencias ?? 0)', { n: (p.resumo?.pendencias ?? 0) })}
                          </span>
                        )}
                        {(p.resumo?.naoSalvos ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[11.5px] text-[var(--color-ink-3)]">
                            <Save size={10} className="shrink-0" />
                            {t('(projetos.resumo?.naoSalvos ?? 0)', { n: (p.resumo?.naoSalvos ?? 0) })}
                          </span>
                        )}
                        {!(p.resumo?.habilitado ?? true) && !p.sumiu && (
                          <span
                            className="flex items-center gap-1 text-[11px] text-[var(--color-ink-3)]"
                            title={t('projetos.desligadoNota')}
                          >
                            <PlugZap size={10} className="shrink-0" />
                            {t('projetos.desligado')}
                          </span>
                        )}
                      </span>

                      {p.sumiu && (
                        <span className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-[var(--color-ink-3)]">
                          <TriangleAlert size={10} className="mt-[2px] shrink-0" />
                          {t('projetos.sumiu')}
                        </span>
                      )}

                      <span className="mt-0.5 block truncate font-mono text-[10.5px] text-[var(--color-ink-3)]">
                        {p.caminho}
                      </span>
                    </span>

                    {ocupado === p.caminho && (
                      <Loader2 size={12} className="mt-[4px] shrink-0 animate-spin" />
                    )}
                  </button>

                  {/* Discretas: só aparecem quando o dedo já está em cima. */}
                  <span className="absolute top-1.5 right-1.5 hidden gap-0.5 group-hover/item:flex">
                    <button
                      onClick={() => fixar(p)}
                      title={p.fixado ? t('projetos.desafixar') : t('projetos.fixar')}
                      className="rounded-md p-1 text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]"
                      style={{ background: 'var(--color-paper)' }}
                    >
                      {p.fixado ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                    <button
                      onClick={() => setConfirmando(p.caminho)}
                      title={t('projetos.esquecer')}
                      className="rounded-md p-1 text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]"
                      style={{ background: 'var(--color-paper)' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>

          <button
            onClick={abrirOutra}
            className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-[12.5px] text-[var(--color-ink-2)]"
            style={{ borderColor: 'var(--color-rule)' }}
          >
            <FolderSearch size={13} className="shrink-0" />
            {t('projetos.abrirOutra')}
          </button>
          <p className="flex items-start gap-2 px-3 pb-2.5 text-[11px] leading-snug text-[var(--color-ink-3)]">
            <FolderOpen size={11} className="mt-[2px] shrink-0" />
            {t('projetos.esquecerNota')}
          </p>
        </div>
      )}
    </div>
  )
}
