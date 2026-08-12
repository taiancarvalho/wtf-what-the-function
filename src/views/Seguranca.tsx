import { useEffect, useState } from 'react'
import { Check, Eye, KeyRound, Loader2, ScrollText, ShieldCheck } from 'lucide-react'
import { Seguranca as Achados } from '@/components/Seguranca'
import { lerArquivo, pedirGuardrails, podeTerminalEmbutido } from '@/lib/source'
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
 */
export function Seguranca({ snapshot }: { snapshot: ProjectSnapshot }) {
  const t = useT()

  const segredos = snapshot.segredos
  const expostos = snapshot.expostos
  const total = (segredos?.achados.length ?? 0) + (expostos?.achados.length ?? 0)
  const varridos = (segredos?.varridos ?? 0) + (expostos?.varridos ?? 0)
  const truncado = Boolean(segredos?.truncado || expostos?.truncado)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-8 pt-7 pb-24">
        <header className="animate-in-up">
          <h1 className="font-display text-[26px] leading-none text-[var(--color-ink)]">
            {t('seguranca.titulo')}
          </h1>
          <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            {t('seguranca.paraQue')}
          </p>
        </header>

        {/*
          Com achados, o cartão de sempre — o mesmo que aparece na Home, para a
          pessoa não ter que aprender duas telas para o mesmo assunto.
        */}
        {total > 0 ? (
          <Achados snapshot={snapshot} />
        ) : (
          <section className="card animate-in-up mt-5 p-5" style={{ animationDelay: '0.05s' }}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="shrink-0" style={{ color: 'var(--color-tested)' }} />
              <h2 className="font-display text-[15px] font-medium">
                {t('seguranca.nadaTitulo')}
              </h2>
            </div>
            <p className="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              {varridos > 0
                ? t('seguranca.nadaTexto', { arquivos: varridos })
                : t('seguranca.aindaNao')}
            </p>

            <ul className="mt-3 space-y-1.5">
              <Procurado icone={KeyRound} texto={t('seg.chaves')} nota={t('seg.chavesNota')} />
              <Procurado icone={Eye} texto={t('seg.dados')} nota={t('seg.dadosNota')} />
            </ul>

            {truncado && (
              <p className="mt-3 text-[12px] leading-snug" style={{ color: 'var(--color-warn)' }}>
                {t('seguranca.truncado')}
              </p>
            )}
          </section>
        )}

        <Guardrails />

        <footer className="mt-8 border-t pt-3">
          <p className="max-w-[62ch] text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            {t('seg.limite')}
          </p>
        </footer>
      </div>
    </div>
  )
}

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
    <li className="flex items-baseline gap-2">
      <Icone size={12} className="mt-[2px] shrink-0" style={{ color: 'var(--color-ink-3)' }} />
      <span className="text-[12.5px] text-[var(--color-ink-2)]">
        <span className="font-medium text-[var(--color-ink)]">{texto}</span> — {nota}
      </span>
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
    <section className="card animate-in-up mt-4 p-5" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center gap-2">
        <ScrollText size={15} className="shrink-0 text-[var(--color-accent)]" />
        <h2 className="font-display text-[15px] font-medium">{t('guard.titulo')}</h2>
        {existe && (
          <Check size={13} className="shrink-0" style={{ color: 'var(--color-tested)' }} />
        )}
        {existe && (
          <span className="ml-auto">
            <ApagarGerado
              chave="guardrails"
              arquivo="GUARDRAILS.md"
              onApagou={() => setRegras(null)}
            />
          </span>
        )}
      </div>

      <p className="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-[var(--color-ink-2)]">
        {existe ? t('guard.existe') : t('guard.vazio')}
      </p>

      {existe && (
        <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">{t('apagar.recupera')}</p>
      )}

      {existe && (
        <pre className="mt-3 max-h-[380px] overflow-auto rounded-lg border bg-[var(--color-paper-3)] p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
          {regras}
        </pre>
      )}

      {/* Fora do aplicativo não há como pedir nada à IA — e um botão que não
          faz nada é pior que a ausência dele. */}
      {podeTerminalEmbutido() && (
        <button
          onClick={pedir}
          disabled={pedindo}
          className="no-drag mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors disabled:opacity-60"
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
