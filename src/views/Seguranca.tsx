import { useEffect, useState } from 'react'
import {
  Check,
  Eye,
  KeyRound,
  Loader2,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Seguranca as Achados } from '@/components/Seguranca'
import { dispensarAchado, lerArquivo, pedirGuardrails, podeTerminalEmbutido } from '@/lib/source'
import { ApagarGerado } from '@/components/ApagarGerado'
import { useT } from '@/lib/i18n'
import type { ProjectSnapshot } from '@/types/protocol'

/**
 * A aba de segurança.
 *
 * O painel já varria chaves e dados de pessoa a cada leitura — mas só falava
 * quando achava algo. Sem achado, a varredura era invisível: quem nunca teve
 * um vazamento nunca soube que alguém estava olhando, e "não apareceu aviso"
 * é indistinguível de "ninguém procurou". Aqui a busca é visível mesmo quando
 * o resultado é nada, que é o resultado que se quer.
 *
 * O que esta tela NÃO faz: dizer que o software está seguro. Ela diz o que foi
 * procurado, o que foi encontrado e o que ficou de fora. A frase "está tudo
 * seguro" é exatamente a confiança cega que este produto existe para desfazer.
 *
 * ─── a moldura, e por que ela virou duas colunas ──────────────────────────
 *
 * POR QUÊ: esta tela tinha uma coluna de 760px centrada. A crítica mediu 41%
 * da janela em papel em branco — numa tela de 1456 isso são ~340px mortos de
 * cada lado, e no caso mais comum desta aba (nada encontrado) o conteúdo
 * acabava na primeira dobra e o resto da altura também ficava vazio.
 *
 * A tela tem dois assuntos, e eles se leem de formas diferentes:
 *   - o que ficou EXPOSTO e as regras do projeto: frases inteiras, decisão,
 *     documento. Isso é leitura, e fica à esquerda.
 *   - a VARREDURA em si — o que ela procura, onde ela parou, o que você já
 *     marcou como falso alarme e o que ela não promete. Isso se confere, não
 *     se lê. Virou o trilho de 400px à direita.
 *
 * A quebra é por `@container` e não por viewport, igual à Início: quem decide
 * se cabem duas colunas é a largura que SOBRA aqui (a lateral pode estar
 * fechada, o terminal pode estar docado à direita), não o tamanho do monitor.
 */
