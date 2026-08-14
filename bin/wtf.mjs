#!/usr/bin/env node
/**
 * `wtf` — abre o painel na pasta onde você está.
 *
 *     cd ~/Projetos/minha-loja
 *     wtf
 *
 * Sem empacotamento, este é o jeito mais próximo de "abrir o app": um comando
 * único, que não exige lembrar de caminho nem de script. O ícone no Dock ainda
 * é o do Electron — isso só muda com um instalador de verdade.
 */

import { spawn } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { lerProjetos } from '../electron/projects.js'

const raizApp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)

if (args[0] === '--help' || args[0] === '-h') {
  console.log(`
  wtf — entenda o que a IA está construindo no seu software

  uso:
    wtf                 abre o painel na pasta atual
    wtf <caminho>       abre o painel na pasta indicada
    wtf <nome>          abre um projeto que você já abriu antes
    wtf --lista         mostra os projetos que o WTF conhece
    wtf --help          mostra esta ajuda

  a pasta precisa ser um repositório Git.
`)
  process.exit(0)
}

async function existe(p) {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** "há 3 minutos", "ontem", "em 12/03" — quando o projeto foi aberto. */
function quando(iso) {
  if (!iso) return 'nunca aberto por aqui'
  const q = new Date(iso)
  if (Number.isNaN(q.getTime())) return 'em data desconhecida'
  const minutos = Math.round((Date.now() - q.getTime()) / 60000)
  if (minutos < 1) return 'agora mesmo'
  if (minutos < 60) return `há ${minutos} min`
  if (minutos < 60 * 24) return `há ${Math.round(minutos / 60)} h`
  if (minutos < 60 * 24 * 7) return `há ${Math.round(minutos / 1440)} dias`
  return `em ${q.toLocaleDateString('pt-BR')}`
}

const conhecidos = await lerProjetos().catch(() => [])

if (args[0] === '--lista' || args[0] === '-l') {
  if (conhecidos.length === 0) {
    console.log(`
  O WTF ainda não conhece nenhum projeto.

  Abra um pela primeira vez e ele passa a aparecer aqui:  wtf ~/caminho/do/projeto
`)
    process.exit(0)
  }
  console.log('\n  Projetos que o WTF conhece:\n')
  for (const p of conhecidos) {
    const marca = p.fixado ? '★' : ' '
    const sumiu = p.sumiu ? '  (a pasta não está mais aí)' : ''
    console.log(`  ${marca} ${p.nome}`)
    console.log(`      ${p.caminho}`)
    console.log(`      aberto ${quando(p.ultimaAberturaEm)}${sumiu}\n`)
  }
  console.log('  para abrir:  wtf <nome>   ou   wtf <caminho>\n')
  process.exit(0)
}

/**
 * O argumento pode ser um caminho OU o nome de um projeto já conhecido.
 *
 * Caminho existente sempre vence: `wtf portal` dentro de uma pasta que TEM uma
 * subpasta chamada "portal" precisa continuar abrindo a subpasta. Só quando
 * não existe pasta nenhuma com aquele nome é que procuramos na lista — assim
 * `wtf portal` funciona de qualquer lugar do computador.
 */
async function ondeAbrir(argumento) {
  const comoCaminho = path.resolve(process.cwd(), argumento ?? '.')
  if (!argumento || (await existe(comoCaminho))) return comoCaminho

  const alvo = argumento.toLowerCase()
  const casa = (p) => p.nome.toLowerCase() === alvo
  const parecido = (p) => p.nome.toLowerCase().includes(alvo)
  const achado = conhecidos.find(casa) ?? conhecidos.find(parecido)
  if (achado) return achado.caminho

  console.error(`
  Não achei nem uma pasta nem um projeto conhecido chamado "${argumento}".

  Veja o que o WTF já conhece:  wtf --lista
`)
  process.exit(1)
}

const projeto = await ondeAbrir(args[0])

function rodar(cmd, argumentos, opcoes = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argumentos, { cwd: raizApp, stdio: 'inherit', ...opcoes })
    p.on('error', reject)
    p.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`saiu com ${codigo}`))))
  })
}

// Sem `git`, o painel não tem o que ler — e o erro do Electron seria críptico.
if (!(await existe(path.join(projeto, '.git')))) {
  console.error(`
  Essa pasta não é acompanhada pelo Git:
  ${projeto}

  O WTF lê o histórico do projeto para saber o que mudou. Rode "git init" na
  pasta, ou aponte para um projeto que já use Git:  wtf ~/caminho/do/projeto
`)
  process.exit(1)
}

// A interface é compilada uma vez e reaproveitada. Compilar a cada abertura
// custaria segundos que ninguém quer esperar para "abrir um app".
const precisaCompilar = !(await existe(path.join(raizApp, 'dist', 'index.html')))
if (precisaCompilar) {
  console.log('Preparando o WTF pela primeira vez (isso leva alguns segundos)…')
  // `npm.cmd` no Windows: `npm` sem extensão não é executável para o spawn.
  await rodar(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'])
}

/*
 * O caminho vem do pacote `electron`, não de `node_modules/.bin/electron`.
 *
 * O atalho em `.bin` é um `.cmd` no Windows, e `spawn` sem shell não executa
 * `.cmd` — o comando morria com ENOENT antes de abrir qualquer janela. O
 * pacote exporta o executável de verdade (`electron.exe`, ou o binário dentro
 * do `.app` no macOS), que roda igual nos três sistemas.
 */
let electron
try {
  electron = (await import('electron')).default
} catch {
  electron = null
}
if (!electron || !(await existe(electron))) {
  console.error('\n  Dependências faltando. Rode "npm install" na pasta do WTF.\n')
  process.exit(1)
}

// `detached` para o terminal ficar livre: a pessoa abre o painel e continua
// trabalhando na mesma janela, que é exatamente o uso lado a lado.
const app = spawn(electron, ['.'], {
  cwd: raizApp,
  env: { ...process.env, WTF_PROJECT: projeto, NODE_ENV: 'production' },
  detached: true,
  stdio: 'ignore',
})
app.unref()

console.log(`WTF aberto em ${projeto}`)
