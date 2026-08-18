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

import { verificarAtualizacao, versaoAtual } from '../electron/atualizacao.js'
import { levantar, remover } from '../electron/desinstalacao.js'
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
    wtf --versao        diz qual versão do WTF está instalada
    wtf --atualizar     traz a versão nova do WTF e recompila
    wtf --del           tira o WTF de todos os projetos onde ele está
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

function rodarNaRaiz(cmd, argumentos, opcoes = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argumentos, { cwd: raizApp, stdio: 'inherit', ...opcoes })
    p.on('error', reject)
    p.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`saiu com ${codigo}`))))
  })
}

/** `npm` no Windows é `npm.cmd`; sem a extensão o spawn não acha. */
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

if (args[0] === '--versao' || args[0] === '-v' || args[0] === '--version') {
  const { versao, commit, data } = await versaoAtual()
  const quando = data ? new Date(data).toLocaleDateString() : null
  console.log(`
  WTF ${versao ?? '(versão desconhecida)'}${commit ? `  ·  ${commit}` : ''}${quando ? `  ·  ${quando}` : ''}
  ${raizApp}
`)
  process.exit(0)
}

if (args[0] === '--atualizar' || args[0] === '--update') {
  const r = await verificarAtualizacao()

  if (r.estado === 'sem-git') {
    console.error(`
  Este WTF não veio de um clone do Git, então não há como atualizá-lo por aqui.
  Baixe a versão nova no lugar de onde você o instalou.
`)
    process.exit(1)
  }

  /*
   * Trabalho não salvo na pasta do WTF trava a atualização.
   *
   * `git pull` por cima de alteração local ou falha no meio, deixando o app
   * pela metade, ou apaga o que a pessoa escreveu. Quem mexeu no código do
   * aplicativo decide o que fazer com aquilo — não nós.
   */
  if (r.estado === 'travado') {
    console.error(`
  Há mudanças não salvas na pasta do WTF:
  ${raizApp}

  Não vou atualizar por cima delas. Salve, descarte ou guarde o que está aí
  (\`git status\` mostra o quê) e rode de novo.
`)
    process.exit(1)
  }

  if (r.estado === 'desconhecido') {
    console.error(`
  Não consegui falar com o repositório do WTF (${r.motivo}).
  Confira a conexão e tente de novo.
`)
    process.exit(1)
  }

  if (r.estado === 'em-dia') {
    const { versao, commit } = await versaoAtual()
    console.log(`\n  O WTF já está na versão mais nova (${versao ?? '?'} · ${commit}).\n`)
    process.exit(0)
  }

  console.log(`\n  Trazendo ${r.atras} ${r.atras === 1 ? 'mudança' : 'mudanças'}…\n`)
  try {
    // `--ff-only`: sem merge automático. Se a história divergiu, é caso para
    // uma pessoa olhar, não para o comando resolver sozinho.
    await rodarNaRaiz('git', ['pull', '--ff-only'])
    await rodarNaRaiz(NPM, ['install'])
    // A interface é compilada uma vez e reaproveitada — sem isto, o código
    // novo estaria no disco e a tela continuaria sendo a antiga.
    await rodarNaRaiz(NPM, ['run', 'build'])
  } catch (erro) {
    console.error(`\n  A atualização parou: ${erro.message}\n`)
    process.exit(1)
  }

  const depois = await versaoAtual()
  console.log(`\n  Pronto. WTF ${depois.versao ?? ''} · ${depois.commit}. Abra com: wtf\n`)
  process.exit(0)
}


/**
 * `wtf --del` — tirar o WTF de tudo.
 *
 * Um comando que apaga arquivo em pasta que não é a dele precisa mostrar a
 * lista ANTES e esperar a pessoa digitar. Enter não serve: Enter é o que se
 * aperta sem ler.
 */
if (args[0] === '--del' || args[0] === '--desinstalar') {
  const plano = await levantar()

  if (plano.nada && !plano.registro) {
    console.log('\n  O WTF não está instalado em lugar nenhum. Nada a fazer.\n')
    process.exit(0)
  }

  console.log('\n  O WTF vai ser removido de:\n')

  for (const p of plano.projetos) {
    console.log(`  ${p.nome}`)
    console.log(`      ${p.caminho}`)
    for (const item of p.itens) console.log(`      − ${item}`)
    if (p.historico.length) {
      console.log(`      • .wtf/ FICA, com ${p.historico.join(', ')}`)
    }
    console.log('')
  }

  if (plano.global) {
    console.log('  Instalação para todos os projetos')
    console.log(`      ${plano.global.caminho}`)
    console.log('      − as habilidades e o hook do WTF\n')
  }

  if (plano.registro) {
    console.log('  Lista de projetos conhecidos')
    console.log(`      ${plano.registro}\n`)
  }

  console.log('  O histórico de cada projeto NÃO é apagado: o que a IA declarou,')
  console.log('  as traduções já pagas e o que você aprovou continuam em `.wtf/`.')
  console.log('  A pasta do próprio WTF também fica — quem apaga ela é você.\n')

  if (!args.includes('--sim')) {
    const { createInterface } = await import('node:readline/promises')
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const resposta = (await rl.question('  Digite "sim" para remover: ')).trim().toLowerCase()
    rl.close()
    if (resposta !== 'sim') {
      console.log('\n  Nada foi removido.\n')
      process.exit(0)
    }
  }

  const r = await remover(plano)
  console.log('')
  for (const f of r.feitos) console.log(`  removido de ${f.nome}`)
  for (const f of r.falhas) console.error(`  NÃO deu para remover de ${f.caminho}: ${f.erro}`)
  console.log(
    r.falhas.length
      ? `\n  ${r.feitos.length} concluídos, ${r.falhas.length} com erro.\n`
      : '\n  Pronto. O WTF saiu de tudo.\n',
  )
  process.exit(r.falhas.length ? 1 : 0)
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
  await rodarNaRaiz(NPM, ['run', 'build'])
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
