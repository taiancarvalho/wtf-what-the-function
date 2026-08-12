import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  isGitRepo,
  readCommits,
  readProjectMeta,
  readTrackedFiles,
  readWorkingFiles,
} from './git.js'
import { commitsParaSnapshot } from './translate.js'
import { mesclarClaims, readAgentEvents } from './events.js'
import { aplicarMapa, readProjectMap } from './map.js'
import { desinstalar, estadoInstalacao, instalar } from './installer.js'
import { observarProjeto } from './watcher.js'
import { abrirTerminal } from './terminal.js'
import { lerArquivo } from './reader.js'
import { traduzirEventos } from './translator.js'
import { alternarResolvido, aplicarResolvidos, lerResolvidos } from './resolved.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_URL = 'http://localhost:5273'
const isDev = !app.isPackaged

/** @type {BrowserWindow | null} */
let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    show: false,
    // A barra de título nativa some; o título vive dentro do layout (ver TitleBar.tsx).
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 22 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15130f' : '#f6f2e9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win?.show())

  // Links externos abrem no navegador, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

/**
 * Projeto observado. Vem de `WTF_PROJECT=/caminho npm run dev`, ou da pasta
 * escolhida pelo usuário. Sem isso, o app cai no projeto de exemplo.
 */
let projetoAtual = process.env.WTF_PROJECT
  ? path.resolve(process.env.WTF_PROJECT.replace(/^~/, os.homedir()))
  : null

/**
 * Leitura pura. Nada é escrito no repositório.
 *
 *   git log            → o que o código prova
 *   .wtf/events.jsonl  → o que a IA declarou
 *
 * A mescla é onde o produto acontece: declaração nunca vence evidência.
 */
async function lerProjeto(dir) {
  if (!dir || !(await isGitRepo(dir))) return null
  const meta = await readProjectMeta(dir)
  const commits = await readCommits(dir, 60)
  let snapshot = commitsParaSnapshot(meta, commits)

  /*
   * A ORDEM IMPORTA.
   *
   * O mapa entra ANTES dos claims. Ele é o vocabulário — quais são as partes e
   * como se chamam. Os claims escrevem frases que citam esses nomes ("a IA
   * mexeu em 11 arquivos de X"), então precisam do vocabulário já pronto;
   * invertido, as frases saem com os nomes técnicos que o mapa veio substituir.
   *
   * O mapa troca os nomes. Nunca o estado, que continua vindo de evidência.
   */
  const mapa = await readProjectMap(dir)
  if (mapa) {
    // `git ls-files` diz o que existe hoje; os commits, quando mexeram; e os
    // arquivos de trabalho, o que a IA fez e ainda não foi salvo no histórico.
    snapshot = aplicarMapa(
      snapshot,
      mapa,
      commits,
      await readTrackedFiles(dir),
      await readWorkingFiles(dir),
    )
  }

  const claims = await readAgentEvents(dir)
  if (claims.length) snapshot = mesclarClaims(snapshot, claims)

  // Traduções JÁ prontas entram na hora (`maxChamadas: 0` não chama o modelo).
  // As que faltam são feitas depois, fora do caminho crítico — ver `traduzirAoFundo`.
  aplicarTraducoes(snapshot, await traduzirEventos(dir, snapshot.events, { maxChamadas: 0 }))

  // Por último: o que a PESSOA marcou como resolvido à mão. Vem depois de tudo
  // porque é a palavra final — nem o Git nem a IA desfazem essa decisão.
  aplicarResolvidos(snapshot, await lerResolvidos(dir))

  snapshot.instalacao = await estadoInstalacao(dir)
  return snapshot
}

/** Substitui o texto heurístico pelo texto traduzido, quando houver. */
function aplicarTraducoes(snapshot, traducoes) {
  if (!traducoes || traducoes.size === 0) return snapshot
  for (const evento of snapshot.events) {
    const t = traducoes.get(evento.id)
    if (t) evento.human = { ...evento.human, ...t }
  }
  return snapshot
}

/**
 * Tradução fora do caminho crítico.
 *
 * Uma chamada ao modelo leva dezenas de segundos; travar o carregamento do
 * painel por isso seria inaceitável. Então o painel abre com o texto que já
 * existe, a tradução acontece atrás, e o renderer é avisado quando terminar.
 */
let traduzindo = false

