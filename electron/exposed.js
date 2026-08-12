/**
 * O caça-expostos: dado pessoal escrito DENTRO do que vai para o navegador.
 *
 * Este módulo é irmão de `secrets.js`, e a diferença entre os dois é de escopo,
 * não de técnica:
 *
 *   - `secrets.js` varre o que AINDA NÃO foi salvo no histórico, procurando
 *     CHAVES de provedor (`sk-ant-…`, `AKIA…`). É uma janela de prevenção: o
 *     aviso só serve entre escrever e commitar, porque depois disso o conserto
 *     é revogar a chave, não apagar a linha.
 *
 *   - este aqui varre o CÓDIGO QUE CHEGA AO NAVEGADOR — commitado ou não —,
 *     procurando DADO DE PESSOA: e-mail, CPF, CNPJ, cartão, telefone, endereço,
 *     e o par login+senha esquecido. Aqui não adianta olhar só o não-commitado:
 *     se o dado está no front, já está exposto para qualquer pessoa que abra o
 *     inspecionar do Chrome. Não existe "antes"; existe agora.
 *
 * ⚠️ FALSO POSITIVO É O INIMIGO — a mesma filosofia de `secrets.js`.
 *
 * Um CPF de teste acusado por dia ensina a pessoa a fechar o painel no
 * automático, e no dia do CPF do cliente ela fecha também. Por isso: CPF, CNPJ
 * e cartão só passam com DÍGITO VERIFICADOR válido (Luhn no cartão), sequências
 * conhecidas de teste são recusadas, e arquivo de mock/fixture/seed/exemplo é
 * ignorado inteiro. Em toda dúvida, este módulo CALA.
 *
 * ⚠️ O TRECHO NUNCA CONTÉM O DADO INTEIRO.
 *
 * Mostrar o CPF na tela seria expor de novo — agora num painel que a pessoa
 * fotografa e manda no grupo do suporte. Tudo sai mascarado.
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { readTrackedFiles, readWorkingFiles } from './git.js'

/** Byte zero — marca de binário sem extensão reveladora. */
const NUL = String.fromCharCode(0)

/** Acima disto não é código de tela: é dado. Não lemos. */
const LIMITE_ARQUIVO = 512 * 1024

/** Tetos globais: a varredura roda a cada pintura do painel. */
const MAX_ARQUIVOS = 400
const MAX_BYTES_TOTAL = 3 * 1024 * 1024

/** Linha absurdamente longa é minificado/base64 — não se lê palavra ali. */
const MAX_COLUNAS = 2000

/** Extensões que viram (ou carregam) código de navegador. */
const EXTENSOES = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html', '.astro'])

/** Pastas cujo conteúdo é servido ao navegador. */
const PASTAS_DE_FRENTE = ['src', 'app', 'pages', 'components', 'public', 'static', 'assets']

/** Nunca é autoria de ninguém, ou nunca chega ao navegador como fonte. */
const PASTAS_IGNORADAS = ['node_modules', 'dist', 'build', '.git', '.next', 'vendor', 'coverage', 'out']

/** Pastas de teste: dado ali é inventado por definição. */
const PASTAS_DE_TESTE = ['tests', 'test', '__tests__', '__mocks__', 'e2e', 'cypress', 'fixtures', 'mocks']

/**
 * "Isto é servidor" — heurística ADMITIDAMENTE IMPERFEITA.
 *
 * `app/api/rota/route.ts` no Next roda no servidor; `src/api/cliente.ts` num
 * projeto Vite vai inteiro para o navegador e tem o mesmo nome. Não há como
 * decidir isso sem entender o framework, então não fingimos que decidimos: em
 * vez de ignorar esses arquivos, rebaixamos a confiança do achado. O dado
 * continua sendo dado; o que muda é a certeza de que ele está VISÍVEL.
 */
