import { useCallback, useEffect, useState } from 'react'
import {
  FileText,
  FolderSearch,
  Gauge,
  Globe,
  KeyRound,
  PackageOpen,
  Settings2,
} from 'lucide-react'
import {
  USO_VAZIO,
  aoPedirTraducao,
  lerPacoteInstalacao,
  lerUso,
  podeEscolherProjeto,
  podeResponderTraducao,
  responderTraducao,
  type Carga,
} from '@/lib/source'
import { EscolherIdioma } from '@/components/EscolherIdioma'
import { ConfigChaves } from '@/components/ConfigChaves'
import { InstalarSkill } from '@/components/InstalarSkill'
import { useT } from '@/lib/i18n'
import type {
  ConfigProjeto,
  ItemInstalacao,
  PacoteInstalacao,
  ProjectSnapshot,
  TraduzirAuto,
  UsoProjeto,
} from '@/types/protocol'


function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`
}

/**
 * Configurações.
 *
 * Tudo que é preferência mora aqui — a barra lateral voltou a ser só navegação.
 * A seção que importa é a última: antes de aceitar, a pessoa consegue ler,
 * inteirinho, cada arquivo que o WTF escreve dentro do projeto dela.
 */
export function Configuracoes({
  snapshot,
  fonteDados,
  onTrocarProjeto,
  onSalvarIdioma,
  onMudou,
}: {
  snapshot: ProjectSnapshot
  fonteDados: 'real' | 'exemplo'
  onTrocarProjeto: () => void
  onSalvarIdioma: (parcial: Partial<ConfigProjeto>) => Promise<void>
  onMudou: (c: Carga) => void
}) {
  const t = useT()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-8 pt-7 pb-24">
        <header className="animate-in-up">
          <h1 className="font-display text-[26px] leading-none text-[var(--color-ink)]">
            {t('config.titulo')}
          </h1>
          <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            {t('config.paraQue')}
          </p>
        </header>

        <Secao icone={Settings2} titulo={t('config.projeto')} nota={t('config.projetoNota')} atraso="0.05s">
          <p className="font-display text-[16px] font-semibold text-[var(--color-ink)]">
            {snapshot.project.name}
          </p>
          <p className="mt-1 font-mono text-[12px] break-all text-[var(--color-ink-2)]">
            {snapshot.project.path}
          </p>
          {podeEscolherProjeto() && (
            <button
              onClick={onTrocarProjeto}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
            >
              <FolderSearch size={14} className="shrink-0" />
              {fonteDados === 'real' ? t('config.trocar') : t('config.abrir')}
            </button>
          )}
        </Secao>

        <Secao icone={Globe} titulo={t('config.idioma')} nota={t('config.idiomaNota')} atraso="0.1s">
          <EscolherIdioma config={snapshot.config} onSalvar={onSalvarIdioma} />
        </Secao>

        <Secao
          icone={Gauge}
          titulo={t('consumo.titulo')}
          nota={t('consumo.nota')}
          atraso="0.13s"
        >
          <Consumo snapshot={snapshot} onSalvar={onSalvarIdioma} />
        </Secao>

        <Secao icone={KeyRound} titulo={t('config.ia')} nota={t('config.iaNota')} atraso="0.15s">
          <ConfigChaves />
        </Secao>

        <Secao
          icone={PackageOpen}
          titulo={t('config.instala')}
          nota={t('config.instalaNota')}
          atraso="0.2s"
        >
          <Transparencia snapshot={snapshot} onMudou={onMudou} />
        </Secao>
      </div>
    </div>
  )
}

function Secao({
  icone: Icone,
  titulo,
  nota,
  atraso,
  children,
}: {
  icone: typeof Settings2
  titulo: string
  nota: string
  atraso: string
  children: React.ReactNode
}) {
  return (
    <section className="card animate-in-up mt-5 p-5" style={{ animationDelay: atraso }}>
      <div className="flex items-center gap-2">
        <Icone size={15} className="shrink-0 text-[var(--color-accent)]" />
        <h2 className="font-display text-[15px] font-medium">{titulo}</h2>
      </div>
      <p className="mt-1.5 max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
        {nota}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/*
 * ===================================================================
 * CONSUMO
 * ===================================================================
 * A regra do produto é "alternativa custo zero, sempre". Esta seção existe
 * para que ela seja verificável: mostra o que o WTF pode gastar do que é da
 * pessoa, deixa ela decidir antes de gastar, e conta o que já foi gasto.
 *
 * O número de reaproveitamentos do cache aparece com o mesmo peso dos outros:
 * é a prova de que o app economiza em vez de gastar de novo.
 *
 * Escolher "nunca traduzir" não deixa o produto capenga. Sem tradução e sem
 * chave nenhuma, o WTF continua lendo o repositório e mostrando estados,
 * avisos, mapa e progresso — só com um texto mais simples.
 * ===================================================================
 */
function Consumo({
  snapshot,
  onSalvar,
}: {
  snapshot: ProjectSnapshot
  onSalvar: (parcial: Partial<ConfigProjeto>) => Promise<void>
}) {
  const t = useT()
  const modo: TraduzirAuto = snapshot.config?.traduzirAuto ?? 'perguntar'
  const teto = snapshot.config?.maxTraducoesPorRodada ?? 8
  const [uso, setUso] = useState<UsoProjeto>(snapshot.uso ?? USO_VAZIO)
  const [pendentes, setPendentes] = useState(0)
  const [ocupado, setOcupado] = useState(false)

  const recarregarUso = useCallback(() => {
    lerUso()
      .then(setUso)
      .catch(() => {})
  }, [])

  useEffect(() => {
    recarregarUso()
    // O main avisa quando há mudanças esperando autorização para serem
    // traduzidas. Enquanto ninguém responde, nada é consumido.
    return aoPedirTraducao((dados) => setPendentes(dados?.pendentes ?? 0))
  }, [recarregarUso])

  useEffect(() => {
    if (snapshot.uso) setUso(snapshot.uso)
  }, [snapshot.uso])

  const escolher = async (novo: TraduzirAuto) => {
    setOcupado(true)
    try {
      await onSalvar({ traduzirAuto: novo })
      if (novo !== 'perguntar') setPendentes(0)
      if (podeResponderTraducao() && novo === 'sim') {
        await responderTraducao('sempre')
        recarregarUso()
      }
    } finally {
      setOcupado(false)
    }
  }

  const traduzirUmaVez = async () => {
    setOcupado(true)
    try {
      await responderTraducao('agora')
      setPendentes(0)
      recarregarUso()
    } finally {
      setOcupado(false)
    }
  }

  const opcoes: { id: TraduzirAuto; rotulo: string }[] = [
    { id: 'perguntar', rotulo: t('consumo.btn.perguntar') },
    { id: 'sim', rotulo: t('consumo.btn.sim') },
    { id: 'nao', rotulo: t('consumo.btn.nao') },
  ]

  const nada =
    uso.traducoes.chamadas === 0 && uso.traducoes.cache === 0 && uso.perguntas.chamadas === 0

  return (
    <div>
      <p className="text-[13px] font-medium text-[var(--color-ink)]">{t('consumo.traducao')}</p>
      <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
        {t('consumo.traducaoNota')}
      </p>

      <p className="mt-2.5 text-[12px] text-[var(--color-ink-3)]">{t(`consumo.estado.${modo}`)}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={ocupado}
            aria-pressed={modo === o.id}
            onClick={() => void escolher(o.id)}
            className="rounded-full border px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-50"
            style={
              modo === o.id
                ? {
                    borderColor: 'var(--color-accent)',
                    color: 'var(--color-accent)',
                    background: 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
                  }
                : { borderColor: 'var(--color-rule)', color: 'var(--color-ink-2)' }
            }
          >
            {o.rotulo}
          </button>
        ))}
      </div>

      {modo === 'perguntar' && pendentes > 0 && (
        <div
          className="mt-3 rounded-lg border px-3 py-2.5"
          style={{
            borderColor: 'color-mix(in oklab, var(--color-accent) 34%, transparent)',
            background: 'color-mix(in oklab, var(--color-accent) 6%, transparent)',
          }}
        >
          <p className="text-[12.5px] text-[var(--color-ink)]">
            {pendentes === 1 ? t('consumo.pendentes1') : t('consumo.pendentes', { n: pendentes })}
          </p>
          {podeResponderTraducao() && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void traduzirUmaVez()}
              className="mt-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }}
            >
              {t('consumo.traduzirAgora')}
            </button>
          )}
        </div>
      )}

      <div className="mt-5 border-t pt-3">
        <label
          htmlFor="wtf-teto"
          className="text-[12.5px] font-medium text-[var(--color-ink)]"
        >
          {t('consumo.teto')}
        </label>
        <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-[var(--color-ink-2)]">
          {t('consumo.tetoNota')}
        </p>
        <input
          id="wtf-teto"
          type="number"
          min={0}
          max={200}
          value={teto}
          disabled={ocupado}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) void onSalvar({ maxTraducoesPorRodada: n })
          }}
          className="mt-2 w-24 rounded-lg border px-2.5 py-1.5 text-[13px] outline-none"
          style={{
            borderColor: 'var(--color-rule)',
            background: 'var(--color-paper)',
            color: 'var(--color-ink)',
          }}
        />
      </div>

      <div className="mt-5 border-t pt-3">
        <p className="text-[10px] tracking-[0.16em] text-[var(--color-ink-3)] uppercase">
          {t('consumo.contador')}
        </p>

        {nada ? (
          <p className="mt-2 text-[12.5px] text-[var(--color-ink-3)]">{t('consumo.nada')}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            <Linha rotulo={t('consumo.traducoesChamadas')} valor={uso.traducoes.chamadas} />
            <Linha rotulo={t('consumo.traducoesEventos')} valor={uso.traducoes.eventos} />
            <Linha
              rotulo={t('consumo.cache')}
              valor={uso.traducoes.cache}
              destaque
              nota={t('consumo.cacheNota')}
            />
            <Linha rotulo={t('consumo.perguntas')} valor={uso.perguntas.chamadas} />
          </ul>
        )}

        {uso.desde && (
          <p className="mt-2 text-[11.5px] text-[var(--color-ink-3)]">
            {t('consumo.desde', { quando: new Date(uso.desde).toLocaleDateString() })}
          </p>
        )}
      </div>
    </div>
  )
}

/** Uma linha do contador: rótulo à esquerda, número à direita. */
function Linha({
  rotulo,
  valor,
  destaque,
  nota,
}: {
  rotulo: string
  valor: number
  destaque?: boolean
  nota?: string
}) {
  return (
    <li className="text-[12.5px]">
      <span className="flex items-baseline gap-2">
        <span className="text-[var(--color-ink-2)]">{rotulo}</span>
        <span
          className="ml-auto font-mono text-[13px]"
          style={{ color: destaque ? 'var(--color-tested)' : 'var(--color-ink)' }}
        >
          {valor}
        </span>
      </span>
      {nota && (
        <span className="mt-0.5 block max-w-[58ch] text-[11.5px] leading-snug text-[var(--color-ink-3)]">
          {nota}
        </span>
      )}
    </li>
  )
}

/** A seção de transparência: o que exatamente vai ser escrito no projeto. */
function Transparencia({
  snapshot,
  onMudou,
}: {
  snapshot: ProjectSnapshot
  onMudou: (c: Carga) => void
}) {
  const t = useT()
  const [pacote, setPacote] = useState<PacoteInstalacao | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    lerPacoteInstalacao()
      .then((p) => vivo && setPacote(p))
      .catch(() => vivo && setPacote(null))
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [])

  return (
    <div>
      <p
        className="rounded-lg border px-3 py-2 text-[12px] leading-relaxed text-[var(--color-ink-2)]"
        style={{ background: 'color-mix(in oklab, var(--color-accent) 6%, transparent)' }}
      >
        {t('config.seguranca')}
      </p>

      {carregando && (
        <p className="mt-3 text-[12.5px] text-[var(--color-ink-3)]">{t('config.lendo')}</p>
      )}

      {!carregando && !pacote && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
          {t('config.semPacote')}
        </p>
      )}

      {pacote && (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {pacote.itens.map((item) => (
              <li key={item.destino}>
                <Arquivo item={item} />
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t pt-3">
            <p className="text-[10px] tracking-[0.16em] text-[var(--color-ink-3)] uppercase">
              {t('config.hooks')}
            </p>
            <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-[var(--color-ink-2)]">
              {t('config.hooksNota')}
            </p>
            {pacote.hooks.length === 0 ? (
              <p className="mt-2 text-[12px] text-[var(--color-ink-3)]">{t('config.nenhumHook')}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {pacote.hooks.map((h, i) => (
                  <li key={`${h.evento}-${i}`} className="text-[12px]">
                    <span className="font-mono text-[var(--color-ink)]">{h.evento}</span>
                    {h.matcher && (
                      <span className="ml-2 font-mono text-[11.5px] text-[var(--color-ink-3)]">
                        {h.matcher}
                      </span>
                    )}
                    <p className="mt-0.5 font-mono text-[11.5px] break-all text-[var(--color-ink-2)]">
                      {h.comando}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5 border-t pt-3">
            <p className="text-[10px] tracking-[0.16em] text-[var(--color-ink-3)] uppercase">
              {t('config.gitignore')}
            </p>
            <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-[var(--color-ink-2)]">
              {t('config.gitignoreNota')}
            </p>
            {pacote.gitignore.length === 0 ? (
              <p className="mt-2 text-[12px] text-[var(--color-ink-3)]">
                {t('config.nenhumGitignore')}
              </p>
            ) : (
              <pre className="mt-2 overflow-x-auto font-mono text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
                {pacote.gitignore.join('\n')}
              </pre>
            )}
          </div>
        </>
      )}

      <InstalarSkill instalacao={snapshot.instalacao} onMudou={onMudou} />
    </div>
  )
}

/** Um arquivo do pacote, com o conteúdo integral atrás de um clique. */
function Arquivo({ item }: { item: ItemInstalacao }) {
  const t = useT()

  const estado = !item.jaExiste
    ? { texto: t('config.selo.novo'), cor: 'var(--color-accent)' }
    : item.igual
      ? { texto: t('config.selo.instalado'), cor: 'var(--color-tested)' }
      : { texto: t('config.selo.desatualizado'), cor: 'var(--color-warn)' }

  return (
    <details className="rounded-lg border px-3 py-2">
      <summary className="cursor-default list-none">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <FileText size={12} aria-hidden className="shrink-0 text-[var(--color-ink-3)]" />
          <span className="text-[13px] font-medium text-[var(--color-ink)]">{item.titulo}</span>
          <span
            className="rounded-full px-2 py-[2px] text-[10.5px] font-medium"
            style={{
              color: estado.cor,
              background: `color-mix(in oklab, ${estado.cor} 13%, transparent)`,
            }}
          >
            {estado.texto}
          </span>
          <span className="ml-auto text-[11px] text-[var(--color-ink-3)]">
            {tamanho(item.bytes)}
          </span>
        </span>
        <span className="mt-0.5 block font-mono text-[11.5px] break-all text-[var(--color-ink-3)]">
          {item.destino}
        </span>
        {item.proposito && (
          <span className="mt-1 block text-[12px] leading-snug text-[var(--color-ink-2)]">
            {item.proposito}
          </span>
        )}
        <span className="mt-1 block text-[11.5px] text-[var(--color-accent)]">
          {t('config.verConteudo')}
        </span>
      </summary>

      {item.erro ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--color-warn)' }}>
          {item.erro}
        </p>
      ) : (
        <pre className="mt-2 max-h-[420px] overflow-auto rounded-md border p-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre text-[var(--color-ink-2)]">
          {item.conteudo}
        </pre>
      )}
      <p className="mt-1.5 font-mono text-[10.5px] break-all text-[var(--color-ink-3)]">
        {item.origem}
      </p>
    </details>
  )
}
