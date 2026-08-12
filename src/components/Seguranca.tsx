import { useState } from 'react'
import { ChevronDown, Eye, KeyRound, ShieldAlert, SquareTerminal } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { pedirTerminal, podeTerminalEmbutido } from '@/lib/source'
import type { AchadoExposto, AchadoSegredo, ProjectSnapshot } from '@/types/protocol'

/**
 * O pedido que sai daqui — e o que ele NUNCA carrega.
 *
 * O valor encontrado não entra na mensagem, nem mascarado. Ele já está no
 * arquivo, e a IA vai abri-lo de qualquer forma: repeti-lo aqui só o copiaria
 * para mais um lugar (a fila do terminal, o histórico da sessão, uma captura
 * de tela do painel). Arquivo e linha bastam para achar; o rótulo basta para
 * entender do que se trata.
 *
 * A instrução é deliberadamente conservadora. Trocar uma chave é operação com
 * consequência — pode derrubar o que está no ar — e quem decide é o dono do
 * projeto, depois de entender. Por isso: explique primeiro, mexa depois.
 */
function mensagemDeSeguranca(
  segredos: AchadoSegredo[],
  expostos: AchadoExposto[],
): string {
  const linhas: string[] = [
    'Contexto (levantado pelo WTF, um painel que acompanha este projeto):',
    'A varredura encontrou coisas que podem ser sensíveis. Os valores não estão ' +
      'escritos aqui de propósito — abra os arquivos para ver.',
    '',
  ]

  if (segredos.length) {
    linhas.push('Possíveis chaves ou senhas no código:')
    for (const a of segredos.slice(0, 12)) {
      linhas.push(`- ${a.rotulo} em ${a.arquivo}:${a.linha} (confiança ${a.confianca})`)
    }
    linhas.push('')
  }

  if (expostos.length) {
    linhas.push('Possíveis dados de pessoa no código que vai para o navegador:')
    for (const a of expostos.slice(0, 12)) {
      linhas.push(`- ${a.rotulo} em ${a.arquivo}:${a.linha} (confiança ${a.confianca})`)
    }
    linhas.push('')
  }

  linhas.push(
    'Confira cada item e me diga, em palavras simples: quais são de verdade, ' +
      'quais são alarme falso (exemplo em documentação, dado de teste), e qual é ' +
      'o risco real de cada um que for verdadeiro.',
    '',
    'Não altere nada ainda. Se alguma chave precisar ser trocada ou algum dado ' +
      'precisar sair do código, me explique o que isso quebra antes de fazer, e ' +
      'espere eu confirmar. Nunca escreva o valor encontrado na sua resposta.',
  )

  return linhas.join('\n')
}

/**
 * Os dois avisos de segurança que o WTF sabe dar — e só estes.
 *
 * Ele não diz que o software está seguro. Diz duas coisas específicas e
 * verificáveis:
 *
 *   1. uma chave está prestes a entrar no histórico (ainda dá para evitar);
 *   2. um dado de pessoa está escrito no código que vai para o navegador
 *      (qualquer um enxerga abrindo o inspecionar).
 *
 * A promessa é estreita de propósito. "Está tudo seguro" é a frase que produz
 * a confiança cega que este produto existe para desfazer.
 */
