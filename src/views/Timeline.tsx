import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  FileText,
  FolderTree,
  Hammer,
  PackagePlus,
  PackageMinus,
  Search,
  ShieldAlert,
  Sparkles,
  ThumbsUp,
} from 'lucide-react'
import { StateChip, UnsavedChip, WorkingChip } from '@/components/StateMark'
import { VisualizadorArquivo } from '@/components/VisualizadorArquivo'
import { OQueFazer } from '@/components/OQueFazer'
import { acoesDeNaoSalvo, acoesDoEvento } from '@/lib/acoes'
import { codigoCurto, diaRelativo, horaDe, plural } from '@/lib/format'
import { AGENT_LABEL } from '@/lib/state'
import type { EventType, Feature, ProjectSnapshot, WtfEvent } from '@/types/protocol'

/**
 * A tela principal. O feed do seu software.
 *
 * Quatro níveis de profundidade, revelados um por vez:
 *   1. manchete  — sempre visível
 *   2. detalhes  — ao abrir o cartão
 *   3. técnico   — atrás de "Ver parte técnica"
 *   4. código    — atrás de "Ver o código"
 */

const ICONE: Record<EventType, typeof Hammer> = {
  'work.started': Hammer,
  'work.progress': Sparkles,
  'work.completed': Sparkles,
  'evidence.found': Search,
  'risk.raised': ShieldAlert,
  'risk.cleared': ShieldAlert,
  'docs.reorganized': FolderTree,
  'user.validated': ThumbsUp,
}

export function Timeline({ snapshot }: { snapshot: ProjectSnapshot }) {
  const [aberto, setAberto] = useState<string | null>(snapshot.events[1]?.id ?? null)
  const [soAtencao, setSoAtencao] = useState(false)
  const [arquivoAberto, setArquivoAberto] = useState<string | null>(null)

  const featurePorId = useMemo(
    () => new Map(snapshot.features.map((f) => [f.id, f])),
    [snapshot.features],
  )

  const eventos = soAtencao
    ? snapshot.events.filter((e) => e.human?.needsYourAttention)
    : snapshot.events

  const precisamAtencao = snapshot.events.filter((e) => e.human?.needsYourAttention).length

  // agrupa por dia, mantendo a ordem já invertida do mock
  const dias: { rotulo: string; eventos: WtfEvent[] }[] = []
  for (const e of eventos) {
    const rotulo = diaRelativo(e.at)
    const ultimo = dias.at(-1)
    if (ultimo?.rotulo === rotulo) ultimo.eventos.push(e)
    else dias.push({ rotulo, eventos: [e] })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-8 pt-7 pb-24">
        <header className="animate-in-up mb-8">
          <h1 className="font-display text-[27px] leading-[1.15] font-semibold">
            {snapshot.project.name}, em português
          </h1>

          <AgoraMesmo features={snapshot.features} />

          {precisamAtencao > 0 && (
            <button
              onClick={() => setSoAtencao((v) => !v)}
              className="no-drag mt-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors"
              style={{
                borderColor: soAtencao
                  ? 'var(--color-warn)'
                  : 'color-mix(in oklab, var(--color-warn) 35%, transparent)',
                background: soAtencao
                  ? 'color-mix(in oklab, var(--color-warn) 13%, transparent)'
                  : 'transparent',
                color: 'var(--color-warn)',
              }}
            >
              <AlertTriangle size={14} />
              {soAtencao
                ? 'Mostrando só o que pede atenção'
                : `${plural(precisamAtencao, 'coisa pede', 'coisas pedem')} sua atenção`}
            </button>
          )}
        </header>

        {dias.map((dia, di) => (
          <section key={dia.rotulo + di} className="mb-2">
            <div className="rule-double sticky top-0 z-10 -mx-2 mb-4 bg-[var(--color-paper)]/92 px-2 pt-3 pb-2 backdrop-blur-sm">
              <h2 className="font-display text-[13px] tracking-[0.1em] text-[var(--color-ink-3)] uppercase">
                {dia.rotulo}
              </h2>
            </div>

            <ol className="relative">
              {/* o fio da linha do tempo */}
              <span
                aria-hidden
                className="absolute top-2 bottom-2 left-[7px] w-px"
                style={{ background: 'var(--color-rule)' }}
              />
              {dia.eventos.map((e, i) => (
                <Cartao
                  key={e.id}
                  evento={e}
                  feature={featurePorId.get(e.featureId)}
                  aberto={aberto === e.id}
                  onToggle={() => setAberto(aberto === e.id ? null : e.id)}
                  onAbrirArquivo={setArquivoAberto}
                  delay={i * 0.045}
                />
              ))}
            </ol>
          </section>
        ))}

        {snapshot.events.length === 0 ? (
          /* Projeto sem nenhuma versão salva ainda — o primeiro minuto de vida
             de todo projeto, e uma hora provável de alguém abrir o WTF. */
          <div className="card mt-4 px-6 py-8 text-center">
            <p className="font-display text-[17px] leading-snug font-medium">
              Ainda não há nada para contar.
            </p>
            <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
              Este projeto ainda não tem nenhuma versão guardada. Assim que a
              primeira for salva — ou assim que a IA começar a trabalhar — o que
              acontecer aparece aqui.
            </p>
          </div>
        ) : (
          <p className="mt-10 text-center text-[13px] text-[var(--color-ink-3)]">
            Começo do projeto.
          </p>
        )}
      </div>

      <VisualizadorArquivo caminho={arquivoAberto} onFechar={() => setArquivoAberto(null)} />
    </div>
  )
}

