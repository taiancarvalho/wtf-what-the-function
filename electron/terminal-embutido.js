/**
 * Terminal EMBUTIDO — o shell dentro do app, como no VS Code.
 *
 * `terminal.js` continua existindo e continua sendo uma escolha legítima: quem
 * prefere a janela nativa do sistema clica no botão de lá. Este arquivo é o
 * outro caminho — a pessoa fica no painel, vê o que a IA está fazendo e o
 * painel traduzindo, sem trocar de janela.
 *
 * ONDE O PROCESSO RODA. O preload é sandboxed (`contextIsolation: true`,
 * `sandbox: true`), então o renderer NÃO consegue — e não deve — abrir um PTY.
 * O pseudo-terminal nasce e morre aqui, no processo principal; o renderer só
 * recebe bytes por IPC e devolve as teclas. É a mesma fronteira do resto do
 * app: o renderer nunca toca em filesystem, git ou processo.
 */

import { statSync } from 'node:fs'
import path from 'node:path'
import { detectarAgente } from './terminal.js'

/**
 * Teto de sessões simultâneas.
 *
 * Cada sessão é um processo de verdade, com um agente de IA dentro dele
 * consumindo CPU, memória e — o que mais importa — cota paga. Três é o
 * suficiente para trabalhar em frentes paralelas e pouco o bastante para que
 * ninguém acorde com dez agentes rodando por ter clicado dez vezes. A quarta
 * não é enfileirada em silêncio: é recusada com um texto que diz o porquê.
 */
const MAX_SESSOES = 3

/** @type {Map<string, { pty: import('@lydell/node-pty').IPty, dir: string }>} */
const sessoes = new Map()

let proximoId = 1

/** O módulo nativo, carregado uma vez só e nunca de forma fatal. */
let ptyModulo
let ptyIndisponivel = false

async function carregarPty() {
  if (ptyModulo) return ptyModulo
  if (ptyIndisponivel) return null
  try {
    ptyModulo = await import('@lydell/node-pty')
    return ptyModulo
  } catch {
    // Módulo nativo pode não casar com a versão do Electron numa máquina
    // qualquer. Isso NÃO derruba o app: o terminal do sistema segue inteiro.
    ptyIndisponivel = true
    return null
  }
}

/** O shell da pessoa. Não impomos o nosso: o `.zshrc` dela é o ambiente dela. */
function shellDoUsuario() {
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe'
  return process.env.SHELL || '/bin/zsh'
}

