import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Blocks,
  FlaskConical,
  FolderTree,
  House,
  Library,
  ListChecks,
  ShieldCheck,
  Newspaper,
  Search,
  Settings2,
  TrendingUp,
} from 'lucide-react'
import {
  aoIrPara,
  aoMudarProjeto,
  aoPedirTerminal,
  carregar,
  escolherProjeto,
  salvarConfig,
  type Carga,
} from '@/lib/source'
import { TerminalEmbutido, type Doca } from '@/components/Terminal'
import { InstalarSkill } from '@/components/InstalarSkill'
import { SeletorProjeto } from '@/components/SeletorProjeto'
import { Busca } from '@/components/Busca'
import { IdiomaContext, useT, type Idioma } from '@/lib/i18n'
import { montarAssuntos } from '@/lib/assuntos'
import { BarraTopo } from '@/components/BarraTopo'
import { BuildMap } from '@/views/BuildMap'
import { ProductMap } from '@/views/ProductMap'
import { Timeline } from '@/views/Timeline'
import { Home } from '@/views/Home'
import { Historico } from '@/views/Historico'
import { Pastas } from '@/views/Pastas'
import { Documentos } from '@/views/Documentos'
import { Seguranca } from '@/views/Seguranca'
import { Configuracoes } from '@/views/Configuracoes'
import { AGENT_LABEL } from '@/lib/state'

type Aba =
  | 'home'
  | 'timeline'
  | 'build'
  | 'historico'
  | 'mapa'
  | 'pastas'
  | 'docs'
  | 'seguranca'
  | 'config'

const ABAS: { id: Aba; label: string; icone: typeof Newspaper; nota: string }[] = [
  { id: 'home', label: 'nav.home', icone: House, nota: 'nav.home.nota' },
  { id: 'timeline', label: 'nav.acontecendo', icone: Newspaper, nota: 'nav.acontecendo.nota' },
  { id: 'build', label: 'nav.progresso', icone: ListChecks, nota: 'nav.progresso.nota' },
  { id: 'historico', label: 'nav.historico', icone: TrendingUp, nota: 'nav.historico.nota' },
  { id: 'mapa', label: 'nav.mapa', icone: Blocks, nota: 'nav.mapa.nota' },
  { id: 'pastas', label: 'nav.pastas', icone: FolderTree, nota: 'nav.pastas.nota' },
  { id: 'docs', label: 'nav.docs', icone: Library, nota: 'nav.docs.nota' },
  { id: 'seguranca', label: 'nav.seguranca', icone: ShieldCheck, nota: 'nav.seguranca.nota' },
  { id: 'config', label: 'nav.config', icone: Settings2, nota: 'nav.config.nota' },
]

/**
 * O número vivo de cada seção.
 *
 * POR QUÊ existe: a faixa do topo era 84% vazia — 46px de altura atravessando
 * 1253px com três botões grudados na direita, igual em todas as nove abas. A
 * faixa equivalente do Linear vai de ponta a ponta: nome da seção à esquerda e
 * o contador do que está ali. Aqui é o mesmo: onde há um número que importa,
 * ele aparece; onde não há (Pastas, Configurações), a faixa fica só com o nome
 * e a legenda, sem inventar contagem para preencher espaço.
 *
 * Tudo sai de chave de tradução já existente — nenhuma frase nova nasce solta
 * em português dentro de um app que fala três idiomas.
 */