export function Seguranca({ snapshot }: { snapshot: ProjectSnapshot }) {
  const t = useT()
  const [aberto, setAberto] = useState(false)

  const segredos = snapshot.segredos?.achados ?? []
  const expostos = snapshot.expostos?.achados ?? []
  const total = segredos.length + expostos.length

  if (total === 0) return null

  return (
    <section
      className="animate-in-up mt-4 rounded-xl border p-4"
      style={{
        borderColor: 'color-mix(in oklab, var(--color-danger) 42%, transparent)',
        background: 'color-mix(in oklab, var(--color-danger) 7%, transparent)',
      }}
    >
      <button
        onClick={() => setAberto((v) => !v)}
        className="no-drag flex w-full items-center gap-2 text-left"
        aria-expanded={aberto}
      >
        <ShieldAlert size={15} style={{ color: 'var(--color-danger)' }} className="shrink-0" />
        <h2 className="text-[13px] font-semibold" style={{ color: 'var(--color-danger)' }}>
          {total === 1 ? t('seg.um') : t('seg.varios', { n: total })}
        </h2>
        <ChevronDown
          size={15}
          className="ml-auto shrink-0 transition-transform duration-300"
          style={{ transform: aberto ? 'rotate(180deg)' : undefined, color: 'var(--color-ink-3)' }}
        />
      </button>

      {!aberto && (
        <>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
            {t('seg.resumo', { chaves: segredos.length, dados: expostos.length })}
          </p>
          {podeTerminalEmbutido() && (
            <button
              onClick={() => pedirTerminal(mensagemDeSeguranca(segredos, expostos))}
              className="no-drag mt-2.5 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--color-danger)', color: 'var(--color-paper)' }}
            >
              <SquareTerminal size={13} />
              {t('seg.pedirIA')}
            </button>
          )}
        </>
      )}

      {aberto && (
        <div className="mt-3 space-y-4">
          {segredos.length > 0 && (
            <Grupo
              icone={KeyRound}
              titulo={t('seg.chaves')}
              nota={t('seg.chavesNota')}
              itens={segredos.map((a: AchadoSegredo) => ({
                rotulo: a.rotulo,
                onde: `${a.arquivo}:${a.linha}`,
                trecho: a.trecho,
                confianca: a.confianca,
                porque: t('seg.chavesPorque'),
              }))}
            />
          )}

          {expostos.length > 0 && (
            <Grupo
              icone={Eye}
              titulo={t('seg.dados')}
              nota={t('seg.dadosNota')}
              itens={expostos.map((a: AchadoExposto) => ({
                rotulo: a.rotulo,
                onde: `${a.arquivo}:${a.linha}`,
                trecho: a.trecho,
                confianca: a.confianca,
                porque: a.porque,
              }))}
            />
          )}

          {/* A saída. Um aviso sem saída é só ansiedade. */}
          {podeTerminalEmbutido() && (
            <button
              onClick={() => pedirTerminal(mensagemDeSeguranca(segredos, expostos))}
              className="no-drag inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--color-danger)', color: 'var(--color-paper)' }}
            >
              <SquareTerminal size={13} />
              {t('seg.pedirIA')}
            </button>
          )}

          <p className="border-t pt-2.5 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            {t('seg.limite')}
          </p>
        </div>
      )}
    </section>
  )
}

interface Item {
  rotulo: string
  onde: string
  trecho: string
  confianca: string
  porque: string
}

function Grupo({
  icone: Icone,
  titulo,
  nota,
  itens,
}: {
  icone: typeof KeyRound
  titulo: string
  nota: string
  itens: Item[]
}) {
  const t = useT()
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Icone size={13} className="shrink-0" style={{ color: 'var(--color-ink-2)' }} />
        <h3 className="text-[12.5px] font-medium">{titulo}</h3>
      </div>
      <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--color-ink-3)]">{nota}</p>

      <ul className="mt-2 space-y-2">
        {itens.slice(0, 8).map((i, n) => (
          <li key={i.onde + n} className="rounded-lg border p-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[12.5px] font-medium">{i.rotulo}</span>
              <span
                className="rounded-full px-1.5 py-px text-[10.5px]"
                style={{
                  color:
                    i.confianca === 'alta' ? 'var(--color-danger)' : 'var(--color-ink-3)',
                  background:
                    i.confianca === 'alta'
                      ? 'color-mix(in oklab, var(--color-danger) 12%, transparent)'
                      : 'transparent',
                }}
              >
                {t(`seg.confianca.${i.confianca}`)}
              </span>
            </div>

            {/* O valor vem mascarado do motor. Mostrar inteiro seria expor de
                novo — em captura de tela, em compartilhamento, numa foto. */}
            <p className="mt-1 font-mono text-[11.5px] break-all text-[var(--color-ink-2)]">
              {i.trecho}
            </p>
            <p className="mt-1 font-mono text-[11px] break-all text-[var(--color-ink-3)]">
              {i.onde}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink-2)]">{i.porque}</p>
          </li>
        ))}
      </ul>

      {itens.length > 8 && (
        <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-3)]">
          {t('seg.mais', { n: itens.length - 8 })}
        </p>
      )}
    </div>
  )
}
