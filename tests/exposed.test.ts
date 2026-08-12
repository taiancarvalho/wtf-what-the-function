/**
 * O caça-expostos, contra repositórios git de verdade.
 *
 * Dois compromissos com o mesmo peso: achar o dado de pessoa que está visível
 * no navegador, e NÃO acusar o CPF de teste, o cartão do Stripe, o mock e o
 * arquivo de teste. O segundo é o que mantém o painel vivo.
 *
 * Tudo acontece em diretórios temporários. Nada é escrito em repositório do
 * usuário, e a identidade do git é sempre LOCAL.
 */

import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { procurarExpostos, cpfValido, cnpjValido, luhnValido } from '../electron/exposed.js'

const execFile = promisify(_execFile)

const AMBIENTE = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
}

const criados: string[] = []

afterAll(async () => {
  for (const dir of criados) await fs.rm(dir, { recursive: true, force: true })
})

async function g(dir: string, args: string[]) {
  return execFile('git', args, { cwd: dir, env: AMBIENTE })
}

async function repo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtf-expostos-'))
  criados.push(dir)
  await g(dir, ['init', '-b', 'main'])
  await g(dir, ['config', 'user.email', 'teste@example.com'])
  await g(dir, ['config', 'user.name', 'Pessoa de Teste'])
  await g(dir, ['config', 'commit.gpgsign', 'false'])
  return dir
}

async function escrever(dir: string, rel: string, conteudo: string) {
  const alvo = path.join(dir, rel)
  await fs.mkdir(path.dirname(alvo), { recursive: true })
  await fs.writeFile(alvo, conteudo)
}

async function comArquivos(arquivos: Record<string, string>) {
  const dir = await repo()
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    await escrever(dir, rel, conteudo)
  }
  return dir
}

/** Como acima, mas tudo commitado: o front exposto NÃO some com o commit. */
async function comArquivosCommitados(arquivos: Record<string, string>) {
  const dir = await comArquivos(arquivos)
  await g(dir, ['add', '-A'])
  await g(dir, ['commit', '-m', 'inicial'])
  return dir
}

// Dados inventados, com o FORMATO dos de verdade. Nenhum pertence a ninguém.
const CPF_VALIDO = '529.982.247-25'
const CPF_INVALIDO = '529.982.247-24'
const CNPJ_VALIDO = '11.222.333/0001-81'
const CNPJ_INVALIDO = '11.222.333/0001-82'
const CARTAO_LUHN = '4539578763621486'
const CARTAO_QUEBRADO = '4539578763621487'

describe('validadores', () => {
  it('valida CPF pelo dígito verificador', () => {
    expect(cpfValido('52998224725')).toBe(true)
    expect(cpfValido('52998224724')).toBe(false)
    expect(cpfValido('11111111111')).toBe(false)
    expect(cpfValido('00000000000')).toBe(false)
  })

  it('valida CNPJ pelo dígito verificador', () => {
    expect(cnpjValido('11222333000181')).toBe(true)
    expect(cnpjValido('11222333000182')).toBe(false)
  })

  it('valida cartão por Luhn', () => {
    expect(luhnValido(CARTAO_LUHN)).toBe(true)
    expect(luhnValido(CARTAO_QUEBRADO)).toBe(false)
    expect(luhnValido('123')).toBe(false)
  })
})

