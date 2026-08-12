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
import {
  ALVOS_GLOBAIS,
  ALVOS_PROJETO,
  HOOKS_GLOBAIS,
  casaClaude,
  comandoHookGlobal,
} from './globalinstall.js'
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
  documentos: {
    titulo: 'Descobrir qual documento vale',
    proposito: 'Ensina a IA a organizar os documentos por assunto e dizer qual é o atual.',
  },
  guardrails: {
    titulo: 'Escrever as regras do que não se faz aqui',
    proposito:
      'Ensina a IA a listar o que é perigoso NESTE projeto — e a obedecer a lista depois.',
  },
  btw: {
    titulo: 'Perguntar sem atrapalhar',
    proposito:
      'Cria o comando /btw, que faz a IA responder uma dúvida sua e voltar ao trabalho.',
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

/*
 * O que aparece quando alguém acrescenta um alvo e esquece do rótulo.
 *
 * Já aconteceu: a skill de guardrails entrou em ALVOS e apareceu na tela de
 * transparência como uma linha SEM NOME NENHUM — justo na tela cujo trabalho
 * é dizer o que vai ser escrito no computador da pessoa. Uma linha muda ali é
 * pior que um nome feio: é a tela falhando na única coisa que ela promete.
 */
const semTexto = (chave) => ({
  titulo: String(chave),
  proposito: 'Ainda sem descrição. Veja o conteúdo abaixo antes de instalar.',
})

/**
 * O pacote inteiro da instalação, pronto para a tela — agora nos DOIS níveis:
 *
 *   `global`  o que vai para `~/.claude/` uma vez por computador (as três
 *             skills e o hook), mais os hooks registrados em `settings.json`.
 *   `projeto` o que vai para dentro do projeto quando a pessoa habilita ali
 *             (`.wtf/bin/wtf-claim.cjs`, `.wtf/MAP-FORMAT.md`, `.gitignore`).
 *
 * `itens`, `hooks` e `gitignore` no topo continuam existindo, com o pacote
 * legado (instalação por projeto), para não quebrar a tela atual enquanto ela
 * ainda os lê.
 *
 * @param {string | null | undefined} dir raiz do projeto observado
 */
export async function lerPacoteInstalacao(dir) {
  const config = dir ? await lerConfig(dir).catch(() => null) : null
  const casa = casaClaude()

  const itens = []
  for (const [chave, [destino, origem]] of Object.entries(ALVOS)) {
    itens.push(await montarItem(dir, chave, destino, origem, config))
  }

  // Nível A — `~/.claude/`. O destino mostrado é o caminho real na máquina:
  // escrever fora do projeto exige dizer exatamente onde.
  const globais = []
  for (const [chave, { destino, origem, comoProjeto }] of Object.entries(ALVOS_GLOBAIS)) {
    const item = await montarItem(casa, chave, destino, origem, config, comoProjeto)
    item.destinoAbsoluto = path.join(casa, destino)
    globais.push(item)
  }

  // Nível B — o projeto. Só o que a pasta `.wtf/` contém: é ela o consentimento.
  const doProjeto = []
  for (const [chave, [destino, origem]] of Object.entries(ALVOS_PROJETO)) {
    doProjeto.push(await montarItem(dir, chave, destino, origem, config))
  }

  const hooksLegado = HOOKS.map(({ evento, matcher }) => ({
    evento,
    matcher: matcher ?? null,
    comando: COMANDO_HOOK,
  }))

  return {
    itens,
    hooks: hooksLegado,
    gitignore: [...GITIGNORE],
    global: {
      caminho: casa,
      itens: globais,
      hooks: HOOKS_GLOBAIS.map(({ evento, matcher }) => ({
        evento,
        matcher: matcher ?? null,
        comando: comandoHookGlobal(),
      })),
      settings: path.join(casa, 'settings.json'),
    },
    projeto: {
      caminho: dir ?? null,
      itens: doProjeto,
      gitignore: [...GITIGNORE],
    },
  }
}

/**
 * @param {string | null | undefined} dir raiz onde o arquivo seria escrito
 * @param {string | null} [chaveIdioma] caminho no formato da instalação por
 *   projeto — é ele que `comIdioma()` reconhece. Os alvos globais têm outro
 *   caminho, então precisam informar o equivalente.
 */
async function montarItem(dir, chave, destino, origem, config, chaveIdioma) {
  const { titulo, proposito } = TEXTOS[chave] ?? semTexto(chave)
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
  conteudo = comIdioma(chaveIdioma === undefined ? destino : chaveIdioma, conteudo, config)
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