function contagemDaSecao(
  aba: Aba,
  snapshot: Carga['snapshot'],
  t: (chave: string, vars?: Record<string, string | number>) => string,
): string | null {
  switch (aba) {
    /*
     * Início e Acontecendo contam ASSUNTOS, nunca eventos — a regra é do
     * próprio `assuntos.ts`: um aviso e as três respostas que vieram depois
     * dele continuam sendo uma coisa só. Contar evento inflaria o número do
     * topo em relação ao que a pessoa vê na lista.
     */
    case 'home': {
      const n = montarAssuntos(snapshot.events ?? []).filter((a) => a.pedeAtencao).length
      return n === 0 ? null : t(n === 1 ? 'home.dependeDeVoce1' : 'home.dependeDeVoce', { n })
    }
    case 'timeline': {
      const n = montarAssuntos(snapshot.events ?? []).length
      return n === 0 ? null : t('desde.mudancas', { n })
    }
    case 'build': {
      const n = (snapshot.features ?? []).length
      return n === 0 ? null : t('progresso.partes', { n })
    }
    case 'historico': {
      const marcos = snapshot.historico?.marcos ?? []
      const semana = snapshot.historico?.granularidade === 'semana'
      if (marcos.length === 0) return null
      if (marcos.length === 1) return t(semana ? 'hist.periodo.semana' : 'hist.periodo.dia')
      return t(semana ? 'hist.periodo.semanas' : 'hist.periodo.dias', { n: marcos.length })
    }
    case 'mapa': {
      const n = new Set((snapshot.features ?? []).map((f) => f.area).filter(Boolean)).size
      return n === 0 ? null : t('progresso.areas', { n })
    }
    case 'docs': {
      const n = snapshot.documentos?.varredura.total ?? 0
      return n === 0 ? null : t('docs.nArquivos', { n })
    }
    case 'seguranca': {
      const n =
        (snapshot.segredos?.achados.length ?? 0) + (snapshot.expostos?.achados.length ?? 0)
      return n === 0 ? null : t(n === 1 ? 'seg.um' : 'seg.varios', { n })
    }
    default:
      return null
  }
}

/**
 * Erro traduzido.
 *
 * Um comando de terminal despejado na tela é a pior coisa que este app pode
 * fazer: ele existe justamente para quem não sabe ler isso. O texto cru fica
 * disponível, mas escondido atrás de "detalhes".
 */
function AvisoErro({ erro }: { erro: string }) {
  const humano = /does not have any commits yet|unknown revision/i.test(erro)
    ? 'Esse projeto ainda não tem nenhuma versão salva. Assim que a primeira for guardada, o painel começa a mostrar o que está acontecendo.'
    : /not a git repository|não é um repositório/i.test(erro)
      ? 'Essa pasta ainda não é acompanhada pelo Git, então o WTF não consegue ver o histórico dela.'
      : /permission|EACCES/i.test(erro)
        ? 'O WTF não tem permissão para ler essa pasta.'
        : 'Não consegui ler esse projeto.'

  return (
    <div className="mt-card">
      {/*
        POR QUÊ os tamanhos subiram: a frase que explica o erro estava a 11,5px
        e o texto cru a 10,5px. Havia 38 usos de 10–10,5px carregando informação
        de verdade num app feito para quem NÃO lê código — abaixo de 11px a
        pessoa não lê, adivinha. A frase humana é a que importa e vai no degrau
        de metadado (13px); o texto cru fica no piso de 11px, e continua um
        clique abaixo, dentro do "detalhes".
      */}
      <p className="text-meta" style={{ color: 'var(--color-danger)' }}>
        {humano}
      </p>
      <details className="mt-hair">
        <summary className="no-drag text-meta cursor-default list-none text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
          detalhes técnicos
        </summary>
        {/* peso e espacejamento normais: o degrau `micro` nasceu para rótulo em
            caixa alta, e 600 + 0,08em num caminho de arquivo vira mancha. */}
        <p className="text-micro mt-hair font-mono font-normal tracking-normal break-all text-[var(--color-ink-3)]">
          {erro}
        </p>
      </details>
    </div>
  )
}

