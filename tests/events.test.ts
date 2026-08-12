import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import { readAgentEvents, mesclarClaims } from '../electron/events.js'
import { codigoCurto } from '@/lib/format'

let raiz: string

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-events-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

async function projetoCom(nome: string, conteudo: string | null): Promise<string> {
  const dir = path.join(raiz, nome)
  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  if (conteudo !== null) {
    await writeFile(path.join(dir, '.wtf', 'events.jsonl'), conteudo, 'utf8')
  }
  return dir
}

const T = (min: number) => new Date(Date.UTC(2026, 0, 10, 12, min, 0)).toISOString()

function snapshotBase(features: any[] = [], events: any[] = []) {
  return {
    project: { id: 'p', name: 'Projeto', connectedAgents: [], live: false },
    features,
    events,
  }
}

function feature(over: Record<string, unknown> = {}) {
  return {
    id: 'f-login',
    area: 'Contas',
    name: 'Entrar na conta',
    state: 'planned',
    origin: 'planned',
    summary: '',
    relatedIds: [],
    files: [],
    lastTouchedAt: T(0),
    attention: 'none',
    ...over,
  }
}

describe('readAgentEvents', () => {
  it('devolve lista vazia quando o arquivo de eventos não existe', async () => {
    const dir = await projetoCom('sem-arquivo', null)
    expect(await readAgentEvents(dir)).toEqual([])
  })

  it('ignora linha corrompida no meio sem perder as linhas boas', async () => {
    const dir = await projetoCom(
      'linha-podre',
      [
        JSON.stringify({ id: 'e1', kind: 'session.started', at: T(1) }),
        '{ isto nao e json',
        JSON.stringify({ id: 'e2', kind: 'file.touched', at: T(2), files: ['a.ts'] }),
      ].join('\n') + '\n',
    )

    const eventos = await readAgentEvents(dir)
    expect(eventos.map((e: any) => e.id)).toEqual(['e2', 'e1'])
  })

  it('descarta evento sem data válida', async () => {
    const dir = await projetoCom(
      'data-invalida',
      [
        JSON.stringify({ id: 'bom', kind: 'session.started', at: T(1) }),
        JSON.stringify({ id: 'ruim', kind: 'session.started', at: 'ontem de tarde' }),
      ].join('\n'),
    )

    const eventos = await readAgentEvents(dir)
    expect(eventos.map((e: any) => e.id)).toEqual(['bom'])
  })

  it('devolve os eventos do mais recente para o mais antigo', async () => {
    const dir = await projetoCom(
      'ordem',
      [
        JSON.stringify({ id: 'antigo', kind: 'session.started', at: T(1) }),
        JSON.stringify({ id: 'novo', kind: 'session.started', at: T(9) }),
        JSON.stringify({ id: 'meio', kind: 'session.started', at: T(5) }),
      ].join('\n'),
    )

    const eventos = await readAgentEvents(dir)
    expect(eventos.map((e: any) => e.id)).toEqual(['novo', 'meio', 'antigo'])
  })
})

describe('mesclarClaims — trabalho em curso', () => {
  it('marca a feature como trabalhando quando há início sem fim', () => {
    const snap = snapshotBase([feature()])
    const out = mesclarClaims(snap, [
      { id: 'c1', kind: 'claim.started', at: T(3), feature: 'Entrar na conta', sessionId: 's1' },
    ])

    const f = out.features.find((x: any) => x.id === 'f-login')
    expect(f.working).toBe(true)
    expect(f.workingSince).toBe(T(3))
  })

  it('não marca como trabalhando quando o par início/fim está fechado', () => {
    const snap = snapshotBase([feature()])
    const out = mesclarClaims(snap, [
      { id: 'c1', kind: 'claim.started', at: T(3), feature: 'Entrar na conta', sessionId: 's1' },
      { id: 'c2', kind: 'claim.completed', at: T(6), feature: 'Entrar na conta', sessionId: 's1' },
    ])

    const f = out.features.find((x: any) => x.id === 'f-login')
    expect(f.working).toBeFalsy()
  })

  it('cria uma feature nova quando a IA declara uma parte que ninguém conhecia', () => {
    const out = mesclarClaims(snapshotBase(), [
      { id: 'c1', kind: 'claim.started', at: T(3), feature: 'Exportar relatório', sessionId: 's1' },
    ])

    const f = out.features.find((x: any) => x.name === 'Exportar relatório')
    expect(f).toBeTruthy()
    expect(f.state).toBe('building')
  })
})

