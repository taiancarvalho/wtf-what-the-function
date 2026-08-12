import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo do processo main, sem tipos
import {
  decidirNotificacoes,
  lerNotificados,
  marcarNotificados,
  noiteSilenciosa,
} from '../electron/notify.js'

/**
 * A regra que estes testes protegem: o WTF notifica POUCO, e só o que exige
 * uma decisão da pessoa. Cada caso aqui é uma forma diferente de o produto
 * virar barulho — e barulho é desligado pelo usuário justamente antes do dia
 * em que o aviso importava.
 */

let raiz: string
let contador = 0

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-notify-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

async function projeto(conteudo?: string): Promise<string> {
  const dir = path.join(raiz, `p${contador++}`)
  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  if (conteudo !== undefined) {
    await writeFile(path.join(dir, '.wtf', 'notified.json'), conteudo, 'utf8')
  }
  return dir
}

const LIGADO = { notificar: 'sim', silencioNoturno: true, idiomaInterface: 'pt-BR' }
/** Meio-dia local: fora do silêncio noturno em qualquer fuso. */
const DIA = new Date(2026, 7, 11, 12, 0, 0)
const NOITE = new Date(2026, 7, 11, 23, 30, 0)

const T = (min: number) => new Date(Date.UTC(2026, 7, 11, 12, min, 0)).toISOString()

function evento(id: string, over: Record<string, unknown> = {}) {
  const { atencao, motivo, ...resto } = over as Record<string, unknown>
  return {
    id,
    at: T(1),
    type: 'agent.claim',
    source: 'agent',
    featureId: 'f-1',
    human: {
      what: `evento ${id}`,
      needsYourAttention: atencao === true,
      ...(motivo ? { attentionReason: motivo } : {}),
    },
    ...resto,
  }
}

function snap(events: unknown[] = [], features: unknown[] = []) {
  return { events, features }
}

const parte = (over: Record<string, unknown> = {}) => ({
  id: 'f-1',
  name: 'Cadastro de clientes',
  state: 'implemented',
  ...over,
})

describe('silêncio noturno', () => {
  it('é noite entre 22h e 7h, e dia no resto', () => {
    expect(noiteSilenciosa(NOITE, LIGADO)).toBe(true)
    expect(noiteSilenciosa(new Date(2026, 7, 11, 3, 0, 0), LIGADO)).toBe(true)
    expect(noiteSilenciosa(DIA, LIGADO)).toBe(false)
  })

  it('desligado, a noite deixa de existir', () => {
    expect(noiteSilenciosa(NOITE, { ...LIGADO, silencioNoturno: false })).toBe(false)
  })
})

describe('decidirNotificacoes — consentimento', () => {
  const antes = snap([evento('a1')], [parte()])
  const depois = snap([evento('a1'), evento('a2', { atencao: true })], [parte()])

  it('com notificar: "nao" nada sai', () => {
    expect(decidirNotificacoes(antes, depois, {}, DIA, { notificar: 'nao' })).toEqual([])
  })

  it('sem config nenhuma nada sai — o padrão é o silêncio', () => {
    expect(decidirNotificacoes(antes, depois, {}, DIA, {})).toEqual([])
  })

  it('a primeira leitura é só linha de base, nunca uma rajada', () => {
    expect(decidirNotificacoes(null, depois, {}, DIA, LIGADO)).toEqual([])
  })
})

describe('decidirNotificacoes — assunto que pede decisão', () => {
  const antes = snap([evento('a1')], [parte()])

  it('assunto novo pendente vira um aviso, com o nome da parte e o motivo', () => {
    const depois = snap(
      [evento('a1'), evento('a2', { atencao: true, motivo: 'Preciso saber se pode cobrar taxa.' })],
      [parte()],
    )
    const avisos = decidirNotificacoes(antes, depois, {}, DIA, LIGADO)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].aba).toBe('timeline')
    expect(avisos[0].titulo).toContain('Cadastro de clientes')
    expect(avisos[0].corpo).toBe('Preciso saber se pode cobrar taxa.')
    expect(avisos[0].chaves).toEqual(['assunto:a2'])
  })

  it('o mesmo assunto não notifica duas vezes', () => {
    const depois = snap([evento('a1'), evento('a2', { atencao: true })], [parte()])
    const avisos = decidirNotificacoes(
      antes,
      depois,
      { 'assunto:a2': new Date().toISOString() },
      DIA,
      LIGADO,
    )
    expect(avisos).toEqual([])
  })

  it('vários de uma vez viram UMA notificação agregada', () => {
    const depois = snap(
      [
        evento('a1'),
        evento('a2', { atencao: true }),
        evento('a3', { atencao: true }),
        evento('a4', { atencao: true }),
      ],
      [parte()],
    )
    const avisos = decidirNotificacoes(antes, depois, {}, DIA, LIGADO)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].titulo).toContain('3')
    expect(avisos[0].chaves).toHaveLength(3)
  })

  it('respostas de um mesmo aviso continuam sendo UM assunto', () => {
    // O aviso já era pendente antes; a IA respondeu e a resposta continua
    // pedindo decisão. Isso é o mesmo assunto — não pode virar aviso novo.
    const jaPendente = snap([evento('a1', { atencao: true })], [parte()])
    const comResposta = snap(
      [
        evento('a1', { atencao: true }),
        evento('r1', { atencao: true, at: T(5), respondeA: codigo('a1') }),
      ],
      [parte()],
    )
    expect(decidirNotificacoes(jaPendente, comResposta, {}, DIA, LIGADO)).toEqual([])
  })

  it('assunto resolvido à mão não notifica', () => {
    const depois = snap([evento('a1'), evento('a2', { atencao: true, resolvido: true })], [parte()])
    expect(decidirNotificacoes(antes, depois, {}, DIA, LIGADO)).toEqual([])
  })
})

