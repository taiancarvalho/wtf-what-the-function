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

const raizApp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)

if (args[0] === '--help' || args[0] === '-h') {
  console.log(`
  wtf — entenda o que a IA está construindo no seu software

  uso:
    wtf                 abre o painel na pasta atual
    wtf <caminho>       abre o painel na pasta indicada
    wtf --help          mostra esta ajuda

  a pasta precisa ser um repositório Git.
`)
  process.exit(0)
}

const projeto = path.resolve(process.cwd(), args[0] ?? '.')

async function existe(p) {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

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
  await rodar('npm', ['run', 'build'])
}

const electron = path.join(raizApp, 'node_modules', '.bin', 'electron')
if (!(await existe(electron))) {
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
