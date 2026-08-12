import { describe, expect, it } from 'vitest'
import { montarResumo, nomeArquivoResumo } from '@/lib/resumo'
import type { Feature, ProjectSnapshot, WtfEvent } from '@/types/protocol'

/**
 * O resumo é a única coisa do WTF que sai de dentro do aplicativo e chega a
 * alguém que nunca vai abri-lo. Se ele mentir, mente para o cliente da pessoa.
 *
 * Daí os testes cobrarem três coisas: o período filtra de verdade, as contagens
 * batem com o retrato, e o texto não vaza nem jargão nem caminho de arquivo.
 */

const AGORA = new Date('2026-08-12T15:00:00Z')
const HOJE = '2026-08-12T09:00:00Z'
const ANTEONTEM = '2026-08-10T09:00:00Z'
const MES_PASSADO = '2026-07-01T09:00:00Z'

/** Dicionário fake: devolve a chave e os valores, para a asserção ser sobre dados. */
function t(chave: string, vars?: Record<string, string | number>): string {
  const dic: Record<string, string> = {
    'resumo.periodo.hoje': 'hoje',
    'resumo.periodo.semana': 'nesta semana',
    'resumo.periodo.tudo': 'até agora',
    'resumo.titulo': '{projeto} — o que aconteceu {periodo}',
    'resumo.ondeEstamos': 'Onde estamos: {pct}% do previsto',
    'resumo.testadas': '{n} partes testadas',
    'resumo.prontas': '{n} prontas, esperando conferência',
    'resumo.naoComecaram': '{n} ainda não começaram',
    'resumo.ficouPronto': 'O que ficou pronto',
    'resumo.emAndamento': 'Sendo feito agora',
    'resumo.decisao': 'Precisa da sua decisão',
    'resumo.nada': 'Nada mudou {periodo}. O projeto continua como estava.',
    'resumo.gerado': 'Gerado pelo WTF em {data}',
    'resumo.arquivo1': '1 arquivo',
    'resumo.arquivos': '{n} arquivos',
    'resumo.itemArea': '{area}: {nome}',
  }
  const texto = dic[chave] ?? chave
  if (!vars) return texto
  return texto.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

function feature(p: Partial<Feature> & { id: string }): Feature {
  return {
    area: 'Contas',
    name: 'Entrar na conta',
    state: 'tested',
    origin: 'planned',
    summary: 'a pessoa entra por um link no e-mail, sem senha',
    relatedIds: [],
    files: ['src/auth/login.ts'],
    lastTouchedAt: HOJE,
    ...p,
  }
}

function aviso(p: Partial<WtfEvent> & { id: string }): WtfEvent {
  return {
    at: HOJE,
    type: 'risk.raised',
    source: 'agent',
    featureId: 'f-trava',
    evidence: [],
    human: {
      headline: 'A trava que separa os clientes ainda não bloqueia publicação',
      what: '',
      why: '',
      impact: '',
      affects: [],
      needsYourAttention: true,
    },
    ...p,
  }
}

function snapshot(features: Feature[], events: WtfEvent[] = []): ProjectSnapshot {
  return {
    project: {
      id: 'p1',
      name: 'Serra Café',
      path: '/tmp/serra',
      pitch: 'loja da torrefação',
      connectedAgents: ['claude-code'],
      live: false,
      createdAt: MES_PASSADO,
    },
    features,
    events,
  }
}

const PADRAO = [
  feature({ id: 'f-login' }),
  feature({
    id: 'f-facebook',
    name: 'Puxar os dados do Facebook',
    summary: 'os números das campanhas entram sozinhos',
    state: 'implemented',
    files: ['src/meta/sync.ts', 'src/meta/token.ts'],
  }),
  feature({
    id: 'f-relatorio',
    name: 'Relatório mensal',
    summary: 'um resumo do mês para o cliente',
    state: 'planned',
    lastTouchedAt: MES_PASSADO,
  }),
]

describe('montarResumo — período', () => {
  it('só conta o que aconteceu hoje', () => {
    const s = snapshot([
      feature({ id: 'a', name: 'Feito hoje', lastTouchedAt: HOJE }),
      feature({ id: 'b', name: 'Feito anteontem', lastTouchedAt: ANTEONTEM }),
    ])
    const texto = montarResumo(s, { periodo: 'hoje', tecnico: false, t, agora: AGORA })
    expect(texto).toContain('Feito hoje')
    expect(texto).not.toContain('Feito anteontem')
  })

  it('a semana pega os últimos sete dias, e "tudo" pega o resto', () => {
    const s = snapshot([
      feature({ id: 'a', name: 'Feito anteontem', lastTouchedAt: ANTEONTEM }),
      feature({ id: 'b', name: 'Feito no mês passado', lastTouchedAt: MES_PASSADO }),
    ])
    const semana = montarResumo(s, { periodo: 'semana', tecnico: false, t, agora: AGORA })
    expect(semana).toContain('Feito anteontem')
    expect(semana).not.toContain('Feito no mês passado')

    const tudo = montarResumo(s, { periodo: 'tudo', tecnico: false, t, agora: AGORA })
    expect(tudo).toContain('Feito anteontem')
    expect(tudo).toContain('Feito no mês passado')
  })

  it('filtra também os avisos que pedem decisão', () => {
    const s = snapshot(
      [feature({ id: 'a', lastTouchedAt: MES_PASSADO, state: 'planned' })],
      [aviso({ id: 'e1', at: MES_PASSADO })],
    )
    const hoje = montarResumo(s, { periodo: 'hoje', tecnico: false, t, agora: AGORA })
    expect(hoje).not.toContain('Precisa da sua decisão')

    const tudo = montarResumo(s, { periodo: 'tudo', tecnico: false, t, agora: AGORA })
    expect(tudo).toContain('Precisa da sua decisão')
    expect(tudo).toContain('A trava que separa os clientes ainda não bloqueia publicação')
  })

  it('aviso já resolvido à mão não vira pendência do resumo', () => {
    const s = snapshot(
      [feature({ id: 'a' })],
      [aviso({ id: 'e1', resolvido: { at: HOJE, por: 'pessoa' } })],
    )
    const texto = montarResumo(s, { periodo: 'tudo', tecnico: false, t, agora: AGORA })
    expect(texto).not.toContain('Precisa da sua decisão')
  })
})

describe('montarResumo — nada aconteceu', () => {
  it('diz isso de forma direta, sem seção vazia', () => {
    const s = snapshot([
      feature({ id: 'a', state: 'planned', lastTouchedAt: MES_PASSADO }),
    ])
    const texto = montarResumo(s, { periodo: 'hoje', tecnico: false, t, agora: AGORA })
    expect(texto).toContain('Nada mudou hoje.')
    expect(texto).not.toContain('O que ficou pronto')
    expect(texto).not.toContain('Precisa da sua decisão')
    expect(texto).not.toContain('Sendo feito agora')
  })

  it('projeto sem nenhuma parte não quebra', () => {
    const texto = montarResumo(snapshot([]), {
      periodo: 'tudo',
      tecnico: false,
      t,
      agora: AGORA,
    })
    expect(texto).toContain('Onde estamos: 0% do previsto')
    expect(texto).toContain('0 partes testadas')
  })
})

describe('montarResumo — contagens', () => {
  it('as contagens batem com o retrato', () => {
    const s = snapshot([
      feature({ id: '1', state: 'tested' }),
      feature({ id: '2', state: 'validated' }),
      feature({ id: '3', state: 'implemented' }),
      feature({ id: '4', state: 'building' }),
      feature({ id: '5', state: 'planned' }),
      feature({ id: '6', state: 'planned' }),
    ])
    const texto = montarResumo(s, { periodo: 'tudo', tecnico: false, t, agora: AGORA })
    expect(texto).toContain('2 partes testadas')
    expect(texto).toContain('2 prontas, esperando conferência')
    expect(texto).toContain('2 ainda não começaram')
    // média de (1 + 0.75 + 0.5 + 0.25 + 0 + 0) / 6 = 41,67% → 42%
    expect(texto).toContain('Onde estamos: 42% do previsto')
  })

  it('traz o nome do projeto e a assinatura do WTF', () => {
    const texto = montarResumo(snapshot(PADRAO), {
      periodo: 'semana',
      tecnico: false,
      t,
      agora: AGORA,
    })
    expect(texto.split('\n')[0]).toBe('Serra Café — o que aconteceu nesta semana')
    expect(texto.trimEnd().endsWith(`Gerado pelo WTF em ${AGORA.toLocaleDateString()}`)).toBe(true)
  })
})

describe('montarResumo — modo técnico', () => {
  const s = snapshot(PADRAO, [aviso({ id: 'e1' })])

  it('acrescenta números e áreas', () => {
    const simples = montarResumo(s, { periodo: 'tudo', tecnico: false, t, agora: AGORA })
    const tecnico = montarResumo(s, { periodo: 'tudo', tecnico: true, t, agora: AGORA })

    expect(simples).not.toContain('1 arquivo')
    expect(tecnico).toContain('1 arquivo')
    expect(tecnico).toContain('2 arquivos')
    expect(tecnico).toContain('Contas: Entrar na conta')
    expect(tecnico.length).toBeGreaterThan(simples.length)
  })

  it('não introduz jargão nenhum', () => {
    const tecnico = montarResumo(s, { periodo: 'tudo', tecnico: true, t, agora: AGORA })
    for (const palavra of ['commit', 'branch', 'merge', 'repositório', 'repository', 'pull request']) {
      expect(tecnico.toLowerCase()).not.toContain(palavra)
    }
  })

  it('nem no modo técnico vaza caminho de arquivo ou identificador', () => {
    for (const tecnico of [false, true]) {
      const texto = montarResumo(s, { periodo: 'tudo', tecnico, t, agora: AGORA })
      expect(texto).not.toContain('src/')
      expect(texto).not.toContain('.ts')
      expect(texto).not.toContain('f-login')
      expect(texto).not.toContain('f-facebook')
      expect(texto).not.toContain('/tmp/serra')
    }
  })

  it('no modo simples só aparecem nome e explicação da parte', () => {
    const texto = montarResumo(s, { periodo: 'tudo', tecnico: false, t, agora: AGORA })
    expect(texto).toContain('· Entrar na conta — a pessoa entra por um link no e-mail, sem senha')
    expect(texto).not.toContain('Contas:')
  })
})

describe('montarResumo — o que está sendo feito agora', () => {
  it('mostra a parte em curso separada do que ficou pronto', () => {
    const s = snapshot([
      feature({ id: 'a', name: 'Cupom de desconto', state: 'building', working: true }),
    ])
    const texto = montarResumo(s, { periodo: 'hoje', tecnico: false, t, agora: AGORA })
    expect(texto).toContain('Sendo feito agora')
    expect(texto).toContain('Cupom de desconto')
    expect(texto).not.toContain('O que ficou pronto')
  })
})

describe('nomeArquivoResumo', () => {
  it('produz um nome de arquivo seguro e datado', () => {
    expect(nomeArquivoResumo('Serra Café', AGORA)).toBe('serra-cafe-2026-08-12.md')
    expect(nomeArquivoResumo('///', AGORA)).toBe('projeto-2026-08-12.md')
  })
})