describe('decidirNotificacoes — parte aprovada que mudou', () => {
  it('revalidar novo notifica sozinho, na aba do progresso', () => {
    const antes = snap([], [parte()])
    const depois = snap([], [parte({ revalidar: true })])
    const avisos = decidirNotificacoes(antes, depois, {}, DIA, LIGADO)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].aba).toBe('build')
    expect(avisos[0].titulo).toContain('Cadastro de clientes')
    expect(avisos[0].chaves).toEqual(['revalidar:f-1'])
  })

  it('revalidar que já existia antes não notifica de novo', () => {
    const antes = snap([], [parte({ revalidar: true })])
    const depois = snap([], [parte({ revalidar: true })])
    expect(decidirNotificacoes(antes, depois, {}, DIA, LIGADO)).toEqual([])
  })

  it('já notificado antes não repete', () => {
    const antes = snap([], [parte()])
    const depois = snap([], [parte({ revalidar: true })])
    const avisos = decidirNotificacoes(
      antes,
      depois,
      { 'revalidar:f-1': new Date().toISOString() },
      DIA,
      LIGADO,
    )
    expect(avisos).toEqual([])
  })
})

describe('decidirNotificacoes — o que NÃO notifica', () => {
  const antes = snap([evento('a1')], [parte()])

  it('commit novo não notifica', () => {
    const depois = snap(
      [evento('a1'), evento('c1', { type: 'code.changed', source: 'git' })],
      [parte()],
    )
    expect(decidirNotificacoes(antes, depois, {}, DIA, LIGADO)).toEqual([])
  })

  it('arquivo tocado e trabalho não salvo não notificam', () => {
    const depois = snap(
      [evento('a1'), evento('f1', { type: 'file.touched' })],
      [parte({ unsaved: true, unsavedCount: 4, working: true })],
    )
    expect(decidirNotificacoes(antes, depois, {}, DIA, LIGADO)).toEqual([])
  })

  it('tradução pronta não notifica', () => {
    const traduzido = evento('a1')
    traduzido.human = { ...traduzido.human, what: 'texto reescrito pela tradução' }
    expect(decidirNotificacoes(antes, snap([traduzido], [parte()]), {}, DIA, LIGADO)).toEqual([])
  })
})

describe('decidirNotificacoes — silêncio noturno', () => {
  const antes = snap([evento('a1')], [parte()])
  const depois = snap([evento('a1'), evento('a2', { atencao: true })], [parte()])

  it('segura o aviso à noite', () => {
    expect(decidirNotificacoes(antes, depois, {}, NOITE, LIGADO)).toEqual([])
  })

  it('e libera na verificação seguinte, em horário decente', () => {
    // Nada foi marcado como notificado durante a noite, então o assunto
    // continua pendente e sai de manhã.
    const avisos = decidirNotificacoes(antes, depois, {}, DIA, LIGADO)
    expect(avisos).toHaveLength(1)
  })
})

describe('notified.json', () => {
  it('arquivo ausente vale nada notificado', async () => {
    expect(await lerNotificados(await projeto())).toEqual({})
  })

  it('JSON quebrado ou formato estranho não derrubam nada', async () => {
    expect(await lerNotificados(await projeto('{{{'))).toEqual({})
    expect(await lerNotificados(await projeto('{"v":1,"itens":42}'))).toEqual({})
    expect(await lerNotificados(await projeto('[]'))).toEqual({})
  })

  it('grava e relê as chaves notificadas', async () => {
    const dir = await projeto()
    await marcarNotificados(dir, ['assunto:a1', 'revalidar:f-1'], DIA)
    const lidos = await lerNotificados(dir)
    expect(Object.keys(lidos).sort()).toEqual(['assunto:a1', 'revalidar:f-1'])
    expect(lidos['assunto:a1']).toBe(DIA.toISOString())
  })

  it('marcar de novo preserva o que já estava lá', async () => {
    const dir = await projeto()
    await marcarNotificados(dir, ['assunto:a1'], DIA)
    await marcarNotificados(dir, ['assunto:a2'], DIA)
    expect(Object.keys(await lerNotificados(dir)).sort()).toEqual(['assunto:a1', 'assunto:a2'])
  })

  it('sem chave nenhuma não escreve nada', async () => {
    const dir = await projeto()
    await marcarNotificados(dir, [], DIA)
    expect(await lerNotificados(dir)).toEqual({})
  })

  it('nunca mostra o identificador da parte para o usuário', () => {
    // Sem nome cadastrado, a notificação usa a manchete — nunca o id.
    const depois = {
      events: [
        {
          id: 'e-sem-nome',
          at: '2026-08-12T15:00:00-03:00',
          featureId: 'f-interno-123',
          human: {
            headline: 'O login passou a exigir confirmação por e-mail',
            needsYourAttention: true,
            attentionReason: 'Confira antes de publicar.',
          },
        },
      ],
      features: [],
    }
    const [aviso] = decidirNotificacoes(
      { events: [], features: [] } as never,
      depois as never,
      {},
      new Date('2026-08-12T15:00:00-03:00'),
      { notificar: 'sim', silencioNoturno: true } as never,
    )
    expect(aviso.titulo).not.toContain('f-interno-123')
    expect(aviso.corpo).not.toContain('f-interno-123')
    expect(aviso.titulo).toContain('O login passou a exigir confirmação por e-mail')
  })

})

/** O mesmo código curto usado pelo main para ligar resposta e aviso. */
function codigo(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h.toString(36).toUpperCase().slice(-4).padStart(4, '0')
}
