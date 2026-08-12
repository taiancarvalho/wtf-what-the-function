/**
 * Guarda das chaves de API.
 *
 * SEGURANÇA É O REQUISITO PRINCIPAL DESTE ARQUIVO. Três decisões, e o porquê
 * de cada uma:
 *
 * 1. NADA é gravado dentro do projeto observado.
 *    `.wtf/` vive no repositório da pessoa. Repositório vai para backup, entra
 *    em compartilhamento de tela, é copiado para outra máquina — e um
 *    `.gitignore` errado publica a chave no GitHub em segundos. Uma chave de
 *    API vazada é dinheiro real da pessoa. Então a chave mora em
 *    `app.getPath('userData')`, que é do APLICATIVO, não do projeto: fora do
 *    repositório, fora do backup do projeto, fora do diff.
 *
 * 2. Em disco, só cifrado — com `safeStorage` do Electron, que usa o cofre do
 *    sistema (Keychain no macOS, DPAPI no Windows, libsecret no Linux). A
 *    consequência é boa: o arquivo copiado para outra máquina não abre.
 *
 * 3. Se o cofre do sistema NÃO estiver disponível, recusamos gravar.
 *    Gravar em texto plano "só desta vez" é como o produto vira o vilão que ele
 *    existe para denunciar. Nesse caso a chave fica só em memória, viva
 *    enquanto o app estiver aberto, e a pessoa reinforma na próxima sessão.
 *
 * 4. O renderer NUNCA recebe a chave inteira. Só quais provedores têm chave e
 *    uma máscara (`sk-or-…4f2a`) suficiente para a pessoa reconhecer qual é.
 *    O renderer roda HTML; qualquer coisa que chegue lá pode terminar num log,
 *    num screenshot ou numa extensão. A chave em claro só existe no main, no
 *    instante da chamada HTTP.
 *
 * Formato do arquivo: { v: 1, provedores: { <id>: { cifrado, mascara, at } } }
 */

import { app, safeStorage } from 'electron'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Provedores aceitos. Só OpenRouter funciona hoje; os outros são estrutura. */
export const PROVEDORES = ['openrouter', 'anthropic', 'openai']

const arquivo = () => path.join(app.getPath('userData'), 'chaves.json')

/**
 * Chaves informadas nesta sessão e NÃO gravadas (cofre indisponível).
 * Some quando o app fecha — de propósito.
 */
const emMemoria = new Map()

/**
 * Máscara mostrável. Guarda o começo (identifica o provedor e a conta) e os
 * quatro últimos (distingue duas chaves parecidas). O miolo, que é o segredo
 * de verdade, nunca sai daqui.
 */
export function mascarar(chave) {
  const c = String(chave ?? '').trim()
  if (c.length <= 10) return '…'
  return `${c.slice(0, 6)}…${c.slice(-4)}`
}

async function lerArquivo() {
  let bruto
  try {
    bruto = await readFile(arquivo(), 'utf8')
  } catch {
    return { v: 1, provedores: {} }
  }
  try {
    const dados = JSON.parse(bruto)
    const provedores =
      dados && typeof dados === 'object' && dados.provedores && typeof dados.provedores === 'object'
        ? dados.provedores
        : {}
    return { v: 1, provedores }
  } catch {
    // Arquivo corrompido vale o mesmo que arquivo ausente: nenhuma chave.
    return { v: 1, provedores: {} }
  }
}

async function gravarArquivo(dados) {
  await mkdir(path.dirname(arquivo()), { recursive: true })
  await writeFile(arquivo(), `${JSON.stringify(dados, null, 2)}\n`, 'utf8')
}

/** O cofre do sistema está disponível? Sem ele, não gravamos nada. */
export function podeGuardar() {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * O que o renderer pode saber: quais provedores têm chave, se ela está gravada
 * ou só nesta sessão, e a máscara. Nunca a chave.
 */
export async function lerChaves() {
  const { provedores } = await lerArquivo()
  const itens = {}

  for (const id of PROVEDORES) {
    const gravada = provedores[id]
    if (gravada && typeof gravada.cifrado === 'string') {
      itens[id] = {
        tem: true,
        mascara: typeof gravada.mascara === 'string' ? gravada.mascara : '…',
        guardada: true,
        at: typeof gravada.at === 'string' ? gravada.at : undefined,
      }
      continue
    }
    const sessao = emMemoria.get(id)
    if (sessao) {
      itens[id] = { tem: true, mascara: mascarar(sessao), guardada: false }
    }
  }

  return { chaves: itens, podeGuardar: podeGuardar() }
}

/**
 * Salva uma chave. Com cofre: cifra e grava. Sem cofre: guarda só em memória e
 * devolve `guardada: false` — a interface precisa dizer isso à pessoa, para ela
 * não descobrir sozinha, no dia seguinte, que a chave sumiu.
 */
export async function salvarChave(provedor, chave) {
  const id = String(provedor ?? '').trim()
  const valor = String(chave ?? '').trim()
  if (!PROVEDORES.includes(id)) return { erro: 'Provedor desconhecido.' }
  if (!valor) return { erro: 'A chave está vazia.' }

  if (!podeGuardar()) {
    emMemoria.set(id, valor)
    return {
      guardada: false,
      aviso:
        'Seu sistema não ofereceu um cofre para guardar a chave com segurança. ' +
        'Ela vale só enquanto o WTF estiver aberto — nada foi escrito em disco, ' +
        'porque escrever a chave sem proteção seria pior do que não guardar.',
      ...(await lerChaves()),
    }
  }

  try {
    const dados = await lerArquivo()
    dados.provedores[id] = {
      cifrado: safeStorage.encryptString(valor).toString('base64'),
      mascara: mascarar(valor),
      at: new Date().toISOString(),
    }
    await gravarArquivo(dados)
    // A cópia em memória perde a razão de existir assim que há a gravada.
    emMemoria.delete(id)
    return { guardada: true, ...(await lerChaves()) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
}

/** Apaga a chave: do disco e da memória. */
export async function apagarChave(provedor) {
  const id = String(provedor ?? '').trim()
  if (!PROVEDORES.includes(id)) return { erro: 'Provedor desconhecido.' }
  emMemoria.delete(id)
  try {
    const dados = await lerArquivo()
    delete dados.provedores[id]
    if (Object.keys(dados.provedores).length === 0) {
      // Sem nenhuma chave, o arquivo em si não precisa existir.
      await unlink(arquivo()).catch(() => {})
    } else {
      await gravarArquivo(dados)
    }
    return { apagada: true, ...(await lerChaves()) }
  } catch (erro) {
    return { erro: String(erro?.message ?? erro) }
  }
}

/**
 * INTERNA — só o main chama, e só no instante de montar a requisição HTTP.
 * Não é exposta no preload, não atravessa IPC, não vai para log.
 */
export async function chaveEmClaro(provedor) {
  const id = String(provedor ?? '').trim()
  if (!PROVEDORES.includes(id)) return null

  const sessao = emMemoria.get(id)
  if (sessao) return sessao

  const { provedores } = await lerArquivo()
  const gravada = provedores[id]
  if (!gravada || typeof gravada.cifrado !== 'string') return null
  if (!podeGuardar()) return null
  try {
    return safeStorage.decryptString(Buffer.from(gravada.cifrado, 'base64'))
  } catch {
    // Cofre de outra máquina, ou perfil trocado: melhor tratar como sem chave.
    return null
  }
}

/** Onde as chaves moram. Existe para a interface poder dizer isso à pessoa. */
export function ondeMoram() {
  try {
    return arquivo()
  } catch {
    return ''
  }
}
