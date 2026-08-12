import { useMemo, useState } from 'react'
import { ApagarGerado } from '@/components/ApagarGerado'
import {
  ChevronRight,
  FileText,
  Files,
  Library,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { mapearDocumentos } from '@/lib/source'
import { diaRelativo } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type {
  AssuntoDocs,
  DocumentosProjeto,
  MapaDocs,
  VarreduraDocs,
  ProjectSnapshot,
} from '@/types/protocol'


type T = (chave: string, vars?: Record<string, string | number>) => string

/** A cor da confiança. `baixa` NUNCA pode parecer igual a `alta`. */
const COR_CONFIANCA: Record<AssuntoDocs['confianca'], string> = {
  alta: 'var(--color-tested)',
  media: 'var(--color-building)',
  baixa: 'var(--color-danger)',
}

function fundo(cor: string, n = 12): string {
  return `color-mix(in oklab, ${cor} ${n}%, transparent)`
}

function quando(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : diaRelativo(iso)
}

/**
 * O mapa do conhecimento escrito do projeto.
 *
 * Em duas camadas, e a ordem importa. Primeiro os FATOS da varredura — quantos
 * documentos existem, quais têm nome repetido — porque isso é verificável e não
 * depende de ninguém opinar: a pessoa vê com os próprios olhos os 26 arquivos
 * chamados README. Só depois vem a LEITURA da IA, que é opinião e por isso
 * carrega a confiança estampada.
 */
export function Documentos({ snapshot }: { snapshot: ProjectSnapshot }) {
  const t = useT()
  const [criando, setCriando] = useState(false)

  const docs = (snapshot as ProjectSnapshot & { documentos?: DocumentosProjeto })
    .documentos

  async function criar() {
    setCriando(true)
    try {
      await mapearDocumentos()
    } finally {
      setCriando(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-8 pt-7 pb-24">
        <header className="animate-in-up">
          <div className="flex items-start gap-2">
            <h1 className="font-display flex-1 text-[26px] leading-none text-[var(--color-ink)]">
              {t('docs.titulo')}
            </h1>
            <ApagarGerado chave="documentos" arquivo=".wtf/docs.json" onApagou={() => {}} />
          </div>
          <p className="mt-2 max-w-[64ch] text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            {t('docs.paraQue')}
          </p>
          {docs?.mapa?.geradoEm && (
            <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">
              {t('docs.atualizado', { quando: quando(docs.mapa.geradoEm) })}
            </p>
          )}
        </header>

        {!docs ? (
          <SemVarredura t={t} />
        ) : (
          <>
            <Fatos varredura={docs.varredura} t={t} />
            {docs.mapa ? (
              <Leitura mapa={docs.mapa} t={t} />
            ) : (
              <ConviteMapear t={t} criando={criando} onCriar={criar} />
            )}
          </>
        )}

        {/* O WTF aponta; quem mexe em arquivo é você, pedindo à IA. */}
        <footer className="mt-8 border-t pt-3">
          <p className="flex items-baseline gap-2 text-[11.5px] leading-snug text-[var(--color-ink-3)]">
            <ShieldCheck size={11} aria-hidden className="shrink-0" />
            <span className="max-w-[70ch]">{t('docs.naoApaga')}</span>
          </p>
        </footer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- os fatos

function Fatos({ varredura, t }: { varredura: VarreduraDocs; t: T }) {
  const deFerramenta = useMemo(
    () => varredura.provavelmenteDeFerramenta.reduce((s, p) => s + p.arquivos, 0),
    [varredura.provavelmenteDeFerramenta],
  )

  const familias = useMemo(
    () =>
      [...varredura.familias].sort(
        (a, b) => b.arquivos.length - a.arquivos.length,
      ),
    [varredura.familias],
  )

  return (
    <section className="animate-in-up mt-5" style={{ animationDelay: '0.05s' }}>
      <Titulo icone={Files} texto={t('docs.fatos')} />
      <p className="mt-1 max-w-[64ch] text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
        {t('docs.fatosNota')}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Numero valor={varredura.total} rotulo={t('docs.total')} />
        <Numero
          valor={deFerramenta}
          rotulo={t('docs.deFerramenta')}
          nota={t('docs.deFerramentaPalpite')}
          cor="var(--color-planned)"
        />
        <Numero
          valor={familias.length}
          rotulo={t('docs.familias')}
          cor="var(--color-accent)"
        />
      </div>

      {varredura.provavelmenteDeFerramenta.length > 0 && (
        <Recolhivel
          titulo={t('docs.verFerramentas')}
          icone={Package}
          padrao={false}
        >
          <ul className="mt-1">
            {varredura.provavelmenteDeFerramenta.map((p) => (
              <li
                key={p.pasta}
                className="flex items-baseline justify-between gap-3 py-[3px]"
              >
                <span className="truncate font-mono text-[12px] text-[var(--color-ink-2)]">
                  {p.pasta}
                </span>
                <span className="shrink-0 text-[11.5px] text-[var(--color-ink-3)]">
                  {t('docs.nArquivos', { n: p.arquivos })}
                </span>
              </li>
            ))}
          </ul>
        </Recolhivel>
      )}

      {familias.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] tracking-[0.16em] text-[var(--color-ink-3)] uppercase">
            {t('docs.mesmoNome')}
          </p>
          <ul className="mt-1.5">
            {familias.map((f) => (
              <li key={f.base + f.tipo} className="rule-double pt-1.5">
                <Recolhivel
                  padrao={false}
                  titulo={
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-mono text-[12.5px] font-medium text-[var(--color-ink)]">
                        {f.base}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-[var(--color-ink-3)]">
                        {t('docs.nCopias', { n: f.arquivos.length })}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--color-ink-3)]">
                        {f.tipo === 'versao'
                          ? t('docs.motivoSufixo')
                          : t('docs.motivoMesmoNome')}
                      </span>
                    </span>
                  }
                >
                  <ul className="mt-1 mb-1">
                    {f.arquivos.map((c) => (
                      <li
                        key={c.caminho}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 py-[2px]"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--color-ink-2)]">
                          {c.caminho}
                        </span>
                        {quando(c.ultimoCommitEm) && (
                          <span className="shrink-0 text-[11px] text-[var(--color-ink-3)]">
                            {quando(c.ultimoCommitEm)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Recolhivel>
              </li>
            ))}
          </ul>
        </div>
      )}

      {varredura.porPasta.length > 0 && (
        <Recolhivel titulo={t('docs.verPorPasta')} padrao={false}>
          <ul className="mt-1 sm:columns-2">
            {varredura.porPasta.map((p) => (
              <li
                key={p.pasta}
                className="flex items-baseline justify-between gap-3 py-[2px] break-inside-avoid"
              >
                <span className="truncate font-mono text-[11.5px] text-[var(--color-ink-2)]">
                  {p.pasta}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--color-ink-3)]">
                  {p.total}
                </span>
              </li>
            ))}
          </ul>
        </Recolhivel>
      )}
    </section>
  )
}

// -------------------------------------------------------- a leitura da IA

function Leitura({ mapa, t }: { mapa: MapaDocs; t: T }) {
  return (
    <section className="animate-in-up mt-8" style={{ animationDelay: '0.1s' }}>
      <Titulo icone={Sparkles} texto={t('docs.leitura')} />
      <p className="mt-1 max-w-[64ch] text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
        {t('docs.leituraNota', {
          lidos: mapa.totalLidos ?? 0,
          encontrados: mapa.totalEncontrados ?? 0,
        })}
      </p>

      {mapa.ignorados && mapa.ignorados.length > 0 && (
        <Recolhivel titulo={t('docs.verIgnorados')} padrao={false}>
          <ul className="mt-1">
            {mapa.ignorados.map((i) => (
              <li key={i.pasta} className="py-[3px]">
                <span className="font-mono text-[11.5px] text-[var(--color-ink-2)]">
                  {i.pasta}
                </span>
                <span className="ml-2 text-[11.5px] text-[var(--color-ink-3)]">
                  {i.motivo} · {t('docs.nArquivos', { n: i.arquivos ?? 0 })}
                </span>
              </li>
            ))}
          </ul>
        </Recolhivel>
      )}

      <ul className="mt-3">
        {mapa.assuntos.map((a) => (
          <li key={a.assunto} className="card mt-2 p-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="font-display text-[15px] font-medium text-[var(--color-ink)]">
                {a.assunto}
              </h3>
              <MarcaConfianca confianca={a.confianca} t={t} />
            </div>
            <p className="mt-1 max-w-[64ch] text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
              {a.resumo}
            </p>

            <div
              className="mt-2.5 rounded-lg px-3 py-2"
              style={{ background: fundo('var(--color-accent)', 8) }}
            >
              <p className="flex items-baseline gap-2">
                <FileText
                  size={12}
                  aria-hidden
                  className="shrink-0 text-[var(--color-accent)]"
                />
                <span className="min-w-0 font-mono text-[12.5px] break-all text-[var(--color-ink)]">
                  {a.vigente}
                </span>
                <span className="shrink-0 text-[10px] tracking-[0.14em] text-[var(--color-ink-3)] uppercase">
                  {t('docs.vigente')}
                </span>
              </p>
              <p className="mt-1 max-w-[64ch] text-[11.5px] leading-snug text-[var(--color-ink-2)]">
                {a.porque}
              </p>
            </div>

            {a.outros && a.outros.length > 0 && (
              <Recolhivel
                padrao={false}
                titulo={t('docs.verOutros', { n: a.outros.length })}
              >
                <ul className="mt-1">
                  {a.outros.map((o) => (
                    <li key={o.caminho} className="py-[3px]">
                      <p className="font-mono text-[11.5px] break-all text-[var(--color-ink-2)]">
                        {o.caminho}
                      </p>
                      <p className="text-[11.5px] leading-snug text-[var(--color-ink-3)]">
                        {o.situacao} — {o.porque}
                      </p>
                    </li>
                  ))}
                </ul>
              </Recolhivel>
            )}
          </li>
        ))}
      </ul>

      {mapa.orfaos && mapa.orfaos.length > 0 && (
        <div className="mt-6">
          <Recolhivel
            padrao={false}
            titulo={
              <span className="text-[11.5px] text-[var(--color-ink-3)]">
                {t('docs.orfaos', { n: mapa.orfaos.length })}
              </span>
            }
          >
            <ul className="mt-1">
              {mapa.orfaos.map((o) => (
                <li
                  key={o.caminho}
                  className="flex flex-wrap items-baseline gap-x-2 py-[2px]"
                >
                  <span className="font-mono text-[11.5px] break-all text-[var(--color-ink-2)]">
                    {o.caminho}
                  </span>
                  <span className="text-[11px] text-[var(--color-ink-3)]">
                    {o.porque}
                  </span>
                </li>
              ))}
            </ul>
          </Recolhivel>
        </div>
      )}
    </section>
  )
}

// -------------------------------------------------------------- auxiliares

function MarcaConfianca({
  confianca,
  t,
}: {
  confianca: AssuntoDocs['confianca']
  t: T
}) {
  const cor = COR_CONFIANCA[confianca]
  const baixa = confianca === 'baixa'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-medium"
      style={{
        color: cor,
        background: fundo(cor, baixa ? 16 : 11),
        border: baixa
          ? `1px solid color-mix(in oklab, ${cor} 45%, transparent)`
          : '1px solid transparent',
      }}
      title={t(`docs.confianca.${confianca}.dica`)}
    >
      {t(`docs.confianca.${confianca}`)}
    </span>
  )
}

function Numero({
  valor,
  rotulo,
  nota,
  cor = 'var(--color-ink)',
}: {
  valor: number
  rotulo: string
  nota?: string
  cor?: string
}) {
  return (
    <div className="card px-3 py-2.5">
      <p className="font-display text-[22px] leading-none" style={{ color: cor }}>
        {valor}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink-2)]">
        {rotulo}
      </p>
      {nota && (
        <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--color-ink-3)]">
          {nota}
        </p>
      )}
    </div>
  )
}

