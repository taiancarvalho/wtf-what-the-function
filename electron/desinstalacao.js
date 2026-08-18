/**
 * Tirar o WTF de tudo quanto é lugar — o `wtf --del`.
 *
 * O WTF escreve em três lugares: dentro de cada projeto onde foi instalado, em
 * `~/.claude` quando a instalação é global, e na pasta de dados do próprio
 * aplicativo. Quem instalou em oito projetos ao longo de meses não lembra
 * quais são os oito, e sair caçando `.claude/skills/wtf*` à mão é o tipo de
 * limpeza que fica pela metade.
 *
 * O QUE ESTE MÓDULO NÃO REMOVE, e é decisão, não esquecimento:
 *
 *   - `.wtf/` de cada projeto, com o que a IA declarou, as traduções já pagas,
 *     o que você aprovou e os avisos que encerrou. É histórico da PESSOA, não
 *     componente nosso. Some `.wtf/bin/` e `.wtf/MAP-FORMAT.md`, que são peças
 *     do WTF; o resto fica, e o comando diz onde.
 *   - O que estiver escrito em `AGENTS.md` e `GEMINI.md` fora dos nossos
 *     marcadores — esses arquivos costumam ser de quem trabalha no projeto.
 *   - O clone do próprio WTF. Quem apaga a pasta do aplicativo é você.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { ALVOS, ALVOS_PORTATEIS, desinstalar } from './installer.js'
import { casaClaude, desinstalarGlobal, estadoGlobal } from './globalinstall.js'
import { casaProjetos, lerProjetos } from './projects.js'

async function existe(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/**
 * O que o WTF deixou NESTE projeto, conferido no disco.
 *
 * A lista de projetos conhecidos diz onde procurar; ela não diz o que está lá.
 * Um projeto pode ter sido aberto e nunca instalado, ter sido limpo à mão, ou
 * ter só metade das peças — e prometer remover o que não existe é tão ruim
 * quanto esquecer o que existe.
 */
export async function itensDoProjeto(dir) {
  const achados = []

  for (const [rel] of Object.values(ALVOS)) {
    if (await existe(path.join(dir, rel))) achados.push(rel)
  }

  // Nos portáteis só conta o nosso trecho: o arquivo pode existir sem ter
  // nada do WTF dentro.
  for (const rel of ALVOS_PORTATEIS) {
    const alvo = path.join(dir, rel)
    if (!(await existe(alvo))) continue
    const texto = await fs.readFile(alvo, 'utf8').catch(() => '')
    if (texto.includes('<!-- wtf:inicio -->')) achados.push(`${rel} (só o trecho do WTF)`)
  }

  const settings = path.join(dir, '.claude/settings.local.json')
  if (await existe(settings)) {
    const texto = await fs.readFile(settings, 'utf8').catch(() => '')
    if (texto.includes('wtf-observer')) achados.push('.claude/settings.local.json (só o hook)')
  }

  return achados
}

/** O histórico que vai FICAR, para o comando poder dizer onde ele está. */
export async function historicoPreservado(dir) {
  const guardados = ['events.jsonl', 'map.json', 'translations.json', 'validated.json', 'resolved.json', 'config.json']
  const fica = []
  for (const nome of guardados) {
    if (await existe(path.join(dir, '.wtf', nome))) fica.push(nome)
  }
  return fica
}

/**
 * Tudo que será tocado, sem tocar em nada. É esta lista que a pessoa lê antes
 * de confirmar — e um comando destrutivo que não mostra o que vai fazer não
 * merece confirmação nenhuma.
 */
export async function levantar(base) {
  const projetos = []
  for (const p of await lerProjetos(base)) {
    if (p.sumiu) continue
    const itens = await itensDoProjeto(p.caminho)
    if (itens.length === 0) continue
    projetos.push({ ...p, itens, historico: await historicoPreservado(p.caminho) })
  }

  const global = await estadoGlobal(base)
  const registro = path.join(await casaProjetos(base), 'projetos.json')

  return {
    projetos,
    global: global.instalado || global.hook || Object.values(global.skills).some(Boolean)
      ? { caminho: casaClaude(base), skills: global.skills, hook: global.hook }
      : null,
    registro: (await existe(registro)) ? registro : null,
    nada: projetos.length === 0 && !global.instalado,
  }
}

/**
 * Remove. Nunca lança por causa de UM projeto: uma pasta protegida no meio da
 * lista não pode impedir a limpeza das outras — o que falhou é relatado.
 */
export async function remover(levantamento, base) {
  const feitos = []
  const falhas = []

  for (const p of levantamento.projetos) {
    try {
      const r = await desinstalar(p.caminho)
      feitos.push({ caminho: p.caminho, nome: p.nome, removidos: r.removidos })
    } catch (erro) {
      falhas.push({ caminho: p.caminho, erro: String(erro?.message ?? erro) })
    }
  }

  if (levantamento.global) {
    try {
      await desinstalarGlobal(base)
      feitos.push({ caminho: levantamento.global.caminho, nome: 'instalação global' })
    } catch (erro) {
      falhas.push({ caminho: levantamento.global.caminho, erro: String(erro?.message ?? erro) })
    }
  }

  // O registro de projetos é do aplicativo, não do projeto de ninguém: sai por
  // último, quando já não há mais o que ele aponte.
  if (levantamento.registro) {
    try {
      await fs.rm(levantamento.registro, { force: true })
      feitos.push({ caminho: levantamento.registro, nome: 'lista de projetos conhecidos' })
    } catch (erro) {
      falhas.push({ caminho: levantamento.registro, erro: String(erro?.message ?? erro) })
    }
  }

  return { feitos, falhas }
}
