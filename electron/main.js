import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { readFile } from 'node:fs/promises'
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
import {
  desdeAUltimaVisita,
  historicoRapido,
  reconstruirHistorico,
  registrarVisita,
} from './history.js'
import { lerMapaPastas } from './folders.js'
import { juntarDocs, lerMapaDocs, varrerDocumentos } from './docs.js'
import { aplicarIdiomaNaSkill, desinstalar, estadoInstalacao, instalar } from './installer.js'
import { lerConfig, salvarConfig } from './config.js'
import { lerPacoteInstalacao } from './disclosure.js'
import {
  casaClaude,
  desabilitarProjeto,
  desinstalarGlobal,
  estadoGlobal,
  habilitarProjeto,
  instalarGlobal,
} from './globalinstall.js'
import { apagarChave, chaveEmClaro, lerChaves, ondeMoram, salvarChave } from './keys.js'
import { MODELO_PADRAO, perguntar } from './ask.js'
import { apagarGerado, listarGerados } from './gerados.js'
import {
  alternarDispensado,
  lerDispensados,
  lerPropostas,
  registrarDecisao,
  removerProposta,
  separarDispensados,
} from './dispensados.js'
import { observarProjeto } from './watcher.js'
import { abrirTerminal } from './terminal.js'
import {
  abrirSessao as abrirSessaoEmbutida,
  escrever as escreverNoTerminal,
  entregar as entregarNoTerminal,
  redimensionar as redimensionarTerminal,
  encerrar as encerrarTerminal,
  encerrarTodas as encerrarTerminais,
} from './terminal-embutido.js'
import { lerArquivo } from './reader.js'
import { procurarSegredos } from './secrets.js'
import { procurarExpostos } from './exposed.js'
import {
  contarPendentes,
  traducaoAutorizada,
  traduzirDisponivel,
  traduzirEventos,
} from './translator.js'
import { lerUso } from './usage.js'
import { alternarResolvido, aplicarResolvidos, lerResolvidos } from './resolved.js'
import {
  decidirNotificacoes,
  lerNotificados,
  marcarNotificados,
  notificar,
  notificarTeste,
} from './notify.js'
import {
  esquecerProjeto,
  fixarProjeto,
  lerProjetos,
  registrarProjeto,
  resumirTodos,
} from './projects.js'
import {
  alternarValidado,
  aplicarValidados,
  assinaturaDe,
  lerValidados,
} from './validated.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_URL = 'http://localhost:5273'
/*
 * Como decidir entre o servidor de desenvolvimento e a interface compilada.
 *
 * `app.isPackaged` sozinho não serve: aberto pelo comando `wtf`, o app NÃO
 * está empacotado e mesmo assim precisa carregar o `dist/`. Confiando só nele,
 * a janela tentava falar com um servidor que ninguém subiu — e o resultado era
 * uma tela branca, sem erro visível. Por isso o comando marca `NODE_ENV` e o
 * modo de desenvolvimento passa a ser a exceção declarada, não o padrão.
 */
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production'

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

  const compilado = path.join(__dirname, '..', 'dist', 'index.html')

  // Tela branca é o pior erro possível: não diz nada a ninguém. Se o
  // carregamento falhar, avisamos na própria janela em vez de deixar no vazio.
  win.webContents.on('did-fail-load', (_e, codigo, descricao, url) => {
    if (!win || win.isDestroyed()) return
    const detalhe = `${descricao || 'falha ao carregar'} (${codigo})\n${url}`
    win.webContents.executeJavaScript(
      `document.body.innerHTML = ${JSON.stringify(
        `<div style="font:15px/1.6 system-ui;padding:40px;max-width:60ch">
           <h1 style="font-size:19px;margin:0 0 8px">O WTF não conseguiu abrir a tela.</h1>
           <p style="color:#666">Tente fechar e abrir de novo. Se continuar, rode
           <code>npm run build</code> na pasta do WTF.</p>
           <pre style="color:#999;font-size:12px;white-space:pre-wrap">${detalhe}</pre>
         </div>`,
      )}`,
    ).catch(() => {})
  })

  if (isDev) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(compilado)
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
  // `registrarUso: false`: esta leitura acontece a cada pintura do painel;
  // contar cache aqui inflaria o número e mentiria sobre a economia real.
  aplicarTraducoes(
    snapshot,
    await traduzirEventos(dir, snapshot.events, { maxChamadas: 0, registrarUso: false }),
  )

  // Por último: o que a PESSOA marcou como resolvido à mão. Vem depois de tudo
  // porque é a palavra final — nem o Git nem a IA desfazem essa decisão.
  aplicarResolvidos(snapshot, await lerResolvidos(dir))
  aplicarValidados(snapshot, await lerValidados(dir))

  // O mapa de pastas é leitura à parte: ele fala do REPOSITÓRIO (onde as
  // coisas moram), não das partes do produto. Ausente é o caso normal.
  const pastas = await lerMapaPastas(dir)
  if (pastas) snapshot.pastas = pastas

  /*
   * Os documentos: FATO primeiro, opinião depois.
   *
   * A varredura é determinística (Git + nome de arquivo + data de commit) e
   * existe mesmo que nenhuma IA tenha passado por aqui. O `.wtf/docs.json` é o
   * julgamento da skill `wtf-documentos` — qual é o vigente, e por quê. Os dois
   * viajam juntos, e separados, para o painel nunca vender palpite como número.
   */
  snapshot.documentos = juntarDocs(await varrerDocumentos(dir), await lerMapaDocs(dir))

  snapshot.instalacao = await estadoInstalacao(dir)
  // As preferências viajam junto com o snapshot: o painel precisa saber em que
  // idioma se desenhar já na primeira pintura, sem uma segunda ida ao main.
  snapshot.config = await lerConfig(dir)
  // O consumo viaja junto: a pessoa precisa poder ver, a qualquer momento,
  // quanto do recurso dela o app usou — e quanto ele economizou com o cache.
  snapshot.uso = await lerUso(dir)

  /*
   * O caça-segredos. Barato: só lê o que ainda NÃO está no histórico —
   * tipicamente meia dúzia de arquivos não salvos. E é o único momento em que
   * o aviso serve para alguma coisa: depois do commit, a chave já vazou.
   */
  snapshot.segredos = await procurarSegredos(dir)

  /*
   * O caça-expostos — a outra metade da pergunta.
   *
   * Aqui não olhamos "o que ainda não foi salvo": olhamos o código que chega ao
   * navegador, commitado ou não, procurando dado de PESSOA (e-mail, CPF, CNPJ,
   * cartão, telefone, endereço, par login+senha). Nesse caso não existe janela
   * de prevenção: se está no front, qualquer visitante que abrir o inspecionar
   * do Chrome já está vendo.
   */
  snapshot.expostos = await procurarExpostos(dir)

  /*
   * O que a pessoa já disse que é falso alarme sai da lista — mas não some.
   *
   * A varredura procura formatos, não certezas: um e-mail de remetente do
   * sistema tem exatamente a cara do que ela caça. Sem esta saída, o mesmo
   * aviso voltaria a cada leitura para sempre, e o que se aprende com um
   * alerta que nunca some é a ignorar alertas.
   */
  const dispensados = await lerDispensados(dir)
  const propostas = await lerPropostas(dir)
  snapshot.segredos = separarDispensados(snapshot.segredos, dispensados, propostas)
  snapshot.expostos = separarDispensados(snapshot.expostos, dispensados, propostas)

  /*
   * O passado do projeto — SEMPRE do cache, nunca calculado aqui.
   *
   * Reconstruir 14 marcos são dezenas de idas ao git, e esta função roda a cada
   * pintura do painel. Então aqui só se LÊ `.wtf/history.json`; se estiver frio
   * ou for de outro dia, o recálculo acontece atrás e a tela é avisada por
   * `wtf:mudou` — o mesmo desenho da tradução.
   */
  snapshot.historico = await historicoRapido(dir)
  if (snapshot.historico.frio || snapshot.historico.desatualizado) {
    void reconstruirAoFundo(dir)
  }

  // Precisa do snapshot pronto: os avisos do intervalo saem dos eventos dele.
  snapshot.desdeUltimaVisita = await desdeAUltimaVisita(dir, { snapshot })

  // Fora do caminho crítico: comparar com a leitura anterior e, se algo passou
  // a depender de uma decisão da pessoa, avisar pelo sistema operacional.
  void avaliarAvisos(dir, snapshot)
  return snapshot
}