function ehProvavelServidor(rel) {
  const partes = rel.split('/')
  const base = path.basename(rel).toLowerCase()
  if (partes.includes('api') || partes.includes('server')) return true
  if (/\.server\./.test(base)) return true
  if (base === 'route.ts' || base === 'route.js' || base === 'route.tsx') return true
  return false
}

function ehTeste(rel) {
  const partes = rel.split('/')
  if (partes.some((p) => PASTAS_DE_TESTE.includes(p))) return true
  const base = path.basename(rel).toLowerCase()
  if (/\.(test|spec)\./.test(base)) return true
  if (base.endsWith('.d.ts')) return true
  return false
}

/**
 * Mock, fixture, seed, exemplo: o arquivo existe PARA conter dado falso.
 * Acusar aqui é gritar por design.
 */
function ehDadoDeMentira(rel) {
  const baixo = rel.toLowerCase()
  return (
    /(^|\/)(mock|mocks|fixture|fixtures|seed|seeds|stub|stubs|sample|samples|demo|storybook|stories)(\/|\.|-|_)/.test(baixo) ||
    /\.(mock|fixture|seed|stub|example|sample|template|stories)\./.test(path.basename(baixo)) ||
    /(^|\/)faker/.test(baixo)
  )
}

/** O arquivo vira código de navegador? */
function ehArquivoDeFrente(rel) {
  const partes = rel.split('/')
  const ext = path.extname(rel).toLowerCase()
  const dentroDePublic = partes.includes('public')
  // `.html`/`.json` em `public/` são servidos crus — o JSON de configuração
  // que alguém deixou ali é lido por qualquer visitante.
  if (dentroDePublic && (ext === '.html' || ext === '.json')) return true
  if (!EXTENSOES.has(ext)) return false
  // `.html` na raiz (index.html) também vai para o navegador.
  if (ext === '.html') return true
  return partes.some((p) => PASTAS_DE_FRENTE.includes(p))
}

function deveIgnorarCaminho(rel) {
  const partes = rel.split('/')
  if (partes.some((p) => PASTAS_IGNORADAS.includes(p))) return true
  // O instalador do WTF deixa backups datados; acusar a própria cópia
  // duplicaria o aviso do arquivo original, que continua sendo varrido.
  if (/\.wtf-backup-/.test(path.basename(rel))) return true
  if (ehTeste(rel)) return true
  if (ehDadoDeMentira(rel)) return true
  if (!ehArquivoDeFrente(rel)) return true
  return false
}

// ------------------------------------------------------------- mascaramento

/** `adm•••@empresa.com` — sobra o suficiente para reconhecer, não para usar. */
function mascararEmail(valor) {
  const [usuario, dominio] = String(valor).split('@')
  if (!dominio) return '•••'
  const visivel = usuario.slice(0, Math.min(3, Math.max(1, usuario.length - 1)))
  return `${visivel}•••@${dominio}`
}

/** `123.***.***-45` — primeiros 3 e últimos 2, como manda o costume. */
function mascararCpf(digitos) {
  return `${digitos.slice(0, 3)}.***.***-${digitos.slice(9)}`
}

function mascararCnpj(digitos) {
  return `${digitos.slice(0, 2)}.***.***/****-${digitos.slice(12)}`
}

/** `4242 •••• •••• 4242` — o padrão que o próprio banco usa no extrato. */
function mascararCartao(digitos) {
  return `${digitos.slice(0, 4)} •••• •••• ${digitos.slice(-4)}`
}

function mascararTelefone(digitos) {
  return `(${digitos.slice(0, 2)}) ••••-${digitos.slice(-2)}`
}

/** Genérico: primeiro caractere e o resto apagado. */
function mascararValor(valor) {
  const v = String(valor)
  if (v.length <= 2) return '••'
  return `${v.slice(0, 1)}${'•'.repeat(Math.min(v.length - 1, 10))}`
}

// ------------------------------------------------------------- validadores

/** Sequências repetidas (`111.111.111-11`) são o placeholder clássico. */
function ehRepetido(d) {
  return /^(\d)\1+$/.test(d)
}

