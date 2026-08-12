/**
 * O caça-segredos: avisar ANTES de a chave entrar no histórico.
 *
 * Este módulo não diz que o projeto está seguro. Não faz auditoria, não avalia
 * dependência, não pontua risco. Ele evita UM desastre específico e muito
 * comum: a chave de API que vaza para o GitHub e volta como fatura de milhares
 * de dólares — ou como invasão.
 *
 * Por isso a varredura olha SOMENTE o que ainda não está no histórico:
 * `untracked` + `modified` de `readWorkingFiles`. O que já foi commitado é
 * tarde demais para este aviso — a chave já está no histórico, já foi para o
 * remoto, e o conserto é revogar, não deletar a linha. Avisar sobre isso todo
 * dia seria ruído permanente sobre um fato imutável. Aqui a janela é a única
 * em que o aviso ainda muda o desfecho: entre escrever e commitar.
 *
 * ⚠️ FALSO POSITIVO É O INIMIGO.
 *
 * Um aviso errado por dia ensina a pessoa a ignorar todos — e no dia da chave
 * de verdade, ela fecha o painel no automático. Um alarme que grita sempre não
 * é mais sensível: é surdo. Então, em toda dúvida, este módulo CALA. Preferimos
 * deixar passar um segredo esquisito a acusar `SENHA=xxx` no `.env.example`.
 * Toda regra nova aqui deve ser julgada por essa pergunta: quantas vezes ela
 * vai gritar à toa antes de acertar uma vez?
 *
 * ⚠️ O TRECHO NUNCA CONTÉM O SEGREDO.
 *
 * Um painel que mostra a chave na tela é um SEGUNDO vazamento: fica no
 * screenshot que a pessoa manda no grupo, na gravação de tela, no print do
 * suporte. Devolvemos no máximo os 4 primeiros e os 2 últimos caracteres do
 * valor; o resto vira `•`. Quem precisa da chave inteira abre o arquivo.
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { readWorkingFiles } from './git.js'

/** Byte zero — marca de arquivo binário sem extensão reveladora. */
const NUL = String.fromCharCode(0)

/** Acima disto, não é arquivo de configuração — é dado. Não lemos. */
const LIMITE_ARQUIVO = 512 * 1024

/** Tetos globais: a varredura roda a cada pintura do painel. */
const MAX_ARQUIVOS = 300
const MAX_BYTES_TOTAL = 2 * 1024 * 1024

/** Linha absurdamente longa é minificado/base64 — não se lê palavra ali. */
const MAX_COLUNAS = 2000

/** Extensões que não são texto: nem abrimos. */
const BINARIOS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.tiff',
  '.ico', '.icns', '.svgz', '.pdf', '.psd', '.ai', '.sketch',
  '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.tar', '.jar',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.ogg', '.flac',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.class',
  '.sqlite', '.db', '.node',
])

/** Pastas que nunca são autoria de ninguém. */
const PASTAS_IGNORADAS = ['node_modules', 'dist', 'build', '.git', '.next', 'vendor', 'coverage']

/** Arquivos de bloqueio: gigantes, gerados, e cheios de hash que parece chave. */
const ARQUIVOS_IGNORADOS = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
  'composer.lock', 'Cargo.lock', 'poetry.lock', 'Gemfile.lock',
])

/**
 * Padrões de FORMATO CONHECIDO — confiança alta.
 *
 * Cada um desses só casa com uma coisa no mundo: o prefixo é do provedor e o
 * comprimento é do provedor. Quando isso casa, não é exemplo: é chave.
 */
const FORMATOS = [
  {
    tipo: 'openai',
    rotulo: 'Chave da OpenAI (ou OpenRouter)',
    re: /\b(sk-or-v1-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,})\b/g,
  },
  {
    tipo: 'anthropic',
    rotulo: 'Chave da Anthropic (Claude)',
    re: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g,
  },
  {
    tipo: 'aws',
    rotulo: 'Chave de acesso da Amazon (AWS)',
    re: /\b(AKIA[0-9A-Z]{16})\b/g,
  },
  {
    tipo: 'google',
    rotulo: 'Chave do Google',
    re: /\b(AIza[0-9A-Za-z\-_]{35})\b/g,
  },
  {
    tipo: 'github',
    rotulo: 'Token do GitHub',
    re: /\b(gh[pous]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    tipo: 'slack',
    rotulo: 'Token do Slack',
    re: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  },
  {
    tipo: 'stripe',
    rotulo: 'Chave de produção do Stripe (cobra dinheiro de verdade)',
    re: /\b((?:sk|rk)_live_[A-Za-z0-9]{10,})\b/g,
  },
  {
    tipo: 'chave-privada',
    rotulo: 'Chave privada (certificado ou SSH)',
    re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g,
  },
]

