/**
 * O caça-segredos, contra repositórios git de verdade.
 *
 * Dois compromissos são testados com o mesmo peso: achar a chave real, e NÃO
 * acusar o exemplo. O segundo é o mais importante — um falso positivo por dia
 * treina a pessoa a ignorar o painel inteiro.
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

import { deveIgnorarCaminho, procurarNoTexto, procurarSegredos } from '../electron/secrets.js'

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtf-segredos-'))
  criados.push(dir)
  await g(dir, ['init', '-b', 'main'])
  await g(dir, ['config', 'user.email', 'teste@example.com'])
  await g(dir, ['config', 'user.name', 'Pessoa de Teste'])
  await g(dir, ['config', 'commit.gpgsign', 'false'])
  return dir
}

async function escrever(dir: string, rel: string, conteudo: string | Buffer) {
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

// Chaves de mentira, com o FORMATO das de verdade. Nenhuma existe.
const CHAVES = {
  openai: 'sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD',
  openrouter: 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef',
  anthropic: 'sk-ant-api03-ZZaabbccddeeffgghhiijjkkllmmnnoopp',
  aws: 'AKIAIOSFODNN7EXAMPL1',
  google: 'AIzaSyB1234567890abcdefghijklmnopqrstuv',
  github: 'ghp_0123456789abcdefghijklmnopqrstuvwx',
  githubPat: 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz',
  slack: 'xoxb-123456789012-abcdefghijklmnop',
  stripe: 'sk_live_51Abcdefghijklmnopqrstuvwx',
}

describe('procurarSegredos — famílias de padrão', () => {
  it('acha a chave da OpenAI e da OpenRouter', async () => {
    const dir = await comArquivos({ '.env': `OPENAI_API_KEY=${CHAVES.openai}\nOR=${CHAVES.openrouter}\n` })
    const r = await procurarSegredos(dir)
    const tipos = r.achados.map((a) => a.tipo)
    expect(tipos.filter((t) => t === 'openai').length).toBe(2)
  })

  it('acha a chave da Anthropic', async () => {
    const dir = await comArquivos({ 'config.ts': `const k = "${CHAVES.anthropic}"` })
    const r = await procurarSegredos(dir)
    expect(r.achados.some((a) => a.tipo === 'anthropic' && a.confianca === 'alta')).toBe(true)
  })

  it('acha a chave da AWS', async () => {
    const dir = await comArquivos({ 'deploy.sh': `AWS_ACCESS_KEY_ID=${CHAVES.aws}` })
    const r = await procurarSegredos(dir)
    expect(r.achados.some((a) => a.tipo === 'aws')).toBe(true)
  })

  it('acha a chave do Google', async () => {
    const dir = await comArquivos({ 'app.js': `const key = '${CHAVES.google}'` })
    const r = await procurarSegredos(dir)
    expect(r.achados.some((a) => a.tipo === 'google')).toBe(true)
  })

  it('acha tokens do GitHub (clássico e fine-grained)', async () => {
    const dir = await comArquivos({ 'ci.env': `A=${CHAVES.github}\nB=${CHAVES.githubPat}\n` })
    const r = await procurarSegredos(dir)
    expect(r.achados.filter((a) => a.tipo === 'github').length).toBe(2)
  })

  it('acha o token do Slack', async () => {
    const dir = await comArquivos({ 'bot.py': `TOKEN = "${CHAVES.slack}"` })
    const r = await procurarSegredos(dir)
    expect(r.achados.some((a) => a.tipo === 'slack')).toBe(true)
  })

  it('acha a chave de produção do Stripe', async () => {
    const dir = await comArquivos({ 'pay.js': `stripe("${CHAVES.stripe}")` })
    const r = await procurarSegredos(dir)
    expect(r.achados.some((a) => a.tipo === 'stripe')).toBe(true)
  })

  it('acha chave privada', async () => {
    const dir = await comArquivos({
      'id_rsa': '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\n',
    })
    const r = await procurarSegredos(dir)
    const achado = r.achados.find((a) => a.tipo === 'chave-privada')
    expect(achado?.confianca).toBe('alta')
  })

  it('acha senha genérica com confiança média', async () => {
    const dir = await comArquivos({ 'docker-compose.yml': 'POSTGRES_PASSWORD=Tr0vaoAzul92x\n' })
    const r = await procurarSegredos(dir)
    const achado = r.achados.find((a) => a.tipo === 'generico')
    expect(achado).toBeTruthy()
    expect(achado?.confianca).toBe('media')
  })

  it('acha URL com usuário e senha embutidos', async () => {
    const dir = await comArquivos({ '.env': 'DATABASE_URL=postgres://admin:Tr0vaoAzul92x@db.exemplo.com:5432/app\n' })
    const r = await procurarSegredos(dir)
    expect(r.achados.some((a) => a.tipo === 'url-com-senha')).toBe(true)
  })
})

describe('procurarSegredos — falso positivo é o inimigo', () => {
  it('não acusa .env.example cheio de placeholder', async () => {
    const dir = await comArquivos({
      '.env.example': [
        '# copie para .env e preencha',
        'OPENAI_API_KEY=your-key-here',
        'DATABASE_URL=postgres://user:senha@localhost:5432/db',
        '# SECRET=<coloque-aqui>',
        'SENHA=changeme',
      ].join('\n'),
    })
    const r = await procurarSegredos(dir)
    expect(r.achados).toEqual([])
  })

  it('não acusa SENHA=xxx nem token com <seu-token-aqui>', async () => {
    const dir = await comArquivos({
      'config.yml': 'SENHA=xxxxxxxx\ntoken: <seu-token-aqui>\napi_key: ${API_KEY}\npassword: placeholder\nsecret: ...\n',
    })
    const r = await procurarSegredos(dir)
    expect(r.achados).toEqual([])
  })

  it('não acusa exemplo em documentação markdown', async () => {
    const dir = await comArquivos({
      'README.md': '```bash\nexport API_KEY=sua-chave-aqui\nPASSWORD=changeme\n```\n',
    })
    const r = await procurarSegredos(dir)
    expect(r.achados).toEqual([])
  })

  it('não acusa valor que aponta para variável de ambiente', async () => {
    const dir = await comArquivos({
      'app.ts': 'const token = process.env.GITHUB_TOKEN\nconst senha = "${SENHA}"\n',
    })
    const r = await procurarSegredos(dir)
    expect(r.achados).toEqual([])
  })

  it('em arquivo de molde ainda avisa se houver uma chave REAL', async () => {
    const dir = await comArquivos({ '.env.example': `AWS_ACCESS_KEY_ID=${CHAVES.aws}\n` })
    const r = await procurarSegredos(dir)
    expect(r.achados.some((a) => a.tipo === 'aws')).toBe(true)
  })
})

describe('procurarSegredos — o que NÃO é varrido', () => {
  it('não varre arquivo que já está no histórico', async () => {
    const dir = await comArquivos({ 'antigo.env': `KEY=${CHAVES.aws}\n` })
    await g(dir, ['add', '-A'])
    await g(dir, ['commit', '-m', 'inicial'])
    const r = await procurarSegredos(dir)
    expect(r.achados).toEqual([])
    expect(r.varridos).toBe(0)
  })

  it('volta a varrer quando o arquivo commitado é modificado', async () => {
    const dir = await comArquivos({ 'antigo.env': 'KEY=nada\n' })
    await g(dir, ['add', '-A'])
    await g(dir, ['commit', '-m', 'inicial'])
    await escrever(dir, 'antigo.env', `KEY=${CHAVES.aws}\n`)
    const r = await procurarSegredos(dir)
    expect(r.achados.some((a) => a.tipo === 'aws')).toBe(true)
  })

  it('pula binários, arquivos grandes, node_modules e lockfiles', async () => {
    const dir = await repo()
    await escrever(dir, 'logo.png', Buffer.from(`x${CHAVES.aws}`))
    await escrever(dir, 'grande.txt', `${'a'.repeat(600 * 1024)}\nAWS=${CHAVES.aws}\n`)
    await escrever(dir, 'node_modules/pkg/index.js', `k="${CHAVES.aws}"`)
    await escrever(dir, 'package-lock.json', `{"k":"${CHAVES.aws}"}`)
    await escrever(dir, 'dist/bundle.js', `k="${CHAVES.aws}"`)
    const r = await procurarSegredos(dir)
    expect(r.achados).toEqual([])
    expect(r.varridos).toBe(0)
    expect(r.ignorados).toBeGreaterThan(0)
  })

  it('respeita o teto de arquivos e marca truncado', async () => {
    const dir = await repo()
    for (let i = 0; i < 320; i += 1) {
      await escrever(dir, `f${i}.txt`, 'nada demais aqui\n')
    }
    const r = await procurarSegredos(dir)
    expect(r.varridos).toBeLessThanOrEqual(300)
    expect(r.truncado).toBe(true)
  })

  it('não lança em diretório que não é repositório', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtf-nao-repo-'))
    criados.push(dir)
    await expect(procurarSegredos(dir)).resolves.toEqual({
      achados: [],
      varridos: 0,
      ignorados: 0,
      truncado: false,
    })
  })
})

/**
 * Falsos positivos que o WTF fabricava sozinho.
 *
 * Num projeto real, 6 dos 9 achados não eram problema nenhum: 4 eram cópias que
 * o PRÓPRIO instalador do WTF tinha deixado no disco, e 2 eram a linha de
 * exemplo do cabeçalho de um script — apontada logo depois de a IA ter tirado
 * dali a chave de verdade. Um painel que fabrica os próprios alertas é um
 * painel em que não se pode confiar.
 */
