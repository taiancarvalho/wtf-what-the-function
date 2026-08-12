/**
 * Os documentos que o WTF pediu à IA e a IA escreveu no projeto.
 *
 * São diferentes de tudo o mais que este app toca. Os arquivos de `installer.js`
 * são peças do WTF: instalar e desinstalar é ligá-lo e desligá-lo. Estes aqui
 * são CONTEÚDO — o mapa das pastas, as regras do projeto, o vocabulário das
 * partes. Foram escritos a pedido da pessoa, moram na raiz do projeto dela, e
 * podem ter sido editados à mão depois.
 *
 * Por isso ganham porta própria para sair. Quem experimentou o mapa e não
 * gostou não deveria precisar desinstalar o WTF inteiro para se livrar de um
 * `MAPA.md` — nem procurar o arquivo no computador para apagar por fora.
 *
 * Duas regras:
 *   - a lista de apagáveis é FECHADA e escrita aqui. O renderer manda uma
 *     chave ('guardrails', 'pastas'…), nunca um caminho: caminho vindo de
 *     fora é como se apaga o que não devia.
 *   - só apaga o que existe, e só dentro do projeto aberto.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * chave → arquivo no projeto.
 *
 * Note que `.wtf/events.jsonl` NÃO está aqui: o histórico do que a IA declarou
 * não é documento gerado, é registro. Apagá-lo é outra decisão, com outro peso,
 * e não vai escondida atrás de um ícone de lixeira.
 */
export const GERADOS = {
  guardrails: 'GUARDRAILS.md',
  pastas: 'MAPA.md',
  mapa: '.wtf/map.json',
  documentos: '.wtf/docs.json',
  historico: '.wtf/history.json',
}

async function informacao(dir, rel) {
  try {
    const s = await fs.stat(path.join(dir, rel))
    if (!s.isFile()) return null
    return { bytes: s.size, alteradoEm: new Date(s.mtimeMs).toISOString() }
  } catch {
    return null
  }
}

/** O que existe hoje, com tamanho e data. Só leitura. */
export async function listarGerados(dir) {
  if (!dir) return []
  const saida = []
  for (const [chave, rel] of Object.entries(GERADOS)) {
    const info = await informacao(dir, rel)
    if (info) saida.push({ chave, arquivo: rel, ...info })
  }
  return saida
}

/**
 * Apaga UM documento gerado.
 *
 * Sem backup e sem lixeira do sistema: o arquivo mora num repositório Git, e
 * quem quer voltar atrás volta pelo histórico do projeto — que é a ferramenta
 * que já existe para isso, e é melhor que qualquer cópia paralela que
 * inventássemos aqui. O que este módulo garante é que a pessoa nunca apague
 * outra coisa por engano.
 */
export async function apagarGerado(dir, chave) {
  if (!dir) return { erro: 'Nenhum projeto aberto.' }
  const rel = GERADOS[chave]
  if (!rel) return { erro: 'Esse arquivo não é apagável pelo painel.' }

  const alvo = path.join(dir, rel)
  // Cinto de segurança: `GERADOS` é fechado, mas se um dia alguém puser um
  // `..` numa entrada, o erro para aqui em vez de apagar fora do projeto.
  const raiz = path.resolve(dir)
  if (!path.resolve(alvo).startsWith(raiz + path.sep)) {
    return { erro: 'Caminho fora do projeto.' }
  }

  try {
    await fs.rm(alvo)
    return { ok: true, arquivo: rel }
  } catch (erro) {
    if (erro?.code === 'ENOENT') return { ok: true, arquivo: rel }
    return { erro: `Não consegui apagar: ${String(erro?.message ?? erro)}` }
  }
}
