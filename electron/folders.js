/**
 * O mapa de pastas (`MAPA.md` na raiz do projeto) — onde cada coisa mora.
 *
 * Quem escreve é a IA, pela skill `wtf-pastas`. Aqui só lemos: o arquivo é
 * uma árvore ASCII desenhada à mão, e o valor dela é justamente o desenho.
 * Por isso devolvemos DUAS coisas:
 *
 *   `arvore`  o texto cru, preservado caractere a caractere;
 *   `linhas`  a mesma árvore já separada em partes (prefixo, nome, propósito)
 *             para a interface poder desenhar melhor que um `<pre>`.
 *
 * Nada aqui lança: mapa ausente ou malformado é normal, e nunca pode derrubar
 * o painel.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

/** Sistemas de arquivo diferentes, gostos diferentes de maiúscula. */
const NOMES = ['MAPA.md', 'Mapa.md', 'mapa.md']

/** Mapa gigante não cabe na tela nem ajuda ninguém — cortamos. */
const MAX_LINHAS = 200

/** Os caracteres que formam o desenho da árvore. */
const RE_PREFIXO = /^[\s│├└─|+`-]*/
/**
 * `│  ── NEGÓCIO ──` — testada ANTES do prefixo, senão os traços do separador
 * seriam confundidos com desenho de árvore e o nome da seção sairia torto.
 */
const RE_SECAO = /^([\s│├└|]*)[─-]{2,}\s*(.+?)\s*[─-]{2,}$/
/** Duas ou mais colunas de espaço separam o nome do propósito. */
const RE_COLUNA = /\s{2,}/
/** `· detalhe em sistema/MAPA.md` */
const RE_DETALHE = /detalhe\s+em\s+([^\s·,;]+)/i

/**
 * Lê `<dir>/MAPA.md`.
 * @param {string | null | undefined} dir
 * @returns {Promise<{ arvore: string, linhas: object[], atualizadoEm?: string, existe: true } | null>}
 */
export async function lerMapaPastas(dir) {
  if (!dir || typeof dir !== 'string') return null

  let cru = null
  let atualizadoEm
  for (const nome of NOMES) {
    const alvo = path.join(dir, nome)
    try {
      cru = await fs.readFile(alvo, 'utf8')
      const st = await fs.stat(alvo)
      atualizadoEm = new Date(st.mtimeMs).toISOString()
      break
    } catch {
      cru = null // tenta o próximo jeito de escrever o nome
    }
  }
  if (cru === null) return null

  try {
    const arvore = extrairBloco(cru)
    return { arvore, linhas: separarLinhas(arvore), atualizadoEm, existe: true }
  } catch {
    // Parser não é motivo para o painel perder o mapa inteiro.
    return { arvore: '', linhas: [], atualizadoEm, existe: true }
  }
}

/**
 * O primeiro bloco de código do arquivo é a árvore. Sem bloco nenhum, o corpo
 * inteiro serve — um mapa escrito sem cerca ainda é um mapa.
 */
function extrairBloco(texto) {
  const linhas = String(texto).replace(/\r\n?/g, '\n').split('\n')
  let dentro = false
  const bloco = []
  for (const linha of linhas) {
    if (/^\s*```/.test(linha)) {
      if (!dentro) {
        dentro = true
        continue
      }
      return bloco.join('\n').replace(/\s+$/, '')
    }
    if (dentro) bloco.push(linha)
  }
  // Bloco aberto e nunca fechado ainda vale o que foi escrito dentro dele.
  if (bloco.length > 0) return bloco.join('\n').replace(/\s+$/, '')
  return String(texto).replace(/\r\n?/g, '\n').replace(/\s+$/, '')
}

/**
 * Uma linha da árvore vira `{ tipo, prefixo, nome, proposito, detalheEm }`.
 * Linha que não se encaixa em nada vira `pasta` com propósito vazio: melhor
 * mostrar a linha inteira do que engolir uma pasta.
 */
function separarLinhas(arvore) {
  if (!arvore) return []
  const brutas = arvore.split('\n').slice(0, MAX_LINHAS)
  const saida = []
  let viuRaiz = false

  for (const bruta of brutas) {
    const secao = bruta.trimEnd().match(RE_SECAO)
    if (secao) {
      saida.push({
        tipo: 'secao',
        prefixo: secao[1].replace(/\s+$/, ''),
        nome: secao[2].trim(),
        proposito: '',
      })
      continue
    }

    const desenho = bruta.match(RE_PREFIXO)?.[0] ?? ''
    const prefixo = desenho.replace(/\s+$/, '')
    const resto = bruta.slice(desenho.length).trim()

    if (!resto) {
      saida.push({ tipo: 'vazia', prefixo, nome: '', proposito: '' })
      continue
    }

    // A raiz é a primeira linha sem desenho de árvore: `meu-projeto/`.
    if (!viuRaiz && prefixo === '') {
      viuRaiz = true
      saida.push({ tipo: 'raiz', prefixo, nome: resto, proposito: '' })
      continue
    }

    const corte = resto.search(RE_COLUNA)
    const nome = corte === -1 ? resto : resto.slice(0, corte)
    const proposito = corte === -1 ? '' : resto.slice(corte).trim()

    const item = { tipo: 'pasta', prefixo, nome, proposito }
    const detalhe = proposito.match(RE_DETALHE)
    if (detalhe) item.detalheEm = detalhe[1]
    saida.push(item)
  }

  return saida
}
