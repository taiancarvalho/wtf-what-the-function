/**
 * Os projetos que a pessoa já abriu no WTF.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ONDE ISTO MORA — e por que NUNCA dentro de um projeto observado:          │
 * │                                                                          │
 * │ esta é uma lista de PASTAS DO COMPUTADOR da pessoa. Ela não pertence a    │
 * │ repositório nenhum: gravá-la dentro de um projeto colocaria o caminho de  │
 * │ todos os outros projetos dela dentro de um repositório que vai para       │
 * │ backup, para o GitHub, para uma tela compartilhada. Além de ser vazamento │
 * │ de informação, seria uma escrita a mais num projeto que o WTF promete     │
 * │ apenas LER. Então mora em `app.getPath('userData')/projetos.json`, que é  │
 * │ do APLICATIVO — a mesma decisão (e a mesma razão) de electron/keys.js.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Formato:
 *   { v: 1, projetos: [{ caminho, nome, ultimaAberturaEm, fixado? }] }
 *
 * Como os outros módulos de estado do WTF, este é TOLERANTE: arquivo ausente,
 * JSON quebrado ou formato estranho valem todos a mesma coisa — lista vazia.
 * Nunca lança. Perder a lista de atalhos é chato; derrubar o app por causa
 * dela seria muito pior.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { isGitRepo, readCommits, readProjectMeta, readWorkingFiles } from './git.js'
import { commitsParaSnapshot } from './translate.js'
import { mesclarClaims, readAgentEvents } from './events.js'
import { aplicarResolvidos, lerResolvidos } from './resolved.js'
import { assuntosPendentes } from './notify.js'
import { lerConfig } from './config.js'
import { estadoProjeto } from './globalinstall.js'

/** Nome do app, como o Electron o calcula (productName vence name). */
const NOME_APP = 'WTF — What The Function'

/**
 * O `userData` do Electron, calculado pela convenção de cada sistema.
 *
 * Existe porque o `bin/wtf.mjs` roda em Node puro, sem Electron, e precisa
 * enxergar EXATAMENTE o mesmo arquivo que o app enxerga — senão `wtf --lista`
 * mostraria uma lista vazia enquanto o painel mostra dez projetos.
 */
function padraoUserData() {
  const casa = os.homedir()
  if (process.platform === 'darwin') return path.join(casa, 'Library', 'Application Support', NOME_APP)
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(casa, 'AppData', 'Roaming'), NOME_APP)
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(casa, '.config'), NOME_APP)
}

/**
 * Diretório base do registro. Injetável por parâmetro ou por `WTF_HOME` — como
 * em globalinstall.js — para que os testes rodem contra um diretório
 * temporário, e nunca contra o `userData` real de quem está desenvolvendo.
 */
export async function casaProjetos(base) {
  if (base) return base
  if (process.env.WTF_HOME) return process.env.WTF_HOME
  try {
    // Import preguiçoso: fora do Electron (testes, CLI) isto não resolve para
    // um `app`, e o módulo precisa continuar utilizável assim mesmo.
    const electron = await import('electron')
    const app = electron?.app ?? electron?.default?.app
    const dir = app?.getPath?.('userData')
    if (dir) return dir
  } catch {
    // Sem Electron: a convenção do sistema é a melhor resposta possível.
  }
  return padraoUserData()
}

const arquivoDe = async (base) => path.join(await casaProjetos(base), 'projetos.json')

/** Caminho canônico: é por ele que a lista deduplica. */
const resolver = (caminho) => path.resolve(String(caminho ?? '').replace(/^~/, os.homedir()))

const texto = (v) => (typeof v === 'string' ? v.trim() : '')

async function existePasta(caminho) {
  try {
    return (await stat(caminho)).isDirectory()
  } catch {
    return false
  }
}

/** Fixados primeiro; depois, o mais recentemente aberto na frente. */
function ordenar(lista) {
  return lista.slice().sort((a, b) => {
    if (!!a.fixado !== !!b.fixado) return a.fixado ? -1 : 1
    return new Date(b.ultimaAberturaEm ?? 0) - new Date(a.ultimaAberturaEm ?? 0)
  })
}

