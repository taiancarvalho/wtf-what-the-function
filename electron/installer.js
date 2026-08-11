/**
 * Instalação do WTF dentro de um projeto observado.
 *
 * É a única parte do WTF que ESCREVE no projeto do usuário. Por isso:
 *   - idempotente (rodar duas vezes não duplica nada);
 *   - faz backup datado de qualquer arquivo que já exista;
 *   - nunca remove hooks ou permissões que já estavam lá;
 *   - `desinstalar()` desfaz tudo o que instalou.
 *
 * O que é escrito:
 *   .claude/skills/wtf/SKILL.md      instrução que o agente lê
 *   .claude/hooks/wtf-observer.cjs   registro determinístico do que foi tocado
 *   .wtf/bin/wtf-claim.cjs           CLI que o agente chama para declarar
 *   .claude/settings.local.json      registro dos hooks (merge, nunca overwrite)
 *   .gitignore                       ignora .wtf/events.jsonl
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ORIGEM = path.join(__dirname, '..', 'skill')

/** destino no projeto → arquivo de origem dentro de `skill/` */
const ALVOS = {
  skill: ['.claude/skills/wtf/SKILL.md', 'SKILL.md'],
  mapear: ['.claude/skills/wtf-mapear/SKILL.md', 'mapear/SKILL.md'],
  formato: ['.wtf/MAP-FORMAT.md', 'MAP-FORMAT.md'],
  hook: ['.claude/hooks/wtf-observer.cjs', 'hooks/wtf-observer.cjs'],
  cli: ['.wtf/bin/wtf-claim.cjs', 'bin/wtf-claim.cjs'],
}

/** Arquivos que precisam de bit de execução. */
const EXECUTAVEIS = new Set(['hook', 'cli'])

const COMANDO_HOOK = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/wtf-observer.cjs"'

// ------------------------------------------------------------------ estado

export async function estadoInstalacao(dir) {
  const presentes = {}
  for (const [chave, [rel]] of Object.entries(ALVOS)) {
    presentes[chave] = await existe(path.join(dir, rel))
  }
  const settings = await lerJson(path.join(dir, '.claude/settings.local.json'))
  presentes.hooksRegistrados = temNossoHook(settings)
  presentes.instalado = Object.values(presentes).every(Boolean)
  // O mapa é escrito pelo onboarding, não pela instalação.
  presentes.mapeado = await existe(path.join(dir, '.wtf/map.json'))
  return presentes
}

function temNossoHook(settings) {
  const h = settings?.hooks
  if (!h) return false
  return Object.values(h)
    .flat()
    .some((grupo) =>
      (grupo?.hooks ?? []).some((x) => String(x?.command ?? '').includes('wtf-observer')),
    )
}

// --------------------------------------------------------------- instalar

export async function instalar(dir) {
  const feito = []

  // 1. arquivos
  for (const [chave, [rel, origem]] of Object.entries(ALVOS)) {
    const destino = path.join(dir, rel)
    await fs.mkdir(path.dirname(destino), { recursive: true })
    if (await existe(destino)) await backup(destino)
    await fs.copyFile(path.join(ORIGEM, origem), destino)
    if (EXECUTAVEIS.has(chave)) await fs.chmod(destino, 0o755)
    feito.push(rel)
  }

  // 2. registro dos hooks — merge, preservando o que já existe
  const alvoSettings = path.join(dir, '.claude/settings.local.json')
  const atual = (await lerJson(alvoSettings)) ?? {}
  if (await existe(alvoSettings)) await backup(alvoSettings)

  const novo = structuredClone(atual)
  novo.hooks ??= {}
  for (const evento of ['SessionStart', 'Stop', 'PostToolUse']) {
    novo.hooks[evento] ??= []
    const jaTem = novo.hooks[evento].some((g) =>
      (g?.hooks ?? []).some((x) => String(x?.command ?? '').includes('wtf-observer')),
    )
    if (jaTem) continue
    novo.hooks[evento].push({
      ...(evento === 'PostToolUse' ? { matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash' } : {}),
      hooks: [{ type: 'command', command: COMANDO_HOOK, timeout: 10 }],
    })
  }
  await fs.writeFile(alvoSettings, JSON.stringify(novo, null, 2) + '\n', 'utf8')
  feito.push('.claude/settings.local.json')

  // 3. o log de eventos é estado local, não entra no controle de versão
  await garantirGitignore(dir)

  return { ok: true, arquivos: feito }
}

// ------------------------------------------------------------ desinstalar

export async function desinstalar(dir) {
  const removidos = []
  for (const [rel] of Object.values(ALVOS)) {
    const alvo = path.join(dir, rel)
    if (await existe(alvo)) {
      await fs.rm(alvo)
      removidos.push(rel)
    }
  }

  const alvoSettings = path.join(dir, '.claude/settings.local.json')
  const atual = await lerJson(alvoSettings)
  if (atual?.hooks) {
    await backup(alvoSettings)
    for (const evento of Object.keys(atual.hooks)) {
      atual.hooks[evento] = atual.hooks[evento]
        .map((g) => ({
          ...g,
          hooks: (g.hooks ?? []).filter(
            (x) => !String(x?.command ?? '').includes('wtf-observer'),
          ),
        }))
        .filter((g) => (g.hooks ?? []).length > 0)
      if (atual.hooks[evento].length === 0) delete atual.hooks[evento]
    }
    if (Object.keys(atual.hooks).length === 0) delete atual.hooks
    await fs.writeFile(alvoSettings, JSON.stringify(atual, null, 2) + '\n', 'utf8')
    removidos.push('registro dos hooks')
  }

  // .wtf/events.jsonl é histórico do usuário — nunca apagamos.
  return { ok: true, removidos }
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

/** Cópia datada ao lado do original. Nada é sobrescrito sem rede de segurança. */
async function backup(p) {
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
  await fs.copyFile(p, `${p}.wtf-backup-${carimbo}`)
}

async function garantirGitignore(dir) {
  const alvo = path.join(dir, '.gitignore')
  const linha = '.wtf/events.jsonl'
  let conteudo = ''
  try {
    conteudo = await fs.readFile(alvo, 'utf8')
  } catch {
    /* não existe ainda */
  }
  if (conteudo.split('\n').some((l) => l.trim() === linha)) return
  const sufixo = conteudo && !conteudo.endsWith('\n') ? '\n' : ''
  await fs.appendFile(alvo, `${sufixo}\n# WTF — histórico local do que a IA declarou\n${linha}\n`, 'utf8')
}