function Titulo({
  icone: Icone,
  texto,
}: {
  icone: typeof Files
  texto: string
}) {
  return (
    <h2 className="flex items-center gap-2">
      <Icone size={14} aria-hidden className="shrink-0 text-[var(--color-accent)]" />
      <span className="font-display text-[15px] font-medium text-[var(--color-ink)]">
        {texto}
      </span>
    </h2>
  )
}

/** Densidade alta: quase tudo nasce fechado, e abre com um clique. */
function Recolhivel({
  titulo,
  children,
  icone: Icone,
  padrao = false,
}: {
  titulo: React.ReactNode
  children: React.ReactNode
  icone?: typeof Files
  padrao?: boolean
}) {
  const [aberto, setAberto] = useState(padrao)
  return (
    <div className="mt-2">
      <button
        onClick={() => setAberto((a) => !a)}
        className="no-drag flex w-full min-w-0 items-baseline gap-1.5 text-left text-[12px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
      >
        <ChevronRight
          size={12}
          aria-hidden
          className="shrink-0 transition-transform"
          style={{ transform: aberto ? 'rotate(90deg)' : 'none' }}
        />
        {Icone && <Icone size={12} aria-hidden className="shrink-0" />}
        <span className="min-w-0 flex-1">{titulo}</span>
      </button>
      {aberto && <div className="pl-[18px]">{children}</div>}
    </div>
  )
}

