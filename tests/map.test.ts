/**
 * O mapa do projeto: vocabulário, nunca estado.
 *
 * A regra que este arquivo existe para proteger: o mapa é opinião da IA. Ele
 * pode dizer como as partes se chamam; não pode dizer que estão prontas.
 * Estado só sai de evidência no disco.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { aplicarMapa, readProjectMap } from '../electron/map.js'

const criados: string[] = []

afterAll(async () => {
  for (const dir of criados) await fs.rm(dir, { recursive: true, force: true })
})

/** Cria um diretório temporário com (ou sem) `.wtf/map.json`. */
async function dirCom(conteudo?: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtf-map-'))
  criados.push(dir)
  if (conteudo !== undefined) {
    await fs.mkdir(path.join(dir, '.wtf'), { recursive: true })
    await fs.writeFile(path.join(dir, '.wtf', 'map.json'), conteudo)
  }
  return dir
}

const featureValida = (over: Record<string, unknown> = {}) => ({
  id: 'f-login',
  area: 'Contas',
  name: 'Entrar na conta',
  summary: 'Pessoa entra com e-mail e senha.',
  paths: ['src/lib/auth/**'],
  ...over,
})

// ------------------------------------------------------------------ leitura

describe('readProjectMap', () => {
  it('devolve null quando não existe mapa', async () => {
    expect(await readProjectMap(await dirCom())).toBeNull()
  })

  it('devolve null quando o mapa está corrompido', async () => {
    expect(await readProjectMap(await dirCom('{ isso não é json'))).toBeNull()
  })

  it('devolve null quando a versão do mapa não é a esperada', async () => {
    const dir = await dirCom(JSON.stringify({ v: 2, features: [featureValida()] }))
    expect(await readProjectMap(dir)).toBeNull()
  })

  it('devolve null quando features não é uma lista', async () => {
    const dir = await dirCom(JSON.stringify({ v: 1, features: { a: 1 } }))
    expect(await readProjectMap(dir)).toBeNull()
  })

  it('descarta feature inválida e mantém as válidas', async () => {
    const dir = await dirCom(
      JSON.stringify({
        v: 1,
        features: [
          featureValida(),
          { id: 'f-sem-nome', area: 'Contas', summary: 'x', paths: [] }, // sem name
          { id: 'f-sem-paths', area: 'Contas', name: 'X', summary: 'x' }, // sem paths
          null,
        ],
      }),
    )
    const mapa = await readProjectMap(dir)
    expect(mapa!.features.map((f: { id: string }) => f.id)).toEqual(['f-login'])
  })

  it('normaliza ids com acento, espaço e maiúscula', async () => {
    const dir = await dirCom(
      JSON.stringify({ v: 1, features: [featureValida({ id: 'Entrar Na Conta ÁÉÍ' })] }),
    )
    const mapa = await readProjectMap(dir)
    expect(mapa!.features[0].id).toBe('entrar-na-conta-aei')
  })

  it('mantém apenas a primeira feature quando dois ids normalizam igual', async () => {
    const dir = await dirCom(
      JSON.stringify({
        v: 1,
        features: [
          featureValida({ id: 'f-login', name: 'Primeira' }),
          featureValida({ id: 'F-LOGIN', name: 'Segunda' }),
        ],
      }),
    )
    const mapa = await readProjectMap(dir)
    expect(mapa!.features).toHaveLength(1)
    expect(mapa!.features[0].name).toBe('Primeira')
  })

  it('devolve null quando nenhuma feature sobrevive à validação', async () => {
    const dir = await dirCom(JSON.stringify({ v: 1, features: [{ id: 'x' }] }))
    expect(await readProjectMap(dir)).toBeNull()
  })
})

// ---------------------------------------------------------------- aplicação

const snapshotBase = () => ({
  project: { id: 'p-real', name: 'projeto', path: '/tmp/projeto', pitch: 'antigo', createdAt: '2026-01-01T00:00:00.000Z' },
  features: [],
  events: [],
})

const mapaCom = (...features: Record<string, unknown>[]) => ({
  v: 1,
  project: {},
  features: features.map((f) => ({
    tests: [],
    related: [],
    planRef: undefined,
    planStatus: undefined,
    ...featureValida(f),
  })),
})

/**
 * O bug: mapear o projeto DESLIGAVA a detecção de testes.
 *
 * `tests` é opcional no formato, e sem mapa o WTF liga teste e código pela
 * convenção de nomes. Com mapa, passava a confiar só na lista declarada — então
 * um agente que pulou a etapa "Ligue os testes" zerava a coluna inteira. Foi o
 * que aconteceu com o próprio WTF: 389 testes no repositório, e o painel
 * dizendo "0 testado" para o dono do projeto.
 */
