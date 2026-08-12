import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Blocks,
  FlaskConical,
  FolderTree,
  House,
  Library,
  ListChecks,
  Newspaper,
  Settings2,
} from 'lucide-react'
import {
  aoMudarProjeto,
  carregar,
  escolherProjeto,
  salvarConfig,
  type Carga,
} from '@/lib/source'
import { InstalarSkill } from '@/components/InstalarSkill'
import { IdiomaContext, useT, type Idioma } from '@/lib/i18n'
import { BarraTopo } from '@/components/BarraTopo'
import { BuildMap } from '@/views/BuildMap'
import { ProductMap } from '@/views/ProductMap'
import { Timeline } from '@/views/Timeline'
import { Home } from '@/views/Home'
import { Pastas } from '@/views/Pastas'
import { Documentos } from '@/views/Documentos'
import { Configuracoes } from '@/views/Configuracoes'
import { AGENT_LABEL } from '@/lib/state'

type Aba = 'home' | 'timeline' | 'build' | 'mapa' | 'pastas' | 'docs' | 'config'

const ABAS: { id: Aba; label: string; icone: typeof Newspaper; nota: string }[] = [
  { id: 'home', label: 'nav.home', icone: House, nota: 'nav.home.nota' },
  { id: 'timeline', label: 'nav.acontecendo', icone: Newspaper, nota: 'nav.acontecendo.nota' },
  { id: 'build', label: 'nav.progresso', icone: ListChecks, nota: 'nav.progresso.nota' },
  { id: 'mapa', label: 'nav.mapa', icone: Blocks, nota: 'nav.mapa.nota' },
  { id: 'pastas', label: 'nav.pastas', icone: FolderTree, nota: 'nav.pastas.nota' },
  { id: 'docs', label: 'nav.docs', icone: Library, nota: 'nav.docs.nota' },
  { id: 'config', label: 'nav.config', icone: Settings2, nota: 'nav.config.nota' },
]

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
    <div className="mt-3">
      <p
        className="text-[11.5px] leading-snug"
        style={{ color: 'var(--color-warn)' }}
      >
        {humano}
      </p>
      <details className="mt-1">
        <summary className="no-drag cursor-default list-none text-[11px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
          detalhes técnicos
        </summary>
        <p className="mt-1 font-mono text-[10.5px] leading-snug break-all text-[var(--color-ink-3)]">
          {erro}
        </p>
      </details>
    </div>
  )
}

export function App() {
  const [carga, setCarga] = useState<Carga | null>(null)
  const [aba, setAba] = useState<Aba>('home')
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
}) {
  const t = useT()
  const { snapshot, fonte, erro } = carga

  return (
    <div className="flex h-full">
      <aside className="drag flex w-[236px] shrink-0 flex-col border-r bg-[var(--color-paper-2)]/55">
        {/* espaço dos semáforos do macOS */}
        <div className="h-[52px]" />

        <div className="px-5 pb-5">
          <p className="font-display text-[13px] tracking-[0.02em] text-[var(--color-ink-3)]">
            WTF
          </p>
          <h1 className="font-display mt-0.5 text-[21px] leading-tight font-semibold">
            {snapshot.project.name}
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--color-ink-2)]">
            {snapshot.project.pitch}
          </p>
          <p className="mt-2 font-mono text-[11px] break-all text-[var(--color-ink-3)]">
            {snapshot.project.path}
          </p>

          {/* De onde vieram os dados. O usuário nunca deve ficar em dúvida. */}
          {fonte === 'exemplo' && (
            <span
              className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium"
              style={{
                color: 'var(--color-building)',
                background: 'color-mix(in oklab, var(--color-building) 13%, transparent)',
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

        <nav className="no-drag flex flex-col gap-0.5 px-3">
          {ABAS.map(({ id, label, icone: Icone, nota }) => {
            const ativa = aba === id
            return (
              <button
                key={id}
                onClick={() => setAba(id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                style={{
                  background: ativa
                    ? 'color-mix(in oklab, var(--color-accent) 12%, transparent)'
                    : 'transparent',
                  color: ativa ? 'var(--color-accent)' : 'var(--color-ink-2)',
                }}
              >
                <Icone size={16} className="shrink-0" strokeWidth={ativa ? 2.4 : 1.9} />
                <span className="min-w-0">
                  <span className="block text-[14px] leading-tight font-medium">
                    {t(label)}
                  </span>
                  <span className="block text-[11.5px] leading-tight text-[var(--color-ink-3)]">
                    {t(nota)}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto border-t px-5 py-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${snapshot.project.live ? 'pulse-live' : ''}`}
              style={{
                background: snapshot.project.live
                  ? 'var(--color-building)'
                  : 'var(--color-planned)',
              }}
            />
            <span className="text-[12.5px] text-[var(--color-ink-2)]">
              {snapshot.project.live ? t('lateral.trabalhando') : t('lateral.parado')}
            </span>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            {snapshot.project.connectedAgents.length > 0
              ? t('lateral.acompanhando', {
                  agentes: snapshot.project.connectedAgents.map((a) => AGENT_LABEL[a]).join(', '),
                })
              : t('lateral.semAgente')}
          </p>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* faixa arrastável, e onde moram as ações da janela */}
        <div className="drag relative h-[46px] shrink-0">
          <BarraTopo
            atualizando={atualizando}
            atualizadoEm={atualizadoEm}
            onAtualizar={() => atualizar(true)}
          />
        </div>
        <div className="min-h-0 flex-1">
          {aba === 'home' && <Home snapshot={snapshot} onIr={setAba} />}
          {aba === 'timeline' && (
            <Timeline snapshot={snapshot} onMudou={() => atualizar(true)} />
          )}
          {aba === 'build' && (
            <BuildMap snapshot={snapshot} onMudou={() => atualizar(true)} />
          )}
          {aba === 'mapa' && <ProductMap snapshot={snapshot} />}
          {aba === 'pastas' && <Pastas snapshot={snapshot} />}
          {aba === 'docs' && <Documentos snapshot={snapshot} />}
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
      </main>
    </div>
  )
}