function ConviteMapear({
  t,
  criando,
  onCriar,
}: {
  t: T
  criando: boolean
  onCriar: () => void
}) {
  return (
    <section className="card animate-in-up mt-6 p-5" style={{ animationDelay: '0.1s' }}>
      <Titulo icone={Library} texto={t('docs.vazioTitulo')} />
      <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-[var(--color-ink-2)]">
        {t('docs.vazioTexto')}
      </p>
      <button
        onClick={onCriar}
        disabled={criando}
        className="no-drag mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors disabled:opacity-60"
        style={{
          color: 'var(--color-accent)',
          borderColor: 'color-mix(in oklab, var(--color-accent) 40%, transparent)',
          background: 'color-mix(in oklab, var(--color-accent) 8%, transparent)',
        }}
      >
        <Library size={14} className="shrink-0" />
        {criando ? t('docs.criando') : t('docs.criar')}
      </button>
    </section>
  )
}

/** Nem a varredura existe ainda: nem os fatos dá para mostrar. */
function SemVarredura({ t }: { t: T }) {
  return (
    <section className="card animate-in-up mt-5 p-5">
      <Titulo icone={Library} texto={t('docs.semVarreduraTitulo')} />
      <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-[var(--color-ink-2)]">
        {t('docs.semVarreduraTexto')}
      </p>
    </section>
  )
}