function envDoPty() {
  // O app não herda o PATH do shell de login (ver terminal.js). Como o PTY
  // roda o shell interativo, ele mesmo carrega o perfil e conserta o PATH —
  // por isso aqui só limpamos o que confundiria o agente.
  const env = { ...process.env, TERM: 'xterm-256color' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

/**
 * `dir` NUNCA vem do renderer.
 *
 * Quem chama é o main, e o main passa `projetoAtual` — a pasta que a própria
 * pessoa escolheu no seletor. Esta função é a rede de segurança para o dia em
 * que alguém for tentado a aceitar um caminho vindo da tela: um shell aberto
 * num caminho arbitrário é exatamente o buraco que a sandbox existe para
 * fechar.
 */
function dirValido(dir) {
  if (typeof dir !== 'string' || !dir) return false
  if (!path.isAbsolute(dir)) return false
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/** Escapa para uma string entre aspas simples do shell. */
const aspasShell = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

/*
 * Instrumentação, ligada por variável de ambiente:
 *
 *     WTF_DEBUG_PTY=1 npm start
 *
 * Fica no código de propósito. O primeiro problema deste terminal foi
 * diagnosticado com um andaime temporário que precisou ser escrito, usado e
 * removido — com estes três logs, o próximo é diagnosticado sem tocar no
 * código. Silenciosos por padrão: nada aparece sem a variável.
 */

/**
 * Abre uma sessão. Nunca lança: devolve `{ erro }` legível quando não dá.
 *
 * @param {object} p
 * @param {import('electron').BrowserWindow | null} p.win
 * @param {string} p.dir pasta do projeto observado (vinda do main, não da tela)
 * @param {string} [p.mensagem] pedido inicial para o agente
 * @param {number} [p.cols]
 * @param {number} [p.rows]
 */
export async function abrirSessao({ win, dir, mensagem, cols, rows }) {
  if (!win || win.isDestroyed()) return { erro: 'Nenhuma janela aberta.' }
  if (!dirValido(dir)) return { erro: 'Nenhum projeto aberto.' }
  if (sessoes.size >= MAX_SESSOES) {
    return {
      erro: `Já há ${MAX_SESSOES} terminais abertos. Feche um antes de abrir outro.`,
      limite: true,
    }
  }

  const pty = await carregarPty()
  if (!pty) {
    return { erro: 'O terminal embutido não abriu nesta máquina. Use o terminal do sistema.' }
  }

  const id = `t${proximoId++}`

  let processo
  try {
    processo = pty.spawn(shellDoUsuario(), [], {
      name: 'xterm-256color',
      cols: Math.max(20, Math.min(500, Number(cols) || 80)),
      rows: Math.max(5, Math.min(200, Number(rows) || 24)),
      cwd: dir,
      env: envDoPty(),
    })
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }

  sessoes.set(id, { pty: processo, dir })

  /*
   * A saída vai em LOTES de ~16 ms, não byte a byte.
   *
   * Isto não é micro-otimização: um agente de IA desenha a tela inteira várias
   * vezes por segundo, e cada pedaço vira uma mensagem entre processos. Sem o
   * lote, a janela recebia milhares de mensagens por segundo e congelava —
   * medido, não suposto. Um quadro a cada 16 ms é o que o olho vê de qualquer
   * jeito, e o terminal volta a responder.
   */
  let acumulado = ''
  let agendado = null
  const despejar = () => {
    agendado = null
    if (!acumulado) return
    const lote = acumulado
    acumulado = ''
    if (!win || win.isDestroyed()) return
    if (process.env.WTF_DEBUG_PTY) console.log('SAIDA', lote.length, JSON.stringify(lote.slice(0, 120)))
    win.webContents.send('wtf:terminal-saida', { id, dados: lote })
  }

  processo.onData((dados) => {
    acumulado += dados
    // Teto de segurança: se o programa despejar megabytes de uma vez, ficamos
    // com o fim (é o que está na tela) em vez de engasgar com o começo.
    if (acumulado.length > 400_000) acumulado = acumulado.slice(-400_000)
    if (!agendado) agendado = setTimeout(despejar, 16)
  })

  processo.onExit(({ exitCode }) => {
    sessoes.delete(id)
    if (agendado) clearTimeout(agendado)
    despejar()
    if (!win || win.isDestroyed()) return
    win.webContents.send('wtf:terminal-fim', { id, codigo: exitCode })
  })

  // Toda sessão morre com a janela. Um agente de IA sobrevivendo ao app que o
  // abriu — escrevendo em arquivos sem ninguém olhando — seria a pior herança
  // possível deste recurso. `once` porque a janela é a mesma sempre.
  win.once('closed', () => encerrarTodas())

  let agente = null
  if (typeof mensagem === 'string' && mensagem.trim()) {
    // Mesmo contrato do terminal do sistema: com agente instalado, ele já
    // começa com o pedido escrito; sem agente, fica só o shell na pasta certa,
    // que ainda é útil.
    agente = await detectarAgente()
    if (agente) {
      processo.write(`clear && ${aspasShell(agente.caminho)} ${aspasShell(mensagem)}\r`)
    }
  }

  return { id, agente: agente?.rotulo ?? null, shell: shellDoUsuario() }
}

/** Teclas digitadas na tela viram bytes no PTY. Sem interpretação nossa. */
export function escrever(id, dados) {
  const s = sessoes.get(id)
  if (!s || typeof dados !== 'string') return { ok: false }
  if (process.env.WTF_DEBUG_PTY) console.log('ENTRADA', JSON.stringify(dados))
  s.pty.write(dados)
  return { ok: true }
}

/**
 * Entrega um texto INTEIRO à sessão, como uma colagem.
 *
 * Digitar não serve para texto de várias linhas: cada quebra de linha é um
 * Enter, e o programa lá dentro recebe uma submissão por linha. Com uma
 * mensagem de quinze linhas isso vira uma dúzia de perguntas pela metade, cada
 * uma redesenhando a tela — foi assim que o "pedir para resolver" travou o
 * aplicativo inteiro: não pela conta de escrever, mas pela avalanche de saída
 * que as submissões parciais produziram.
 *
 * `ESC[200~ … ESC[201~` é o modo de colagem entre colchetes, que todo terminal
 * moderno entende: o que vem no meio é texto, não teclas. As quebras viram
 * `\r` porque é isso que um terminal fala; dentro do bloco elas são apenas
 * quebras, e não envios. O `\r` final, esse sim, é o Enter — um só, depois do
 * texto completo estar na linha.
 */
export function sequenciaDeColagem(texto) {
  const corpo = String(texto).replace(/\r?\n/g, '\r')
  return `\x1b[200~${corpo}\x1b[201~\r`
}

export function colar(id, texto) {
  const s = sessoes.get(id)
  if (!s || typeof texto !== 'string') return { ok: false }
  const bytes = sequenciaDeColagem(texto)
  if (process.env.WTF_DEBUG_PTY) console.log('COLAGEM', bytes.length)
  s.pty.write(bytes)
  return { ok: true }
}

/** O painel mudou de tamanho: o programa lá dentro precisa saber. */
export function redimensionar(id, cols, rows) {
  const s = sessoes.get(id)
  if (!s) return { ok: false }
  if (process.env.WTF_DEBUG_PTY) console.log('REDIM', cols, rows)
  try {
    s.pty.resize(Math.max(20, Math.min(500, Number(cols) || 80)), Math.max(5, Math.min(200, Number(rows) || 24)))
  } catch {
    return { ok: false }
  }
  return { ok: true }
}

/** Fecha uma sessão pelo botão de fechar do painel. */
export function encerrar(id) {
  const s = sessoes.get(id)
  if (!s) return { ok: false }
  sessoes.delete(id)
  try {
    s.pty.kill()
  } catch {
    /* já tinha morrido */
  }
  return { ok: true }
}

/** Fecha tudo — janela fechando ou app saindo. Nenhum processo órfão. */
export function encerrarTodas() {
  for (const id of [...sessoes.keys()]) encerrar(id)
}
