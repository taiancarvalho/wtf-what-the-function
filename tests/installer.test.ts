import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulos do processo main, sem tipos
import {
  ALVOS,
  ALVOS_PORTATEIS,
  desinstalar,
  estadoInstalacao,
  instalar,
  SKILLS_OPCIONAIS,
} from '../electron/installer.js'
// @ts-expect-error idem
import { lerPacoteInstalacao } from '../electron/disclosure.js'

let raiz: string
let contador = 0

beforeAll(async () => {
  raiz = await mkdtemp(path.join(os.tmpdir(), 'wtf-installer-'))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

const existeArquivo = (p: string) =>
  readFile(p, 'utf8').then(
    () => true,
    () => false,
  )

function novoProjeto(): string {
  return path.join(raiz, `p${contador++}`)
}

/**
 * O bug que este arquivo existe para não deixar voltar.
 *
 * Uma skill nova entra em ALVOS e, de um dia para o outro, TODO projeto já
 * instalado passa a se declarar não instalado — e o app oferece "ligar o WTF
 * neste projeto" para quem ligou semanas atrás e está com ele funcionando.
 * Aconteceu de verdade quando a skill de guardrails chegou.
 */
describe('instalação já feita, e o WTF ganhou uma peça nova', () => {
  it('some uma skill do disco: continua LIGADO, e pede atualização — não instalação', async () => {
    const dir = novoProjeto()
    await instalar(dir)

    const antes = await estadoInstalacao(dir)
    expect(antes.instalado).toBe(true)
    expect(antes.desatualizado).toBe(false)

    // Exatamente o que acontece quando a versão nova traz um alvo que a
    // instalação antiga não tinha: o arquivo simplesmente não está lá.
    await rm(path.join(dir, ALVOS.guardrails[0]), { force: true })

    const depois = await estadoInstalacao(dir)
    expect(depois.instalado).toBe(false)
    expect(depois.desatualizado).toBe(true)
    expect(depois.projeto.habilitado).toBe(true)
  })

  it('projeto que nunca foi habilitado NÃO é "desatualizado" — é novo mesmo', async () => {
    const estado = await estadoInstalacao(novoProjeto())
    expect(estado.instalado).toBe(false)
    expect(estado.desatualizado).toBe(false)
  })

  it('reinstalar por cima devolve o projeto ao estado ligado', async () => {
    const dir = novoProjeto()
    await instalar(dir)
    await rm(path.join(dir, ALVOS.guardrails[0]), { force: true })
    expect((await estadoInstalacao(dir)).desatualizado).toBe(true)

    await instalar(dir)
    const depois = await estadoInstalacao(dir)
    expect(depois.instalado).toBe(true)
    expect(depois.desatualizado).toBe(false)
  })
})

/**
 * A tela de transparência promete dizer o que vai ser escrito no computador da
 * pessoa. Um alvo sem rótulo aparecia ali como uma linha em branco — a tela
 * falhando na única coisa que ela faz.
 */
describe('todo alvo tem nome na tela de transparência', () => {
  it('nenhum item do pacote sai sem título', async () => {
    const pacote = await lerPacoteInstalacao(novoProjeto())
    const todos = [...pacote.itens, ...pacote.global.itens, ...pacote.projeto.itens]
    expect(todos.length).toBeGreaterThan(0)
    for (const item of todos) {
      expect(item.titulo, `sem título: ${item.destino}`).toBeTruthy()
      expect(item.proposito, `sem propósito: ${item.destino}`).toBeTruthy()
    }
  })

  it('cada alvo tem um arquivo de origem que existe de verdade', async () => {
    const pacote = await lerPacoteInstalacao(novoProjeto())
    for (const item of pacote.itens) {
      expect(item.erro, `origem faltando: ${item.origem}`).toBeUndefined()
      expect(item.bytes).toBeGreaterThan(0)
    }
  })
})

/**
 * `/btw` é o único alvo que a PESSOA digita. Se o nome da pasta mudar, o
 * comando muda junto e o que estava documentado deixa de existir.
 */
describe('o comando /btw', () => {
  it('mora numa pasta chamada exatamente "btw"', () => {
    expect(ALVOS.btw[0]).toBe('.claude/skills/btw/SKILL.md')
  })

  it('é instalado junto com o resto', async () => {
    const dir = novoProjeto()
    await instalar(dir)
    expect((await estadoInstalacao(dir)).btw).toBe(true)
  })
})

/**
 * `AGENTS.md` e `GEMINI.md` são a instrução para quem não lê `.claude/skills/`
 * — Codex, opencode e Gemini. E são arquivos DO PROJETO: podem já existir,
 * escritos por quem trabalha nele. Instalar o WTF não pode levar isso embora,
 * e desinstalar não pode levar junto o que não é nosso.
 */
describe('a instrução para os outros agentes', () => {
  const ler = (dir: string, rel: string) => readFile(path.join(dir, rel), 'utf8')

  it('cria os dois arquivos com a regra de declarar', async () => {
    const dir = novoProjeto()
    await instalar(dir)

    for (const rel of ALVOS_PORTATEIS) {
      const texto = await ler(dir, rel)
      expect(texto).toContain('wtf-claim.cjs')
      expect(texto).toContain('--feature')
      // O índice aponta para as skills no disco em vez de copiar as 691
      // linhas delas para um arquivo lido em toda sessão.
      expect(texto).toContain('.claude/skills/wtf-mapear/SKILL.md')
      expect(texto.length).toBeLessThan(4000)
    }
  })

  it('preserva o que já estava escrito no AGENTS.md de quem trabalha no projeto', async () => {
    const dir = novoProjeto()
    await mkdir(dir, { recursive: true })
    const meu = '# Regras da casa\n\nNunca use `any` em TypeScript.\n'
    await writeFile(path.join(dir, 'AGENTS.md'), meu, 'utf8')

    await instalar(dir)

    const texto = await ler(dir, 'AGENTS.md')
    expect(texto).toContain('Nunca use `any` em TypeScript.')
    expect(texto).toContain('wtf-claim.cjs')
  })

  it('instalar duas vezes não acumula bloco', async () => {
    const dir = novoProjeto()
    await instalar(dir)
    const uma = await ler(dir, 'AGENTS.md')
    await instalar(dir)
    const duas = await ler(dir, 'AGENTS.md')

    expect(duas).toBe(uma)
    expect(duas.split('wtf-claim.cjs').length - 1).toBe(2) // start e done, uma vez só
  })

  it('desinstalar devolve o arquivo EXATAMENTE como estava antes', async () => {
    const dir = novoProjeto()
    await mkdir(dir, { recursive: true })
    const meu = '# Regras da casa\n\nNunca use `any` em TypeScript.\n'
    await writeFile(path.join(dir, 'AGENTS.md'), meu, 'utf8')

    await instalar(dir)
    await desinstalar(dir)

    expect(await ler(dir, 'AGENTS.md')).toBe(meu)
  })

  it('desinstalar apaga o arquivo quando ele era só nosso', async () => {
    const dir = novoProjeto()
    await instalar(dir)
    await desinstalar(dir)

    for (const rel of ALVOS_PORTATEIS) {
      await expect(ler(dir, rel)).rejects.toThrow()
    }
  })

  it('o idioma escolhido vale também para os outros agentes', async () => {
    const dir = novoProjeto()
    await mkdir(path.join(dir, '.wtf'), { recursive: true })
    await writeFile(
      path.join(dir, '.wtf', 'config.json'),
      JSON.stringify({ idiomaConteudo: 'en', nomeIdiomaConteudo: 'inglês' }),
      'utf8',
    )

    await instalar(dir)

    expect(await ler(dir, 'AGENTS.md')).toContain('Escreva SEMPRE em inglês')
  })
})

/**
 * Cada habilidade instalada é contexto que a IA carrega em toda sessão. Poder
 * recusar as que não se usa é economia real — mas o botão precisa desligar de
 * verdade, inclusive o que já estava no disco.
 */
describe('escolher quais habilidades instalar', () => {
  const desligar = async (dir: string, skills: string[]) => {
    await mkdir(path.join(dir, '.wtf'), { recursive: true })
    await writeFile(
      path.join(dir, '.wtf', 'config.json'),
      JSON.stringify({ skillsDesligadas: skills }),
      'utf8',
    )
  }

  it('sem escolha nenhuma, instala tudo — o silêncio significa todas', async () => {
    const dir = novoProjeto()
    await instalar(dir)

    for (const chave of SKILLS_OPCIONAIS) {
      expect(await existeArquivo(path.join(dir, ALVOS[chave][0]))).toBe(true)
    }
  })

  it('a recusada não vai para o disco, e o resto vai', async () => {
    const dir = novoProjeto()
    await desligar(dir, ['documentos', 'btw'])
    await instalar(dir)

    expect(await existeArquivo(path.join(dir, ALVOS.documentos[0]))).toBe(false)
    expect(await existeArquivo(path.join(dir, ALVOS.btw[0]))).toBe(false)
    expect(await existeArquivo(path.join(dir, ALVOS.mapear[0]))).toBe(true)
    expect(await existeArquivo(path.join(dir, ALVOS.skill[0]))).toBe(true)
  })

  it('recusar DEPOIS de instalada tira o arquivo do disco', async () => {
    const dir = novoProjeto()
    await instalar(dir)
    expect(await existeArquivo(path.join(dir, ALVOS.pastas[0]))).toBe(true)

    await desligar(dir, ['pastas'])
    await instalar(dir)

    expect(await existeArquivo(path.join(dir, ALVOS.pastas[0]))).toBe(false)
    // A pasta também sai: deixá-la vazia faz a habilidade continuar aparecendo
    // para quem lista `.claude/skills/` — recusada no config, presente no disco.
    await expect(readdir(path.dirname(path.join(dir, ALVOS.pastas[0])))).rejects.toThrow()
  })

  it('recusar uma habilidade NÃO faz o projeto parecer desinstalado', async () => {
    const dir = novoProjeto()
    await desligar(dir, ['guardrails'])
    await instalar(dir)

    const estado = await estadoInstalacao(dir)
    expect(estado.instalado).toBe(true)
    expect(estado.desatualizado).toBe(false)
  })

  it('o índice dos outros agentes não aponta para habilidade recusada', async () => {
    const dir = novoProjeto()
    await desligar(dir, ['mapear'])
    await instalar(dir)

    const texto = await readFile(path.join(dir, 'AGENTS.md'), 'utf8')
    expect(texto).not.toContain('wtf-mapear')
    expect(texto).toContain('wtf-pastas')
  })

  it('o essencial não é opcional: declarar, o CLI e o hook não entram na lista', async () => {
    for (const essencial of ['skill', 'cli', 'hook', 'formato']) {
      expect(SKILLS_OPCIONAIS).not.toContain(essencial)
    }
  })

  it('desligar tudo ainda deixa o WTF funcionando', async () => {
    const dir = novoProjeto()
    await desligar(dir, [...SKILLS_OPCIONAIS])
    await instalar(dir)

    expect(await existeArquivo(path.join(dir, ALVOS.skill[0]))).toBe(true)
    expect(await existeArquivo(path.join(dir, ALVOS.cli[0]))).toBe(true)
    expect((await estadoInstalacao(dir)).instalado).toBe(true)
  })
})