describe('procurarExpostos — o que ele deve achar', () => {
  it('acha o e-mail do admin em um componente de front', async () => {
    const dir = await comArquivosCommitados({
      'src/components/Rodape.tsx': `export const Rodape = () => <a href="mailto:admin@agenciaem5.com.br">Fale conosco</a>`,
    })
    const r = await procurarExpostos(dir)
    const a = r.achados.find((x) => x.tipo === 'email-sensivel')
    expect(a).toBeTruthy()
    expect(a?.confianca).toBe('alta')
    expect(a?.porque.length).toBeGreaterThan(20)
  })

  it('acha CPF válido e IGNORA o inválido e o de teste', async () => {
    const dir = await comArquivos({
      'src/pages/Cliente.tsx': `const cpf = "${CPF_VALIDO}"`,
      'src/pages/Ruim.tsx': `const a = "${CPF_INVALIDO}"\nconst b = "111.111.111-11"\nconst c = "000.000.000-00"\n`,
    })
    const r = await procurarExpostos(dir)
    const cpfs = r.achados.filter((x) => x.tipo === 'cpf')
    expect(cpfs.length).toBe(1)
    expect(cpfs[0].arquivo).toBe('src/pages/Cliente.tsx')
  })

  it('acha CNPJ válido e ignora o inválido', async () => {
    const dir = await comArquivos({
      'src/app/Empresa.tsx': `const cnpj = "${CNPJ_VALIDO}"`,
      'src/app/Outra.tsx': `const cnpj = "${CNPJ_INVALIDO}"`,
    })
    const r = await procurarExpostos(dir)
    const achados = r.achados.filter((x) => x.tipo === 'cnpj')
    expect(achados.length).toBe(1)
    expect(achados[0].arquivo).toBe('src/app/Empresa.tsx')
  })

  it('acha cartão que passa no Luhn e ignora o que não passa', async () => {
    const dir = await comArquivos({
      'src/checkout/Pagar.ts': `const numero = "${CARTAO_LUHN}"`,
      'src/checkout/Ruim.ts': `const numero = "${CARTAO_QUEBRADO}"`,
    })
    const r = await procurarExpostos(dir)
    const cartoes = r.achados.filter((x) => x.tipo === 'cartao')
    expect(cartoes.length).toBe(1)
    expect(cartoes[0].arquivo).toBe('src/checkout/Pagar.ts')
  })

  it('ignora os cartões de teste conhecidos dos provedores', async () => {
    const dir = await comArquivos({
      'src/checkout/Testes.ts':
        `const a = "4111111111111111"\nconst b = "4242424242424242"\nconst c = "5555555555554444"\n`,
    })
    const r = await procurarExpostos(dir)
    expect(r.achados.filter((x) => x.tipo === 'cartao').length).toBe(0)
  })

  it('acha o par login+senha deixado na tela', async () => {
    const dir = await comArquivos({
      'src/views/Login.tsx': [
        'const acesso = {',
        '  usuario: "gerente.financeiro",',
        '  senha: "Br4silSA#2024",',
        '}',
      ].join('\n'),
    })
    const r = await procurarExpostos(dir)
    const cred = r.achados.filter((x) => x.tipo === 'credencial')
    expect(cred.length).toBe(1)
    expect(cred[0].confianca).toBe('alta')
  })

  it('não acusa credencial quando os valores são placeholder', async () => {
    const dir = await comArquivos({
      'src/views/Form.tsx': `const f = { usuario: "seu-usuario", senha: "sua-senha" }`,
    })
    const r = await procurarExpostos(dir)
    expect(r.achados.filter((x) => x.tipo === 'credencial').length).toBe(0)
  })

  it('acha telefone com DDD e ignora o de enfeite', async () => {
    const dir = await comArquivos({
      'src/components/Contato.tsx': `const tel = "(31) 98842-7361"`,
      'src/components/Molde.tsx': `const tel = "(00) 00000-0000"\nconst t2 = "(11) 99999-9999"\n`,
    })
    const r = await procurarExpostos(dir)
    const tels = r.achados.filter((x) => x.tipo === 'telefone')
    expect(tels.length).toBe(1)
    expect(tels[0].arquivo).toBe('src/components/Contato.tsx')
  })

  it('só acusa CEP quando vem junto de endereço', async () => {
    const dir = await comArquivos({
      'src/pages/Endereco.tsx': `const local = "Rua das Acácias, 210 — CEP 30140-071"`,
      'src/pages/Campo.tsx': `const mascara = "30140-071"`,
    })
    const r = await procurarExpostos(dir)
    const end = r.achados.filter((x) => x.tipo === 'endereco')
    expect(end.length).toBe(1)
    expect(end[0].arquivo).toBe('src/pages/Endereco.tsx')
  })
})

