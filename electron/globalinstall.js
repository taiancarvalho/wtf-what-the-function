/**
 * Instalação GLOBAL do WTF — em `~/.claude/`.
 *
 * O modelo tem dois níveis, e eles existem por um motivo:
 *
 *   A) GLOBAL (uma vez por computador). As skills e o hook ficam em
 *      `~/.claude/`, valendo para TODOS os projetos que a pessoa abrir no
 *      Claude Code. Instalado uma vez, nunca mais.
 *
 *   B) POR PROJETO (um clique, dentro do app). Cria a pasta `.wtf/` no projeto.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ A REGRA QUE LIGA OS DOIS — o coração deste desenho:                       │
 * │                                                                          │
 * │   A EXISTÊNCIA DE `.wtf/` NO PROJETO **É** O CONSENTIMENTO.               │
 * │                                                                          │
 * │ O hook global roda em todo projeto, mas SAI EM SILÊNCIO, sem gravar uma   │
 * │ linha, quando o projeto onde ele rodou não tem `.wtf/`. Ou seja: fica     │
 * │ instalado em todo lugar e INERTE POR PADRÃO. Ninguém é observado por ter  │
 * │ instalado o WTF uma vez — só quem pediu, projeto a projeto, pelo app.     │
 * │                                                                          │
 * │ Quem implementa a regra do lado de lá é `skill/hooks/wtf-observer.cjs`.   │
 * │ Quem cria o consentimento do lado de cá é `habilitarProjeto()`.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `~/.claude/settings.json` é arquivo do USUÁRIO e costuma estar cheio (env,
 * model, statusLine, plugins, hooks de outras ferramentas…). Aqui nada é
 * reescrito: lemos, fazemos merge, gravamos backup datado antes de escrever, e
 * mexemos exclusivamente nas entradas que contêm `wtf-observer`.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ALVOS, ORIGEM_SKILL, comIdioma } from './installer.js'

/**
 * Onde fica o `.claude` do usuário. Injetável por `WTF_HOME` (ou por parâmetro)
 * para que os testes rodem contra uma cópia em diretório temporário — nunca
 * contra o `~/.claude` real de quem está desenvolvendo.
 */
export function casaClaude(base) {
  return base || process.env.WTF_HOME || path.join(os.homedir(), '.claude')
}

/**
 * O que vai para `~/.claude/`: as três skills e o hook. O `.wtf/` (CLI e
 * MAP-FORMAT) NÃO entra aqui — é ele o consentimento por projeto.
 *
 * Cada entrada guarda também o caminho equivalente na instalação por projeto,
 * porque é essa chave que `comIdioma()` reconhece para aplicar o idioma.
 */
export const ALVOS_GLOBAIS = {
  skill: { destino: 'skills/wtf/SKILL.md', origem: 'SKILL.md', comoProjeto: ALVOS.skill[0] },
  mapear: {
    destino: 'skills/wtf-mapear/SKILL.md',
    origem: 'mapear/SKILL.md',
    comoProjeto: ALVOS.mapear[0],
  },
  pastas: {
    destino: 'skills/wtf-pastas/SKILL.md',
    origem: 'pastas/SKILL.md',
    comoProjeto: ALVOS.pastas[0],
  },
  documentos: {
    destino: 'skills/wtf-documentos/SKILL.md',
    origem: 'documentos/SKILL.md',
    comoProjeto: ALVOS.documentos[0],
  },
  guardrails: {
    destino: 'skills/wtf-guardrails/SKILL.md',
    origem: 'guardrails/SKILL.md',
    comoProjeto: ALVOS.guardrails[0],
  },
  hook: { destino: 'hooks/wtf-observer.cjs', origem: 'hooks/wtf-observer.cjs', comoProjeto: null },
}

/** O que vai para dentro do projeto quando a pessoa habilita ali. */
export const ALVOS_PROJETO = {
  cli: ALVOS.cli,
  formato: ALVOS.formato,
}

