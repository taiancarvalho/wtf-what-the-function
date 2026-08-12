/**
 * O que a instalação do WTF escreve no projeto — antes de escrever.
 *
 * A tese do produto é "não acredite, veja a prova". Pedir um clique para
 * escrever seis arquivos no projeto de alguém sem mostrar o conteúdo de nenhum
 * contradiz isso. Este módulo monta o pacote completo — cada arquivo, com o
 * texto integral, o que já existe e o que mudaria — para a interface poder
 * mostrar tudo ANTES do consentimento.
 *
 * Regra que sustenta o módulo: nada aqui é escrito à mão. A lista de alvos, os
 * hooks e as linhas do `.gitignore` vêm das MESMAS constantes que `installer.js`
 * aplica. Se as listas pudessem divergir, a tela mentiria — e uma tela de
 * transparência que mente é pior que não ter tela nenhuma.
 *
 * Só o texto humano (título e propósito de cada item) mora aqui: é a única
 * parte que o instalador não precisa saber.
 *
 * Nada lança. Origem ausente vira conteúdo vazio com `erro`.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { ALVOS, COMANDO_HOOK, GITIGNORE, HOOKS, ORIGEM_SKILL, comIdioma } from './installer.js'
import { lerConfig } from './config.js'

/**
 * Rótulo humano por chave de alvo. Curto, em português, sem jargão: quem lê
 * isto é o dono do projeto, não quem programa.
 */
const TEXTOS = {
  skill: {
    titulo: 'Declarar o que está fazendo',
    proposito: 'Manda a IA avisar você antes de começar e depois de terminar cada trabalho.',
  },
  mapear: {
    titulo: 'Traduzir o projeto para o seu idioma',
    proposito: 'Ensina a IA a descrever as partes do projeto com nomes que você entende.',
  },
  pastas: {
    titulo: 'Explicar para que serve cada pasta',
    proposito: 'Ensina a IA a desenhar o mapa das pastas do projeto em uma frase cada.',
  },
  formato: {
    titulo: 'Formato do mapa do projeto',
    proposito: 'Documento de referência que diz como o mapa deve ser escrito.',
  },
  hook: {
    titulo: 'Registro automático do que a IA toca',
    proposito: 'Anota cada arquivo alterado, mesmo quando a IA esquece de avisar.',
  },
  cli: {
    titulo: 'Canal de recado da IA',
    proposito: 'O programinha que a IA chama para registrar o que fez.',
  },
}

const SEM_TEXTO = { titulo: '', proposito: '' }

/**
 * O pacote inteiro da instalação, pronto para a tela.
 *
 * @param {string | null | undefined} dir raiz do projeto observado
 * @returns {Promise<{ itens: object[], hooks: object[], gitignore: string[] }>}
 */
export async function lerPacoteInstalacao(dir) {
  const config = dir ? await lerConfig(dir).catch(() => null) : null
  const itens = []

  for (const [chave, [destino, origem]] of Object.entries(ALVOS)) {
    itens.push(await montarItem(dir, chave, destino, origem, config))
  }

  return {
    itens,
    hooks: HOOKS.map(({ evento, matcher }) => ({
      evento,
      matcher: matcher ?? null,
      comando: COMANDO_HOOK,
    })),
    gitignore: [...GITIGNORE],
  }
}

async function montarItem(dir, chave, destino, origem, config) {
  const { titulo, proposito } = TEXTOS[chave] ?? SEM_TEXTO
  const item = { destino, origem, titulo, proposito, conteudo: '', bytes: 0, jaExiste: false, igual: false }

  let conteudo = null
  try {
    conteudo = await fs.readFile(path.join(ORIGEM_SKILL, origem), 'utf8')
  } catch (erro) {
    // Origem faltando é falha nossa, não do usuário — mas a tela precisa
    // mostrar o resto do pacote em vez de sumir inteira.
    item.erro = `Não foi possível ler o arquivo de origem: ${String(erro?.message ?? erro)}`
    return item
  }

  // O que vai para o disco é o original já com o idioma escolhido aplicado —
  // é esse texto que a pessoa precisa ver, não o de antes.
  conteudo = comIdioma(destino, conteudo, config)
  item.conteudo = conteudo
  item.bytes = Buffer.byteLength(conteudo, 'utf8')

  if (!dir) return item
  try {
    const atual = await fs.readFile(path.join(dir, destino), 'utf8')
    item.jaExiste = true
    item.igual = atual === conteudo
  } catch {
    /* ainda não instalado: jaExiste/igual continuam false */
  }
  return item
}
