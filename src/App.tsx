import { useCallback, useEffect, useState } from 'react'
import { Blocks, FlaskConical, FolderSearch, ListChecks, Newspaper } from 'lucide-react'
import {
  aoMudarProjeto,
  carregar,
  escolherProjeto,
  podeEscolherProjeto,
  type Carga,
} from '@/lib/source'
import { InstalarSkill } from '@/components/InstalarSkill'
import { BarraTopo } from '@/components/BarraTopo'
import { BuildMap } from '@/views/BuildMap'
import { ProductMap } from '@/views/ProductMap'
import { Timeline } from '@/views/Timeline'
import { AGENT_LABEL } from '@/lib/state'

type Aba = 'timeline' | 'build' | 'mapa'

const ABAS: { id: Aba; label: string; icone: typeof Newspaper; nota: string }[] = [
  { id: 'timeline', label: 'Acontecendo', icone: Newspaper, nota: 'O que a IA mexeu' },
  { id: 'build', label: 'Progresso', icone: ListChecks, nota: 'Onde estamos' },
  { id: 'mapa', label: 'Mapa', icone: Blocks, nota: 'Do que é feito' },
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
  const [aba, setAba] = useState<Aba>('timeline')
  const [atualizando, setAtualizando] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState(() => Date.now())

  const atualizar = useCallback(async () => {
    setAtualizando(true)
    try {
      const nova = await carregar()
      setCarga(nova)
      setAtualizadoEm(Date.now())
    } finally {
      // um piscar curto demais não é percebido como resposta ao clique
      setTimeout(() => setAtualizando(false), 320)
    }
  }, [])

  useEffect(() => {
    atualizar()
  }, [atualizar])

  // o projeto avisa quando muda — commit novo ou declaração da IA
  useEffect(() => aoMudarProjeto(() => atualizar()), [atualizar])

  if (!carga) return <div className="drag h-full" />

  const { snapshot, fonte, erro } = carga

  async function trocarProjeto() {
    const nova = await escolherProjeto()
    if (nova) {
      setCarga(nova)
      setAtualizadoEm(Date.now())
    }
  }

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
              Projeto de exemplo
            </span>
          )}

          {podeEscolherProjeto() && (
            <button
              onClick={trocarProjeto}
              className="no-drag mt-3 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-[12.5px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
            >
              <FolderSearch size={14} className="shrink-0" />
              {fonte === 'real' ? 'Trocar de projeto' : 'Abrir um projeto de verdade'}
            </button>
          )}

          {fonte === 'real' && (
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
                    {label}
                  </span>
                  <span className="block text-[11.5px] leading-tight text-[var(--color-ink-3)]">
                    {nota}
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
              {snapshot.project.live ? 'A IA está trabalhando agora' : 'Nada em andamento'}
            </span>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            {snapshot.project.connectedAgents.length > 0
              ? `Acompanhando ${snapshot.project.connectedAgents.map((a) => AGENT_LABEL[a]).join(' e ')}`
              : 'Lendo o histórico do Git. Nenhum agente assinou as mudanças ainda.'}
          </p>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* faixa arrastável, e onde moram as ações da janela */}
        <div className="drag relative h-[46px] shrink-0">
          <BarraTopo
            atualizando={atualizando}
            atualizadoEm={atualizadoEm}
            onAtualizar={atualizar}
          />
        </div>
        <div className="min-h-0 flex-1">
          {aba === 'timeline' && <Timeline snapshot={snapshot} />}
          {aba === 'build' && <BuildMap snapshot={snapshot} />}
          {aba === 'mapa' && <ProductMap snapshot={snapshot} />}
        </div>
      </main>
    </div>
  )
}