/**
 * Genérico — confiança média.
 *
 * `senha=`, `token:`, `api_key=` seguidos de um valor com 8+ caracteres. É o
 * padrão que pega a chave de um serviço pequeno, que não tem prefixo famoso.
 * Também é o padrão que mais erra, então os filtros de placeholder abaixo são
 * mais importantes aqui do que em qualquer outro lugar.
 */
const GENERICO =
  /\b([A-Za-z0-9]*[_-]?(?:senha|password|passwd|pwd|secret|token|api[_-]?key|apikey|private[_-]?key))(?![A-Za-z0-9])\s*[:=]\s*["'`]?([^\s"'`,;)\]}]{8,})/gi

/** URL com usuário e senha embutidos: `postgres://user:senha@host`. */
const URL_COM_CREDENCIAL = /\b([a-z][a-z0-9+.-]{2,15}):\/\/([^\s/:@]{1,64}):([^\s/:@]{4,128})@[^\s/]+/gi

/**
 * O vocabulário do "isto é exemplo".
 *
 * Tudo aqui é coisa que gente escreve QUANDO NÃO É a chave: no README, no
 * `.env.example`, no comentário. Se o valor cheira a isso, ficamos quietos.
 */
const PLACEHOLDER_ESTRITO = [
  /^x+$/i, /^y+$/i, /^\.+$/, /^-+$/, /^_+$/, /^\*+$/, /^0+$/, /^\d+$/,
  /^<.*>$/, /^\{.*\}$/, /^\[.*\]$/, /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/,
  /^%[A-Z_]+%$/, /^\{\{.*\}\}$/,
  // `${algo}` em qualquer posição: é uma referência a outro valor, nunca o
  // valor. Aparece em template literal, docker-compose, shell.
  /\$\{/,
  /^(null|none|undefined|true|false|senha|password|secret|token|changeme)$/i,
  /^(process\.env|os\.getenv|import\.meta\.env)/i,
]

/**
 * Frouxo — só para o padrão GENÉRICO.
 *
 * Estas regras casam com PEDAÇOS do valor ("...example...", "1234567") e por
 * isso não podem valer para formato conhecido: uma chave de verdade da AWS
 * pode conter uma sequência dessas por puro acaso, e recusá-la seria calar
 * justo no caso que importa. No genérico, ao contrário, o excesso de silêncio
 * é o comportamento desejado.
 */
const PLACEHOLDER_FROUXO = [
  /change[-_ ]?me/i, /your[-_ ]?(key|token|secret|password|senha|api)/i,
  /my[-_ ]?(key|token|secret)/i, /sua[-_ ]?(chave|senha|key)/i, /seu[-_ ]?(token|segredo)/i,
  /troque/i, /trocar/i, /coloque/i, /preencha/i, /insira/i,
  /example/i, /exemplo/i, /dummy/i, /placeholder/i, /sample/i, /fake/i,
  /test(e)?[-_]?(key|token|value)/i,
  /here$/i, /aqui$/i, /todo/i, /xxxx/i, /abc123/i, /1234567/,
  /*
   * Três ou mais `x` como pedaço do valor: `sb_secret_xxx`, `wvspd_xxx`.
   *
   * É a forma que quase toda documentação usa para dizer "ponha a sua chave
   * aqui, com este prefixo". Sem isto, o WTF apontava a LINHA DE EXEMPLO do
   * cabeçalho de um script — logo depois de a IA ter tirado a chave de verdade
   * dali. Acusar o exemplo de uso é o tipo de aviso que ensina a ignorar avisos.
   */
  /(^|[^a-z0-9])x{3,}([^a-z0-9]|$)/i,
  /*
   * Valor que COMEÇA com "sua_", "seu_", "your_", "my_": `sua_service_key`.
   * A regra vizinha já pegava "sua_chave" e "your_key", mas exigia a palavra
   * exata em seguida — e ninguém escreve o placeholder pensando nessa lista.
   */
  /^(sua|seu|your|my|minha|meu|nossa|nosso)[-_]/i,
  /process\.env/i, /os\.getenv/i, /import\.meta\.env/i, /\{\{/, /%[A-Z_]+%/,
  /redacted/i, /hidden/i, /masked/i, /\.\.\./, /^[a-z]+$/,
]

function ehPlaceholder(valor) {
  const v = String(valor).trim()
  if (!v) return true
  return PLACEHOLDER_ESTRITO.some((re) => re.test(v))
}

/** Genérico erra mais, então recusa mais: estrito + frouxo. */
function ehPlaceholderGenerico(valor) {
  const v = String(valor).trim()
  if (ehPlaceholder(v)) return true
  return PLACEHOLDER_FROUXO.some((re) => re.test(v))
}

/**
 * Cópias que o PRÓPRIO WTF deixou para trás.
 *
 * O instalador faz backup datado de todo arquivo que sobrescreve — e um deles
 * é `.claude/settings.local.json`, que costuma ter senha de banco dentro. O
 * resultado era o painel acusando o lixo dele mesmo: quatro dos nove achados
 * num projeto real eram backups nossos, e cada clique em "aplicar a novidade"
 * criava mais um arquivo e mais dois avisos. Um painel que fabrica os próprios
 * alertas é um painel em que não se pode confiar.
 *
 * Isto NÃO esconde nada: o backup é cópia de um arquivo que continua sendo
 * varrido. Se há uma senha no `settings.local.json`, ela aparece pelo original.
 * O que sai da lista é a duplicata — e só ela.
 */
function ehBackupDoWtf(rel) {
  return /\.wtf-backup-/.test(path.basename(rel))
}

/** `.env.example`, `.env.sample`, `config.template.json`: arquivos de molde. */
function ehArquivoDeExemplo(rel) {
  const base = path.basename(rel).toLowerCase()
  return (
    /\.(example|sample|template|dist|tpl)$/.test(base) ||
    /\.(example|sample|template)\./.test(base) ||
    base === '.env.example' ||
    base === '.env.sample' ||
    base.endsWith('.example')
  )
}

function ehDocumento(rel) {
  const ext = path.extname(rel).toLowerCase()
  return ext === '.md' || ext === '.mdx' || ext === '.rst' || ext === '.txt'
}

/** Linha comentada — `#`, `//`, `*`, `;`. */
function ehComentario(linha) {
  return /^\s*(#|\/\/|\*|;|<!--)/.test(linha)
}

/**
 * Mascara o valor. NUNCA devolvemos o segredo: 4 primeiros, 2 últimos.
 * Valor curto some quase inteiro — de propósito.
 */
function mascarar(valor) {
  const v = String(valor)
  if (v.length <= 6) return `${v.slice(0, 1)}${'•'.repeat(Math.max(v.length - 1, 1))}`
  const inicio = v.slice(0, 4)
  const fim = v.slice(-2)
  const meio = '•'.repeat(Math.min(v.length - 6, 12))
  return `${inicio}${meio}${fim}`
}

/** Exportada para teste: é ela que decide o que a varredura nem abre. */
export function deveIgnorarCaminho(rel) {
  const partes = rel.split('/')
  if (partes.some((p) => PASTAS_IGNORADAS.includes(p))) return true
  if (ARQUIVOS_IGNORADOS.has(path.basename(rel))) return true
  if (BINARIOS.has(path.extname(rel).toLowerCase())) return true
  if (ehBackupDoWtf(rel)) return true
  return false
}

/** Achados de um arquivo já lido. Exportado só para teste direto. */
export function procurarNoTexto(rel, texto) {
  const achados = []
  const exemplo = ehArquivoDeExemplo(rel)
  const documento = ehDocumento(rel)
  const linhas = texto.split('\n')

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i]
    if (!linha || linha.length > MAX_COLUNAS) continue

    const comentada = ehComentario(linha)
    // Linha comentada em arquivo de molde é instrução de preenchimento, não
    // configuração. É o lugar onde MAIS aparece `API_KEY=<sua-chave>`.
    if (comentada && (exemplo || documento)) continue

    const numero = i + 1

    // ---- formato conhecido (alta): vale até em arquivo de exemplo, porque
    // ninguém escreve `AKIA...` de 16 caracteres válidos "de brincadeira".
    for (const { tipo, rotulo, re } of FORMATOS) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(linha)) !== null) {
        const valor = m[1] ?? m[0]
        if (ehPlaceholder(valor)) continue
        achados.push({
          arquivo: rel,
          linha: numero,
          tipo,
          rotulo,
          trecho: tipo === 'chave-privada' ? '-----BEGIN ••••• PRIVATE KEY-----' : mascarar(valor),
          confianca: 'alta',
        })
      }
    }

    // ---- URL com credencial embutida (alta): a senha viaja no endereço.
    URL_COM_CREDENCIAL.lastIndex = 0
    let u
    while ((u = URL_COM_CREDENCIAL.exec(linha)) !== null) {
      const senha = u[3]
      // Só a SENHA é julgada: nomes de usuário são palavras comuns ("admin",
      // "postgres") e cairiam nos filtros frouxos sem ter nada de exemplo.
      if (ehPlaceholderGenerico(senha)) continue
      achados.push({
        arquivo: rel,
        linha: numero,
        tipo: 'url-com-senha',
        rotulo: 'Endereço com usuário e senha dentro',
        trecho: `${u[1]}://${u[2]}:${mascarar(senha)}@…`,
        confianca: 'alta',
      })
    }

    // ---- genérico (média): só quando o valor não cheira a exemplo.
    //
    // Em arquivo de molde (`.env.example`) e em documentação, o genérico é
    // desligado por completo: ali o padrão `SENHA=algo` é a razão de o arquivo
    // existir, e acusá-lo seria gritar todo dia por design.
    if (!exemplo && !documento) {
      GENERICO.lastIndex = 0
      let g
      while ((g = GENERICO.exec(linha)) !== null) {
        const valor = g[2]
        if (ehPlaceholderGenerico(valor)) continue
        // Já pegamos com confiança alta ali em cima? Não repetir.
        if (achados.some((a) => a.linha === numero && a.confianca === 'alta')) continue
        achados.push({
          arquivo: rel,
          linha: numero,
          tipo: 'generico',
          rotulo: `Valor de "${g[1].toLowerCase()}" escrito direto no arquivo`,
          trecho: mascarar(valor),
          confianca: 'media',
        })
      }
    }
  }

  return achados
}

