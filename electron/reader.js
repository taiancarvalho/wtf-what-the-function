/**
 * Leitura de um arquivo do projeto, para exibir dentro do app.
 *
 * Regra de segurança: o caminho pedido pelo renderer é sempre resolvido contra
 * a raiz do projeto observado e recusado se escapar dela. Sem isso, um mapa
 * malformado (ou malicioso) com `../../.ssh/id_rsa` viraria um leitor de
 * arquivos do computador inteiro.
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

/** Acima disto, mostrar o arquivo inteiro não ajuda ninguém. */
const LIMITE_BYTES = 400 * 1024

/** Extensões que não fazem sentido abrir como texto. */
const BINARIOS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.icns',
  '.pdf', '.zip', '.gz', '.tar', '.mp4', '.mov', '.mp3', '.wav',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
])

export async function lerArquivo(raiz, relativo) {
  if (!raiz || typeof relativo !== 'string' || relativo === '') {
    return { erro: 'Caminho inválido.' }
  }

  const alvo = path.resolve(raiz, relativo)
  const dentro = path.resolve(raiz)
  // `path.relative` some com `..` e symlinks resolvidos por resolve()
  const rel = path.relative(dentro, alvo)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { erro: 'Esse arquivo está fora do projeto.' }
  }

  const ext = path.extname(alvo).toLowerCase()
  if (BINARIOS.has(ext)) {
    return { caminho: relativo, binario: true, erro: 'Este arquivo não é texto.' }
  }

  try {
    const info = await stat(alvo)
    if (!info.isFile()) return { erro: 'Isso não é um arquivo.' }
    if (info.size > LIMITE_BYTES) {
      return {
        caminho: relativo,
        erro: `Arquivo grande demais para abrir aqui (${Math.round(info.size / 1024)} KB).`,
      }
    }

    const conteudo = await readFile(alvo, 'utf8')
    return {
      caminho: relativo,
      conteudo,
      linhas: conteudo.split('\n').length,
      bytes: info.size,
      ext: ext.replace('.', ''),
    }
  } catch (erro) {
    const codigo = erro?.code
    if (codigo === 'ENOENT') {
      return { caminho: relativo, erro: 'Esse arquivo não existe mais no projeto.' }
    }
    return { caminho: relativo, erro: String(erro?.message ?? erro) }
  }
}