async function traduzirAoFundo(dir, eventos) {
  if (traduzindo || !dir) return
  traduzindo = true
  try {
    const feitas = await traduzirEventos(dir, eventos, { maxChamadas: 4 })
    if (feitas.size > 0 && win && !win.isDestroyed()) {
      win.webContents.send('wtf:mudou', 'traducao')
    }
  } catch {
    // Tradução é enfeite: se falhar, o painel segue com o texto heurístico.
  } finally {
    traduzindo = false
  }
}

/** Watcher ativo. Trocar de projeto derruba o anterior — sem vazamento. */
let pararObservacao = null

function observar(dir) {
  pararObservacao?.()
  pararObservacao = observarProjeto(dir, (motivo) => {
    // O renderer decide quando recarregar; aqui só avisamos que mudou.
    if (!win || win.isDestroyed()) return
    win.webContents.send('wtf:mudou', motivo)
  })
}

/** Lê um arquivo do projeto para o visualizador lateral. Só dentro da raiz. */
ipcMain.handle('wtf:ler-arquivo', async (_e, relativo) => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  return lerArquivo(projetoAtual, relativo)
})

ipcMain.handle('wtf:abrir-terminal', async (_e, promptInicial) =>
  abrirTerminal(projetoAtual, typeof promptInicial === 'string' ? promptInicial : undefined),
)

/** Dispara o onboarding: abre o agente já pedindo o mapeamento do projeto. */
ipcMain.handle('wtf:mapear', async () =>
  abrirTerminal(
    projetoAtual,
    'Use a skill wtf-mapear para mapear este projeto para o WTF. ' +
      'Leia .wtf/MAP-FORMAT.md e o plano do projeto, e escreva .wtf/map.json. ' +
      'Lembre: você descreve as partes e como se chamam — você não decide o que está pronto.',
  ),
)

ipcMain.handle('wtf:snapshot', async () => {
  if (!projetoAtual) return null
  try {
    const s = await lerProjeto(projetoAtual)
    observar(projetoAtual)
    traduzirAoFundo(projetoAtual, s?.events ?? [])
    return s
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

/**
 * Marca (ou desmarca) um aviso como resolvido pela pessoa. Escreve só em
 * `.wtf/resolved.json` — nada do código do projeto é tocado.
 */
ipcMain.handle('wtf:resolver', async (_e, eventId) => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  if (typeof eventId !== 'string' || !eventId) return { erro: 'Evento inválido.' }
  try {
    const { resolvido } = await alternarResolvido(projetoAtual, eventId)
    return { resolvido, snapshot: await lerProjeto(projetoAtual) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

ipcMain.handle('wtf:escolher-projeto', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Escolha a pasta do projeto que a IA está construindo',
    properties: ['openDirectory'],
  })
  if (r.canceled || !r.filePaths[0]) return null
  const dir = r.filePaths[0]
  if (!(await isGitRepo(dir))) {
    return { erro: 'Essa pasta não é um repositório Git. O WTF ainda precisa de Git para acompanhar as mudanças.' }
  }
  projetoAtual = dir
  try {
    const s = await lerProjeto(dir)
    observar(dir)
    traduzirAoFundo(dir, s?.events ?? [])
    return s
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

/**
 * Instala a skill e o hook no projeto observado. É a única escrita que o WTF
 * faz — e só acontece por clique explícito, com confirmação.
 */
ipcMain.handle('wtf:instalar', async () => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  const r = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Instalar', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    message: 'Instalar o WTF neste projeto?',
    detail:
      `Serão criados 3 arquivos em ${path.basename(projetoAtual)} e os hooks serão ` +
      'registrados em .claude/settings.local.json.\n\n' +
      'Nada existente é apagado — o que já estiver lá é preservado e recebe backup. ' +
      'Dá para desfazer a qualquer momento.',
  })
  if (r.response !== 0) return { cancelado: true }
  try {
    const feito = await instalar(projetoAtual)
    return { ...feito, snapshot: await lerProjeto(projetoAtual) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

ipcMain.handle('wtf:desinstalar', async () => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  try {
    const feito = await desinstalar(projetoAtual)
    return { ...feito, snapshot: await lerProjeto(projetoAtual) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  pararObservacao?.()
  pararObservacao = null
  if (process.platform !== 'darwin') app.quit()
})