async function lerArquivo(base) {
  let bruto
  try {
    bruto = await readFile(await arquivoDe(base), 'utf8')
  } catch {
    return []
  }
  let dados
  try {
    dados = JSON.parse(bruto)
  } catch {
    // Arquivo corrompido vale o mesmo que arquivo ausente: nenhum projeto.
    return []
  }
  const lista = Array.isArray(dados?.projetos) ? dados.projetos : []
  const vistos = new Set()
  const out = []
  for (const item of lista) {
    const caminho = texto(item?.caminho)
    if (!caminho) continue
    const canonico = resolver(caminho)
    if (vistos.has(canonico)) continue
    vistos.add(canonico)
    out.push({
      caminho: canonico,
      nome: texto(item?.nome) || path.basename(canonico),
      ultimaAberturaEm: texto(item?.ultimaAberturaEm) || null,
      ...(item?.fixado === true ? { fixado: true } : {}),
    })
  }
  return out
}

async function gravar(lista, base) {
  const alvo = await arquivoDe(base)
  await mkdir(path.dirname(alvo), { recursive: true })
  await writeFile(alvo, `${JSON.stringify({ v: 1, projetos: ordenar(lista) }, null, 2)}\n`, 'utf8')
}

/**
 * A lista, já ordenada.
 *
 * Um caminho que não existe mais no disco CONTINUA na lista, apenas marcado
 * com `sumiu: true`. Apagar sozinho seria decidir pela pessoa: talvez o
 * projeto esteja num HD externo desconectado, num volume de rede fora do ar,
 * ou só tenha sido renomeado. Quem esquece um projeto é ela, no botão.
 */
export async function lerProjetos(base) {
  const lista = await lerArquivo(base)
  const marcados = []
  for (const p of lista) {
    marcados.push({ ...p, ...((await existePasta(p.caminho)) ? {} : { sumiu: true }) })
  }
  return ordenar(marcados)
}

/**
 * Registra uma abertura: acrescenta o projeto ou atualiza a data do que já
 * estava lá. Deduplica pelo caminho resolvido — `~/p`, `./p` e `/casa/p` são
 * o mesmo projeto.
 */
export async function registrarProjeto(caminho, base, agora = new Date()) {
  const canonico = resolver(caminho)
  if (!canonico || canonico === '.') return await lerProjetos(base)
  const lista = await lerArquivo(base)
  const quando = (agora instanceof Date ? agora : new Date(agora)).toISOString()

  const existente = lista.find((p) => p.caminho === canonico)
  if (existente) {
    existente.ultimaAberturaEm = quando
    // O nome acompanha a pasta: renomear a pasta renomeia o atalho.
    existente.nome = path.basename(canonico)
  } else {
    lista.push({ caminho: canonico, nome: path.basename(canonico), ultimaAberturaEm: quando })
  }

  await gravar(lista, base)
  return await lerProjetos(base)
}

/**
 * Tira o projeto DA LISTA — e só da lista.
 *
 * ⚠️ Isto NUNCA toca no projeto em si: nenhum arquivo dele é lido para
 * escrita, nada é apagado, o `.wtf/` continua onde está e o histórico
 * registrado permanece intacto. "Esquecer" aqui significa apenas "não me
 * mostre mais este atalho". É por isso que a função se chama `esquecer` e não
 * `remover`: remover soaria como destruir alguma coisa, e destruir projeto de
 * alguém não é atribuição deste app.
 */
export async function esquecerProjeto(caminho, base) {
  const canonico = resolver(caminho)
  const lista = (await lerArquivo(base)).filter((p) => p.caminho !== canonico)
  await gravar(lista, base)
  return await lerProjetos(base)
}

/** Fixa (ou desfixa) um projeto no topo da lista. */
export async function fixarProjeto(caminho, valor, base) {
  const canonico = resolver(caminho)
  const lista = await lerArquivo(base)
  const alvo = lista.find((p) => p.caminho === canonico)
  if (!alvo) return await lerProjetos(base)
  if (valor === false) delete alvo.fixado
  else alvo.fixado = true
  await gravar(lista, base)
  return await lerProjetos(base)
}

// ------------------------------------------------------------------ resumo

/** Uma declaração da IA neste intervalo significa "tem alguém trabalhando ali". */
const JANELA_ATIVO_MS = 30 * 60 * 1000

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ REGRA CRÍTICA — CUSTO ZERO, SEMPRE.                                      ║
 * ║                                                                          ║
 * ║ Resumir um projeto que NÃO está aberto jamais pode:                      ║
 * ║   • chamar o modelo (nem uma vez, nem "só as pendentes");                ║
 * ║   • traduzir coisa alguma;                                               ║
 * ║   • escrever um único byte em disco — nem cache, nem contador, nem log.  ║
 * ║                                                                          ║
 * ║ A lista de projetos é desenhada assim que o painel abre, com N projetos  ║
 * ║ de uma vez. Se cada um custasse uma chamada, a pessoa pagaria por olhar  ║
 * ║ uma tela — exatamente o comportamento que este produto existe para       ║
 * ║ denunciar. A diretriz do dono do projeto é literal: "custo zero, sempre; ║
 * ║ o usuário não pode ser pego desprevenido".                               ║
 * ║                                                                          ║
 * ║ Só entra aqui leitura barata: git log curto, estado do disco e os        ║
 * ║ arquivos JSON que o próprio WTF já escreveu. Só o projeto ATIVO é        ║
 * ║ observado e traduzido — isso é responsabilidade do main, não daqui.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * @returns {Promise<{nome:string,caminho:string,pendencias:number,naoSalvos:number,ativo:boolean,ultimoEventoEm:string|null,habilitado:boolean,erro?:string}>}
 */