describe('mesclarClaims — declaração não é prova', () => {
  it('promove no máximo até implemented quando a IA declara ter terminado', () => {
    const snap = snapshotBase([feature({ state: 'planned' })])
    const out = mesclarClaims(snap, [
      { id: 'c1', kind: 'claim.started', at: T(3), feature: 'Entrar na conta', sessionId: 's1' },
      { id: 'c2', kind: 'claim.completed', at: T(6), feature: 'Entrar na conta', sessionId: 's1' },
    ])

    expect(out.features.find((x: any) => x.id === 'f-login').state).toBe('implemented')
  })

  it('nunca promove até tested por declaração da IA', () => {
    const snap = snapshotBase([feature({ state: 'implemented' })])
    const out = mesclarClaims(snap, [
      { id: 'c2', kind: 'claim.completed', at: T(6), feature: 'Entrar na conta', sessionId: 's1' },
    ])

    expect(out.features.find((x: any) => x.id === 'f-login').state).not.toBe('tested')
    expect(out.features.find((x: any) => x.id === 'f-login').state).toBe('implemented')
  })

  it('não rebaixa uma feature já provada como tested ao receber um claim aberto', () => {
    const snap = snapshotBase([feature({ state: 'tested' })])
    const out = mesclarClaims(snap, [
      { id: 'c1', kind: 'claim.started', at: T(3), feature: 'Entrar na conta', sessionId: 's1' },
    ])

    const f = out.features.find((x: any) => x.id === 'f-login')
    expect(f.state).toBe('tested')
    expect(f.working).toBe(true)
  })

  it('não rebaixa uma feature validated ao receber um claim concluído', () => {
    const snap = snapshotBase([feature({ state: 'validated' })])
    const out = mesclarClaims(snap, [
      { id: 'c2', kind: 'claim.completed', at: T(6), feature: 'Entrar na conta', sessionId: 's1' },
    ])

    expect(out.features.find((x: any) => x.id === 'f-login').state).toBe('validated')
  })
})

describe('mesclarClaims — toques de arquivo', () => {
  it('agrupa toques órfãos de uma mesma rajada em um único cartão', () => {
    const snap = snapshotBase([feature({ files: ['src/login.ts'] })])
    const out = mesclarClaims(snap, [
      { id: 't1', kind: 'file.touched', at: T(1), files: ['src/login.ts'], sessionId: 's1' },
      { id: 't2', kind: 'file.touched', at: T(3), files: ['src/senha.ts'], sessionId: 's1' },
      { id: 't3', kind: 'file.touched', at: T(5), files: ['src/token.ts'], sessionId: 's1' },
    ])

    const progresso = out.events.filter((e: any) => e.type === 'work.progress')
    expect(progresso).toHaveLength(1)
    expect(progresso[0].technical.filesChanged).toBe(3)
  })

  it('separa em dois cartões toques distantes mais que a janela da rajada', () => {
    const snap = snapshotBase([feature({ files: ['src/login.ts'] })])
    const out = mesclarClaims(snap, [
      { id: 't1', kind: 'file.touched', at: T(1), files: ['src/login.ts'], sessionId: 's1' },
      { id: 't2', kind: 'file.touched', at: T(40), files: ['src/senha.ts'], sessionId: 's1' },
    ])

    expect(out.events.filter((e: any) => e.type === 'work.progress')).toHaveLength(2)
  })

  it('não cria cartão de rajada para toques dentro de um par de claims', () => {
    const snap = snapshotBase([feature()])
    const out = mesclarClaims(snap, [
      { id: 'c1', kind: 'claim.started', at: T(2), feature: 'Entrar na conta', sessionId: 's1' },
      { id: 't1', kind: 'file.touched', at: T(4), files: ['src/login.ts'], sessionId: 's1' },
      { id: 'c2', kind: 'claim.completed', at: T(8), feature: 'Entrar na conta', sessionId: 's1' },
    ])

    expect(out.events.filter((e: any) => e.type === 'work.progress')).toHaveLength(0)
  })

  it('anexa à feature os arquivos tocados entre o início e o fim do trabalho', () => {
    const snap = snapshotBase([feature()])
    const out = mesclarClaims(snap, [
      { id: 'c1', kind: 'claim.started', at: T(2), feature: 'Entrar na conta', sessionId: 's1' },
      { id: 't1', kind: 'file.touched', at: T(4), files: ['src/login.ts'], sessionId: 's1' },
      { id: 'c2', kind: 'claim.completed', at: T(8), feature: 'Entrar na conta', sessionId: 's1' },
    ])

    expect(out.features.find((x: any) => x.id === 'f-login').files).toContain('src/login.ts')
  })
})