describe('a rede de segurança do "✓ Testado"', () => {
  const rastreados = ['electron/git.js', 'tests/git.test.ts']

  it('sem `tests` declarado, liga teste e código pela convenção de nomes', () => {
    const mapa = mapaCom({ id: 'git', name: 'Leitura do histórico', paths: ['electron/git.js'] })
    const out = aplicarMapa(snapshotBase(), mapa, [], rastreados, null)
    expect(out.features[0].state).toBe('tested')
  })

  it('a declaração do mapa continua mandando quando existe', () => {
    // Lista declarada e vazia de casamento: o autor disse que o teste desta
    // parte é outro, e a convenção não passa por cima disso.
    const mapa = mapaCom({
      id: 'git',
      name: 'Leitura do histórico',
      paths: ['electron/git.js'],
      tests: ['tests/nao-existe/**'],
    })
    const out = aplicarMapa(snapshotBase(), mapa, [], rastreados, null)
    expect(out.features[0].state).toBe('implemented')
  })

  it('NÃO promove parte que não tem teste nenhum — a rede não inventa prova', () => {
    const mapa = mapaCom({ id: 'map', name: 'Vocabulário', paths: ['electron/map.js'] })
    const out = aplicarMapa(snapshotBase(), mapa, [], ['electron/map.js', 'tests/git.test.ts'], null)
    expect(out.features[0].state).toBe('implemented')
  })

  it('projeto sem teste algum continua em "pronto"', () => {
    const mapa = mapaCom({ id: 'git', name: 'Leitura', paths: ['electron/git.js'] })
    const out = aplicarMapa(snapshotBase(), mapa, [], ['electron/git.js'], null)
    expect(out.features[0].state).toBe('implemented')
  })
})

describe('aplicarMapa — o estado vem da evidência', () => {
  it('devolve o snapshot intacto quando não há mapa', () => {
    const snap = snapshotBase()
    expect(aplicarMapa(snap, null, [], [], null)).toBe(snap)
  })

  it('deixa como planned a parte cujos arquivos não existem', () => {
    const out = aplicarMapa(snapshotBase(), mapaCom({ paths: ['src/lib/auth/**'] }), [], [], null)
    expect(out.features[0].state).toBe('planned')
  })

  it('nunca promove estado por planStatus done', () => {
    const mapa = mapaCom({ paths: ['src/lib/auth/**'], planStatus: 'done' })
    const out = aplicarMapa(snapshotBase(), mapa, [], [], null)
    expect(out.features[0].state).toBe('planned')
    expect(out.features[0].planStatus).toBe('done')
  })

  it('promove para implemented quando o arquivo existe de verdade', () => {
    const mapa = mapaCom({ paths: ['src/lib/auth/**'], planStatus: 'todo' })
    const out = aplicarMapa(snapshotBase(), mapa, [], ['src/lib/auth/login.ts'], null)
    expect(out.features[0].state).toBe('implemented')
  })

  it('promove para tested quando existe teste casando com a parte', () => {
    const mapa = mapaCom({ paths: ['src/lib/auth/**'], tests: ['tests/auth/**'] })
    const out = aplicarMapa(
      snapshotBase(),
      mapa,
      [],
      ['src/lib/auth/login.ts', 'tests/auth/login.test.ts'],
      null,
    )
    expect(out.features[0].state).toBe('tested')
  })

  it('não promove para tested quando só existe o teste, sem código', () => {
    const mapa = mapaCom({ paths: ['src/lib/auth/**'], tests: ['tests/auth/**'] })
    const out = aplicarMapa(snapshotBase(), mapa, [], ['tests/auth/login.test.ts'], null)
    expect(out.features[0].state).toBe('planned')
  })

  it('marca origin planned quando a feature veio de um plano', () => {
    const out = aplicarMapa(snapshotBase(), mapaCom({ planRef: 'story-12' }), [], [], null)
    expect(out.features[0].origin).toBe('planned')
    expect(out.features[0].planRef).toBe('story-12')
  })
})

describe('aplicarMapa — glob', () => {
  const casa = (glob: string, arquivo: string) =>
    aplicarMapa(snapshotBase(), mapaCom({ paths: [glob] }), [], [arquivo], null).features[0].files

  it('casa qualquer profundidade com **', () => {
    expect(casa('src/**', 'src/a/b/c.ts')).toEqual(['src/a/b/c.ts'])
  })

  it('não atravessa barra com *', () => {
    expect(casa('src/*.ts', 'src/a/b.ts')).toEqual([])
    expect(casa('src/*.ts', 'src/b.ts')).toEqual(['src/b.ts'])
  })

  it('cobre o conteúdo de um diretório listado literalmente', () => {
    expect(casa('src/lib/', 'src/lib/motor.ts')).toEqual(['src/lib/motor.ts'])
  })

  it('não casa arquivo fora do diretório literal', () => {
    expect(casa('src/lib/', 'src/outro/motor.ts')).toEqual([])
  })

  it('filtra related que aponta para feature inexistente', () => {
    const mapa = mapaCom({ id: 'f-login', related: ['f-fantasma', 'f-login'] })
    const out = aplicarMapa(snapshotBase(), mapa, [], [], null)
    expect(out.features[0].relatedIds).toEqual([])
  })

  it('mantém related que aponta para feature existente', () => {
    const mapa = {
      v: 1,
      project: {},
      features: [
        { ...featureValida({ id: 'f-login' }), tests: [], related: ['f-perfil'] },
        { ...featureValida({ id: 'f-perfil', name: 'Perfil' }), tests: [], related: [] },
      ],
    }
    const out = aplicarMapa(snapshotBase(), mapa, [], [], null)
    expect(out.features[0].relatedIds).toEqual(['f-perfil'])
  })
})