export async function resumoDe(dir) {
  const caminho = resolver(dir)
  const nome = path.basename(caminho)
  const vazio = {
    nome,
    caminho,
    pendencias: 0,
    naoSalvos: 0,
    ativo: false,
    ultimoEventoEm: null,
    habilitado: false,
  }

  try {
    if (!(await isGitRepo(caminho))) {
      return { ...vazio, erro: 'Essa pasta não é um repositório Git.' }
    }

    // Poucos commits de propósito: aqui é um cartão de lista, não o painel.
    const commits = await readCommits(caminho, 10)
    let snapshot = commitsParaSnapshot(await readProjectMeta(caminho), commits)

    const claims = await readAgentEvents(caminho)
    if (claims.length) snapshot = mesclarClaims(snapshot, claims)
    // A palavra final da pessoa entra também aqui: um aviso que ela já marcou
    // como resolvido não pode voltar a cobrar do lado de fora do projeto.
    aplicarResolvidos(snapshot, await lerResolvidos(caminho))

    // ASSUNTOS, nunca eventos — a mesma função que decide o que notificar
    // (electron/notify.js). Uma terceira cópia da regra seria uma terceira
    // chance de as contagens discordarem entre si.
    const pendencias = assuntosPendentes(snapshot).length

    const trabalho = await readWorkingFiles(caminho)
    const naoSalvos = new Set([...(trabalho.untracked ?? []), ...(trabalho.modified ?? [])]).size

    const ultimoEventoEm = claims[0]?.at ?? null
    const ativo = !!ultimoEventoEm && Date.now() - new Date(ultimoEventoEm).getTime() < JANELA_ATIVO_MS

    const config = await lerConfig(caminho)
    const { habilitado } = await estadoProjeto(caminho)

    return {
      nome,
      caminho,
      pendencias,
      naoSalvos,
      ativo,
      ultimoEventoEm,
      habilitado,
      idiomaInterface: config.idiomaInterface,
    }
  } catch (erro) {
    return { ...vazio, erro: String(erro?.message ?? erro) }
  }
}

/** Quantos resumos rodam ao mesmo tempo, e quanto tempo cada um tem. */
const CONCORRENCIA = 3
const TEMPO_LIMITE_MS = 3000

function comPrazo(promessa, caminho) {
  return new Promise((resolve) => {
    const relogio = setTimeout(
      () =>
        resolve({
          nome: path.basename(caminho),
          caminho,
          pendencias: 0,
          naoSalvos: 0,
          ativo: false,
          ultimoEventoEm: null,
          habilitado: false,
          erro: 'Demorou demais para responder.',
        }),
      TEMPO_LIMITE_MS,
    )
    promessa.then(
      (v) => {
        clearTimeout(relogio)
        resolve(v)
      },
      (e) => {
        clearTimeout(relogio)
        resolve({
          nome: path.basename(caminho),
          caminho,
          pendencias: 0,
          naoSalvos: 0,
          ativo: false,
          ultimoEventoEm: null,
          habilitado: false,
          erro: String(e?.message ?? e),
        })
      },
    )
  })
}

/**
 * Resumo de todos os projetos da lista, três por vez e com prazo individual.
 *
 * Um projeto quebrado (pasta sumida, repositório corrompido, disco de rede
 * fora do ar) devolve `erro` no lugar do resumo e a lista continua inteira —
 * jamais trava a tela de quem tem dez projetos por causa de um.
 */
export async function resumirTodos(caminhos, base) {
  const lista = Array.isArray(caminhos)
    ? caminhos.map(resolver)
    : (await lerProjetos(base)).map((p) => p.caminho)

  const resumos = new Array(lista.length)
  let proximo = 0

  async function trabalhador() {
    while (proximo < lista.length) {
      const i = proximo++
      resumos[i] = await comPrazo(resumoDe(lista[i]), lista[i])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA, lista.length) }, () => trabalhador()),
  )
  return resumos
}