export function App() {
  const [carga, setCarga] = useState<Carga | null>(null)
  const [aba, setAba] = useState<Aba>('home')
  const [buscando, setBuscando] = useState(false)
  const [atualizando, setAtualizando] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState(() => Date.now())

  const assinatura = useRef<string>('')
  const ultimaLeitura = useRef(0)

  /**
   * `forcado` = veio de clique. Aí sempre recarrega e sempre pisca.
   *
   * Sem isso o painel ficava "doido": enquanto a IA trabalha, o hook grava um
   * evento a cada arquivo tocado e a cada comando rodado, e cada gravação
   * disparava uma atualização — várias por segundo, o botão girando sem parar.
   * Duas travas: nada de recarregar mais de uma vez por segundo, e só mexer na
   * tela quando o conteúdo realmente mudou.
   */
  const pendente = useRef<ReturnType<typeof setTimeout> | null>(null)

  const atualizarRef = useRef<(f?: boolean) => void>(() => {})

  const atualizar = useCallback(async (forcado = false) => {
    const agora = Date.now()

    /*
     * Atrasar, nunca descartar.
     *
     * A primeira versão desta trava simplesmente ignorava avisos que
     * chegassem dentro de um segundo do anterior — e o aviso mais importante
     * é justamente o último da rajada: o hook grava o arquivo tocado, depois
     * o comando rodado, e só então a declaração da IA. Descartando, a
     * conclusão do trabalho era exatamente o que sumia.
     */
    if (!forcado && agora - ultimaLeitura.current < 1000) {
      if (pendente.current) return
      pendente.current = setTimeout(() => {
        pendente.current = null
        atualizarRef.current()
      }, 1000)
      return
    }
    ultimaLeitura.current = agora

    if (forcado) setAtualizando(true)
    try {
      const nova = await carregar()
      const nova_assinatura = JSON.stringify([nova.snapshot.events, nova.snapshot.features])
      const mudou = nova_assinatura !== assinatura.current
      assinatura.current = nova_assinatura

      if (mudou || forcado) {
        setCarga(nova)
        setAtualizadoEm(Date.now())
        if (mudou && !forcado) setAtualizando(true)
      }
    } finally {
      // um piscar curto demais não é percebido como resposta ao clique
      setTimeout(() => setAtualizando(false), 420)
    }
  }, [])

  atualizarRef.current = atualizar

  useEffect(() => {
    atualizar(true)
  }, [atualizar])

  // o projeto avisa quando muda — commit novo ou declaração da IA
  useEffect(() => aoMudarProjeto(() => atualizar()), [atualizar])

  // Clicar no aviso do sistema tem que cair na tela certa: o aviso prometeu
  // algo específico, e abrir na home faria a pessoa procurar de novo.
  useEffect(
    () =>
      aoIrPara((destino) => {
        if (ABAS.some((a) => a.id === destino)) setAba(destino as Aba)
      }),
    [],
  )

  // ⌘K / Ctrl+K: o atalho que todo mundo tenta antes de procurar um botão.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setBuscando((v) => !v)
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [])

  if (!carga) return <div className="drag h-full" />

  const { snapshot } = carga

  async function trocarProjeto() {
    const nova = await escolherProjeto()
    if (nova) {
      setCarga(nova)
      setAtualizadoEm(Date.now())
    }
  }

  const idioma = (snapshot.config?.idiomaInterface ?? 'pt-BR') as Idioma

  /** Trocar de idioma reescreve a instrução dentro da skill instalada. */
  async function trocarIdioma(parcial: Parameters<typeof salvarConfig>[0]) {
    const r = await salvarConfig(parcial)
    if (r?.carga) setCarga(r.carga)
  }

  return (
    <IdiomaContext.Provider value={idioma}>
      <Painel
        aba={aba}
        setAba={setAba}
        carga={carga}
        setCarga={setCarga}
        atualizando={atualizando}
        atualizadoEm={atualizadoEm}
        atualizar={atualizar}
        trocarProjeto={trocarProjeto}
        trocarIdioma={trocarIdioma}
        buscando={buscando}
        setBuscando={setBuscando}
      />
    </IdiomaContext.Provider>
  )
}