describe('o que o WTF não pode acusar', () => {
  it('não abre os backups que o próprio instalador deixou', () => {
    // O original continua sendo varrido: nada foi escondido, só a duplicata.
    expect(deveIgnorarCaminho('.claude/settings.local.json')).toBe(false)
    expect(
      deveIgnorarCaminho('.claude/settings.local.json.wtf-backup-2026-08-12T15-40-42-702Z'),
    ).toBe(true)
  })

  it('e o conteúdo do original continua sendo acusado', () => {
    // A forma real: um comando com a senha embutida, dentro do settings.
    const linha = '"Bash(PGPASSWORD=S3nh4Sup3rSecret4Longa psql -h db)"'
    expect(procurarNoTexto('.claude/settings.local.json', linha).length).toBeGreaterThan(0)
  })

  it('não acusa placeholder com "xxx" — a linha de exemplo de um script', () => {
    const linha = ' *   SUPABASE_SECRET=sb_secret_xxx node scripts/importar.mjs'
    expect(procurarNoTexto('scripts/importar.mjs', linha)).toHaveLength(0)
  })

  it('não acusa placeholder que começa com "sua_" / "your_"', () => {
    expect(
      procurarNoTexto('scripts/x.mjs', 'console.error("defina SUPABASE_SECRET=sua_service_key")'),
    ).toHaveLength(0)
    expect(procurarNoTexto('scripts/x.mjs', 'const apiKey = "your_api_key_here"')).toHaveLength(0)
  })

  it('mas continua acusando o valor de verdade no mesmo formato', () => {
    const real = 'const SUPABASE_SECRET = "sb_secret_LqxAZduTqckijskxzS2lNQ_7w5vz"'
    expect(procurarNoTexto('scripts/importar.mjs', real).length).toBeGreaterThan(0)
  })

  it('um "x" solto no meio de uma chave real não a transforma em exemplo', () => {
    const real = 'PGPASSWORD=Axx9Kd82LmQ7ZrT4Wbn1'
    expect(procurarNoTexto('.env.local', real).length).toBeGreaterThan(0)
  })
})