/** CPFs de teste que circulam em tutorial brasileiro há vinte anos. */
const CPF_DE_TESTE = new Set([
  '00000000000', '12345678909', '11144477735', '01234567890',
])

export function cpfValido(digitos) {
  const d = String(digitos).replace(/\D/g, '')
  if (d.length !== 11) return false
  if (ehRepetido(d)) return false
  if (CPF_DE_TESTE.has(d)) return false
  for (let t = 9; t < 11; t += 1) {
    let soma = 0
    for (let i = 0; i < t; i += 1) soma += Number(d[i]) * (t + 1 - i)
    const dv = ((soma * 10) % 11) % 10
    if (dv !== Number(d[t])) return false
  }
  return true
}

export function cnpjValido(digitos) {
  const d = String(digitos).replace(/\D/g, '')
  if (d.length !== 14) return false
  if (ehRepetido(d)) return false
  const calc = (base) => {
    let peso = base.length - 7
    let soma = 0
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * peso
      peso -= 1
      if (peso < 2) peso = 9
    }
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  if (calc(d.slice(0, 12)) !== Number(d[12])) return false
  if (calc(d.slice(0, 13)) !== Number(d[13])) return false
  return true
}

/**
 * Luhn. Sem isto, "13 a 19 dígitos" casa com timestamp, id de pedido e número
 * de telefone com DDI — ou seja, com ruído puro.
 */
export function luhnValido(digitos) {
  const d = String(digitos).replace(/\D/g, '')
  if (d.length < 13 || d.length > 19) return false
  if (ehRepetido(d)) return false
  let soma = 0
  let dobra = false
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let n = Number(d[i])
    if (dobra) {
      n *= 2
      if (n > 9) n -= 9
    }
    soma += n
    dobra = !dobra
  }
  return soma % 10 === 0
}

/**
 * Os cartões de teste dos provedores. Todos passam no Luhn de propósito — se
 * não estivessem listados aqui, todo checkout do país viraria alarme.
 */
const CARTOES_DE_TESTE = new Set([
  '4111111111111111', '4012888888881881', '4222222222222', '4242424242424242',
  '4000056655665556', '5555555555554444', '5105105105105100', '5200828282828210',
  '378282246310005', '371449635398431', '378734493671000',
  '6011111111111117', '6011000990139424', '30569309025904', '38520000023237',
  '3530111333300000', '3566002020360505', '5555555555555555', '4444444444444448',
  '4000000000000002', '4000000000009995', '5424000000000015',
])

// ------------------------------------------------------------------ padrões

const RE_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

/** Domínios e caixas que existem justamente para NÃO ser ninguém. */
const EMAIL_IGNORADO = [
  /@(example|exemplo|test|teste|localhost|domain|dominio|email|mail|site|empresa|company|seudominio|yourdomain|acme|foo|bar)\.(com|org|net|br|com\.br|dev|io|local)$/i,
  /@example\./i, /@test\./i, /\.example$/i, /@localhost$/i, /@sentry\./i,
  /^(test|teste|user|usuario|exemplo|example|foo|bar|baz|noreply|no-reply|nao-responda|naoresponda|donotreply|admin@example|seu|seuemail|youremail|nome|name|joao|fulano|john|jane)@/i,
  /^(support|suporte)@(example|test)/i,
  /@(react|vue|angular|npmjs|github|w3|schema)\./i,
  /\.(png|jpg|jpeg|gif|svg|webp|js|ts|css|html|json)$/i,
  /^seu@/i, /^email@/i,
]

/** Caixas de função: quem escreve isso no front está expondo um canal real. */
const EMAIL_SENSIVEL = /^(admin|administrador|contato|contact|suporte|support|financeiro|faturamento|cobranca|comercial|vendas|rh|juridico|root|sysadmin|webmaster)@/i

/** Cabeçalho de licença: `@` ali é atribuição de autoria, não vazamento. */
function ehLinhaDeLicenca(linha) {
  return /copyright|\(c\)|licens|license|@author|SPDX|all rights reserved|MIT|Apache/i.test(linha)
}

