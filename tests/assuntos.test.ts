import { describe, expect, it } from 'vitest'

import { montarAssuntos } from '@/lib/assuntos'
import { codigoCurto } from '@/lib/format'
import type { WtfEvent } from '@/types/protocol'

const T = (min: number) => new Date(Date.UTC(2026, 0, 10, 12, min, 0)).toISOString()

function ev(
  id: string,
  min: number,
  over: Record<string, unknown> = {},
  human: Record<string, unknown> = {},
): WtfEvent {
  return {
    id,
    at: T(min),
    type: 'code.changed',
    source: 'git',
    featureId: 'f-1',
    human: {
      headline: `Evento ${id}`,
      what: '',
      why: '',
      impact: '',
      affects: [],
      needsYourAttention: false,
      ...human,
    },
    ...over,
  } as unknown as WtfEvent
}

/** A lista chega do mais recente para o mais antigo, como no painel. */
const feed = (...eventos: WtfEvent[]) =>
  eventos.slice().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

describe('montarAssuntos — quem abre um assunto', () => {
  it('abre um assunto próprio para o evento que não responde a ninguém', () => {
    const a = ev('aviso-1', 1, {}, { needsYourAttention: true })
    const assuntos = montarAssuntos(feed(a))

    expect(assuntos).toHaveLength(1)
    expect(assuntos[0].aviso.id).toBe('aviso-1')
  })

  it('não deixa a resposta virar item de topo', () => {
    const a = ev('aviso-1', 1, {}, { needsYourAttention: true })
    const r = ev('resposta-1', 5, { respondeA: codigoCurto('aviso-1') })

    const assuntos = montarAssuntos(feed(a, r))

    expect(assuntos.map((s) => s.aviso.id)).toEqual(['aviso-1'])
    expect(assuntos[0].respostas.map((e) => e.id)).toEqual(['resposta-1'])
  })

  it('abre assunto próprio quando o código citado não existe no feed', () => {
    const r = ev('resposta-solta', 5, { respondeA: 'ZZZZ' })
    const assuntos = montarAssuntos(feed(r))

    expect(assuntos.map((s) => s.aviso.id)).toEqual(['resposta-solta'])
  })
})

describe('montarAssuntos — a contagem', () => {
  it('conta como UM assunto um aviso com três respostas', () => {
    const a = ev('aviso-1', 1, {}, { needsYourAttention: true })
    const cod = codigoCurto('aviso-1')
    const r1 = ev('r1', 3, { respondeA: cod })
    const r2 = ev('r2', 5, { respondeA: cod })
    const r3 = ev('r3', 7, { respondeA: cod })

    const assuntos = montarAssuntos(feed(a, r1, r2, r3))

    expect(assuntos).toHaveLength(1)
    expect(assuntos[0].respostas).toHaveLength(3)
  })

  it('lista as respostas da mais antiga para a mais recente', () => {
    const a = ev('aviso-1', 1)
    const cod = codigoCurto('aviso-1')
    const assuntos = montarAssuntos(
      feed(a, ev('r1', 3, { respondeA: cod }), ev('r2', 9, { respondeA: cod })),
    )

    expect(assuntos[0].respostas.map((e) => e.id)).toEqual(['r1', 'r2'])
  })

  it('conta uma única pendência mesmo quando aviso e resposta pedem atenção', () => {
    const a = ev('aviso-1', 1, {}, { needsYourAttention: true })
    const r = ev('r1', 5, { respondeA: codigoCurto('aviso-1') }, { needsYourAttention: true })

    const assuntos = montarAssuntos(feed(a, r))
    const pendentes = assuntos.filter((s) => s.pedeAtencao)

    expect(pendentes).toHaveLength(1)
  })
})

