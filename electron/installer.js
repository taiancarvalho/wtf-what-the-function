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
import { lerConfig } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ORIGEM = path.join(__dirname, '..', 'skill')

/**
 * Onde moram os arquivos de origem. Exportada porque `disclosure.js` precisa
 * ler exatamente os MESMOS arquivos que serão copiados — se as duas partes
 * resolvessem o caminho por conta própria, a tela poderia mostrar um conteúdo
 * e a instalação escrever outro.
 */
export const ORIGEM_SKILL = ORIGEM

/** destino no projeto → arquivo de origem dentro de `skill/` */
export const ALVOS = {
  skill: ['.claude/skills/wtf/SKILL.md', 'SKILL.md'],
  mapear: ['.claude/skills/wtf-mapear/SKILL.md', 'mapear/SKILL.md'],
  pastas: ['.claude/skills/wtf-pastas/SKILL.md', 'pastas/SKILL.md'],
  documentos: ['.claude/skills/wtf-documentos/SKILL.md', 'documentos/SKILL.md'],
  guardrails: ['.claude/skills/wtf-guardrails/SKILL.md', 'guardrails/SKILL.md'],
  /*
   * Fora do prefixo `wtf-` de propósito.
   *
   * Este é o único alvo que a PESSOA digita, e ela digita no meio de um
   * trabalho em andamento: `/btw por que isso demora tanto?`. `/wtf-btw` seria
   * mais arrumado e ninguém usaria.
   */
  btw: ['.claude/skills/btw/SKILL.md', 'btw/SKILL.md'],
  formato: ['.wtf/MAP-FORMAT.md', 'MAP-FORMAT.md'],
  hook: ['.claude/hooks/wtf-observer.cjs', 'hooks/wtf-observer.cjs'],
  cli: ['.wtf/bin/wtf-claim.cjs', 'bin/wtf-claim.cjs'],
}

/** Arquivos que precisam de bit de execução. */
const EXECUTAVEIS = new Set(['hook', 'cli'])

export const COMANDO_HOOK = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/wtf-observer.cjs"'

/**
 * Os hooks que serão registrados em `.claude/settings.local.json`. É esta lista
 * que `instalar()` aplica e que `disclosure.js` mostra — uma só definição, para
 * a tela nunca prometer algo diferente do que é escrito.
 */