describe('procurarExpostos — o que ele deve calar', () => {
  it('ignora e-mails de exemplo e de licença', async () => {
    const dir = await comArquivos({
      'src/util/mail.ts': [
        '// Copyright (c) 2024 fulano@empresareal.com — todos os direitos reservados',
        'const a = "user@example.com"',
        'const b = "teste@teste.com"',
        'const c = "noreply@agenciaem5.com.br"',
        'const d = "seu@email.com"',
      ].join('\n'),
    })
    const r = await procurarExpostos(dir)
    expect(r.achados.filter((x) => x.tipo.startsWith('email')).length).toBe(0)
  })

  it('ignora tudo em arquivo de teste, em node_modules e em mock', async () => {
    const dir = await comArquivos({
      'src/components/Card.test.tsx': `const cpf = "${CPF_VALIDO}"; const email = "admin@empresareal.com"`,
      'src/components/Card.spec.ts': `const cpf = "${CPF_VALIDO}"`,
      'tests/tudo.ts': `const cpf = "${CPF_VALIDO}"`,
      'src/mocks/clientes.ts': `const cpf = "${CPF_VALIDO}"`,
      'src/tipos.d.ts': `// admin@empresareal.com`,
      'node_modules/pacote/src/index.js': `const cpf = "${CPF_VALIDO}"`,
    })
    const r = await procurarExpostos(dir)
    expect(r.achados.length).toBe(0)
    expect(r.ignorados).toBeGreaterThan(0)
  })

  it('ignora arquivo fora do que vai para o navegador', async () => {
    const dir = await comArquivos({
      'scripts/importar.ts': `const cpf = "${CPF_VALIDO}"`,
      'README.md': `admin@empresareal.com`,
    })
    const r = await procurarExpostos(dir)
    expect(r.achados.length).toBe(0)
  })

  it('rebaixa a confiança em arquivo que parece de servidor (heurística imperfeita)', async () => {
    const dir = await comArquivos({
      'src/api/clientes.ts': `const contato = "admin@empresareal.com"`,
    })
    const r = await procurarExpostos(dir)
    const a = r.achados.find((x) => x.tipo === 'email-sensivel')
    expect(a?.confianca).toBe('media')
    expect(a?.porque).toContain('servidor')
  })
})

describe('procurarExpostos — mascaramento', () => {
  it('nunca devolve o dado inteiro em nenhum campo da saída', async () => {
    const email = 'diretoria@empresareal.com.br'
    const dir = await comArquivos({
      'src/pages/Tudo.tsx': [
        `const email = "${email}"`,
        `const cpf = "${CPF_VALIDO}"`,
        `const cnpj = "${CNPJ_VALIDO}"`,
        `const cartao = "${CARTAO_LUHN}"`,
        `const tel = "(31) 98842-7361"`,
        `const acesso = { usuario: "gerente.financeiro", senha: "Br4silSA#2024" }`,
      ].join('\n'),
    })
    const r = await procurarExpostos(dir)
    expect(r.achados.length).toBeGreaterThan(3)

    const saida = JSON.stringify(r)
    for (const inteiro of [
      email, CPF_VALIDO, '52998224725', CNPJ_VALIDO, '11222333000181',
      CARTAO_LUHN, '31988427361', 'gerente.financeiro', 'Br4silSA#2024',
    ]) {
      expect(saida).not.toContain(inteiro)
    }

    // E o mascaramento ainda deixa reconhecer de que dado se trata.
    expect(r.achados.some((a) => a.trecho.includes('•'))).toBe(true)
  })

  it('mascara o cartão no formato do extrato', async () => {
    const dir = await comArquivos({ 'src/x.ts': `const c = "${CARTAO_LUHN}"` })
    const r = await procurarExpostos(dir)
    const cartao = r.achados.find((a) => a.tipo === 'cartao')
    expect(cartao?.trecho).toBe('4539 •••• •••• 1486')
  })
})

describe('procurarExpostos — tetos e robustez', () => {
  it('marca truncado ao estourar o teto de arquivos', async () => {
    const dir = await repo()
    for (let i = 0; i < 420; i += 1) {
      await escrever(dir, `src/gerado/arq${i}.ts`, `export const n${i} = ${i}\n`)
    }
    const r = await procurarExpostos(dir)
    expect(r.varridos).toBeLessThanOrEqual(400)
    expect(r.truncado).toBe(true)
  })

  it('nunca lança: pasta que não é repositório e caminho inválido', async () => {
    const vazio = await fs.mkdtemp(path.join(os.tmpdir(), 'wtf-expostos-nada-'))
    criados.push(vazio)
    await expect(procurarExpostos(vazio)).resolves.toMatchObject({ achados: [] })
    await expect(procurarExpostos('/caminho/que/nao/existe/mesmo')).resolves.toMatchObject({ achados: [] })
    // @ts-expect-error — entrada errada de propósito.
    await expect(procurarExpostos(null)).resolves.toMatchObject({ achados: [] })
  })
})
