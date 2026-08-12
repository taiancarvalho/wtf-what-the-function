import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
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
 *
 * ─── o que mudou na superfície (diagnóstico em .gauntlet/diagnostico) ───────
 *
 * TAMANHOS. A tela tinha 15 tamanhos escritos à mão — 10, 11,5, 12, 12,5, 13,
 * 13,5, 14, 26 — sendo que 12, 12,5 e 13 apareciam lado a lado na MESMA linha.
 * Meio pixel de diferença não comunica hierarquia nenhuma; só ruído. Agora são
 * três degraus da escala: display (título), lead (a frase que explica a pasta)
 * e meta (o nome da pasta e o traço da árvore). O rótulo de seção estava a
 * 10px — abaixo do piso de 11px, num app para quem não lê código — e virou
 * `.label`.
 *
 * LARGURA. Era uma coluna de 860px centrada: numa janela de 1456 com a lateral
 * aberta, ~180px mortos de cada lado, e a frase de cada pasta espremida em
 * ~520px enquanto sobrava tela. A margem morta virou trilho, com os mesmos
 * números da Home (leitura + 32 + 400): o índice das seções, que é o que se
 * confere, sai da coluna de leitura e a frase de cada pasta ganha a largura.
 * A quebra é por `@container` e não por viewport, porque quem decide se cabem
 * duas colunas é a largura que SOBRA aqui — a lateral pode estar fechada e o
 * terminal docado à direita.
 *
 * RITMO. Cada linha tinha 3px de respiro e as seções eram separadas por um
 * filete — ou seja, o que agrupava era um traço, não o espaço. Agora: 8px
 * entre irmãos da lista (4 em cima + 4 embaixo), 32px entre seções. Com essa
 * distância o filete ficou redundante e saiu.
 */