describe('mesclarClaims — ligação por código', () => {
  const idDoAviso = 'aviso-de-seguranca-2026'

  it('marca o aviso citado com respondidoPor quando a IA cita o código dele', () => {
    const aviso = {
      id: idDoAviso,
      at: T(1),
      type: 'code.changed',
      source: 'git',
      featureId: 'f-login',
      human: { headline: 'Mudou o login', needsYourAttention: true },
    }
    const cod = codigoCurto(idDoAviso)

    const out = mesclarClaims(snapshotBase([feature()], [aviso]), [
      {
        id: 'resposta-1',
        kind: 'claim.completed',
        at: T(9),
        feature: 'Entrar na conta',
        sessionId: 's1',
        text: `Conferi o ${cod} e estava tudo certo.`,
      },
    ])

    const alvo = out.events.find((e: any) => e.id === idDoAviso)
    expect(alvo.respondidoPor).toBeTruthy()
    expect(alvo.respondidoPor.eventId).toBe('resposta-1')
  })

  it('marca a própria resposta com respondeA apontando o código citado', () => {
    const aviso = {
      id: idDoAviso,
      at: T(1),
      type: 'code.changed',
      source: 'git',
      featureId: 'f-login',
      human: { headline: 'Mudou o login', needsYourAttention: true },
    }
    const cod = codigoCurto(idDoAviso)

    const out = mesclarClaims(snapshotBase([feature()], [aviso]), [
      {
        id: 'resposta-1',
        kind: 'claim.completed',
        at: T(9),
        feature: 'Entrar na conta',
        sessionId: 's1',
        text: `Conferi o ${cod} e estava tudo certo.`,
      },
    ])

    const resposta = out.events.find((e: any) => e.id === 'resposta-1')
    expect(resposta.respondeA).toBe(cod)
  })

  it('não deixa uma resposta responder a um aviso que veio depois dela', () => {
    const aviso = {
      id: idDoAviso,
      at: T(30),
      type: 'code.changed',
      source: 'git',
      featureId: 'f-login',
      human: { headline: 'Mudou o login', needsYourAttention: true },
    }
    const cod = codigoCurto(idDoAviso)

    const out = mesclarClaims(snapshotBase([feature()], [aviso]), [
      {
        id: 'resposta-1',
        kind: 'claim.completed',
        at: T(9),
        feature: 'Entrar na conta',
        sessionId: 's1',
        text: `Conferi o ${cod}.`,
      },
    ])

    expect(out.events.find((e: any) => e.id === idDoAviso).respondidoPor).toBeUndefined()
  })

  it('a primeira resposta é a que fica registrada como quem fechou o aviso', () => {
    const aviso = {
      id: idDoAviso,
      at: T(1),
      type: 'code.changed',
      source: 'git',
      featureId: 'f-login',
      human: { headline: 'Mudou o login', needsYourAttention: true },
    }
    const cod = codigoCurto(idDoAviso)

    const out = mesclarClaims(snapshotBase([feature()], [aviso]), [
      {
        id: 'resposta-a',
        kind: 'claim.completed',
        at: T(5),
        feature: 'Entrar na conta',
        sessionId: 's1',
        text: `Olhei o ${cod}.`,
      },
      {
        id: 'resposta-b',
        kind: 'claim.completed',
        at: T(9),
        feature: 'Entrar na conta',
        sessionId: 's1',
        text: `Olhei o ${cod} de novo.`,
      },
    ])

    expect(out.events.find((e: any) => e.id === idDoAviso).respondidoPor.eventId).toBe('resposta-a')
  })

  it('as duas cópias de codigoCurto concordam para uma amostra grande de ids', () => {
    // A cópia em electron/events.js não é exportada. Provamos a concordância
    // pelo efeito observável: a ligação só acontece se os dois lados calcularem
    // o MESMO código de 4 caracteres para o mesmo id.
    const ids = Array.from({ length: 60 }, (_, i) => `evento-de-teste-${i}-abc${i * 7}`)
    const divergentes: string[] = []

    for (const id of ids) {
      const cod = codigoCurto(id)
      const aviso = {
        id,
        at: T(1),
        type: 'code.changed',
        source: 'git',
        featureId: 'f-login',
        human: { headline: 'Aviso', needsYourAttention: true },
      }
      const out = mesclarClaims(snapshotBase([feature()], [aviso]), [
        {
          id: `resposta-${id}`,
          kind: 'claim.completed',
          at: T(20),
          feature: 'Entrar na conta',
          sessionId: 's1',
          text: `Conferi o ${cod}.`,
        },
      ])
      if (!out.events.find((e: any) => e.id === id)?.respondidoPor) divergentes.push(id)
    }

    expect(divergentes).toEqual([])
  })
})