export const HOOKS = [
  { evento: 'SessionStart', matcher: null },
  { evento: 'Stop', matcher: null },
  { evento: 'PostToolUse', matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash' },
]

/** Linhas acrescentadas ao `.gitignore` do projeto. */
export const GITIGNORE = ['# WTF — histórico local do que a IA declarou', '.wtf/events.jsonl']

// ------------------------------------------------------------------ estado

/**
 * O estado nos DOIS níveis.
 *
 * Os campos antigos continuam existindo e com significado coerente, para quem
 * já os lê não quebrar:
 *   - `skill`/`mapear`/`pastas`/`hook`: presentes se estiverem instalados AQUI
 *     (modo antigo, por projeto) OU em `~/.claude` (modo novo, global) — o que
 *     interessa a quem lê é "o agente tem esta instrução disponível?".
 *   - `cli`/`formato`: sempre do projeto; são parte do "habilitar aqui".
 *   - `hooksRegistrados`: hook registrado no settings local OU no global.
 *   - `instalado`: tudo disponível E este projeto habilitado (`.wtf/` existe).
 *     Continua significando "o WTF funciona neste projeto".
 *   - `mapeado`: inalterado.
 * E dois campos novos: `global` e `projeto`.
 *
 * Importação dinâmica de propósito: `globalinstall.js` importa constantes deste
 * arquivo, e um import estático nos dois sentidos criaria um ciclo.
 */
export async function estadoInstalacao(dir) {
  const { estadoGlobal, estadoProjeto } = await import('./globalinstall.js')
  const [global, projeto] = await Promise.all([estadoGlobal(), estadoProjeto(dir)])

  const local = {}
  for (const [chave, [rel]] of Object.entries(ALVOS)) {
    local[chave] = await existe(path.join(dir, rel))
  }
  const settings = await lerJson(path.join(dir, '.claude/settings.local.json'))
  const hooksLocais = temNossoHook(settings)

  const presentes = {
    skill: local.skill || global.skills.skill,
    mapear: local.mapear || global.skills.mapear,
    pastas: local.pastas || global.skills.pastas,
    documentos: local.documentos || global.skills.documentos,
    guardrails: local.guardrails || global.skills.guardrails,
    btw: local.btw || global.skills.btw,
    hook: local.hook || global.hook,
    cli: local.cli,
    formato: local.formato,
    hooksRegistrados: hooksLocais || global.hooksRegistrados,
  }
  presentes.instalado = Object.values(presentes).every(Boolean) && projeto.habilitado

  /*
   * Habilitado aqui, mas faltando peça.
   *
   * Toda vez que o WTF ganha uma skill nova, ela entra em ALVOS — e todo
   * projeto instalado ANTES dela passa a falhar o `every(Boolean)` acima.
   * Sem esta distinção o app dizia "o WTF não está ligado neste projeto" para
   * quem tinha ligado semanas atrás, e oferecia instalar do zero o que já
   * estava quase todo lá. Quem já disse sim uma vez não deve ser perguntado de
   * novo: deve ser avisado de que há uma peça nova, e ela é a mesma
   * `instalar()` idempotente que roda por cima.
   */
  presentes.desatualizado = Boolean(projeto.habilitado) && !presentes.instalado
  // O mapa é escrito pelo onboarding, não pela instalação.
  presentes.mapeado = await existe(path.join(dir, '.wtf/map.json'))
  presentes.global = global
  presentes.projeto = projeto
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

  // As skills nascem no idioma configurado — o padrão do arquivo de origem é
  // português, e reescrever aqui evita instalar a instrução errada.
  await aplicarIdiomaNaSkill(dir, await lerConfig(dir))

  // 2. registro dos hooks — merge, preservando o que já existe
  const alvoSettings = path.join(dir, '.claude/settings.local.json')
  const atual = (await lerJson(alvoSettings)) ?? {}
  if (await existe(alvoSettings)) await backup(alvoSettings)

  const novo = structuredClone(atual)
  novo.hooks ??= {}
  for (const { evento, matcher } of HOOKS) {
    novo.hooks[evento] ??= []
    const jaTem = novo.hooks[evento].some((g) =>
      (g?.hooks ?? []).some((x) => String(x?.command ?? '').includes('wtf-observer')),
    )
    if (jaTem) continue
    novo.hooks[evento].push({
      ...(matcher ? { matcher } : {}),
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

// ------------------------------------------------------------------ idioma

/**
 * O agente escreve para o dono do projeto, não para quem programa — e não é o
 * idioma da CONVERSA que manda, é o idioma que o dono escolheu no WTF. Como a
 * skill é um arquivo no disco, a preferência precisa ser gravada dentro dela.
 *
 * A seção fica entre marcadores para que reaplicar seja substituição, e não
 * acúmulo: reescrevemos só o miolo, o resto do arquivo nunca é tocado.
 */
const ABRE = '<!-- wtf:idioma -->'
const FECHA = '<!-- /wtf:idioma -->'

/** Arquivos instalados que carregam a instrução de idioma. */
const SKILLS_COM_IDIOMA = [
  ['.claude/skills/wtf/SKILL.md', (nome) =>
    `Escreva SEMPRE em ${nome}. Isto vale para o \`--text\` das declarações e para ` +
    'qualquer explicação destinada ao dono do projeto, mesmo que a conversa esteja ' +
    'em outra língua.'],
  ['.claude/skills/wtf-mapear/SKILL.md', (nome) =>
    `Escreva SEMPRE em ${nome}. Isto vale para os nomes e descrições que você grava ` +
    'em `.wtf/map.json` e para qualquer explicação destinada ao dono do projeto, ' +
    'mesmo que a conversa esteja em outra língua.'],
  ['.claude/skills/wtf-pastas/SKILL.md', (nome) =>
    `Escreva SEMPRE em ${nome}. Isto vale para o \`MAPA.md\` inteiro — nomes de ` +
    'seção e o propósito de cada pasta — e para qualquer explicação destinada ao ' +
    'dono do projeto, mesmo que a conversa esteja em outra língua. Os nomes das ' +
    'pastas em si ficam como estão no disco.'],
  ['.claude/skills/wtf-documentos/SKILL.md', (nome) =>
    `Escreva SEMPRE em ${nome}. Isto vale para o \`assunto\`, o \`resumo\` e o ` +
    '`porque` de cada entrada de `.wtf/docs.json`, e para o resumo final que você ' +
    'dá em conversa, mesmo que ela esteja em outra língua. Os nomes dos arquivos e ' +
    'os caminhos ficam como estão no disco.'],
  ['.claude/skills/wtf-guardrails/SKILL.md', (nome) =>
    `Escreva SEMPRE em ${nome}. Isto vale para as regras que você grava em ` +
    '`GUARDRAILS.md` — quem precisa entendê-las é o dono do projeto, não só ' +
    'o próximo agente.'],
]

/**
 * Reescreve o trecho de idioma nas skills já instaladas. Idempotente: rodar
 * duas vezes deixa o arquivo idêntico. Se os marcadores não existirem (skill
 * instalada por uma versão antiga do WTF), a seção é acrescentada ao final em
 * vez de o arquivo ser abandonado sem instrução.
 *
 * Nunca lança: idioma errado na skill é ruim, mas derrubar a instalação por
 * causa disso seria pior.
 */
/**
 * O conteúdo final de um arquivo instalado: o original do `skill/` já com a
 * seção de idioma aplicada, quando o arquivo carrega uma. Pura, para que
 * `disclosure.js` possa mostrar EXATAMENTE o texto que vai para o disco sem
 * escrever nada.
 */
export function comIdioma(rel, conteudo, config) {
  const montar = SKILLS_COM_IDIOMA.find(([alvo]) => alvo === rel)?.[1]
  if (!montar) return conteudo
  const nome = config?.nomeIdiomaConteudo || 'português do Brasil'
  const miolo = `${ABRE}\n${montar(nome)}\n${FECHA}`
  const ini = conteudo.indexOf(ABRE)
  const fim = conteudo.indexOf(FECHA)
  if (ini >= 0 && fim > ini) {
    return conteudo.slice(0, ini) + miolo + conteudo.slice(fim + FECHA.length)
  }
  const sufixo = conteudo.endsWith('\n') ? '' : '\n'
  return `${conteudo}${sufixo}\n## Idioma\n\n${miolo}\n`
}

export async function aplicarIdiomaNaSkill(dir, config) {
  if (!dir) return { ok: false, arquivos: [] }
  const tocados = []

  for (const [rel] of SKILLS_COM_IDIOMA) {
    const alvo = path.join(dir, rel)
    let conteudo
    try {
      conteudo = await fs.readFile(alvo, 'utf8')
    } catch {
      continue // skill não instalada: nada a fazer
    }

    const novo = comIdioma(rel, conteudo, config)
    if (novo === conteudo) continue
    try {
      await fs.writeFile(alvo, novo, 'utf8')
      tocados.push(rel)
    } catch {
      /* sem permissão de escrita: segue com as outras */
    }
  }

  return { ok: true, arquivos: tocados }
}