describe('montarAssuntos — o desfecho', () => {
  it('marca como respondido e tira da fila quando a última resposta não pede atenção', () => {
    const a = ev('aviso-1', 1, {}, { needsYourAttention: true })
    const r = ev('r1', 5, { respondeA: codigoCurto('aviso-1') }, { needsYourAttention: false })

    const [assunto] = montarAssuntos(feed(a, r))

    expect(assunto.respondido).toBe(true)
    expect(assunto.aguardando).toBe(false)
    expect(assunto.pedeAtencao).toBe(false)
  })

  it('marca como aguardando quando a última resposta ainda pede atenção', () => {
    const a = ev('aviso-1', 1, {}, { needsYourAttention: true })
    const r = ev('r1', 5, { respondeA: codigoCurto('aviso-1') }, { needsYourAttention: true })

    const [assunto] = montarAssuntos(feed(a, r))

    expect(assunto.aguardando).toBe(true)
    expect(assunto.pedeAtencao).toBe(true)
    expect(assunto.respondido).toBe(false)
  })

  it('tira o motivo da última resposta, não do aviso original', () => {
    const a = ev('aviso-1', 1, {}, { needsYourAttention: true, attentionReason: 'motivo do aviso' })
    const r = ev(
      'r1',
      5,
      { respondeA: codigoCurto('aviso-1') },
      { needsYourAttention: true, attentionReason: 'motivo da resposta' },
    )

    const [assunto] = montarAssuntos(feed(a, r))

    expect(assunto.motivo).toBe('motivo da resposta')
  })

  it('deixa quem decide o desfecho ser a última resposta, não a primeira', () => {
    const a = ev('aviso-1', 1, {}, { needsYourAttention: true })
    const cod = codigoCurto('aviso-1')
    const r1 = ev('r1', 3, { respondeA: cod }, { needsYourAttention: true })
    const r2 = ev('r2', 8, { respondeA: cod }, { needsYourAttention: false })

    const [assunto] = montarAssuntos(feed(a, r1, r2))

    expect(assunto.ultimo.id).toBe('r2')
    expect(assunto.pedeAtencao).toBe(false)
  })

  it('fecha o assunto quando a pessoa marcou o aviso como resolvido à mão', () => {
    const a = ev(
      'aviso-1',
      1,
      { resolvido: { at: T(9), por: 'usuario' } },
      { needsYourAttention: true },
    )
    const r = ev('r1', 5, { respondeA: codigoCurto('aviso-1') }, { needsYourAttention: true })

    const [assunto] = montarAssuntos(feed(a, r))

    expect(assunto.pedeAtencao).toBe(false)
    expect(assunto.aguardando).toBe(false)
  })

  it('fecha o assunto resolvido à mão mesmo sem nenhuma resposta', () => {
    const a = ev(
      'aviso-1',
      1,
      { resolvido: { at: T(9), por: 'usuario' } },
      { needsYourAttention: true },
    )

    const [assunto] = montarAssuntos(feed(a))

    expect(assunto.pedeAtencao).toBe(false)
  })
})

describe('montarAssuntos — cadeias', () => {
  it('joga a resposta de uma resposta no mesmo assunto do aviso original', () => {
    const a = ev('aviso-1', 1, {}, { needsYourAttention: true })
    const r1 = ev('r1', 4, { respondeA: codigoCurto('aviso-1') })
    const r2 = ev('r2', 7, { respondeA: codigoCurto('r1') })

    const assuntos = montarAssuntos(feed(a, r1, r2))

    expect(assuntos).toHaveLength(1)
    expect(assuntos[0].respostas.map((e) => e.id)).toEqual(['r1', 'r2'])
  })

  it('termina sem laço infinito quando dois eventos se citam mutuamente', () => {
    const a = ev('ev-a', 1, { respondeA: codigoCurto('ev-b') })
    const b = ev('ev-b', 5, { respondeA: codigoCurto('ev-a') })

    const assuntos = montarAssuntos(feed(a, b))

    expect(Array.isArray(assuntos)).toBe(true)
  })

  it('termina sem laço infinito numa cadeia circular de três eventos', () => {
    const a = ev('ev-a', 1, { respondeA: codigoCurto('ev-c') })
    const b = ev('ev-b', 5, { respondeA: codigoCurto('ev-a') })
    const c = ev('ev-c', 9, { respondeA: codigoCurto('ev-b') })

    const assuntos = montarAssuntos(feed(a, b, c))

    expect(Array.isArray(assuntos)).toBe(true)
  })
})