/**
 * O recálculo do histórico, fora do caminho crítico.
 *
 * Uma trava por vez: o watcher pode disparar várias leituras seguidas enquanto
 * a IA salva arquivos, e cada uma acharia o cache "desatualizado" — sem isto,
 * dez reconstruções concorreriam pelo mesmo arquivo.
 */
let reconstruindo = false

async function reconstruirAoFundo(dir) {
  if (reconstruindo || !dir) return
  reconstruindo = true
  try {
    const antes = await historicoRapido(dir)
    const depois = await reconstruirHistorico(dir)
    // Só acorda a tela se o resultado mudou de fato.
    const mudou = JSON.stringify(antes.marcos) !== JSON.stringify(depois.marcos)
    if (mudou && win && !win.isDestroyed()) win.webContents.send('wtf:mudou', 'historico')
  } catch {
    // O histórico é leitura extra: falhar aqui nunca derruba o painel.
  } finally {
    reconstruindo = false
  }
}

/**
 * O painel fechado é o caso normal: quem não programa não deixa o WTF aberto o
 * dia inteiro. Sem isto, a pessoa só descobre que algo depende dela quando
 * resolve abrir o app — que pode ser dias depois.
 *
 * A decisão de O QUE notificar é pura e mora em `notify.js` (leia a regra no
 * topo daquele arquivo antes de acrescentar qualquer gatilho aqui). O que
 * acontece neste ponto é só a fiação: o snapshot anterior, o disco e a janela.
 */