describe('mesclarClaims — pureza e sinais do projeto', () => {
  it('não muta o snapshot recebido', () => {
    const snap = snapshotBase([feature()], [
      {
        id: 'aviso-x',
        at: T(1),
        type: 'code.changed',
        source: 'git',
        featureId: 'f-login',
        human: { headline: 'Oi', needsYourAttention: true },
      },
    ])
    const antes = JSON.stringify(snap)

    mesclarClaims(snap, [
      { id: 'c1', kind: 'claim.started', at: T(3), feature: 'Entrar na conta', sessionId: 's1' },
      { id: 't1', kind: 'file.touched', at: T(4), files: ['src/login.ts'], sessionId: 's1' },
    ])

    expect(JSON.stringify(snap)).toBe(antes)
  })

  it('não muta a lista de eventos do agente recebida', () => {
    const eventos = [
      { id: 'c1', kind: 'claim.started', at: T(3), feature: 'Entrar na conta', sessionId: 's1' },
      { id: 'c2', kind: 'claim.completed', at: T(6), feature: 'Entrar na conta', sessionId: 's1' },
    ]
    const antes = JSON.stringify(eventos)

    mesclarClaims(snapshotBase([feature()]), eventos)

    expect(JSON.stringify(eventos)).toBe(antes)
  })

  it('registra os agentes vistos nos eventos', () => {
    const out = mesclarClaims(snapshotBase([feature()]), [
      { id: 'c1', kind: 'claim.started', at: T(3), feature: 'Entrar na conta', agent: 'claude' },
    ])

    expect(out.project.connectedAgents).toContain('claude')
  })

  it('não acende o sinal de vida por sessão antiga', () => {
    const out = mesclarClaims(snapshotBase([feature()]), [
      { id: 's', kind: 'session.started', at: T(0) },
    ])

    expect(out.project.live).toBe(false)
  })

  it('acende o sinal de vida quando há sessão iniciada há poucos minutos', () => {
    const agora = new Date(Date.now() - 60_000).toISOString()
    const out = mesclarClaims(snapshotBase([feature()]), [
      { id: 's', kind: 'session.started', at: agora },
    ])

    expect(out.project.live).toBe(true)
  })
})
