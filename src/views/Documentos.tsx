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

/**
 * A tinta da confiança.
 *
 * POR QUÊ deixou de usar as cores de estado: `alta` era `--color-tested` e
 * `media` era `--color-building` — dois dos cinco tokens de ESTADO da parte do
 * software (a máquina conferiu / está sendo escrito agora) emprestados para
 * dizer outra coisa (o quanto a IA acredita na própria leitura). Uma cor, um
 * significado: se o verde de "testado" também diz "certeza alta", o verde
 * deixou de afirmar qualquer coisa.
 *
 * O que sobra é uma rampa de tinta neutra, e ela é INVERSA à confiança: quanto
 * mais certeza, mais quieto (não há nada a fazer); a única que grita é `baixa`,
 * porque ela é literalmente um pedido de conferência — e para pedido existe um
 * token só, `--color-danger`. `baixa` NUNCA pode parecer igual a `alta`, e
 * continua não parecendo: é a única com pílula, borda e carmim.
 */
const TINTA_CONFIANCA: Record<AssuntoDocs['confianca'], string> = {
  alta: 'var(--color-ink-3)',
  media: 'var(--color-ink-2)',
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
 * Em duas camadas, e a diferença entre elas importa. De um lado os FATOS da
 * varredura — quantos documentos existem, quais têm nome repetido — porque isso
 * é verificável e não depende de ninguém opinar: a pessoa vê com os próprios
 * olhos os 26 arquivos chamados README. Do outro a LEITURA da IA, que é opinião
 * e por isso carrega a confiança estampada em cada assunto.
 *
 * ─── a moldura, e por que ela deixou de ser uma coluna centrada ───────────
 *
 * POR QUÊ: a crítica mediu 41% da janela em papel em branco, e esta tela era
 * uma coluna de 900px no meio de 1456 — quase 280px mortos de cada lado,
 * enquanto os caminhos de arquivo quebravam em três linhas dentro da coluna.
 * Margem morta não vira respiro, vira lugar nenhum.
 *
 * Então virou trilho, na mesma medida da tela Início (leitura + 400px), para
 * que as duas pareçam o mesmo produto. À esquerda a LEITURA: qual documento
 * vale hoje sobre cada assunto, em frases inteiras — é a pergunta que traz
 * alguém a esta tela. À direita o CENSO: contagens e listas de nomes repetidos,
 * coisas que se conferem de relance, não se leem.
 *
 * As duas camadas continuam separadas — mas agora por POSIÇÃO, lado a lado, e
 * não por ordem vertical. O fato não fica escondido embaixo da opinião: ele
 * está no alto da tela, ao lado dela, o tempo todo. Abaixo de 960px de largura
 * ÚTIL o trilho desce para o fim, e aí a ordem vira leitura → fatos.
 *
 * A quebra é por `@container` e não por viewport de propósito: a lateral do app
 * pode estar aberta ou fechada e o terminal pode estar docado à direita — o que
 * decide se cabem duas colunas é a largura que sobra AQUI.
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
      <div className="@container mx-auto max-w-[1200px] px-10 pt-7 pb-group">
        {/* A manchete é a única `text-display` da tela. Era 26px/400 — mais
            leve que o nome do projeto na lateral, que é moldura. */}
        <header className="animate-in-up flex items-start gap-item">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-display text-[var(--color-ink)]">
              {t('docs.titulo')}
            </h1>
            <p className="text-lead mt-hair max-w-[60ch] text-[var(--color-ink-2)]">
              {t('docs.paraQue')}
            </p>
            {docs?.mapa?.geradoEm && (
              <p className="text-meta mt-hair text-[var(--color-ink-3)]">
                {t('docs.atualizado', { quando: quando(docs.mapa.geradoEm) })}
              </p>
            )}
          </div>
          <ApagarGerado chave="documentos" arquivo=".wtf/docs.json" onApagou={() => {}} />
        </header>

        {!docs ? (
          /* Nem a varredura existe: não há censo para o trilho carregar, então
             a tela não finge duas colunas. */
          <div className="mt-group">
            <SemVarredura t={t} />
          </div>
        ) : (
          /* 960px é onde a conta fecha, medida por dentro: 528 de leitura + 32
             de vão + 400 de trilho. É o mesmo número da tela Início — duas
             telas do mesmo app não quebram em larguras diferentes. */
          <div className="mt-group grid grid-cols-1 items-start gap-group @min-[960px]:grid-cols-[minmax(0,1fr)_400px]">
            {/* ─── leitura: qual documento vale hoje sobre cada assunto ─── */}
            <div className="min-w-0 space-y-group">
              {docs.mapa ? (
                <Leitura mapa={docs.mapa} t={t} />
              ) : (
                <ConviteMapear t={t} criando={criando} onCriar={criar} />
              )}
            </div>

            {/* ─── trilho: o censo, que se confere de relance ─── */}
            <aside className="min-w-0 space-y-group">
              <Fatos varredura={docs.varredura} t={t} />
            </aside>
          </div>
        )}

        {/* O WTF aponta; quem mexe em arquivo é você, pedindo à IA.
            Sem o filete de antes: com 32px separando o rodapé do que vem acima
            — o dobro do respiro interno dos cartões — a linha não tem mais o
            que fazer. */}
        <footer className="mt-group">
          <p className="text-meta flex items-baseline gap-item text-[var(--color-ink-3)]">
            <ShieldCheck size={13} aria-hidden className="shrink-0" />
            <span className="max-w-[70ch]">{t('docs.naoApaga')}</span>
          </p>
        </footer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- os fatos

/**
 * O censo, no trilho.
 *
 * POR QUÊ os três números viraram linhas de uma lista: em cartões lado a lado
 * eles ficavam alinhados por CIMA, e cada rótulo quebrava em um número
 * diferente de linhas — três caixas de alturas diferentes dizendo três coisas
 * do mesmo tipo. Em lista, o número vem primeiro e o rótulo completa a frase
 * ("142 documentos no projeto"), que é como alguém leria em voz alta.
 */
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
    <>
      <section
        className="card animate-in-up p-card"
        style={{ animationDelay: '0.1s' }}
      >
        <RotuloSecao icone={Files} texto={t('docs.fatos')} />
        <p className="text-meta mt-item text-[var(--color-ink-2)]">
          {t('docs.fatosNota')}
        </p>

        <ul className="mt-card space-y-item">
          <LinhaNumero valor={varredura.total} rotulo={t('docs.total')} />
          {/* `quieto`: estes são os documentos que vieram junto com uma
              ferramenta, ou seja, ruído. A diferença entre eles e os outros dois
              números é de TINTA (ink-3, o degrau mais quieto), não de cor de
              estado — `--color-planned` significa "nada aconteceu ainda" numa
              parte do software, e emprestar esse sinal para decorar um número
              gasta o sinal. */}
          <LinhaNumero
            valor={deFerramenta}
            rotulo={t('docs.deFerramenta')}
            nota={t('docs.deFerramentaPalpite')}
            quieto
          />
          <LinhaNumero valor={familias.length} rotulo={t('docs.familias')} />
        </ul>

        {varredura.provavelmenteDeFerramenta.length > 0 && (
          <Recolhivel
            titulo={t('docs.verFerramentas')}
            icone={Package}
            padrao={false}
          >
            <ul className="mt-item space-y-hair">
              {varredura.provavelmenteDeFerramenta.map((p) => (
                <li
                  key={p.pasta}
                  className="text-meta flex items-baseline justify-between gap-item"
                >
                  <span className="truncate font-mono text-[var(--color-ink-2)]">
                    {p.pasta}
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--color-ink-3)]">
                    {t('docs.nArquivos', { n: p.arquivos })}
                  </span>
                </li>
              ))}
            </ul>
          </Recolhivel>
        )}

        {varredura.porPasta.length > 0 && (
          <Recolhivel titulo={t('docs.verPorPasta')} padrao={false}>
            {/* Sem `columns-2`: no trilho de 400px duas colunas de caminho de
                pasta cortavam o nome no meio. */}
            <ul className="mt-item space-y-hair">
              {varredura.porPasta.map((p) => (
                <li
                  key={p.pasta}
                  className="text-meta flex items-baseline justify-between gap-item"
                >
                  <span className="truncate font-mono text-[var(--color-ink-2)]">
                    {p.pasta}
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--color-ink-3)]">
                    {p.total}
                  </span>
                </li>
              ))}
            </ul>
          </Recolhivel>
        )}
      </section>

      {familias.length > 0 && (
        <section
          className="card animate-in-up p-card"
          style={{ animationDelay: '0.15s' }}
        >
          {/* Era 10px em caixa alta com 0,16em de espacejamento — abaixo do
              piso de 11px, e este é o rótulo do bloco que responde "por que
              tenho sete arquivos com o mesmo nome?". `.label` é o mesmo rótulo
              usado nas outras telas. */}
          <RotuloSecao texto={t('docs.mesmoNome')} />

          {/* Sem `rule-double` entre as famílias: o filete existia para separar
              itens que estavam a 16px um do outro — o mesmo espaço que havia
              dentro deles. Com 8px entre irmãos e 16px de respiro no cartão, o
              grupo já se lê sozinho. */}
          <ul className="mt-item space-y-item">
            {familias.map((f) => (
              <li key={f.base + f.tipo}>
                <Recolhivel
                  padrao={false}
                  titulo={
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-item gap-y-hair">
                      <span className="truncate font-mono font-medium text-[var(--color-ink)]">
                        {f.base}
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--color-ink-3)]">
                        {t('docs.nCopias', { n: f.arquivos.length })}
                      </span>
                      <span className="shrink-0 text-[var(--color-ink-3)]">
                        {f.tipo === 'versao'
                          ? t('docs.motivoSufixo')
                          : t('docs.motivoMesmoNome')}
                      </span>
                    </span>
                  }
                >
                  <ul className="mt-item space-y-hair">
                    {f.arquivos.map((c) => (
                      <li
                        key={c.caminho}
                        className="text-meta flex flex-wrap items-baseline justify-between gap-x-item"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[var(--color-ink-2)]">
                          {c.caminho}
                        </span>
                        {quando(c.ultimoCommitEm) && (
                          <span className="shrink-0 text-[var(--color-ink-3)]">
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
        </section>
      )}
    </>
  )
}

// -------------------------------------------------------- a leitura da IA

function Leitura({ mapa, t }: { mapa: MapaDocs; t: T }) {
  return (
    <>
      <section className="animate-in-up" style={{ animationDelay: '0.05s' }}>
        {/* O título da seção é rótulo, não manchete: ele era 15px serifado, o
            mesmo tamanho do nome do assunto que ele encabeça — moldura do
            tamanho do conteúdo. Quem cresceu foi o assunto (19px). */}
        <RotuloSecao icone={Sparkles} texto={t('docs.leitura')} />
        {/* A ressalva ("é leitura dela, não verdade") fica junto do rótulo
            porque vale para tudo que vem abaixo. */}
        <p className="text-meta mt-item max-w-[64ch] text-[var(--color-ink-2)]">
          {t('docs.leituraNota', {
            lidos: mapa.totalLidos ?? 0,
            encontrados: mapa.totalEncontrados ?? 0,
          })}
        </p>

        {mapa.ignorados && mapa.ignorados.length > 0 && (
          <Recolhivel titulo={t('docs.verIgnorados')} padrao={false}>
            <ul className="mt-item space-y-hair">
              {mapa.ignorados.map((i) => (
                <li key={i.pasta} className="text-meta">
                  <span className="font-mono text-[var(--color-ink-2)]">
                    {i.pasta}
                  </span>
                  <span className="ml-hair text-[var(--color-ink-3)]">
                    {i.motivo} · {t('docs.nArquivos', { n: i.arquivos ?? 0 })}
                  </span>
                </li>
              ))}
            </ul>
          </Recolhivel>
        )}

        {/* 8px entre cartões, 16px dentro deles: o espaço DENTRO precisa ser
            maior que o espaço ENTRE, senão a lista não agrupa. Antes os dois
            eram 16px. */}
        <ul className="mt-card space-y-item">
          {mapa.assuntos.map((a) => (
            <li key={a.assunto} className="card p-card">
              <div className="flex flex-wrap items-baseline gap-x-item gap-y-hair">
                {/* 19px: o assunto é O conteúdo desta tela. Estava a 15px, o
                    mesmo tamanho do título da seção acima dele. */}
                <h3 className="text-title font-display min-w-0 flex-1 text-[var(--color-ink)]">
                  {a.assunto}
                </h3>
                <MarcaConfianca confianca={a.confianca} t={t} />
              </div>
              <p className="text-lead mt-hair max-w-[64ch] text-[var(--color-ink-2)]">
                {a.resumo}
              </p>

              {/* A resposta da tela: qual documento vale hoje. Ganha 16px de
                  distância do resumo (o dobro dos 8px que separam os outros
                  pedaços do cartão) — é o único jeito de o olho achar isto
                  primeiro sem que a caixa precise de cor de sinal.
                  O fundo é `--color-accent-soft`, que é o token de REALCE de
                  fundo. Antes era `--color-accent`, que agora é a tinta de
                  interação: pintar de "clicável" uma caixa que não clica. */}
              <div
                className="mt-card rounded-lg p-item"
                style={{ background: fundo('var(--color-accent-soft)', 60) }}
              >
                <p className="flex flex-wrap items-baseline gap-x-item gap-y-hair">
                  <FileText
                    size={13}
                    aria-hidden
                    className="shrink-0 text-[var(--color-ink-2)]"
                  />
                  {/* 15px e não 12,5px: este caminho é a informação que a
                      pessoa vai copiar, digitar ou procurar. */}
                  <span className="text-lead min-w-0 font-mono break-all text-[var(--color-ink)]">
                    {a.vigente}
                  </span>
                  {/* Era 10px — abaixo do piso de leitura. `.label` traz os
                      11px, o peso e a caixa alta de uma vez. */}
                  <span className="label shrink-0 text-[var(--color-ink-2)]">
                    {t('docs.vigente')}
                  </span>
                </p>
                <p className="text-meta mt-hair max-w-[64ch] text-[var(--color-ink-2)]">
                  {a.porque}
                </p>
              </div>

              {a.outros && a.outros.length > 0 && (
                <Recolhivel
                  padrao={false}
                  titulo={t('docs.verOutros', { n: a.outros.length })}
                >
                  <ul className="mt-item space-y-item">
                    {a.outros.map((o) => (
                      <li key={o.caminho} className="text-meta">
                        <p className="font-mono break-all text-[var(--color-ink-2)]">
                          {o.caminho}
                        </p>
                        <p className="text-[var(--color-ink-3)]">
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
      </section>

      {mapa.orfaos && mapa.orfaos.length > 0 && (
        <section className="animate-in-up" style={{ animationDelay: '0.2s' }}>
          <Recolhivel padrao={false} titulo={t('docs.orfaos', { n: mapa.orfaos.length })}>
            <ul className="mt-item space-y-hair">
              {mapa.orfaos.map((o) => (
                <li
                  key={o.caminho}
                  className="text-meta flex flex-wrap items-baseline gap-x-item"
                >
                  <span className="font-mono break-all text-[var(--color-ink-2)]">
                    {o.caminho}
                  </span>
                  <span className="text-[var(--color-ink-3)]">{o.porque}</span>
                </li>
              ))}
            </ul>
          </Recolhivel>
        </section>
      )}
    </>
  )
}

// -------------------------------------------------------------- auxiliares

/**
 * O selo de confiança.
 *
 * Só `baixa` vira pílula: era o único dos três que precisava ser visto de
 * longe ("confira este"), e os três tinham o mesmo desenho — quando tudo é
 * selo, nenhum selo chama. Os outros dois são rótulo puro, no degrau de tinta
 * que a confiança merece.
 */
function MarcaConfianca({
  confianca,
  t,
}: {
  confianca: AssuntoDocs['confianca']
  t: T
}) {
  const cor = TINTA_CONFIANCA[confianca]
  const baixa = confianca === 'baixa'
  return (
    <span
      className={[
        'label shrink-0',
        baixa ? 'rounded-full border px-item py-hair' : '',
      ].join(' ')}
      style={{
        color: cor,
        background: baixa ? fundo(cor, 14) : undefined,
        borderColor: baixa ? fundo(cor, 45) : undefined,
      }}
      title={t(`docs.confianca.${confianca}.dica`)}
    >
      {t(`docs.confianca.${confianca}`)}
    </span>
  )
}

/**
 * Uma linha do censo: o número, e a frase que ele completa.
 *
 * O número é `text-title` (19px) — era 22px, um degrau que não existe na
 * escala. O rótulo e a nota têm o MESMO tamanho (13px) e se separam por tinta,
 * não por corpo: era a nota que estava a 10,5px, abaixo do piso de leitura.
 */
function LinhaNumero({
  valor,
  rotulo,
  nota,
  quieto,
}: {
  valor: number
  rotulo: string
  nota?: string
  quieto?: boolean
}) {
  return (
    <li className="flex items-baseline gap-item">
      {/* `min-w-[2ch]`: medida tipográfica, não espaço de layout — é o que
          mantém os três números alinhados à direita quando um tem uma casa e o
          outro tem três. */}
      <span
        className="text-title min-w-[2ch] shrink-0 text-right font-mono tabular-nums"
        style={{ color: quieto ? 'var(--color-ink-3)' : 'var(--color-ink)' }}
      >
        {valor}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-meta block text-[var(--color-ink-2)]">{rotulo}</span>
        {nota && (
          <span className="text-meta block text-[var(--color-ink-3)]">{nota}</span>
        )}
      </span>
    </li>
  )
}

/**
 * Rótulo de bloco. Nunca um tamanho maior que o conteúdo que ele encabeça —
 * daí `.label` (11px, caixa alta) no lugar dos 15px serifados de antes.
 * O ícone acompanha a tinta do rótulo: ele era `--color-accent`, e accent é a
 * tinta de interação, não de decoração.
 */
function RotuloSecao({
  icone: Icone,
  texto,
}: {
  icone?: typeof Files
  texto: string
}) {
  return (
    <h2 className="label flex items-center gap-hair text-[var(--color-ink-3)]">
      {Icone && <Icone size={13} aria-hidden className="shrink-0" />}
      <span>{texto}</span>
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
    <div className="mt-item">
      <button
        onClick={() => setAberto((a) => !a)}
        className="no-drag text-meta flex w-full min-w-0 items-baseline gap-hair text-left text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
      >
        <ChevronRight
          size={13}
          aria-hidden
          className="shrink-0 transition-transform"
          style={{ transform: aberto ? 'rotate(90deg)' : 'none' }}
        />
        {Icone && <Icone size={13} aria-hidden className="shrink-0" />}
        <span className="min-w-0 flex-1">{titulo}</span>
      </button>
      {/* O recuo alinha o conteúdo com o texto do gatilho (13px de seta + 4px
          de vão), e é o mesmo degrau de 16px do respiro de cartão. */}
      {aberto && <div className="pl-card">{children}</div>}
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
    <section className="card animate-in-up p-card" style={{ animationDelay: '0.05s' }}>
      {/* Aqui o título NÃO é rótulo: ele é a frase principal do cartão ("a IA
          ainda não leu estes documentos"), o conteúdo em pessoa. Por isso
          `text-title`, o mesmo degrau do nome de um assunto. */}
      <h2 className="text-title font-display text-[var(--color-ink)]">
        {t('docs.vazioTitulo')}
      </h2>
      <p className="text-lead mt-item max-w-[60ch] text-[var(--color-ink-2)]">
        {t('docs.vazioTexto')}
      </p>
      <button
        onClick={onCriar}
        disabled={criando}
        className="no-drag text-meta mt-card inline-flex items-center gap-hair rounded-lg border px-item py-hair transition-colors disabled:opacity-60"
        style={{
          color: 'var(--color-accent)',
          borderColor: 'color-mix(in oklab, var(--color-accent) 40%, transparent)',
          background: 'color-mix(in oklab, var(--color-accent) 8%, transparent)',
        }}
      >
        <Library size={13} className="shrink-0" />
        {criando ? t('docs.criando') : t('docs.criar')}
      </button>
    </section>
  )
}

/** Nem a varredura existe ainda: nem os fatos dá para mostrar. */
function SemVarredura({ t }: { t: T }) {
  return (
    <section className="card animate-in-up p-card">
      <h2 className="text-title font-display text-[var(--color-ink)]">
        {t('docs.semVarreduraTitulo')}
      </h2>
      <p className="text-lead mt-item max-w-[60ch] text-[var(--color-ink-2)]">
        {t('docs.semVarreduraTexto')}
      </p>
    </section>
  )
}