/** Os mesmos três eventos da instalação por projeto. */
export const HOOKS_GLOBAIS = [
  { evento: 'SessionStart', matcher: null },
  { evento: 'Stop', matcher: null },
  { evento: 'PostToolUse', matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash' },
]

/**
 * O comando registrado em `~/.claude/settings.json`.
 *
 * Para o `~/.claude` de verdade usamos `$HOME`, que é legível para quem abrir o
 * arquivo e sobrevive a mudanças de usuário. Para uma casa injetada (testes)
 * gravamos o caminho absoluto, porque `$HOME` apontaria para outro lugar.
 */
export function comandoHookGlobal(base) {
  const casa = casaClaude(base)
  const padrao = path.join(os.homedir(), '.claude')
  const alvo = path.join(casa, 'hooks/wtf-observer.cjs')
  return casa === padrao ? 'node "$HOME/.claude/hooks/wtf-observer.cjs"' : `node "${alvo}"`
}

// ------------------------------------------------------------------ estado

/**
 * @returns {Promise<{skills: Record<string, boolean>, hook: boolean,
 *   hooksRegistrados: boolean, instalado: boolean, caminho: string}>}
 */
export async function estadoGlobal(base) {
  const casa = casaClaude(base)
  const skills = {}
  for (const [chave, { destino }] of Object.entries(ALVOS_GLOBAIS)) {
    if (chave === 'hook') continue
    skills[chave] = await existe(path.join(casa, destino))
  }
  const hook = await existe(path.join(casa, ALVOS_GLOBAIS.hook.destino))
  const settings = await lerJson(path.join(casa, 'settings.json'))
  const hooksRegistrados = temNossoHook(settings)
  const instalado = Object.values(skills).every(Boolean) && hook && hooksRegistrados
  return { skills, hook, hooksRegistrados, instalado, caminho: casa }
}

function temNossoHook(settings) {
  const h = settings?.hooks
  if (!h) return false
  return Object.values(h)
    .flat()
    .some((g) => (g?.hooks ?? []).some((x) => String(x?.command ?? '').includes('wtf-observer')))
}

// --------------------------------------------------------------- instalar

/**
 * Escreve as skills e o hook em `~/.claude/` e registra os hooks no
 * `settings.json` do usuário. Idempotente: rodar duas vezes não duplica nada.
 */
export async function instalarGlobal(config, base) {
  const casa = casaClaude(base)
  const feito = []

  for (const [chave, { destino, origem, comoProjeto }] of Object.entries(ALVOS_GLOBAIS)) {
    const alvo = path.join(casa, destino)
    await fs.mkdir(path.dirname(alvo), { recursive: true })
    if (await existe(alvo)) await backup(alvo)
    if (chave === 'hook') {
      await fs.copyFile(path.join(ORIGEM_SKILL, origem), alvo)
      await fs.chmod(alvo, 0o755)
    } else {
      // A skill nasce já no idioma escolhido — instalar a instrução errada e
      // corrigir depois deixaria uma janela em que o agente escreve errado.
      const bruto = await fs.readFile(path.join(ORIGEM_SKILL, origem), 'utf8')
      await fs.writeFile(alvo, comIdioma(comoProjeto, bruto, config), 'utf8')
    }
    feito.push(destino)
  }

  await mesclarHooks(casa, base)
  feito.push('settings.json')
  return { ok: true, caminho: casa, arquivos: feito }
}

/**
 * Merge cirúrgico no `settings.json` do usuário: só acrescenta entradas de hook
 * que ainda não existem. Toda chave que já estava lá (env, model, statusLine,
 * enabledPlugins, outros grupos de PreToolUse…) segue intacta e na mesma ordem.
 */
async function mesclarHooks(casa, base) {
  const alvo = path.join(casa, 'settings.json')
  const atual = (await lerJson(alvo)) ?? {}
  if (await existe(alvo)) await backup(alvo)

  const novo = structuredClone(atual)
  novo.hooks ??= {}
  const comando = comandoHookGlobal(base)
  for (const { evento, matcher } of HOOKS_GLOBAIS) {
    novo.hooks[evento] ??= []
    const jaTem = novo.hooks[evento].some((g) =>
      (g?.hooks ?? []).some((x) => String(x?.command ?? '').includes('wtf-observer')),
    )
    if (jaTem) continue
    novo.hooks[evento].push({
      ...(matcher ? { matcher } : {}),
      hooks: [{ type: 'command', command: comando, timeout: 10 }],
    })
  }
  await fs.mkdir(path.dirname(alvo), { recursive: true })
  await fs.writeFile(alvo, JSON.stringify(novo, null, 2) + '\n', 'utf8')
}

// ------------------------------------------------------------ desinstalar

/** Remove só o que é do WTF. O resto do `~/.claude` fica exatamente como estava. */
export async function desinstalarGlobal(base) {
  const casa = casaClaude(base)
  const removidos = []

  for (const { destino } of Object.values(ALVOS_GLOBAIS)) {
    const alvo = path.join(casa, destino)
    if (!(await existe(alvo))) continue
    await fs.rm(alvo)
    removidos.push(destino)
    // A pasta da skill só existia por causa dela; se ficou vazia, some.
    await fs.rmdir(path.dirname(alvo)).catch(() => {})
  }

  const alvo = path.join(casa, 'settings.json')
  const atual = await lerJson(alvo)
  if (atual?.hooks) {
    await backup(alvo)
    for (const evento of Object.keys(atual.hooks)) {
      atual.hooks[evento] = atual.hooks[evento]
        .map((g) => ({
          ...g,
          hooks: (g.hooks ?? []).filter((x) => !String(x?.command ?? '').includes('wtf-observer')),
        }))
        .filter((g) => (g.hooks ?? []).length > 0)
      if (atual.hooks[evento].length === 0) delete atual.hooks[evento]
    }
    if (Object.keys(atual.hooks).length === 0) delete atual.hooks
    await fs.writeFile(alvo, JSON.stringify(atual, null, 2) + '\n', 'utf8')
    removidos.push('settings.json (entradas do wtf-observer)')
  }

  return { ok: true, caminho: casa, removidos }
}

// ------------------------------------------------------- habilitar projeto

/**
 * O clique de "habilitar neste projeto". Cria `.wtf/` — que É o consentimento —
 * com o CLI que o agente chama e o documento de formato do mapa.
 */
export async function habilitarProjeto(dir, config) {
  if (!dir) return { ok: false, arquivos: [] }
  const feito = []
  for (const [chave, [rel, origem]] of Object.entries(ALVOS_PROJETO)) {
    const alvo = path.join(dir, rel)
    await fs.mkdir(path.dirname(alvo), { recursive: true })
    if (await existe(alvo)) await backup(alvo)
    await fs.copyFile(path.join(ORIGEM_SKILL, origem), alvo)
    if (chave === 'cli') await fs.chmod(alvo, 0o755)
    feito.push(rel)
  }
  await garantirGitignore(dir)
  feito.push('.gitignore')
  void config // o idioma vive nas skills (globais), não nos arquivos do projeto
  return { ok: true, arquivos: feito }
}

/**
 * Desliga o WTF neste projeto: sem `.wtf/bin/wtf-claim.cjs` e sem `.wtf/`
 * o hook global volta a sair em silêncio aqui.
 *
 * NUNCA apaga `events.jsonl`, `map.json`, `validated.json`, `resolved.json` nem
 * `config.json`: isso é histórico da pessoa, não arquivo nosso. Por isso a
 * pasta `.wtf/` só é removida se tiver ficado vazia.
 */
export async function desabilitarProjeto(dir) {
  if (!dir) return { ok: false, removidos: [] }
  const removidos = []
  for (const [rel] of Object.values(ALVOS_PROJETO)) {
    const alvo = path.join(dir, rel)
    if (!(await existe(alvo))) continue
    await fs.rm(alvo)
    removidos.push(rel)
  }
  await fs.rmdir(path.join(dir, '.wtf/bin')).catch(() => {})
  await fs.rmdir(path.join(dir, '.wtf')).catch(() => {})
  return { ok: true, removidos }
}

/** @returns {Promise<{habilitado: boolean, cli: boolean, formato: boolean, pasta: boolean}>} */
export async function estadoProjeto(dir) {
  if (!dir) return { habilitado: false, cli: false, formato: false, pasta: false }
  const pasta = await existe(path.join(dir, '.wtf'))
  const cli = await existe(path.join(dir, ALVOS_PROJETO.cli[0]))
  const formato = await existe(path.join(dir, ALVOS_PROJETO.formato[0]))
  // Basta a pasta existir para o hook gravar — é ela o consentimento. O CLI e o
  // MAP-FORMAT são o que a instalação completa acrescenta.
  return { habilitado: pasta, cli, formato, pasta }
}

// ---------------------------------------------------------------- helpers

async function existe(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function lerJson(p) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'))
  } catch {
    return null
  }
}

async function backup(p) {
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
  await fs.copyFile(p, `${p}.wtf-backup-${carimbo}`)
}

const GITIGNORE = ['# WTF — histórico local do que a IA declarou', '.wtf/events.jsonl']

async function garantirGitignore(dir) {
  const alvo = path.join(dir, '.gitignore')
  const linha = GITIGNORE[GITIGNORE.length - 1]
  let conteudo = ''
  try {
    conteudo = await fs.readFile(alvo, 'utf8')
  } catch {
    /* não existe ainda */
  }
  if (conteudo.split('\n').some((l) => l.trim() === linha)) return
  const sufixo = conteudo && !conteudo.endsWith('\n') ? '\n' : ''
  await fs.appendFile(alvo, `${sufixo}\n${GITIGNORE.join('\n')}\n`, 'utf8')
}