/**
 * Varre o que ainda não está no histórico e devolve os achados mascarados.
 * Nunca lança: um caça-segredos que derruba o painel some do painel.
 */
export async function procurarSegredos(dir) {
  const vazio = { achados: [], varridos: 0, ignorados: 0, truncado: false }
  if (!dir || typeof dir !== 'string') return vazio

  let lista
  try {
    const { untracked, modified } = await readWorkingFiles(dir)
    lista = [...new Set([...untracked, ...modified])]
  } catch {
    return vazio
  }

  const raiz = path.resolve(dir)
  const achados = []
  let varridos = 0
  let ignorados = 0
  let bytes = 0
  let truncado = false

  for (const rel of lista) {
    if (deveIgnorarCaminho(rel)) {
      ignorados += 1
      continue
    }
    if (varridos >= MAX_ARQUIVOS || bytes >= MAX_BYTES_TOTAL) {
      truncado = true
      break
    }

    const alvo = path.resolve(raiz, rel)
    // Mesma proteção do reader: nada fora da raiz do projeto é lido.
    const dentro = path.relative(raiz, alvo)
    if (dentro.startsWith('..') || path.isAbsolute(dentro)) {
      ignorados += 1
      continue
    }

    try {
      const info = await stat(alvo)
      if (!info.isFile()) {
        ignorados += 1
        continue
      }
      if (info.size > LIMITE_ARQUIVO) {
        ignorados += 1
        continue
      }
      const texto = await readFile(alvo, 'utf8')
      // NUL no conteúdo: é binário sem extensão conhecida.
      if (texto.indexOf(NUL) !== -1) {
        ignorados += 1
        continue
      }
      bytes += info.size
      varridos += 1
      achados.push(...procurarNoTexto(rel, texto))
    } catch {
      ignorados += 1
    }
  }

  return { achados, varridos, ignorados, truncado }
}