describe('procurarSegredos — o trecho nunca é o segredo', () => {
  it('mascara o valor: no máximo 4 do começo e 2 do fim', async () => {
    const dir = await comArquivos({ '.env': `ANTHROPIC_API_KEY=${CHAVES.anthropic}\n` })
    const r = await procurarSegredos(dir)
    const achado = r.achados.find((a) => a.tipo === 'anthropic')
    expect(achado).toBeTruthy()
    expect(achado!.trecho).toContain('•')
    expect(achado!.trecho.startsWith(CHAVES.anthropic.slice(0, 4))).toBe(true)
    expect(achado!.trecho.endsWith(CHAVES.anthropic.slice(-2))).toBe(true)
    expect(achado!.trecho).not.toContain(CHAVES.anthropic)
  })

  it('a chave completa não aparece em NENHUM lugar da saída', async () => {
    const dir = await comArquivos({
      '.env': [
        `OPENAI_API_KEY=${CHAVES.openai}`,
        `AWS_ACCESS_KEY_ID=${CHAVES.aws}`,
        `GITHUB_TOKEN=${CHAVES.github}`,
        'DATABASE_URL=postgres://admin:Tr0vaoAzul92x@db.exemplo.com/app',
        'POSTGRES_PASSWORD=Tr0vaoAzul92x',
      ].join('\n'),
    })
    const r = await procurarSegredos(dir)
    expect(r.achados.length).toBeGreaterThan(3)
    const serializado = JSON.stringify(r)
    for (const chave of [CHAVES.openai, CHAVES.aws, CHAVES.github, 'Tr0vaoAzul92x']) {
      expect(serializado).not.toContain(chave)
    }
  })
})