/**
 * O que a IA declarou que está fazendo e ainda não terminou.
 * É a resposta para "o que está acontecendo neste exato momento?" — a pergunta
 * de quem fica olhando o painel enquanto o agente trabalha.
 */
function AgoraMesmo({ features }: { features: Feature[] }) {
  // Duas formas de "em curso": a IA declarou, ou há arquivo mexido sem salvar.
  // A segunda pega o trabalho que ninguém anunciou — que é a maioria.
  const emCurso = features.filter((f) => f.working || f.unsaved)
  if (emCurso.length === 0) return null

  const naoSalvos = emCurso.reduce((soma, f) => soma + (f.unsavedCount ?? 0), 0)

  return (
    <div
      className="animate-in-up mt-5 rounded-xl border p-4"
      style={{
        borderColor: 'color-mix(in oklab, var(--color-building) 42%, transparent)',
        background: 'color-mix(in oklab, var(--color-building) 8%, transparent)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="pulse-live h-2 w-2 rounded-full"
          style={{ background: 'var(--color-building)' }}
        />
        <span
          className="text-[11px] font-semibold tracking-[0.14em] uppercase"
          style={{ color: 'var(--color-building)' }}
        >
          Acontecendo agora
        </span>
      </div>

      {naoSalvos > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
          {plural(naoSalvos, 'arquivo não guardado', 'arquivos não guardados')} — esse
          trabalho pode ser perdido.
        </p>
      )}

      <ul className="mt-3 space-y-2.5">
        {emCurso.map((f) => (
          <li key={f.id}>
            <p className="font-display text-[16px] leading-snug font-medium">{f.name}</p>
            {f.workingClaim && (
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
                {f.workingClaim}
              </p>
            )}
            <p className="mt-0.5 text-[12px] text-[var(--color-ink-3)]">
              {f.working && f.workingSince
                ? `começou ${diaRelativo(f.workingSince).toLowerCase()} às ${horaDe(f.workingSince)} · ainda não terminou`
                : `${plural(f.unsavedCount ?? 0, 'arquivo mexido', 'arquivos mexidos')} · a IA não avisou o que está fazendo`}
            </p>
          </li>
        ))}
      </ul>

      {naoSalvos > 0 && <OQueFazer acoes={acoesDeNaoSalvo(features)} />}
    </div>
  )
}

function Cartao({
  evento,
  feature,
  aberto,
  onToggle,
  onAbrirArquivo,
  delay,
}: {
  evento: WtfEvent
  feature: Feature | undefined
  aberto: boolean
  onToggle: () => void
  onAbrirArquivo: (caminho: string) => void
  delay: number
}) {
  const h = evento.human
  const Icone = ICONE[evento.type]
  const atencao = h?.needsYourAttention ?? false
  const cor = atencao ? 'var(--color-warn)' : 'var(--color-ink-3)'

  return (
    <li
      className="animate-in-up relative pb-4 pl-9"
      style={{ animationDelay: `${delay}s` }}
    >
      {/* marcador na linha */}
      <span
        className="absolute top-[15px] left-0 grid h-[15px] w-[15px] place-items-center rounded-full border"
        style={{
          borderColor: cor,
          background: 'var(--color-paper)',
          color: cor,
        }}
      >
        <Icone size={8.5} strokeWidth={2.6} />
      </span>

      <article
        className="card overflow-hidden transition-[border-color,box-shadow] duration-200"
        style={
          atencao
            ? {
                borderColor: 'color-mix(in oklab, var(--color-warn) 42%, transparent)',
                boxShadow: '0 1px 0 0 color-mix(in oklab, var(--color-warn) 14%, transparent)',
              }
            : undefined
        }
      >
        <button
          onClick={onToggle}
          className="no-drag block w-full px-5 py-4 text-left"
          aria-expanded={aberto}
        >
          <div className="flex items-baseline gap-2.5 text-[12px] text-[var(--color-ink-3)]">
            <span
              className="rounded border px-1.5 py-px font-mono text-[10.5px] tracking-wider"
              title="Código deste aviso. Use para se referir a ele quando falar com a IA."
            >
              {codigoCurto(evento.id)}
            </span>
            <span className="font-mono tabular-nums">{horaDe(evento.at)}</span>
            {feature && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-[var(--color-ink-2)]">
                  {feature.name}
                </span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>
              {evento.source === 'user'
                ? 'você'
                : evento.source === 'wtf'
                  ? 'WTF'
                  : AGENT_LABEL[evento.agent ?? 'desconhecido']}
            </span>
            <ChevronDown
              size={15}
              className="ml-auto shrink-0 transition-transform duration-300"
              style={{ transform: aberto ? 'rotate(180deg)' : undefined }}
            />
          </div>

          {/* NÍVEL 1 — a manchete */}
          <h3 className="font-display mt-2 text-[19px] leading-snug font-medium text-balance">
            {h?.headline}
          </h3>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {feature?.working && <WorkingChip desde={feature.workingSince} />}
            {feature && <StateChip state={feature.state} />}
            {feature?.unsaved && <UnsavedChip quantos={feature.unsavedCount} />}
            {atencao && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium"
                style={{
                  color: 'var(--color-warn)',
                  background: 'color-mix(in oklab, var(--color-warn) 13%, transparent)',
                }}
              >
                <AlertTriangle size={11} />
                Precisa da sua atenção
              </span>
            )}
          </div>
        </button>

        {aberto && h && (
          <Detalhes evento={evento} feature={feature} onAbrirArquivo={onAbrirArquivo} />
        )}
      </article>
    </li>
  )
}

/** NÍVEL 2 — o que mudou, por quê, e o que isso afeta. */
function Detalhes({
  evento,
  feature,
  onAbrirArquivo,
}: {
  feature?: Feature
  evento: WtfEvent
  onAbrirArquivo: (caminho: string) => void
}) {
  const h = evento.human!
  const t = evento.technical

  return (
    <div className="animate-in-up border-t px-5 pt-4 pb-5">
      <p className="text-[14.5px] leading-relaxed text-pretty text-[var(--color-ink)]">
        {h.what}
      </p>
      <Bloco titulo="Por quê">{h.why}</Bloco>
      <Bloco titulo="Para você">{h.impact}</Bloco>

      {h.affects.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {h.affects.map((a) => (
              <span
                key={a}
                className="rounded-md border px-2 py-[3px] text-[12px] text-[var(--color-ink-2)]"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {h.needsYourAttention && h.attentionReason && (
        <div
          className="mt-4 flex gap-2.5 rounded-lg border p-3.5"
          style={{
            borderColor: 'color-mix(in oklab, var(--color-warn) 38%, transparent)',
            background: 'color-mix(in oklab, var(--color-warn) 8%, transparent)',
          }}
        >
          <AlertTriangle
            size={15}
            className="mt-[3px] shrink-0"
            style={{ color: 'var(--color-warn)' }}
          />
          <p className="text-[14px] leading-relaxed text-[var(--color-ink)]">
            {h.attentionReason}
          </p>
        </div>
      )}

      {/* Diagnóstico sem saída é só ansiedade: todo alerta oferece uma ação. */}
      {h.needsYourAttention && <OQueFazer acoes={acoesDoEvento(evento, feature)} />}

      {/* o que o agente realmente disse — guardado como dito */}
      {evento.claim && (
        <details className="group mt-4">
          <summary className="no-drag inline-flex cursor-default list-none items-center gap-1.5 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
            <ChevronDown
              size={13}
              className="transition-transform group-open:rotate-180"
            />
            Ver o que a IA declarou
          </summary>
          <blockquote
            className="mt-2 border-l-2 py-1 pl-3 text-[13px] leading-relaxed text-[var(--color-ink-2)] italic"
            style={{ borderColor: 'var(--color-rule)' }}
          >
            {evento.claim}
          </blockquote>
        </details>
      )}

      {/* como o WTF chegou nessa conclusão */}
      <details className="group mt-3">
        <summary className="no-drag inline-flex cursor-default list-none items-center gap-1.5 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
          <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
          Como o WTF sabe disso
        </summary>
        <ul className="mt-2 space-y-1.5">
          {evento.evidence.map((ev) => (
            <li key={ev.id} className="flex items-start gap-2 text-[13px]">
              <span
                className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    ev.confidence >= 0.8
                      ? 'var(--color-tested)'
                      : ev.confidence >= 0.5
                        ? 'var(--color-implemented)'
                        : 'var(--color-planned)',
                }}
              />
              <span className="text-[var(--color-ink-2)]">{ev.detail}</span>
            </li>
          ))}
        </ul>
      </details>

      {/* NÍVEL 3 — técnico */}
      {t && (
        <details className="group mt-3">
          <summary className="no-drag inline-flex cursor-default list-none items-center gap-1.5 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
            <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
            Ver a parte técnica
          </summary>

          <div className="mt-2.5 rounded-lg border p-3.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px]">
              <span className="text-[var(--color-ink-2)]">
                {plural(t.filesChanged, 'arquivo', 'arquivos')}
              </span>
              <span style={{ color: 'var(--color-tested)' }}>+{t.insertions}</span>
              <span style={{ color: 'var(--color-danger)' }}>−{t.deletions}</span>
            </div>

            <ul className="mt-2.5 space-y-0.5 font-mono text-[12px] text-[var(--color-ink-3)]">
              {t.files.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    onClick={() => onAbrirArquivo(f)}
                    title="Abrir o arquivo aqui do lado"
                    className="no-drag flex w-full cursor-pointer items-center gap-1.5 rounded px-1 py-[1px] text-left underline decoration-dotted underline-offset-[3px] transition-colors hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]"
                    style={{ textDecorationColor: 'var(--color-rule)' }}
                  >
                    <FileText size={11} className="shrink-0" />
                    <span className="truncate">{f}</span>
                  </button>
                </li>
              ))}
            </ul>

            {(t.dependenciesAdded.length > 0 || t.dependenciesRemoved.length > 0) && (
              <ul className="mt-2.5 space-y-0.5 font-mono text-[12px]">
                {t.dependenciesAdded.map((d) => (
                  <li
                    key={d}
                    className="flex items-center gap-1.5"
                    style={{ color: 'var(--color-tested)' }}
                  >
                    <PackagePlus size={11} className="shrink-0" />
                    {d}
                  </li>
                ))}
                {t.dependenciesRemoved.map((d) => (
                  <li
                    key={d}
                    className="flex items-center gap-1.5"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <PackageMinus size={11} className="shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            )}

            {/* NÍVEL 4 — o código cru */}
            {t.patch && (
              <details className="group/code mt-3">
                <summary className="no-drag cursor-default list-none text-[12px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
                  Ver o código
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-md border bg-[var(--color-paper-3)] p-3 font-mono text-[11.5px] leading-[1.6]">
                  {t.patch.split('\n').map((linha, i) => (
                    <div
                      key={i}
                      style={{
                        color: linha.startsWith('+')
                          ? 'var(--color-tested)'
                          : linha.startsWith('-')
                            ? 'var(--color-danger)'
                            : linha.startsWith('@@')
                              ? 'var(--color-implemented)'
                              : 'var(--color-ink-3)',
                      }}
                    >
                      {linha || ' '}
                    </div>
                  ))}
                </pre>
              </details>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5 first:mt-0">
      <Rotulo>{titulo}</Rotulo>
      <p className="mt-1 text-[14.5px] leading-relaxed text-pretty text-[var(--color-ink)]">
        {children}
      </p>
    </div>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] tracking-[0.14em] text-[var(--color-ink-3)] uppercase">
      {children}
    </span>
  )
}
