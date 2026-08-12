import { useState, type ReactNode } from 'react'
import { CornerDownRight, FolderTree, Pencil } from 'lucide-react'
import { mapearPastas } from '@/lib/source'
import { ApagarGerado } from '@/components/ApagarGerado'
import { diaRelativo } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { ProjectSnapshot } from '@/types/protocol'

/** O texto da seção vem entre traços: "── PRODUTO ──". */
function limparSecao(nome: string): string {
  return nome.replace(/[─\-—│|]/g, '').trim()
}

/**
 * O mapa de pastas.
 *
 * Não é a árvore do sistema de arquivos: é a resposta humana para "onde cada
 * coisa mora". Por isso o desenho da árvore é redesenhado aqui linha a linha —
 * o prefixo é só o traço, o que importa é o nome e a frase ao lado.
 */
export function Pastas({ snapshot }: { snapshot: ProjectSnapshot }) {
  const t = useT()
  const [criando, setCriando] = useState(false)

  const mapa = (snapshot as ProjectSnapshot).pastas

  async function criar() {
    setCriando(true)
    try {
      await mapearPastas()
    } finally {
      setCriando(false)
    }
  }

  if (!mapa || !mapa.existe) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-8 pt-7 pb-24">
          <Cabecalho titulo={t('pastas.titulo')} explicacao={t('pastas.paraQue')} />

          <section
            className="card animate-in-up mt-5 p-5"
            style={{ animationDelay: '0.05s' }}
          >
            <div className="flex items-center gap-2">
              <FolderTree size={15} className="shrink-0 text-[var(--color-accent)]" />
              <h2 className="font-display text-[15px] font-medium">
                {t('pastas.vazioTitulo')}
              </h2>
            </div>
            <p className="mt-2 max-w-[56ch] text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              {t('pastas.vazioTexto')}
            </p>
            <button
              onClick={criar}
              disabled={criando}
              className="no-drag mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors disabled:opacity-60"
              style={{
                color: 'var(--color-accent)',
                borderColor: 'color-mix(in oklab, var(--color-accent) 40%, transparent)',
                background: 'color-mix(in oklab, var(--color-accent) 8%, transparent)',
              }}
            >
              <FolderTree size={14} className="shrink-0" />
              {criando ? t('pastas.criando') : t('pastas.criar')}
            </button>
          </section>

          <Rodape t={t} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-8 pt-7 pb-24">
        <Cabecalho
          titulo={t('pastas.titulo')}
          explicacao={t('pastas.paraQue')}
          apagar={<ApagarGerado chave="pastas" arquivo="MAPA.md" onApagou={() => {}} />}
          quando={
            mapa.atualizadoEm
              ? t('pastas.atualizado', { quando: diaRelativo(mapa.atualizadoEm) })
              : ''
          }
        />

        <ul className="animate-in-up mt-5">
          {mapa.linhas.map((linha, i) => {
            if (linha.tipo === 'vazia') {
              return <li key={i} aria-hidden className="h-3" />
            }

            if (linha.tipo === 'secao') {
              return (
                <li key={i} className="rule-double mt-4 pt-2 first:mt-0">
                  <p className="text-[10px] tracking-[0.16em] text-[var(--color-ink-3)] uppercase">
                    {limparSecao(linha.nome || linha.proposito)}
                  </p>
                </li>
              )
            }

            const raiz = linha.tipo === 'raiz'

            return (
              <li
                key={i}
                className="flex flex-wrap items-baseline gap-x-2 py-[3px] sm:flex-nowrap"
              >
                <span className="flex min-w-0 shrink-0 items-baseline gap-2 sm:w-[300px]">
                  {!raiz && (
                    <span
                      aria-hidden
                      className="shrink-0 font-mono text-[12px] whitespace-pre text-[var(--color-ink-3)]"
                    >
                      {linha.prefixo}
                    </span>
                  )}
                  <span
                    className={
                      raiz
                        ? 'font-display truncate text-[14px] font-semibold text-[var(--color-ink)]'
                        : 'truncate font-mono text-[12.5px] font-medium text-[var(--color-ink)]'
                    }
                  >
                    {linha.nome}
                  </span>
                </span>

                {linha.proposito && (
                  <span className="w-full min-w-0 pl-6 text-[12.5px] leading-snug text-[var(--color-ink-2)] sm:w-auto sm:flex-1 sm:pl-0">
                    {linha.proposito}
                    {linha.detalheEm && (
                      <span
                        className="ml-1.5 inline-flex items-baseline gap-1 text-[11.5px] text-[var(--color-accent)]"
                        title={t('pastas.temMapaProprioDica')}
                      >
                        <CornerDownRight size={11} aria-hidden className="shrink-0" />
                        <span className="font-mono">{linha.detalheEm}</span>
                      </span>
                    )}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        <Rodape t={t} />
      </div>
    </div>
  )
}

function Cabecalho({
  titulo,
  explicacao,
  quando,
  apagar,
}: {
  titulo: string
  explicacao: string
  quando?: string
  /** A lixeira do documento, quando ele existe. Ver `ApagarGerado`. */
  apagar?: ReactNode
}) {
  return (
    <header className="animate-in-up">
      <div className="flex items-start gap-2">
        <h1 className="font-display flex-1 text-[26px] leading-none text-[var(--color-ink)]">
          {titulo}
        </h1>
        {apagar}
      </div>
      <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
        {explicacao}
      </p>
      {quando && (
        <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">{quando}</p>
      )}
    </header>
  )
}

/** Editar à mão é legítimo: quem é dono do projeto sabe mais que a IA. */
function Rodape({ t }: { t: (chave: string, vars?: Record<string, string | number>) => string }) {
  return (
    <footer className="mt-8 border-t pt-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11.5px] text-[var(--color-ink-3)]">
        <Pencil size={11} aria-hidden className="shrink-0" />
        <span className="font-mono text-[11px]">MAPA.md</span>
        <span>{t('pastas.rodape')}</span>
      </p>
    </footer>
  )
}
