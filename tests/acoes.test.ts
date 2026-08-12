import { describe, expect, it } from 'vitest'

import { acoesDeNaoSalvo, acoesDoEvento } from '@/lib/acoes'
import { codigoCurto } from '@/lib/format'
import type { ConfigProjeto, Feature, WtfEvent } from '@/types/protocol'

const T = (min: number) => new Date(Date.UTC(2026, 0, 10, 12, min, 0)).toISOString()

function evento(over: Record<string, unknown> = {}, human: Record<string, unknown> = {}): WtfEvent {
  return {
    id: 'aviso-de-login-2026',
    at: T(1),
    type: 'code.changed',
    source: 'git',
    featureId: 'f-login',
    human: {
      headline: 'A tela de entrada mudou',
      what: '',
      why: '',
      impact: '',
      affects: [],
      needsYourAttention: true,
      attentionReason: 'A senha pode estar sendo guardada sem proteção.',
      ...human,
    },
    technical: { filesChanged: 1, insertions: 1, deletions: 0, files: ['src/login.ts'] },
    ...over,
  } as unknown as WtfEvent
}

const parte = { id: 'f-login', name: 'Entrar na conta' } as unknown as Feature

const config = { nomeIdiomaConteudo: 'japonês' } as unknown as ConfigProjeto

/** Jargão de versionamento: o público deste app não sabe o que essas palavras são. */
const JARGAO = ['commit', 'branch', 'merge', 'stash', 'repositório', 'repositorio']

describe('acoesDoEvento — o código citado', () => {
  it('cita o código do assunto quando ele é passado', () => {
    const acoes = acoesDoEvento(evento(), parte, 'AB12')

    for (const a of acoes) expect(a.mensagem).toContain('AB12')
  })

  it('não cita o código do próprio evento quando há código de assunto', () => {
    const proprio = codigoCurto('aviso-de-login-2026')
    const acoes = acoesDoEvento(evento(), parte, 'AB12')

    expect(proprio).not.toBe('AB12')
    for (const a of acoes) expect(a.mensagem).not.toContain(proprio)
  })

  it('cai no código do próprio evento quando não há código de assunto', () => {
    const acoes = acoesDoEvento(evento(), parte)

    for (const a of acoes) expect(a.mensagem).toContain(codigoCurto('aviso-de-login-2026'))
  })
})

describe('acoesDoEvento — conteúdo da mensagem', () => {
  it('pede que a IA avise o painel ao terminar', () => {
    const acoes = acoesDoEvento(evento(), parte, 'AB12')

    for (const a of acoes) expect(a.mensagem).toContain('avise o painel')
  })

  it('cita o nome humano da parte do produto', () => {
    const acoes = acoesDoEvento(evento(), parte, 'AB12')

    for (const a of acoes) expect(a.mensagem).toContain('Entrar na conta')
  })

  it('usa um rótulo genérico quando a parte não é conhecida', () => {
    const acoes = acoesDoEvento(evento(), undefined, 'AB12')

    expect(acoes[0].mensagem).toContain('esta parte do projeto')
  })

  it('leva o motivo do alerta como contexto', () => {
    const acoes = acoesDoEvento(evento(), parte, 'AB12')

    expect(acoes[0].mensagem).toContain('A senha pode estar sendo guardada sem proteção.')
  })

  it('lista os arquivos envolvidos', () => {
    const acoes = acoesDoEvento(evento(), parte, 'AB12')

    expect(acoes[0].mensagem).toContain('src/login.ts')
  })

  it('oferece resolver, explicar e verificar, nessa ordem', () => {
    expect(acoesDoEvento(evento(), parte, 'AB12').map((a) => a.id)).toEqual([
      'resolver',
      'explicar',
      'verificar',
    ])
  })

  it('não devolve ação nenhuma para evento sem texto humano', () => {
    expect(acoesDoEvento(evento({ human: undefined }), parte, 'AB12')).toEqual([])
  })
})

describe('acoesDoEvento — idioma do conteúdo', () => {
  it('acrescenta o pedido de responder no idioma escolhido quando há config', () => {
    const acoes = acoesDoEvento(evento(), parte, 'AB12', config)

    for (const a of acoes) expect(a.mensagem).toContain('Responda em japonês.')
  })

  it('não inventa idioma nenhum quando não há config', () => {
    const acoes = acoesDoEvento(evento(), parte, 'AB12')

    for (const a of acoes) expect(a.mensagem).not.toContain('Responda em')
  })
})

describe('acoesDeNaoSalvo', () => {
  const features = [
    { id: 'f-login', name: 'Entrar na conta', unsaved: true, unsavedCount: 3 },
    { id: 'f-outra', name: 'Relatórios', unsaved: false, unsavedCount: 0 },
  ] as unknown as Feature[]

  it('não oferece ação quando não há nada pendente', () => {
    expect(acoesDeNaoSalvo([{ id: 'f', name: 'X' } as unknown as Feature])).toEqual([])
  })

  it('oferece guardar e resumir quando há trabalho não salvo', () => {
    expect(acoesDeNaoSalvo(features).map((a) => a.id)).toEqual(['salvar', 'resumir-pendente'])
  })

  it('informa quantos arquivos estão pendentes', () => {
    expect(acoesDeNaoSalvo(features)[0].mensagem).toContain('3 arquivos')
  })

  it('cita o nome humano das partes com trabalho pendente', () => {
    expect(acoesDeNaoSalvo(features)[0].mensagem).toContain('Entrar na conta')
  })

  it('acrescenta o pedido de idioma quando há config', () => {
    for (const a of acoesDeNaoSalvo(features, config)) {
      expect(a.mensagem).toContain('Responda em japonês.')
    }
  })
})

describe('linguagem das mensagens', () => {
  it('não usa jargão de versionamento nas ações de um evento', () => {
    for (const a of acoesDoEvento(evento(), parte, 'AB12', config)) {
      const texto = a.mensagem.toLowerCase()
      for (const palavra of JARGAO) expect(texto).not.toContain(palavra)
    }
  })

  it('não usa jargão de versionamento nas ações de trabalho não salvo', () => {
    const features = [
      { id: 'f-login', name: 'Entrar na conta', unsaved: true, unsavedCount: 3 },
    ] as unknown as Feature[]

    for (const a of acoesDeNaoSalvo(features, config)) {
      const texto = a.mensagem.toLowerCase()
      for (const palavra of JARGAO) expect(texto).not.toContain(palavra)
    }
  })
})