export function Pastas({ snapshot }: { snapshot: ProjectSnapshot }) {
  const t = useT()
  const [criando, setCriando] = useState(false)

  const mapa = (snapshot as ProjectSnapshot).pastas

  /**
   * O índice do trilho: cada seção do mapa e quantas pastas moram nela.
   *
   * Não é informação nova — são as mesmas seções e as mesmas linhas da árvore,
   * contadas. Existe porque um MAPA.md real chega a 200 linhas (é o teto do
   * leitor, em `electron/folders.js`) e sem índice a única forma de saber
   * quantas áreas o projeto tem é rolar até o fim contando.
   */
  const secoes = useMemo(() => {
    const fora: { id: string; nome: string; n: number }[] = []
    for (const [i, linha] of (mapa?.linhas ?? []).entries()) {
      if (linha.tipo === 'secao') {
        fora.push({
          id: `pastas-secao-${i}`,
          nome: limparSecao(linha.nome || linha.proposito),
          n: 0,
        })
      } else if (linha.tipo === 'pasta' && fora.length > 0) {
        fora[fora.length - 1].n += 1
      }
    }
    return fora
  }, [mapa])

  /**
   * A largura da coluna dos nomes, em caracteres do próprio desenho.
   *
   * POR QUÊ não um número fixo: a versão antiga reservava 300px para o nome da
   * pasta. Neste projeto o nome mais longo (`├── skill/documentos/`) ocupa 20
   * caracteres — 156px — e os 144px restantes eram um buraco no meio de cada
   * linha, enquanto a frase que explica a pasta quebrava em duas linhas do
   * outro lado. Medindo o desenho, a coluna encosta no nome mais comprido e
   * TODA a sobra vai para a frase, que é o conteúdo da tela.
   *
   * O piso de 12 evita que um mapa de nomes curtos cole as duas colunas; o teto
   * de 34 evita que um caminho monstruoso engula a frase (aí ele trunca).
   */
  const larguraNome = useMemo(() => {
    const maior = (mapa?.linhas ?? [])
      .filter((l) => l.tipo === 'pasta')
      .reduce((m, l) => Math.max(m, l.prefixo.length + l.nome.length), 0)
    return Math.min(Math.max(maior + 1, 12), 34)
  }, [mapa])

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
        <div className="@container mx-auto max-w-[1200px] px-10 pt-7 pb-group">
          <Cabecalho titulo={t('pastas.titulo')} explicacao={t('pastas.paraQue')} />

          {/* A mesma moldura de duas colunas da tela cheia, de propósito: sem
              mapa não há índice, mas o que o arquivo É continua sendo detalhe,
              e detalhe mora no trilho. Empilhado, o convite ocupava 600px de
              uma faixa de 1120 e a metade direita da tela ficava morta —
              justamente o que a crítica mediu em 41% da janela. */}
          <div className="mt-group grid grid-cols-1 items-start gap-group @min-[960px]:grid-cols-[minmax(0,1fr)_400px]">
            <section
              className="card animate-in-up max-w-[62ch] p-card"
              style={{ animationDelay: '0.05s' }}
            >
              <div className="flex items-center gap-hair">
                <FolderTree size={15} className="shrink-0 text-[var(--color-ink-3)]" />
                {/* text-title (19px) e não 15px: este é o assunto do cartão, e o
                  cartão é a tela inteira aqui. Sem cor de token no ícone: a
                  cor de interação é do botão, que é a única coisa clicável. */}
                <h2 className="font-display text-title">{t('pastas.vazioTitulo')}</h2>
              </div>
              <p className="text-lead mt-item max-w-[56ch] text-[var(--color-ink-2)]">
                {t('pastas.vazioTexto')}
              </p>
              {/* Botão cheio, e não contorno com fundo a 8%: no sistema novo
                `background: accent` + `color: paper` é o botão de alto
                contraste, e esta é a única ação da tela. O contorno a 8%
                rendia 3 pontos de RGB contra o papel — um botão que ninguém
                vê não é uma ação, é um enfeite. */}
              <button
                onClick={criar}
                disabled={criando}
                className="no-drag text-meta mt-card inline-flex items-center gap-hair rounded-lg px-3 py-2 font-medium transition-opacity disabled:opacity-60"
                style={{
                  background: 'var(--color-accent)',
                  color: 'var(--color-paper)',
                }}
              >
                <FolderTree size={14} className="shrink-0" />
                {criando ? t('pastas.criando') : t('pastas.criar')}
              </button>
            </section>

            <aside className="min-w-0">
              <Arquivo t={t} />
            </aside>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="@container mx-auto max-w-[1200px] px-10 pt-7 pb-group">
        <Cabecalho titulo={t('pastas.titulo')} explicacao={t('pastas.paraQue')} />

        {/*
          Os mesmos números da Home, de propósito — é o mesmo produto: 528 de
          leitura + 32 entre colunas + 400 de trilho = 960px medidos POR DENTRO
          (o `@container` já desconta o respiro lateral). Abaixo disso as duas
          colunas viram uma e o índice desce para o fim.
        */}
        <div className="mt-group grid grid-cols-1 items-start gap-group @min-[960px]:grid-cols-[minmax(0,1fr)_400px]">
          {/* ─── leitura: para que serve cada pasta ─── */}
          {/* `@container` aninhado: quem decide se o nome da pasta e a frase
              cabem lado a lado é a largura DESTA coluna, não a da janela nem a
              do quadro inteiro. */}
          <div className="@container min-w-0">
            <ul
              className="animate-in-up"
              /* A medida vai por variável porque quem decide se as duas colunas
                 existem é a consulta de container lá embaixo, e consulta de
                 container não se escreve em `style`. */
              style={{ '--col-nome': `${larguraNome}ch` } as CSSProperties}
            >
              {mapa.linhas.map((linha, i) => {
                if (linha.tipo === 'vazia') {
                  /* A linha em branco da árvore é a quebra de grupo que quem
                     escreveu o MAPA.md desenhou à mão. Antes ela valia 12px,
                     um valor fora da escala; agora vale 8px, o degrau entre
                     irmãos. Quando ela vem logo antes de um rótulo de seção,
                     some: o rótulo já traz os 32px de separação, e 8+32 seria
                     um espaço que não existe no sistema. */
                  const proxima = mapa.linhas[i + 1]
                  if (proxima?.tipo === 'secao') return null
                  return <li key={i} aria-hidden className="h-item" />
                }

                if (linha.tipo === 'secao') {
                  return (
                    <li
                      key={i}
                      id={`pastas-secao-${i}`}
                      /* 32px acima, 8px abaixo: o rótulo pertence às linhas que
                         encabeça e se separa do grupo anterior pelo dobro do
                         maior espaço interno. Era `rule-double` + 16px — o
                         filete fazia o trabalho que o espaço não fazia. */
                      className="mt-group scroll-mt-6 pb-item first:mt-0"
                    >
                      {/* `.label` (11px caixa alta, peso 600) e não 10px: havia
                          texto de 10px carregando informação real numa tela
                          feita para quem não lê código. */}
                      <p className="label text-[var(--color-ink-3)]">
                        {limparSecao(linha.nome || linha.proposito)}
                      </p>
                    </li>
                  )
                }

                if (linha.tipo === 'raiz') {
                  /* A raiz do projeto. Era 14px serifado semibold — serifa é a
                     voz humana do app, e o nome de uma pasta é um caminho, não
                     uma frase. Continua sendo a linha mais forte da árvore, mas
                     por tamanho (15 contra 13) dentro da mesma família mono. */
                  return (
                    /* pb-hair e não pb-item: a linha seguinte já traz 4px de
                       respiro próprio, então 4+4 fecha os 8px entre irmãos.
                       Quando o que vem em seguida é um rótulo de seção, quem
                       manda são os 32px dele. */
                    <li key={i} className="pb-hair">
                      <span className="text-lead font-mono font-medium text-[var(--color-ink)]">
                        {linha.nome}
                      </span>
                    </li>
                  )
                }

                return (
                  <li
                    key={i}
                    /* py-hair: 4 em cima + 4 embaixo = os 8px entre irmãos da
                       lista. Eram 3px, e nessa distância 40 linhas viram uma
                       mancha só. */
                    className="flex flex-wrap items-baseline gap-x-card py-hair @min-[480px]:flex-nowrap"
                  >
                    {/* `text-meta font-mono` aqui também, e não só nos filhos:
                        é este elemento que resolve o `ch` da largura, e um `ch`
                        medido na sans de 15px daria uma coluna 25% mais larga
                        que o desenho que ela precisa conter. */}
                    <span className="text-meta flex min-w-0 shrink-0 items-baseline gap-hair font-mono @min-[480px]:w-[var(--col-nome)]">
                      {/* O traço da árvore: mesmo tamanho e mesma família do
                          nome, senão o desenho desalinha linha a linha. Era
                          12px contra 12,5px do nome — meio pixel de diferença
                          que só servia para torcer a coluna. */}
                      <span
                        aria-hidden
                        className="shrink-0 whitespace-pre text-[var(--color-ink-3)]"
                      >
                        {linha.prefixo}
                      </span>
                      <span
                        className="truncate font-medium text-[var(--color-ink)]"
                        title={linha.nome}
                      >
                        {linha.nome}
                      </span>
                    </span>

                    {linha.proposito && (
                      /* A frase é O conteúdo desta tela — a única coisa aqui
                         que uma pessoa que não programa consegue ler. Sobe de
                         12,5px para o degrau de leitura (15px) e passa a ser o
                         texto mais alto da linha. */
                      <span className="text-lead w-full min-w-0 pl-card text-[var(--color-ink-2)] @min-[480px]:w-auto @min-[480px]:flex-1 @min-[480px]:pl-0">
                        {linha.proposito}
                        {linha.detalheEm && (
                          /* Era 11,5px na cor de interação. Duas correções: o
                             tamanho subiu para 13px (o piso é 11), e a cor
                             saiu do accent — accent significa "isto responde
                             ao clique", e este caminho não é clicável. Um
                             caminho de arquivo é técnico: mono, em ink-3. */
                          <span
                            className="text-meta ml-item inline-flex items-baseline gap-hair whitespace-nowrap text-[var(--color-ink-3)]"
                            title={t('pastas.temMapaProprioDica')}
                          >
                            <CornerDownRight
                              size={12}
                              aria-hidden
                              className="shrink-0 translate-y-[2px]"
                            />
                            <span className="font-mono">{linha.detalheEm}</span>
                          </span>
                        )}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {/* ─── trilho: o índice e o arquivo, que se conferem, não se leem ─── */}
          <aside className="min-w-0 space-y-group">
            {secoes.length > 0 && (
              <section
                className="card animate-in-up p-card"
                style={{ animationDelay: '0.05s' }}
              >
                {/* Sem título: os nomes das seções JÁ são rótulos em caixa alta,
                    e são exatamente os mesmos que aparecem na coluna da
                    esquerda. Um título por cima diria duas vezes a mesma coisa
                    — e um rótulo nunca pode ser maior que o conteúdo. */}
                <ul className="space-y-item">
                  {secoes.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById(s.id)?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          })
                        }
                        className="no-drag group flex w-full items-baseline gap-item text-left"
                      >
                        <span className="label min-w-0 flex-1 truncate text-[var(--color-ink-2)] transition-colors group-hover:text-[var(--color-ink)]">
                          {s.nome}
                        </span>
                        <span className="text-meta shrink-0 font-mono tabular-nums text-[var(--color-ink-3)]">
                          {s.n}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* O arquivo em si: quando foi atualizado, que pode ser editado à
                mão, e a saída para apagá-lo. Saiu do cabeçalho e do rodapé
                porque nenhuma das três coisas fala do CONTEÚDO do mapa — todas
                falam do documento. No cabeçalho, a data disputava a linha com o
                título; no rodapé, a frase mais importante desta tela ("a sua
                opinião vale mais que a da IA") ficava depois de 40 linhas de
                árvore, onde ninguém chega. */}
            <Arquivo
              t={t}
              quando={
                mapa.atualizadoEm
                  ? t('pastas.atualizado', {
                      quando: diaRelativo(mapa.atualizadoEm),
                    })
                  : ''
              }
              apagar={
                <ApagarGerado chave="pastas" arquivo="MAPA.md" onApagou={() => {}} />
              }
            />
          </aside>
        </div>
      </div>
    </div>
  )
}

function Cabecalho({ titulo, explicacao }: { titulo: string; explicacao: string }) {
  return (
    <header className="animate-in-up">
      {/* O único `text-display` da tela: 28px, o degrau de manchete. Era 26px
          com `leading-none` — um tamanho avulso e uma entrelinha avulsa, que é
          exatamente como nasceram os 20 tamanhos do app antigo. */}
      <h1 className="font-display text-display text-[var(--color-ink)]">{titulo}</h1>
      <p className="text-lead mt-hair max-w-[60ch] text-[var(--color-ink-2)]">
        {explicacao}
      </p>
    </header>
  )
}

/**
 * O documento por trás da tela.
 *
 * Editar à mão é legítimo: quem é dono do projeto sabe mais que a IA — e é
 * por isso que esta frase existe. Ela é a mesma do antigo rodapé, palavra por
 * palavra; o que mudou é o lugar e o tamanho (11,5px → 13px).
 */
function Arquivo({
  t,
  quando,
  apagar,
}: {
  t: (chave: string, vars?: Record<string, string | number>) => string
  quando?: string
  /** A lixeira do documento, quando ele existe. Ver `ApagarGerado`. */
  apagar?: ReactNode
}) {
  return (
    <section className="card animate-in-up p-card" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-start gap-item">
        <p className="text-meta min-w-0 flex-1 text-[var(--color-ink-2)]">
          <Pencil
            size={12}
            aria-hidden
            className="mr-hair inline-block shrink-0 align-[-1px] text-[var(--color-ink-3)]"
          />
          <span className="font-mono text-[var(--color-ink)]">MAPA.md</span>{' '}
          {t('pastas.rodape')}
        </p>
        {apagar}
      </div>
      {quando && <p className="text-meta mt-item text-[var(--color-ink-3)]">{quando}</p>}
    </section>
  )
}