let ultimoSnapshot = null
let avaliandoAvisos = false

async function avaliarAvisos(dir, snapshot) {
  if (avaliandoAvisos) return
  avaliandoAvisos = true
  try {
    const antes = ultimoSnapshot
    ultimoSnapshot = snapshot
    const config = snapshot?.config ?? (await lerConfig(dir))
    if (config?.notificar !== 'sim') return

    const jaNotificados = await lerNotificados(dir)
    const avisos = decidirNotificacoes(antes, snapshot, jaNotificados, new Date(), config)
    for (const aviso of avisos) {
      const r = await notificar(aviso, win)
      // Só marca o que de fato saiu: um aviso engolido (janela em foco, sistema
      // sem suporte) precisa continuar podendo aparecer depois.
      if (r?.enviada) await marcarNotificados(dir, aviso.chaves)
    }
  } catch {
    // Avisar é serviço secundário: falhar aqui nunca pode derrubar a leitura.
  } finally {
    avaliandoAvisos = false
  }
}

/** A notificação de exemplo do botão "Testar aviso", em Configurações. */
ipcMain.handle('wtf:testar-notificacao', async () => {
  try {
    const config = await lerConfig(projetoAtual)
    return await notificarTeste(win, config)
  } catch (erro) {
    return { enviada: false, erro: String(erro?.message ?? erro) }
  }
})

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

/**
 * Os eventos da última leitura, guardados para o caso de a pessoa autorizar a
 * tradução depois de ver o pedido. Sem isto, dizer "sim" não teria o que
 * traduzir até o próximo commit.
 */
let ultimosEventos = []

/**
 * Traduzir consome a assinatura de quem tem plano limitado. Então, com
 * `traduzirAuto: 'perguntar'` (o padrão), esta função NÃO chama o modelo:
 * conta quantos eventos estão sem tradução e avisa o renderer, que pergunta.
 *
 * Enquanto ninguém responde, o painel segue inteiro com o texto heurístico —
 * estados, avisos, mapa e progresso não dependem de tradução nenhuma.
 */
async function traduzirAoFundo(dir, eventos, autorizadoAgora = false) {
  if (traduzindo || !dir) return
  traduzindo = true
  try {
    ultimosEventos = Array.isArray(eventos) ? eventos : []
    const config = await lerConfig(dir)

    if (!traducaoAutorizada(config, autorizadoAgora)) {
      // Com 'nao' não se pergunta mais nada: a pessoa já decidiu.
      if (config.traduzirAuto === 'perguntar') {
        const pendentes = await contarPendentes(dir, ultimosEventos)
        if (pendentes > 0 && win && !win.isDestroyed()) {
          win.webContents.send('wtf:traducao-pendente', {
            pendentes,
            maxPorRodada: config.maxTraducoesPorRodada,
          })
        }
      }
      return
    }

    const feitas = await traduzirEventos(dir, ultimosEventos, {
      maxChamadas: 4,
      config,
      autorizadoAgora,
    })
    if (feitas.size > 0 && win && !win.isDestroyed()) {
      win.webContents.send('wtf:mudou', 'traducao')
    }
  } catch {
    // Tradução é enfeite: se falhar, o painel segue com o texto heurístico.
  } finally {
    traduzindo = false
  }
}

/**
 * A resposta da pessoa ao pedido de tradução.
 *
 *   'agora'  — traduz esta rodada e continua perguntando nas próximas
 *   'sempre' — grava `traduzirAuto: 'sim'`; não pergunta mais
 *   'nunca'  — grava `traduzirAuto: 'nao'`; o painel segue na heurística
 */
/**
 * Quantas mudanças ainda estão no texto automático.
 *
 * O aviso de "há tradução pendente" só era EMPURRADO quando a leitura de fundo
 * encontrava pendências — e quem abrisse a aba depois disso não via nada. Num
 * projeto importado, que chega com o histórico inteiro por traduzir, isso
 * significava um feed em linguagem de commit sem nenhuma porta para sair dele.
 * Agora a tela pode PERGUNTAR, a qualquer momento.
 */