const RE_CPF_FORMATADO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g
const RE_CPF_NU = /(?<![\d.\-/])\d{11}(?![\d.\-/])/g
const RE_CNPJ_FORMATADO = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g
const RE_CNPJ_NU = /(?<![\d.\-/])\d{14}(?![\d.\-/])/g
const RE_CARTAO = /(?<![\d.\-/])(?:\d[ -]?){12,18}\d(?![\d.\-/])/g
const RE_TELEFONE = /(?<![\d])\(?\b(?:1[1-9]|2[12478]|3[1-8]|4[1-9]|5[13-5]|6[1-9]|7[134579]|8[1-9]|9[1-9])\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b(?![\d])/g
const RE_CEP = /\b\d{5}-?\d{3}\b/g
const RE_ENDERECO = /\b(rua|avenida|av\.|alameda|travessa|rodovia|praça|praca|estrada|bairro|logradouro)\b/i

/** Telefones de enfeite: `(00) 00000-0000`, `(11) 99999-9999`. */
function ehTelefoneDeEnfeite(digitos) {
  if (ehRepetido(digitos)) return true
  const corpo = digitos.slice(2)
  if (/^(\d)\1+$/.test(corpo)) return true
  if (/^9?(1234|0000|9999|8888|1111)/.test(corpo)) return true
  if (/(\d)\1{6,}/.test(digitos)) return true
  return false
}

/**
 * O par login+senha no mesmo bloco — o "usuário de teste" que ficou no código.
 *
 * Exigimos os DOIS lados com valor real e próximos (mesma linha ou linhas
 * vizinhas). Só `password:` sozinho é campo de formulário, não credencial: é
 * por isso que `secrets.js` cobre esse caso e aqui a régua é o par.
 */
const RE_USUARIO = /\b(usuario|usuário|username|user|login|email|e-mail)\b\s*[:=]\s*["'`]([^"'`\s]{3,80})["'`]/i
const RE_SENHA = /\b(senha|password|passwd|pwd)\b\s*[:=]\s*["'`]([^"'`\s]{4,80})["'`]/i

/** Vocabulário do "isto é exemplo" — emprestado da mesma ideia de secrets.js. */
const VALOR_DE_MENTIRA = [
  /^\s*$/, /^\$\{/, /\$\{/, /^\{\{/, /^<.*>$/, /^%[A-Z_]+%/,
  /change[-_ ]?me/i, /^(senha|password|secret|token|123456|1234|admin|teste|test|abc123|qwerty|000000|password123)$/i,
  /example/i, /exemplo/i, /placeholder/i, /dummy/i, /fake/i, /sample/i,
  /your[-_ ]?/i, /sua[-_ ]?/i, /seu[-_ ]?/i, /preencha/i, /insira/i, /coloque/i,
  /process\.env/i, /import\.meta\.env/i, /os\.getenv/i,
  /^(null|none|undefined|true|false)$/i,
]

function ehValorDeMentira(v) {
  const s = String(v).trim()
  return VALOR_DE_MENTIRA.some((re) => re.test(s))
}

// ------------------------------------------------------------------ varredura

const PORQUE = {
  email: 'qualquer pessoa que abrir o inspecionar do navegador vê este endereço, e ele vira alvo de golpe e de tentativa de invasão',
  'email-sensivel': 'este é um endereço de contato interno escrito na página: quem abrir o inspecionar descobre por onde falar com quem administra o sistema',
  cpf: 'o CPF de uma pessoa está escrito na página e fica visível para qualquer visitante que abrir o inspecionar',
  cnpj: 'o CNPJ está escrito direto na página, visível para qualquer visitante',
  cartao: 'um número de cartão está escrito dentro do código que vai para o navegador — qualquer visitante consegue lê-lo',
  telefone: 'este telefone fica visível para qualquer visitante e costuma virar porta de entrada para golpe por WhatsApp',
  endereco: 'o endereço completo de alguém está escrito na página e fica visível para qualquer visitante',
  credencial: 'um usuário e uma senha estão escritos juntos no código da tela: quem abrir o inspecionar entra com eles',
}

function empurrar(lista, achado, servidor) {
  // Arquivo que PARECE de servidor: o dado continua sendo dado, mas a certeza
  // de que ele chega ao navegador cai um degrau.
  if (servidor) {
    achado.confianca = achado.confianca === 'alta' ? 'media' : 'baixa'
    achado.porque = `${achado.porque} (este arquivo parece rodar no servidor, então pode não estar visível — vale conferir)`
  }
  lista.push(achado)
}

/** Achados de um arquivo já lido. Exportado para teste direto. */
export function procurarNoTexto(rel, texto) {
  const achados = []
  const servidor = ehProvavelServidor(rel)
  const linhas = texto.split('\n')

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i]
    if (!linha || linha.length > MAX_COLUNAS) continue
    const numero = i + 1
    const licenca = ehLinhaDeLicenca(linha)

    // ---- e-mail de pessoa real
    if (!licenca) {
      RE_EMAIL.lastIndex = 0
      let m
      while ((m = RE_EMAIL.exec(linha)) !== null) {
        const valor = m[0]
        if (EMAIL_IGNORADO.some((re) => re.test(valor))) continue
        const sensivel = EMAIL_SENSIVEL.test(valor)
        empurrar(achados, {
          arquivo: rel,
          linha: numero,
          tipo: sensivel ? 'email-sensivel' : 'email',
          rotulo: sensivel
            ? 'E-mail de contato da empresa escrito na tela'
            : 'E-mail de uma pessoa escrito na tela',
          trecho: mascararEmail(valor),
          confianca: sensivel ? 'alta' : 'media',
          porque: sensivel ? PORQUE['email-sensivel'] : PORQUE.email,
        }, servidor)
      }
    }

    // ---- CPF (com dígito verificador)
    const cpfs = new Set()
    for (const re of [RE_CPF_FORMATADO, RE_CPF_NU]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(linha)) !== null) cpfs.add(m[0])
    }
    for (const bruto of cpfs) {
      const d = bruto.replace(/\D/g, '')
      if (!cpfValido(d)) continue
      empurrar(achados, {
        arquivo: rel,
        linha: numero,
        tipo: 'cpf',
        rotulo: 'CPF escrito no código da tela',
        trecho: mascararCpf(d),
        // Formatado é declaração de intenção; 11 dígitos soltos ainda pode ser
        // coincidência estatística, mesmo passando no dígito verificador.
        confianca: /\D/.test(bruto) ? 'alta' : 'media',
        porque: PORQUE.cpf,
      }, servidor)
    }

    // ---- CNPJ (com dígito verificador)
    const cnpjs = new Set()
    for (const re of [RE_CNPJ_FORMATADO, RE_CNPJ_NU]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(linha)) !== null) cnpjs.add(m[0])
    }
    for (const bruto of cnpjs) {
      const d = bruto.replace(/\D/g, '')
      if (!cnpjValido(d)) continue
      empurrar(achados, {
        arquivo: rel,
        linha: numero,
        tipo: 'cnpj',
        rotulo: 'CNPJ escrito no código da tela',
        trecho: mascararCnpj(d),
        confianca: /\D/.test(bruto) ? 'alta' : 'media',
        porque: PORQUE.cnpj,
      }, servidor)
    }

    // ---- cartão de crédito (Luhn de verdade)
    RE_CARTAO.lastIndex = 0
    let c
    while ((c = RE_CARTAO.exec(linha)) !== null) {
      const d = c[0].replace(/\D/g, '')
      if (!luhnValido(d)) continue
      if (CARTOES_DE_TESTE.has(d)) continue
      // CPF/CNPJ já foram julgados acima com regra própria e mais forte.
      if (d.length === 11 || d.length === 14) continue
      empurrar(achados, {
        arquivo: rel,
        linha: numero,
        tipo: 'cartao',
        rotulo: 'Número de cartão de crédito no código da tela',
        trecho: mascararCartao(d),
        confianca: 'alta',
        porque: PORQUE.cartao,
      }, servidor)
    }

    // ---- telefone brasileiro com DDD
    RE_TELEFONE.lastIndex = 0
    let t
    while ((t = RE_TELEFONE.exec(linha)) !== null) {
      const d = t[0].replace(/\D/g, '')
      if (d.length !== 10 && d.length !== 11) continue
      if (ehTelefoneDeEnfeite(d)) continue
      // Se a mesma linha já rendeu um CPF/cartão, o "telefone" é pedaço dele.
      if (achados.some((a) => a.linha === numero && (a.tipo === 'cpf' || a.tipo === 'cartao' || a.tipo === 'cnpj'))) continue
      empurrar(achados, {
        arquivo: rel,
        linha: numero,
        tipo: 'telefone',
        rotulo: 'Telefone escrito na tela',
        trecho: mascararTelefone(d),
        confianca: 'media',
        porque: PORQUE.telefone,
      }, servidor)
    }

    // ---- CEP + endereço: só JUNTOS.
    //
    // CEP sozinho é campo de formulário; "Rua" sozinha é texto de rótulo. O
    // par, na mesma linha ou na vizinha, é o endereço de alguém de verdade.
    const vizinhanca = [linhas[i - 1] ?? '', linha, linhas[i + 1] ?? ''].join('\n')
    RE_CEP.lastIndex = 0
    const cep = RE_CEP.exec(linha)
    if (cep && RE_ENDERECO.test(vizinhanca) && !ehRepetido(cep[0].replace(/\D/g, ''))) {
      empurrar(achados, {
        arquivo: rel,
        linha: numero,
        tipo: 'endereco',
        rotulo: 'Endereço com CEP escrito na tela',
        trecho: `${cep[0].slice(0, 2)}•••-•••`,
        confianca: 'media',
        porque: PORQUE.endereco,
      }, servidor)
    }

    // ---- credencial de pessoa: usuário E senha, no mesmo bloco.
    const bloco = linhas.slice(Math.max(0, i - 2), i + 3).join('\n')
    const usuario = RE_USUARIO.exec(linha) || RE_USUARIO.exec(bloco)
    const senha = RE_SENHA.exec(linha) || RE_SENHA.exec(bloco)
    if (usuario && senha && !ehValorDeMentira(usuario[2]) && !ehValorDeMentira(senha[2])) {
      const jaTem = achados.some((a) => a.tipo === 'credencial' && Math.abs(a.linha - numero) <= 4)
      if (!jaTem) {
        empurrar(achados, {
          arquivo: rel,
          linha: numero,
          tipo: 'credencial',
          rotulo: 'Usuário e senha escritos juntos no código da tela',
          trecho: `${mascararValor(usuario[2])} / ${mascararValor(senha[2])}`,
          confianca: 'alta',
          porque: PORQUE.credencial,
        }, servidor)
      }
    }
  }

  return achados
}

/**
 * Varre o código que chega ao navegador e devolve os achados MASCARADOS.
 * Nunca lança: um caça-expostos que derruba o painel some do painel.
 */
export async function procurarExpostos(dir) {
  const vazio = { achados: [], varridos: 0, ignorados: 0, truncado: false }
  if (!dir || typeof dir !== 'string') return vazio

  let lista
  try {
    // Commitado E não commitado: aqui o histórico não salva ninguém — o que
    // está no front está exposto desde o primeiro deploy.
    const rastreados = await readTrackedFiles(dir).catch(() => [])
    const { untracked, modified } = await readWorkingFiles(dir)
    lista = [...new Set([...rastreados, ...untracked, ...modified])]
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
      if (!info.isFile() || info.size > LIMITE_ARQUIVO) {
        ignorados += 1
        continue
      }
      const texto = await readFile(alvo, 'utf8')
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