describe('aplicarMapa — trabalho ainda não salvo', () => {
  it('conta arquivo não rastreado como existência e marca unsaved', () => {
    const mapa = mapaCom({ paths: ['src/lib/auth/**'] })
    const out = aplicarMapa(snapshotBase(), mapa, [], [], {
      untracked: ['src/lib/auth/novo.ts'],
      modified: [],
    })
    expect(out.features[0].state).toBe('implemented')
    expect(out.features[0].unsaved).toBe(true)
    expect(out.features[0].unsavedCount).toBe(1)
  })

  it('conta também arquivo modificado ainda não commitado', () => {
    const mapa = mapaCom({ paths: ['src/lib/auth/**'] })
    const out = aplicarMapa(snapshotBase(), mapa, [], ['src/lib/auth/login.ts'], {
      untracked: [],
      modified: ['src/lib/auth/login.ts'],
    })
    expect(out.features[0].unsavedCount).toBe(1)
  })

  it('não anuncia unsaved quando tudo está salvo', () => {
    const mapa = mapaCom({ paths: ['src/lib/auth/**'] })
    const out = aplicarMapa(snapshotBase(), mapa, [], ['src/lib/auth/login.ts'], {
      untracked: [],
      modified: [],
    })
    expect(out.features[0].unsaved).toBeUndefined()
    expect(out.features[0].unsavedCount).toBeUndefined()
  })
})

describe('aplicarMapa — estado declarado pela IA e imutabilidade', () => {
  it('preserva working, workingSince e workingClaim de um snapshot anterior', () => {
    const snap = {
      ...snapshotBase(),
      features: [
        {
          id: 'qualquer-outro-id',
          name: 'Entrar na conta',
          working: true,
          workingSince: '2026-02-01T12:00:00.000Z',
          workingClaim: 'Estou trocando o login por magic link.',
        },
      ],
    }
    const out = aplicarMapa(snap as never, mapaCom({ name: 'Entrar na conta' }), [], [], null)
    expect(out.features[0].working).toBe(true)
    expect(out.features[0].workingSince).toBe('2026-02-01T12:00:00.000Z')
    expect(out.features[0].workingClaim).toBe('Estou trocando o login por magic link.')
  })

  it('não mutila o snapshot que recebeu', () => {
    const snap = {
      ...snapshotBase(),
      events: [
        {
          id: 'e1',
          at: '2026-01-02T00:00:00.000Z',
          featureId: 'f-antigo',
          technical: { files: ['src/lib/auth/login.ts'] },
        },
      ],
    }
    const antes = structuredClone(snap)
    aplicarMapa(snap as never, mapaCom({ paths: ['src/lib/auth/**'] }), [], [], null)
    expect(snap).toEqual(antes)
  })

  it('reatribui o evento para a feature que cobre seus arquivos', () => {
    const snap = {
      ...snapshotBase(),
      events: [
        { id: 'e1', at: '2026-01-02T00:00:00.000Z', featureId: 'f-antigo', technical: { files: ['src/lib/auth/login.ts'] } },
      ],
    }
    const out = aplicarMapa(snap as never, mapaCom({ id: 'f-login', paths: ['src/lib/auth/**'] }), [], [], null)
    expect(out.events[0].featureId).toBe('f-login')
  })

  it('joga na gaveta de sobra o evento que não pertence a nenhuma parte', () => {
    const snap = {
      ...snapshotBase(),
      events: [
        { id: 'e1', at: '2026-01-02T00:00:00.000Z', featureId: 'f-antigo', technical: { files: ['scripts/solto.sh'] } },
      ],
    }
    const out = aplicarMapa(snap as never, mapaCom({ paths: ['src/lib/auth/**'] }), [], [], null)
    expect(out.events[0].featureId).toBe('f-outros')
    expect(out.features.some((f: { id: string }) => f.id === 'f-outros')).toBe(true)
  })

  it('usa a data do commit mais recente que tocou a parte', () => {
    const mapa = mapaCom({ paths: ['src/lib/auth/**'] })
    const commits = [
      { at: '2026-03-01T00:00:00.000Z', files: [{ path: 'src/lib/auth/login.ts' }] },
      { at: '2026-02-01T00:00:00.000Z', files: [{ path: 'src/lib/auth/login.ts' }] },
    ]
    const out = aplicarMapa(snapshotBase(), mapa, commits, ['src/lib/auth/login.ts'], null)
    expect(out.features[0].lastTouchedAt).toBe('2026-03-01T00:00:00.000Z')
  })
})