ipcMain.handle('wtf:traducao-pendentes', async () => {
  if (!projetoAtual) return { pendentes: 0, disponivel: false }
  try {
    const config = await lerConfig(projetoAtual)
    const disponivel = await traduzirDisponivel()
    if (!disponivel) return { pendentes: 0, disponivel: false, auto: config.traduzirAuto }
    const pendentes = await contarPendentes(projetoAtual, ultimosEventos, config.idiomaConteudo)
    return {
      pendentes,
      disponivel: true,
      auto: config.traduzirAuto,
      maxPorRodada: config.maxTraducoesPorRodada,
    }
  } catch {
    return { pendentes: 0, disponivel: false }
  }
})

ipcMain.handle('wtf:responder-traducao', async (_e, resposta) => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  const r = typeof resposta === 'string' ? resposta : ''
  if (!['agora', 'sempre', 'nunca'].includes(r)) return { erro: 'Resposta inválida.' }
  try {
    let config = await lerConfig(projetoAtual)
    if (r === 'sempre') config = await salvarConfig(projetoAtual, { traduzirAuto: 'sim' })
    if (r === 'nunca') config = await salvarConfig(projetoAtual, { traduzirAuto: 'nao' })

    // 'agora' e 'sempre' liberam esta rodada; 'nunca' não chama nada.
    if (r !== 'nunca') void traduzirAoFundo(projetoAtual, ultimosEventos, true)
    return { config }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

/** O contador de consumo do projeto. Leitura pura, tolerante a ausência. */
ipcMain.handle('wtf:uso', async () => {
  try {
    return { uso: await lerUso(projetoAtual) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

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

/*
 * Terminal EMBUTIDO. O `cwd` é sempre `projetoAtual` — a pasta que a pessoa
 * escolheu —, nunca um caminho vindo do renderer. Ver terminal-embutido.js.
 */
ipcMain.handle('wtf:terminal-abrir', async (_e, opcoes) =>
  abrirSessaoEmbutida({
    win,
    dir: projetoAtual,
    mensagem: typeof opcoes?.mensagem === 'string' ? opcoes.mensagem : undefined,
    cols: opcoes?.cols,
    rows: opcoes?.rows,
  }),
)

ipcMain.handle('wtf:terminal-escrever', async (_e, id, dados) => escreverNoTerminal(id, dados))

/*
 * Colar é diferente de digitar, e a diferença importa: ver `colar()`. Tudo o
 * que o app manda de uma vez (as mensagens dos botões, os pedidos de mapa)
 * passa por aqui; só as teclas de quem está no painel usam `escrever`.
 */
ipcMain.handle('wtf:terminal-colar', async (_e, id, texto) => entregarNoTerminal(id, texto))

ipcMain.handle('wtf:terminal-redimensionar', async (_e, id, cols, rows) =>
  redimensionarTerminal(id, cols, rows),
)

ipcMain.handle('wtf:terminal-encerrar', async (_e, id) => encerrarTerminal(id))

/**
 * Os pedidos que o app faz à IA em nome de quem clicou.
 *
 * Ficam num só lugar porque cada um tem DOIS destinos: o terminal do sistema
 * (o caminho antigo) e o terminal de dentro do app. Enquanto os textos moravam
 * dentro dos handlers, só o caminho de fora existia — e o botão "criar mapa"
 * continuou jogando a pessoa para fora do aplicativo muito depois de o app ter
 * um terminal próprio.
 */
export const PEDIDOS = {
  mapear:
    'Use a skill wtf-mapear para mapear este projeto para o WTF. ' +
    'Leia .wtf/MAP-FORMAT.md e o plano do projeto, e escreva .wtf/map.json. ' +
    'Lembre: você descreve as partes e como se chamam — você não decide o que está pronto.',
  pastas:
    'Use a skill wtf-pastas para criar ou atualizar o MAPA.md na raiz deste projeto. ' +
    'Percorra as pastas que importam (ignorando o que é gerado), descubra para que ' +
    'cada uma serve e escreva a árvore com uma frase curta e sem jargão por pasta. ' +
    'Se o MAPA.md já existir, preserve as frases das pastas que não mudaram de propósito.',
  documentos:
    'Use a skill wtf-documentos para criar ou atualizar o .wtf/docs.json deste projeto. ' +
    'Comece pela raiz e por docs/, ignore o que é de ferramenta instalada, e diga por ' +
    'assunto qual documento é o vigente e por quê. Não apague, não mova e não junte ' +
    'arquivo nenhum: consolidar é decisão do dono do projeto. ' +
    'Onde a evidência for fraca, diga que está em dúvida em vez de chutar.',
  guardrails:
    'Use a skill wtf-guardrails para escrever ou atualizar o GUARDRAILS.md na raiz ' +
    'deste projeto: a lista do que NÃO se faz aqui. Procure o que já deu errado no ' +
    'histórico, o que o projeto protege e as verificações que já existem. Cite a ' +
    'evidência de cada regra, e diga quando for só precaução. Não altere código para ' +
    'corrigir o que encontrar — anote e deixe a decisão comigo.',
}

/** O texto de um pedido, para o app entregá-lo ao terminal de dentro. */
ipcMain.handle('wtf:texto-pedido', async (_e, tipo) => PEDIDOS[tipo] ?? null)

/** Os documentos que a IA escreveu a pedido do painel — e a porta para apagá-los. */
ipcMain.handle('wtf:gerados', async () => listarGerados(projetoAtual))

/** "Isso não é problema": marca (ou desmarca) um achado como falso alarme. */
ipcMain.handle('wtf:dispensar-achado', async (_e, achado, nota, acao) => {
  const r = await alternarDispensado(projetoAtual, achado, nota, acao)
  // Aceitar a proposta consome a proposta: ela já cumpriu o papel dela.
  if (achado?.arquivo) await removerProposta(projetoAtual, achado.arquivo, achado.linha)
  // Só o "marcar" vira história; desmarcar é correção de rota, não decisão.
  // Só o "marcar" vira história — e só quando ele mudou alguma coisa: aceitar
  // sete avisos que compartilham o mesmo valor é UMA decisão, não sete cartões.
  if (r?.dispensado && !r.jaEstava) {
    await registrarDecisao(projetoAtual, [{ ...achado, nota: nota ?? achado?.rotulo }])
  }
  if (win && !win.isDestroyed()) win.webContents.send('wtf:mudou', 'seguranca')
  return r
})

/** "Não, isso é problema mesmo": tira a proposta sem dispensar o achado. */
ipcMain.handle('wtf:recusar-proposta', async (_e, arquivo, linha) => {
  await removerProposta(projetoAtual, arquivo, linha)
  if (win && !win.isDestroyed()) win.webContents.send('wtf:mudou', 'seguranca')
  return { ok: true }
})

ipcMain.handle('wtf:apagar-gerado', async (_e, chave) => {
  const r = await apagarGerado(projetoAtual, typeof chave === 'string' ? chave : '')
  // O painel lê o disco: sem esta releitura, a tela continuaria mostrando o
  // mapa que acabou de deixar de existir.
  if (r?.ok && win && !win.isDestroyed()) win.webContents.send('wtf:mudou', 'gerado-apagado')
  return r
})

/** Dispara o onboarding: abre o agente já pedindo o mapeamento do projeto. */
ipcMain.handle('wtf:mapear', async () => abrirTerminal(projetoAtual, PEDIDOS.mapear))

/** Pede o mapa das PASTAS: para que serve cada diretório do repositório. */
ipcMain.handle('wtf:mapear-pastas', async () => abrirTerminal(projetoAtual, PEDIDOS.pastas))

/** Pede o mapa dos DOCUMENTOS: quais importam, e qual é o vigente de cada assunto. */
ipcMain.handle('wtf:mapear-documentos', async () =>
  abrirTerminal(projetoAtual, PEDIDOS.documentos),
)

/**
 * Passa a acompanhar `dir`: registra a abertura, lê, observa e traduz.
 *
 * É o ÚNICO caminho para trocar de projeto — venha a troca da variável de
 * ambiente, do seletor de pasta ou da lista de projetos. Três coisas
 * acontecem aqui, e nenhuma delas é opcional:
 *
 *  1. `registrarProjeto` — a lista de atalhos só existe porque toda abertura
 *     passa por aqui. Ela é gravada em `userData`, NUNCA dentro do projeto.
 *  2. `ultimoSnapshot = null` — zerar a linha de base das notificações. Sem
 *     isto, a próxima comparação seria entre DOIS PROJETOS DIFERENTES: tudo o
 *     que existe no projeto novo apareceria como "acabou de surgir" e a pessoa
 *     receberia uma rajada de avisos falsos ao simplesmente trocar de aba.
 *  3. `observar` — o watcher anterior cai (`pararObservacao`, dentro de
 *     `observar`). Só o projeto ATIVO é observado e traduzido; os outros da
 *     lista existem apenas como resumo barato, sem watcher e sem modelo.
 */
async function abrirProjeto(dir) {
  /*
   * 4. os terminais do projeto ANTERIOR morrem aqui.
   *
   * Uma sessão nasce com `cwd` no projeto aberto, e esse `cwd` não muda nunca
   * mais. Trocar de projeto sem encerrá-las deixava a IA trabalhando numa
   * pasta enquanto o painel mostrava outra — e nada na tela dizia isso. Pior:
   * as sessões continuavam vivas e invisíveis, gastando o teto de três, até o
   * app ser fechado. Foi assim que um `zsh` de meia hora sobrou no ar.
   */
  if (dir !== projetoAtual) encerrarTerminais()

  projetoAtual = dir
  ultimoSnapshot = null
  ultimosEventos = []
  void registrarProjeto(dir).catch(() => {})
  /*
   * A marca da visita é gravada ANTES da leitura, e a ordem é a regra inteira.
   *
   * `registrarVisita` empurra a visita anterior para `anteriorEm` — e é contra
   * `anteriorEm` que o resumo compara. Gravando depois de `lerProjeto`, o
   * resumo desta abertura ainda enxergaria a marca de DUAS sessões atrás.
   * (Aberturas seguidas dentro de 30 min contam como a mesma visita, então
   * reabrir o painel não apaga o intervalo — ver history.js.)
   */
  await registrarVisita(dir).catch(() => {})
  const s = await lerProjeto(dir)
  observar(dir)
  traduzirAoFundo(dir, s?.events ?? [])
  return s
}

/**
 * Recalcula o histórico AGORA e devolve os marcos prontos.
 *
 * O caminho normal é o cache + o recálculo em segundo plano; isto existe para
 * quando a tela quer o passado na mão (a pessoa abriu a aba do histórico e não
 * quer esperar o próximo `wtf:mudou`). Caro de propósito: só por pedido.
 */
ipcMain.handle('wtf:historico', async () => {
  if (!projetoAtual) return null
  try {
    return await reconstruirHistorico(projetoAtual)
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

ipcMain.handle('wtf:snapshot', async () => {
  if (!projetoAtual) return null
  try {
    // Abrir pelo `WTF_PROJECT` também é uma visita. A janela de sessão de
    // 30 min impede que as releituras do watcher apaguem o intervalo.
    await registrarVisita(projetoAtual).catch(() => {})
    const s = await lerProjeto(projetoAtual)
    observar(projetoAtual)
    traduzirAoFundo(projetoAtual, s?.events ?? [])
    // Abrir pelo `WTF_PROJECT` também conta como abertura: é assim que o
    // projeto vindo do comando `wtf` entra na lista de atalhos.
    void registrarProjeto(projetoAtual).catch(() => {})
    return s
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

// ------------------------------------------------------- lista de projetos

/**
 * Os projetos conhecidos, cada um com um resumo BARATO (ver a regra de custo
 * zero no topo de electron/projects.js). Nenhum deles é observado nem
 * traduzido — só o aberto é.
 */
ipcMain.handle('wtf:projetos', async () => {
  try {
    const projetos = await lerProjetos()
    const resumos = await resumirTodos(projetos.map((p) => p.caminho))
    const porCaminho = new Map(resumos.map((r) => [r.caminho, r]))
    return {
      atual: projetoAtual,
      projetos: projetos.map((p) => ({ ...p, resumo: porCaminho.get(p.caminho) ?? null })),
    }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

/** Troca o projeto aberto e devolve o snapshot novo, já pronto para pintar. */
ipcMain.handle('wtf:abrir-projeto', async (_e, caminho) => {
  const dir = typeof caminho === 'string' ? caminho.trim() : ''
  if (!dir) return { erro: 'Caminho inválido.' }
  if (!(await isGitRepo(dir))) {
    return { erro: 'Essa pasta não é mais um repositório Git. Ela pode ter sido movida ou apagada.' }
  }
  try {
    return await abrirProjeto(dir)
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

/**
 * Tira o projeto da LISTA. Não apaga nada dentro dele — ver o comentário de
 * `esquecerProjeto` em electron/projects.js.
 */
ipcMain.handle('wtf:esquecer-projeto', async (_e, caminho) => {
  const dir = typeof caminho === 'string' ? caminho.trim() : ''
  if (!dir) return { erro: 'Caminho inválido.' }
  try {
    return { projetos: await esquecerProjeto(dir) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

ipcMain.handle('wtf:fixar-projeto', async (_e, caminho, valor) => {
  const dir = typeof caminho === 'string' ? caminho.trim() : ''
  if (!dir) return { erro: 'Caminho inválido.' }
  try {
    return { projetos: await fixarProjeto(dir, valor !== false) }
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

/**
 * Aprova (ou desfaz a aprovação de) uma parte do projeto. A assinatura é
 * calculada AQUI, a partir do snapshot atual: é o retrato do que a pessoa está
 * vendo na hora em que ela clica. Escreve só em `.wtf/validated.json`.
 */
ipcMain.handle('wtf:validar', async (_e, featureId) => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  if (typeof featureId !== 'string' || !featureId) return { erro: 'Parte inválida.' }
  try {
    const atual = await lerProjeto(projetoAtual)
    const feature = atual?.features?.find((f) => f.id === featureId)
    if (!feature) return { erro: 'Essa parte não existe mais no projeto.' }

    /*
     * Só se aprova o que já existe.
     *
     * Aprovar algo ainda não construído transformaria o ✓✓ numa lista de
     * desejos — e ele é o oposto disso: é o único estado do painel que nasce
     * de alguém ter olhado com os próprios olhos. Barrado aqui, e não só na
     * hora de exibir, para não deixar registro de aprovação que nunca houve.
     */
    // `validated` e `revalidar` entram na lista porque desfazer uma aprovação
    // (ou reaprovar algo que mudou) precisa continuar funcionando.
    const podeAprovar =
      feature.state === 'implemented' ||
      feature.state === 'tested' ||
      feature.state === 'validated' ||
      feature.revalidar
    if (!podeAprovar) {
      return { erro: 'Só dá para aprovar uma parte depois que ela existe.' }
    }

    const { validado } = await alternarValidado(projetoAtual, featureId, assinaturaDe(feature))
    return { validado, snapshot: await lerProjeto(projetoAtual) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

/** Lê as preferências do projeto (idioma da interface e idioma do conteúdo). */
ipcMain.handle('wtf:config', async () => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  try {
    return { config: await lerConfig(projetoAtual) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

/**
 * Salva as preferências. Escreve só em `.wtf/config.json` — e, logo depois,
 * reaplica o idioma nas skills instaladas: a preferência só vale de verdade
 * quando o agente também a enxerga, e ele só lê o arquivo da skill.
 */
ipcMain.handle('wtf:salvar-config', async (_e, parcial) => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  if (!parcial || typeof parcial !== 'object') return { erro: 'Preferências inválidas.' }
  try {
    const config = await salvarConfig(projetoAtual, parcial)
    await aplicarIdiomaNaSkill(projetoAtual, config)
    return { config, snapshot: await lerProjeto(projetoAtual) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

/*
 * ------------------------------------------------------------------ perguntar
 *
 * As chaves ficam em `userData`, cifradas — NUNCA dentro do projeto observado
 * (ver o cabeçalho de keys.js). O que atravessa o IPC para o renderer é sempre
 * a versão mascarada; a chave em claro só existe aqui dentro, no instante da
 * chamada HTTP.
 */
ipcMain.handle('wtf:chaves', async () => {
  try {
    return { ...(await lerChaves()), onde: ondeMoram() }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

ipcMain.handle('wtf:salvar-chave', async (_e, provedor, chave) => {
  if (typeof chave !== 'string' || !chave.trim()) return { erro: 'A chave está vazia.' }
  return salvarChave(provedor, chave)
})

ipcMain.handle('wtf:apagar-chave', async (_e, provedor) => apagarChave(provedor))

/**
 * O modelo é uma preferência do projeto (`.wtf/config.json → modeloPergunta`).
 * Lido cru porque `lerConfig` normaliza só os campos de idioma; ausente ou
 * estranho vale o padrão.
 */
async function modeloDoProjeto(dir) {
  if (!dir) return MODELO_PADRAO
  try {
    const bruto = await readFile(path.join(dir, '.wtf', 'config.json'), 'utf8')
    const m = JSON.parse(bruto)?.modeloPergunta
    return typeof m === 'string' && m.trim() ? m.trim() : MODELO_PADRAO
  } catch {
    return MODELO_PADRAO
  }
}

/** Uma pergunta por vez: a nova cancela a anterior, que ninguém mais lê. */
let perguntaEmCurso = null

ipcMain.handle('wtf:perguntar', async (_e, pedido) => {
  const p = pedido && typeof pedido === 'object' ? pedido : {}
  const id = typeof p.eventoId === 'string' ? p.eventoId : ''
  if (!id) return { erro: 'Pergunta sem evento.' }
  if (typeof p.pergunta !== 'string' || !p.pergunta.trim()) return { erro: 'Escreva uma pergunta.' }

  const provedor = typeof p.provedor === 'string' && p.provedor ? p.provedor : 'openrouter'
  const chave = await chaveEmClaro(provedor)
  if (!chave) {
    return { erro: 'Nenhuma chave configurada. Configure uma chave para poder perguntar.' }
  }

  perguntaEmCurso?.abort()
  const controle = new AbortController()
  perguntaEmCurso = controle

  const config = await lerConfig(projetoAtual)
  const enviar = (canal, dados) => {
    if (win && !win.isDestroyed()) win.webContents.send(canal, dados)
  }

  const r = await perguntar({
    provedor,
    chave,
    modelo: await modeloDoProjeto(projetoAtual),
    contexto: p.contexto,
    pergunta: p.pergunta,
    idioma: config.nomeIdiomaConteudo,
    // O contador de perguntas pagas vive dentro do projeto observado.
    dir: projetoAtual,
    sinal: controle.signal,
    aoPedaco: (pedaco) => enviar('wtf:resposta', { id, pedaco }),
  })

  if (perguntaEmCurso === controle) perguntaEmCurso = null
  if (r?.cancelado) return { cancelado: true }
  if (r?.erro) {
    enviar('wtf:resposta', { id, erro: r.erro })
    return { erro: r.erro }
  }
  enviar('wtf:resposta', { id, fim: true, incompleta: !!r?.incompleta })
  return { ok: true }
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
  try {
    // Projeto novo, linha de base nova: o histórico dele não vira uma rajada
    // de avisos no primeiro segundo (ver `abrirProjeto`).
    return await abrirProjeto(dir)
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

/**
 * Instala a skill e o hook no projeto observado. É a única escrita que o WTF
 * faz — e só acontece por clique explícito, com confirmação.
 */
/**
 * Tudo o que a instalação escreveria, com o conteúdo integral de cada arquivo.
 * Só leitura: chamar isto nunca toca no projeto.
 */
ipcMain.handle('wtf:pacote-instalacao', async () => {
  try {
    return await lerPacoteInstalacao(projetoAtual)
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

ipcMain.handle('wtf:instalar', async () => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  const r = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Instalar', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    message: 'Instalar o WTF neste projeto?',
    detail:
      `Serão criados os arquivos do WTF em ${path.basename(projetoAtual)} e os hooks serão ` +
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

// ------------------------------------------------- nível A: global (~/.claude)

/**
 * Instala as skills e o hook em `~/.claude`, valendo para todos os projetos.
 * Escrever na configuração global do Claude Code é coisa séria: pede
 * confirmação e diz, em texto, que o hook fica INERTE onde não houver `.wtf/`.
 */
ipcMain.handle('wtf:instalar-global', async () => {
  const casa = casaClaude()
  const r = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Instalar', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    message: 'Instalar o WTF para todos os projetos?',
    detail:
      `Isto mexe na configuração global do Claude Code, em ${casa}.\n\n` +
      'Serão criadas as skills do WTF e o registro do hook em settings.json. ' +
      'Nada existente é apagado — o arquivo recebe backup datado e todo o resto ' +
      'é preservado.\n\n' +
      'Mesmo instalado, o WTF fica desligado em todo projeto: ele só registra ' +
      'algo onde você clicar em "habilitar neste projeto".',
  })
  if (r.response !== 0) return { cancelado: true }
  try {
    const config = projetoAtual ? await lerConfig(projetoAtual).catch(() => null) : null
    const feito = await instalarGlobal(config)
    return {
      ...feito,
      global: await estadoGlobal(),
      snapshot: projetoAtual ? await lerProjeto(projetoAtual) : undefined,
    }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

ipcMain.handle('wtf:desinstalar-global', async () => {
  const casa = casaClaude()
  const r = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Remover', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    message: 'Remover o WTF de todos os projetos?',
    detail:
      `Isto mexe na configuração global do Claude Code, em ${casa}.\n\n` +
      'Só o que é do WTF sai: as skills wtf, wtf-mapear e wtf-pastas, o hook e as ' +
      'entradas dele em settings.json. Todo o resto da sua configuração fica intacto, ' +
      'e o arquivo recebe backup antes.\n\n' +
      'O histórico já registrado nos seus projetos não é apagado.',
  })
  if (r.response !== 0) return { cancelado: true }
  try {
    const feito = await desinstalarGlobal()
    return {
      ...feito,
      global: await estadoGlobal(),
      snapshot: projetoAtual ? await lerProjeto(projetoAtual) : undefined,
    }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

// --------------------------------------------- nível B: habilitar o projeto

/**
 * Cria `.wtf/` no projeto. É este clique — e só ele — que faz o hook global
 * sair do silêncio aqui. Escreve dentro do projeto da pessoa, não em
 * `~/.claude`, então não precisa do aviso sobre configuração global.
 */
ipcMain.handle('wtf:habilitar-projeto', async () => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  const r = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Habilitar', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    message: `Habilitar o WTF em ${path.basename(projetoAtual)}?`,
    detail:
      'Será criada a pasta .wtf/ dentro do projeto, com o programinha que a IA usa ' +
      'para declarar o que faz. A partir daí o WTF passa a registrar o que acontece ' +
      'aqui — e só aqui.\n\n' +
      'Dá para desligar a qualquer momento; o histórico já registrado permanece.',
  })
  if (r.response !== 0) return { cancelado: true }
  try {
    const config = await lerConfig(projetoAtual).catch(() => null)
    const feito = await habilitarProjeto(projetoAtual, config)
    return { ...feito, snapshot: await lerProjeto(projetoAtual) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
})

ipcMain.handle('wtf:desabilitar-projeto', async () => {
  if (!projetoAtual) return { erro: 'Nenhum projeto aberto.' }
  try {
    const feito = await desabilitarProjeto(projetoAtual)
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

// Nenhum shell (nem agente dentro dele) sobrevive ao app.
app.on('before-quit', () => encerrarTerminais())

app.on('window-all-closed', () => {
  pararObservacao?.()
  pararObservacao = null
  encerrarTerminais()
  if (process.platform !== 'darwin') app.quit()
})