export function Seguranca({
  snapshot,
  onVarrer,
}: {
  snapshot: ProjectSnapshot
  /** Relê o projeto — é a releitura que roda a varredura de novo. */
  onVarrer?: () => void
}) {
  const t = useT()
  const [varrendo, setVarrendo] = useState(false)

  /*
   * A varredura roda a cada leitura do projeto, não guarda resultado em cache.
   * Então "varrer de novo" é simplesmente reler — e a espera curta existe para
   * o clique ter resposta visível: sem ela, um resultado idêntico ao anterior
   * parece um botão que não fez nada.
   */
  function varrer() {
    setVarrendo(true)
    onVarrer?.()
    setTimeout(() => setVarrendo(false), 900)
  }

  const segredos = snapshot.segredos
  const expostos = snapshot.expostos
  const total = (segredos?.achados.length ?? 0) + (expostos?.achados.length ?? 0)
  const varridos = (segredos?.varridos ?? 0) + (expostos?.varridos ?? 0)
  const truncado = Boolean(segredos?.truncado || expostos?.truncado)
  const dispensados =
    (segredos?.dispensados?.length ?? 0) + (expostos?.dispensados?.length ?? 0)

  /*
   * As propostas da IA, todas de uma vez.
   *
   * Sete achados analisados, sete cliques — e a pessoa desiste no terceiro.
   * A decisão continua sendo dela, mas ela não precisa repeti-la sete vezes
   * para dizer a mesma coisa. Quem quiser julgar um por um continua podendo:
   * cada achado traz o motivo e os dois botões.
   */
  const todos = [...(segredos?.achados ?? []), ...(expostos?.achados ?? [])]
  const comProposta = todos.filter((a) => a.proposta && a.proposta.veredito !== 'real')
  /** Conferidos pela IA e CONFIRMADOS. Não têm botão: têm conserto. */
  const confirmados = todos.filter((a) => a.proposta?.veredito === 'real')

  const [aceitando, setAceitando] = useState(false)

  async function aceitarTodas() {
    setAceitando(true)
    try {
      for (const a of comProposta) await dispensarAchado(a, a.proposta?.motivo, 'marcar')
      onVarrer?.()
    } finally {
      setAceitando(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="@container mx-auto max-w-[1200px] px-10 pt-7 pb-group">
        {/*
          Uma manchete só na tela, e é esta. O título era 26px numa serifa de
          peso 400 — mais leve que o nome do projeto na lateral (21px/600), ou
          seja, o texto mais forte desta página era a moldura. Agora ele é o
          único `text-display` (28px/600) daqui.
        */}
        <header className="animate-in-up">
          <h1 className="font-display text-display text-[var(--color-ink)]">
            {t('seguranca.titulo')}
          </h1>
          <p className="text-lead mt-hair max-w-[60ch] text-[var(--color-ink-2)]">
            {t('seguranca.paraQue')}
          </p>
        </header>

        {/*
          960px é onde a conta fecha, medida por dentro (o `@container` já
          desconta o respiro lateral): 528 de leitura + 32 entre as colunas +
          400 de trilho. É o mesmo ponto de quebra da Início de propósito — as
          duas telas viram uma coluna na mesma largura, e a pessoa não vê o
          aplicativo mudar de forma ao trocar de aba.
        */}
        <div className="mt-group grid grid-cols-1 items-start gap-group @min-[960px]:grid-cols-[minmax(0,1fr)_400px]">
          {/* ─── leitura: o que ficou exposto, e as regras da casa ─── */}
          <div className="min-w-0 space-y-group">
            {/*
              Confirmado pela IA como problema de verdade. É o único bloco de
              alerta desta coluna, e por isso é o único que usa carmim.
              Antes ele usava `--color-danger` a 100% na borda e 10% no fundo;
              agora usa a mesma receita dos blocos de alerta da Início (40% de
              borda, 7% de fundo) — dois cartões de alerta do mesmo produto não
              podem ter duas intensidades diferentes sem que uma delas signifique
              algo, e não significa.
            */}
            {confirmados.length > 0 && (
              <section
                className="animate-in-up rounded-card border p-card"
                style={{
                  animationDelay: '0.05s',
                  borderColor: 'color-mix(in oklab, var(--color-danger) 40%, transparent)',
                  background: 'color-mix(in oklab, var(--color-danger) 7%, transparent)',
                }}
              >
                <div className="flex items-center gap-hair">
                  <ShieldAlert
                    size={13}
                    className="shrink-0"
                    style={{ color: 'var(--color-danger)' }}
                  />
                  {/*
                    Título de bloco é rótulo, nunca manchete: era 13,5px
                    semibold em cima de uma nota de 12,5px — 1px de diferença
                    não é hierarquia, é ruído. Agora o rótulo é `.label` (11px
                    caixa alta) e o que a pessoa lê é o degrau de leitura.
                  */}
                  <h2 className="label" style={{ color: 'var(--color-danger)' }}>
                    {t('seguranca.confirmados', { n: confirmados.length })}
                  </h2>
                </div>
                <p className="text-lead mt-item text-[var(--color-ink-2)]">
                  {t('seguranca.confirmadosNota')}
                </p>
              </section>
            )}

            {/*
              As propostas da IA NÃO são um alerta, e por isso perderam a tinta
              de sinal: o bloco tingia o fundo com `--color-accent`, que no
              sistema novo é a tinta de interação (item ativo, botão principal).
              Um painel inteiro pintado com a cor de "selecionado" faz a tela
              mentir. Cartão neutro; a cor de interação sobrou só para o botão,
              que é onde ela quer dizer alguma coisa.
            */}
            {comProposta.length > 0 && (
              <section className="card animate-in-up p-card" style={{ animationDelay: '0.1s' }}>
                <div className="flex items-center gap-hair">
                  <Sparkles size={13} className="shrink-0 text-[var(--color-ink-3)]" />
                  <h2 className="label text-[var(--color-ink-3)]">
                    {t('seguranca.propostas', { n: comProposta.length })}
                  </h2>
                </div>
                <p className="text-lead mt-item text-[var(--color-ink-2)]">
                  {t('seguranca.propostasNota')}
                </p>
                <button
                  onClick={aceitarTodas}
                  disabled={aceitando}
                  className="no-drag text-meta mt-card inline-flex items-center gap-hair rounded-md px-3 py-1.5 font-medium disabled:opacity-60"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}
                >
                  {aceitando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {t('seguranca.aceitarTodas', { n: comProposta.length })}
                </button>
              </section>
            )}

            {total > 0 ? (
              /* O `mt-4` que o componente compartilhado carrega vem de antes da
                 escala de espaço (e o arquivo dele não é meu). Quem separa os
                 blocos aqui é o `space-y-group` da coluna, com 32px. */
              <div className="[&>section]:mt-0">
                <Achados snapshot={snapshot} />
              </div>
            ) : (
              <section className="card animate-in-up p-card" style={{ animationDelay: '0.05s' }}>
                <div className="flex items-center gap-item">
                  {/* Verde de "a máquina conferiu" — o mesmo sentido que o
                      token carrega no resto do app. A varredura É uma
                      verificação automática que passou; nenhum outro token
                      significa isso, e inventar uma sexta cor para dizer a
                      mesma coisa é o que produziu os cinco significados de
                      terracota que a crítica achou. */}
                  <ShieldCheck
                    size={16}
                    className="shrink-0"
                    style={{ color: 'var(--color-tested)' }}
                  />
                  {/* Aqui o título NÃO é rótulo: ele é a resposta da tela ("não
                      achei nada"), e a frase abaixo é a ressalva dele. Por isso
                      `text-title` (19px) e não `.label` — era 15px, quase o
                      mesmo corpo do parágrafo que ele encabeçava. */}
                  <h2 className="font-display text-title text-[var(--color-ink)]">
                    {t('seguranca.nadaTitulo')}
                  </h2>
                </div>
                <p className="text-lead mt-item max-w-[62ch] text-[var(--color-ink-2)]">
                  {varridos > 0
                    ? t('seguranca.nadaTexto', { arquivos: varridos })
                    : t('seguranca.aindaNao')}
                </p>
              </section>
            )}

            <Guardrails />
          </div>

          {/* ─── trilho: a varredura, que se confere ─── */}
          <aside className="min-w-0 space-y-group">
            <section className="card animate-in-up p-card" style={{ animationDelay: '0.15s' }}>
              {/*
                O que a varredura procura. Estas duas linhas só existiam dentro
                do cartão de "nada encontrado" — ou seja, no dia em que havia
                achado, a tela deixava de dizer o que tinha sido procurado, que
                é justamente quando a pessoa quer saber. No trilho elas ficam
                sempre, e não disputam espaço com a leitura.
              */}
              <ul className="space-y-item">
                <Procurado icone={KeyRound} texto={t('seg.chaves')} nota={t('seg.chavesNota')} />
                <Procurado icone={Eye} texto={t('seg.dados')} nota={t('seg.dadosNota')} />
              </ul>

              {/* Onde a varredura parou. Era `--color-warn`, que foi
                  aposentado por estar a ΔE 1,1 do terracota de "você aprovou" —
                  perigo e aprovação eram a mesma tinta. Um alerta é um alerta:
                  `--color-danger`. */}
              {truncado && (
                <p className="text-meta mt-card" style={{ color: 'var(--color-danger)' }}>
                  {t('seguranca.truncado')}
                </p>
              )}

              {/* Dispensado não é apagado: a conta fica à vista, e o aviso volta
                  se o valor daquele lugar mudar. Era 12px solto no fim da
                  página, longe de tudo que explicava do que ele falava. */}
              {dispensados > 0 && (
                <p className="text-meta mt-card text-[var(--color-ink-3)]">
                  {t('seguranca.dispensados', { n: dispensados })}
                </p>
              )}

              {onVarrer && (
                <button
                  onClick={varrer}
                  disabled={varrendo}
                  className="no-drag text-meta mt-card inline-flex items-center gap-hair rounded-md border px-2.5 py-1.5 text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-60"
                  style={{ borderColor: 'var(--color-rule)' }}
                >
                  <RefreshCw size={13} className={varrendo ? 'animate-spin' : undefined} />
                  {varrendo ? t('seguranca.varrendo') : t('seguranca.varrer')}
                </button>
              )}
            </section>

            {/* O que o WTF NÃO promete. Estava a 11,5px — abaixo do piso de
                11px em que quem não lê código ainda LÊ em vez de adivinhar — e
                num rodapé onde ninguém chega. É a frase mais importante da
                tela: sobe para o trilho, ao lado do que a varredura procura. */}
            <p className="text-meta text-[var(--color-ink-3)]">{t('seg.limite')}</p>
          </aside>
        </div>
      </div>
    </div>
  )
}

/**
 * Uma das duas coisas que a varredura procura.
 *
 * Empilhado, e não "nome — nota" na mesma linha: numa coluna de 400px a linha
 * corrida quebrava em três e o nome deixava de ser reconhecível de relance.
 * O que separa o nome da nota é a TINTA, não o tamanho — os dois estão no
 * degrau de metadado. Combinar um degrau da escala com um tamanho avulso é
 * exatamente como nasceram os 22 tamanhos que esta tela tinha.
 */
function Procurado({
  icone: Icone,
  texto,
  nota,
}: {
  icone: typeof KeyRound
  texto: string
  nota: string
}) {
  return (
    <li className="flex items-start gap-item">
      <Icone size={13} className="mt-[2px] shrink-0" style={{ color: 'var(--color-ink-3)' }} />
      <div className="min-w-0">
        <p className="text-meta font-medium text-[var(--color-ink)]">{texto}</p>
        <p className="text-meta mt-hair text-[var(--color-ink-3)]">{nota}</p>
      </div>
    </li>
  )
}

/**
 * As regras do que não se faz NESTE projeto.
 *
 * Uma varredura acha o que já vazou; isto tenta impedir o próximo. O documento
 * é escrito pela IA porque quem conhece os erros passados do projeto é quem o
 * construiu — mas quem lê e manda nele é o dono, e por isso o arquivo é texto
 * simples na raiz, não configuração escondida.
 *
 * Fica na coluna de leitura, e não no trilho: é um documento em português que
 * se lê inteiro, não um número que se confere.
 */
function Guardrails() {
  const t = useT()
  const [regras, setRegras] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [pedindo, setPedindo] = useState(false)

  useEffect(() => {
    let vivo = true
    void lerArquivo('GUARDRAILS.md').then((r) => {
      if (!vivo) return
      setRegras(r.erro ? null : (r.conteudo ?? null))
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [])

  async function pedir() {
    setPedindo(true)
    try {
      await pedirGuardrails()
    } finally {
      setPedindo(false)
    }
  }

  if (carregando) return null

  const existe = Boolean(regras?.trim())

  return (
    <section className="card animate-in-up p-card" style={{ animationDelay: '0.2s' }}>
      <div className="flex items-center gap-item">
        <ScrollText size={16} className="shrink-0 text-[var(--color-ink-3)]" />
        {/* text-title (19px): este é o segundo assunto da tela, e o nome dele
            precisa ter o peso de um assunto. Era 15px — dois pontos acima do
            parágrafo que ele encabeça. */}
        <h2 className="font-display text-title min-w-0 flex-1 text-[var(--color-ink)]">
          {t('guard.titulo')}
        </h2>
        {existe && (
          <ApagarGerado chave="guardrails" arquivo="GUARDRAILS.md" onApagou={() => setRegras(null)} />
        )}
      </div>

      <p className="text-lead mt-item max-w-[62ch] text-[var(--color-ink-2)]">
        {existe ? t('guard.existe') : t('guard.vazio')}
      </p>

      {existe && (
        <p className="text-meta mt-hair text-[var(--color-ink-3)]">{t('apagar.recupera')}</p>
      )}

      {/* O arquivo, como ele está no computador. Continua em mono: é o texto
          literal de um arquivo que a pessoa pode abrir e editar à mão, e a mono
          é o que diz "isto é o arquivo, não a nossa versão dele". O que mudou é
          o corpo — 12px viraram 13px, o degrau de metadado, porque isto aqui é
          para ser lido por quem não programa. */}
      {existe && (
        <pre className="text-meta mt-card max-h-[380px] overflow-auto rounded-card border bg-[var(--color-paper-3)] p-card whitespace-pre-wrap">
          {regras}
        </pre>
      )}

      {/* Fora do aplicativo não há como pedir nada à IA — e um botão que não
          faz nada é pior que a ausência dele. */}
      {podeTerminalEmbutido() && (
        <button
          onClick={pedir}
          disabled={pedindo}
          className="no-drag text-meta mt-card inline-flex items-center gap-hair rounded-md border px-3 py-2 transition-colors disabled:opacity-60"
          style={{
            color: 'var(--color-accent)',
            borderColor: 'color-mix(in oklab, var(--color-accent) 40%, transparent)',
            background: 'color-mix(in oklab, var(--color-accent) 8%, transparent)',
          }}
        >
          {pedindo ? (
            <Loader2 size={14} className="shrink-0 animate-spin" />
          ) : (
            <ScrollText size={14} className="shrink-0" />
          )}
          {existe ? t('guard.atualizar') : t('guard.criar')}
        </button>
      )}
    </section>
  )
}