/** O app inteiro, já dentro do idioma escolhido. */
function Painel({
  aba,
  setAba,
  carga,
  setCarga,
  atualizando,
  atualizadoEm,
  atualizar,
  trocarProjeto,
  trocarIdioma,
  buscando,
  setBuscando,
}: {
  aba: Aba
  setAba: (a: Aba) => void
  carga: Carga
  setCarga: (c: Carga) => void
  atualizando: boolean
  atualizadoEm: number
  atualizar: (forcado?: boolean) => void
  trocarProjeto: () => void
  trocarIdioma: (parcial: Parameters<typeof salvarConfig>[0]) => Promise<void>
  buscando: boolean
  setBuscando: (v: boolean) => void
}) {
  const t = useT()
  const { snapshot, fonte, erro } = carga

  /*
   * O terminal embutido vive no rodapé, abaixo das abas — como no VS Code.
   * `chave` remonta o painel a cada pedido novo: cada pedido é uma sessão,
   * com a sua mensagem, e reaproveitar a anterior escreveria por cima de um
   * agente que talvez ainda esteja trabalhando.
   */
  const [terminal, setTerminal] = useState<{
    chave: number
    mensagem?: string
    /** Texto a entregar ao shell já aberto. `n` faz o mesmo texto valer duas vezes. */
    envio?: { texto: string; n: number }
  } | null>(null)

  /*
   * Embaixo ou à direita — e a escolha sobrevive ao fechar o app.
   *
   * Não vai para a configuração do projeto: é preferência de quem está
   * olhando, não fato sobre o software. Numa tela larga o terminal cabe ao
   * lado sem espremer o painel; numa estreita, embaixo é o único jeito de os
   * dois serem legíveis. Quem decide isso é quem está na frente da tela.
   */
  const [doca, setDoca] = useState<Doca>(() =>
    localStorage.getItem('wtf.terminal.doca') === 'direita' ? 'direita' : 'baixo',
  )
  const trocarDoca = useCallback((d: Doca) => {
    setDoca(d)
    localStorage.setItem('wtf.terminal.doca', d)
  }, [])
  /*
   * Com o terminal JÁ aberto, o pedido não abre outro: ele é entregue ao que
   * está lá.
   *
   * Abrir uma sessão nova a cada botão seria matar o agente que está no meio
   * de um trabalho — exatamente a pessoa que a pergunta tem por destino. Como
   * o `key` do painel é `chave`, mexer nela remonta o componente e derruba o
   * shell; por isso, com painel vivo, `chave` fica intocada e só `envio` muda.
   */
  useEffect(
    () =>
      aoPedirTerminal((mensagem) =>
        setTerminal((atual) =>
          atual
            ? { ...atual, envio: mensagem ? { texto: mensagem, n: Date.now() } : atual.envio }
            : { chave: Date.now(), mensagem },
        ),
      ),
    [],
  )

  /*
   * O que a faixa do topo diz sobre a tela em que a pessoa está.
   *
   * A contagem percorre eventos e partes; refazer isso a cada tecla digitada
   * no terminal embutido seria trabalho jogado fora. `t` troca de identidade a
   * cada render — o que muda o texto é o idioma, e ele já vem de contexto.
   */
  const secaoAtual = ABAS.find((a) => a.id === aba)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const contagem = useMemo(() => contagemDaSecao(aba, snapshot, t), [aba, snapshot])

  return (
    <div className="flex h-full">
      <aside className="drag flex w-[236px] shrink-0 flex-col border-r bg-[var(--color-paper-2)]/55">
        {/* espaço dos semáforos do macOS */}
        <div className="h-[52px]" />

        {/*
          A cabeça da lateral, em duas linhas e nenhum texto acima de 13px.

          POR QUÊ: o nome do projeto vinha a 21px em serifa semibold — era o
          texto mais forte da tela inteira. Na tela de Progresso ele enfrentava
          um título de página de 26px em peso 400 e GANHAVA: a moldura pesando
          mais que o assunto. Na lateral do Linear nada passa de 13px, nem o
          nome do workspace.

          Saíram daqui também o pitch (12,5px, 2 linhas) e o caminho da pasta
          (11px em mono, quebrando no meio da palavra, 3 linhas). Os dois já
          existem um clique abaixo — o caminho na lista de projetos e em
          Configurações, o pitch na tela de Início — e eram parte das 28 linhas
          de texto que esta coluna de 236px carregava. O Linear tem 14.

          O respiro `px-6` (24px) não é decorativo: alinha esta cabeça com a
          coluna dos ícones do menu (12 da nav + 12 do botão).
        */}
        <div className="pb-card px-6">
          <p className="label font-display text-[var(--color-ink-3)]">WTF</p>
          <SeletorProjeto
            nome={snapshot.project.name}
            caminho={snapshot.project.path}
            onTrocou={setCarga}
          />

          {/* De onde vieram os dados. O usuário nunca deve ficar em dúvida.
              POR QUÊ deixou de ser ocre: `--color-building` significa "está
              sendo construído agora". Um selo de dado falso pintado com uma cor
              de estado faz o estado deixar de ser sinal — e este selo aparece
              em toda sessão de demonstração. Tinta neutra sobre papel. */}
          {fonte === 'exemplo' && (
            <span
              className="label mt-item gap-hair inline-flex items-center rounded-full px-2 py-[3px]"
              style={{
                color: 'var(--color-ink-2)',
                background: 'var(--color-paper-3)',
              }}
            >
              <FlaskConical size={11} />
              {t('lateral.exemplo')}
            </span>
          )}

          {/*
            Discreto para o recorrente, explícito para o decisivo.

            Idioma, chaves e troca de projeto viraram Configurações: são coisas
            que se mexe uma vez e não precisam ocupar a lateral todo dia. Já a
            instalação da skill fica aqui ENQUANTO não estiver instalada — sem
            ela o WTF só enxerga o passado, então esse convite precisa ser
            impossível de ignorar. Depois de instalada, ela só vive em
            Configurações.
          */}
          {fonte === 'real' && !snapshot.instalacao?.instalado && (
            <InstalarSkill instalacao={snapshot.instalacao} onMudou={setCarga} />
          )}

          {erro && <AvisoErro erro={erro} />}
        </div>

        {/*
          O menu: uma linha por item, um tamanho só.

          POR QUÊ sumiram as legendas: cada um dos 9 itens carregava uma
          legenda de 11,5px, e isso sozinho respondia por metade das 28 linhas
          de texto da coluna. Sete tamanhos diferentes conviviam em 236px de
          largura. A legenda não foi jogada fora — ela aparece inteira, e sem
          truncar, na faixa do topo, ao lado do nome da seção em que a pessoa
          está. Ou seja: o menu ficou com nove linhas de 13px, e a explicação
          passou a aparecer no lugar onde a pessoa está olhando.
        */}
        <nav className="no-drag gap-hair flex flex-col px-3">
          {/* Discreto: quem já sabe usa ⌘K; quem não sabe descobre por aqui. */}
          <button
            onClick={() => setBuscando(true)}
            className="mb-item gap-item flex items-center rounded-lg px-3 py-1.5 text-left text-[var(--color-ink-2)] transition-colors"
          >
            <Search size={15} className="shrink-0" strokeWidth={1.9} />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="text-meta">{t('busca.abrir')}</span>
              <span className="text-micro shrink-0 font-mono text-[var(--color-ink-3)]">
                {t('busca.atalho')}
              </span>
            </span>
          </button>
          {ABAS.map(({ id, label, icone: Icone, nota }) => {
            const ativa = aba === id
            return (
              <button
                key={id}
                onClick={() => setAba(id)}
                /* A legenda continua a um passar de mouse, para quem estranhar
                   o nome antes de clicar. */
                title={t(nota)}
                className="gap-item flex items-center rounded-lg px-3 py-1.5 text-left transition-colors"
                style={{
                  /* O item ativo se distingue por FUNDO e por tinta cheia,
                     nunca por corpo maior — era assim que a lateral acabava
                     gritando mais alto que a página. */
                  background: ativa
                    ? 'color-mix(in oklab, var(--color-accent) 11%, transparent)'
                    : 'transparent',
                  color: ativa ? 'var(--color-accent)' : 'var(--color-ink-2)',
                }}
              >
                <Icone size={15} className="shrink-0" strokeWidth={ativa ? 2.3 : 1.8} />
                <span
                  className="text-meta min-w-0 truncate"
                  style={{ fontWeight: ativa ? 500 : 400 }}
                >
                  {t(label)}
                </span>
              </button>
            )
          })}
        </nav>

        {/* O rodapé é o sinal de vida do projeto. Duas linhas, os dois degraus
            de sempre: o estado em tinta de leitura, quem está assinando em
            tinta quieta. A frase longa de "nenhum agente ainda" fica em duas
            linhas no máximo, com o texto inteiro no passar do mouse. */}
        <div className="mt-auto py-card border-t px-6">
          <div className="gap-item flex items-center">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${snapshot.project.live ? 'pulse-live' : ''}`}
              style={{
                background: snapshot.project.live
                  ? 'var(--color-building)'
                  : 'var(--color-planned)',
              }}
            />
            <span className="text-meta text-[var(--color-ink-2)]">
              {snapshot.project.live ? t('lateral.trabalhando') : t('lateral.parado')}
            </span>
          </div>
          <p
            className="text-meta mt-hair line-clamp-2 text-[var(--color-ink-3)]"
            title={
              snapshot.project.connectedAgents.length > 0
                ? t('lateral.acompanhando', {
                    agentes: snapshot.project.connectedAgents
                      .map((a) => AGENT_LABEL[a])
                      .join(', '),
                  })
                : t('lateral.semAgente')
            }
          >
            {snapshot.project.connectedAgents.length > 0
              ? t('lateral.acompanhando', {
                  agentes: snapshot.project.connectedAgents.map((a) => AGENT_LABEL[a]).join(', '),
                })
              : t('lateral.semAgente')}
          </p>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Faixa arrastável, e onde moram as ações da janela. Continua `drag`:
            é a alça da janela, e cada botão dentro dela repõe o `no-drag`. */}
        <div className="drag relative h-[46px] shrink-0">
          <BarraTopo
            secao={secaoAtual ? t(secaoAtual.label) : ''}
            nota={secaoAtual ? t(secaoAtual.nota) : ''}
            contagem={contagem}
            atualizando={atualizando}
            atualizadoEm={atualizadoEm}
            onAtualizar={() => atualizar(true)}
          />
        </div>
        {/*
          O terminal divide o espaço com o conteúdo — embaixo ou à direita.
          A barra de cima fica de fora da divisão: ela é a alça de arrastar a
          janela, e uma alça pela metade é pior que nenhuma.
        */}
        <div className={`flex min-h-0 min-w-0 flex-1 ${doca === 'direita' ? 'flex-row' : 'flex-col'}`}>
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          {aba === 'home' && <Home snapshot={snapshot} onIr={setAba} />}
          {aba === 'timeline' && (
            <Timeline snapshot={snapshot} onMudou={() => atualizar(true)} />
          )}
          {aba === 'build' && (
            <BuildMap snapshot={snapshot} onMudou={() => atualizar(true)} />
          )}
          {aba === 'historico' && <Historico snapshot={snapshot} />}
          {aba === 'mapa' && <ProductMap snapshot={snapshot} />}
          {aba === 'pastas' && <Pastas snapshot={snapshot} />}
          {aba === 'docs' && <Documentos snapshot={snapshot} />}
          {aba === 'seguranca' && <Seguranca snapshot={snapshot} onVarrer={() => atualizar(true)} />}
          {aba === 'config' && (
            <Configuracoes
              snapshot={snapshot}
              fonteDados={fonte}
              onTrocarProjeto={trocarProjeto}
              onSalvarIdioma={trocarIdioma}
              onMudou={setCarga}
            />
          )}
        </div>

        {terminal && (
          <TerminalEmbutido
            key={terminal.chave}
            projeto={snapshot.project.name}
            mensagem={terminal.mensagem}
            envio={terminal.envio}
            doca={doca}
            onDoca={trocarDoca}
            onFechar={() => setTerminal(null)}
          />
        )}
        </div>
      </main>

      <Busca
        snapshot={snapshot}
        aberta={buscando}
        onFechar={() => setBuscando(false)}
        onIr={setAba}
      />
    </div>
  )
}
