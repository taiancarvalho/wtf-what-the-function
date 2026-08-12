/**
 * Tradução: commits reais → modelo do WTF.
 *
 * ATENÇÃO — limite honesto desta versão:
 * aqui não há LLM. A tradução é HEURÍSTICA: lê o prefixo convencional do
 * commit, os caminhos tocados e o volume, e monta uma frase humana a partir
 * disso. Serve para provar o encanamento (repo real → feed legível), não para
 * entregar a qualidade final do Human Diff. Quando o modelo entrar, só a
 * função `humanizar()` muda.
 */

// ---------------------------------------------------------------- features

/** Regras de caminho → { area, feature }. A primeira que casar vence. */
const REGRAS = [
  [/^\.github\/workflows/, 'Bastidores', 'Checagens automáticas'],
  [/^prisma\//, 'Dados', 'Banco de dados'],
  [/^docs\/planning\/stories/, 'Planejamento', 'Histórias e escopo'],
  [/^docs\/product\/decisions/, 'Planejamento', 'Decisões registradas'],
  [/^docs\//, 'Planejamento', 'Documentação'],
  [/^tests?\//, 'Bastidores', 'Testes automáticos'],
  [/^src\/lib\/meta/, 'Integrações', 'Conexão com a Meta'],
  [/^src\/lib\/sync/, 'Integrações', 'Sincronização de dados'],
  [/^src\/lib\/metrics/, 'Relatórios', 'Cálculo de métricas'],
  [/^src\/lib\/dashboard/, 'Relatórios', 'Painel'],
  [/^src\/components\/dashboard/, 'Relatórios', 'Painel'],
  [/^src\/app\/.*\/integracoes/, 'Integrações', 'Tela de integrações'],
  [/^src\/app\/.*\/equipe/, 'Contas', 'Equipe e acessos'],
  [/^src\/app\/.*\/configuracoes/, 'Contas', 'Configurações'],
  [/^src\/app\/.*\/login|^src\/app\/.*\/auth|^src\/lib\/auth/, 'Contas', 'Entrar na conta'],
  [/^src\/middleware|^src\/lib\/tenant/, 'Contas', 'Separação entre clientes'],
  [/^src\/components/, 'Interface', 'Peças da interface'],
  [/^src\/app/, 'Interface', 'Telas'],
  [/^src\/lib/, 'Bastidores', 'Motor interno'],
  [/^(package\.json|package-lock\.json|pnpm-lock|tsconfig|vitest|next\.config|eslint)/, 'Bastidores', 'Configuração do projeto'],
]

const OUTROS = ['Bastidores', 'Outros arquivos']

function classificar(caminho) {
  for (const [re, area, nome] of REGRAS) {
    if (re.test(caminho)) return { area, nome }
  }
  return { area: OUTROS[0], nome: OUTROS[1] }
}

/**
 * A que parte um arquivo de teste pertence.
 *
 * `tests/lib/meta/x.test.ts` verifica `src/lib/meta` — mas, classificado pelo
 * próprio caminho, ele caía numa feature "Testes automáticos" à parte. O efeito
 * era duplo e silencioso: a parte que TEM o código nunca recebia crédito pelo
 * teste que a cobre, e a feature dos testes aparecia como "planejada" mesmo com
 * dezenas de arquivos de teste no repositório. O estado "Testado" existia no
 * código e era inalcançável sem mapa — justamente no primeiro contato de quem
 * abre o app antes de mapear o projeto.
 *
 * Aqui tiramos o prefixo de teste e classificamos pelo que sobra: o teste passa
 * a apontar para a parte que ele verifica. Sem correspondência, ele continua
 * caindo em "Testes automáticos", que é o destino honesto para um teste que não
 * cobre nada reconhecível.
 */
const RE_TESTE = /^(tests?|spec|__tests__)\//
const SUFIXO_TESTE = /\.(test|spec)\.[jt]sx?$/

export function ehTeste(caminho) {
  return RE_TESTE.test(caminho) || SUFIXO_TESTE.test(caminho)
}

/**
 * Última tentativa: casar `tests/calc.test.ts` com `src/lib/metrics/calc.ts`
 * pelo nome do arquivo, entre os que vieram no MESMO commit. Nem todo projeto
 * espelha a estrutura de pastas nos testes, mas quase todos mantêm o nome.
 */
function porNomeDeArquivo(caminhoDoTeste, codigo) {
  const base = caminhoDoTeste
    .split('/')
    .pop()
    .replace(/\.(test|spec)\.[jt]sx?$/, '')
    .replace(/\.[jt]sx?$/, '')
  if (!base) return null
  for (const p of codigo) {
    const alvo = p.split('/').pop().replace(/\.[jt]sx?$/, '')
    if (alvo === base) return classificar(p)
  }
  return null
}

function classificarTeste(caminho) {
  const semPrefixo = caminho.replace(RE_TESTE, '')
  for (const [re, area, nome] of REGRAS) {
    // o mesmo caminho, e também com `src/` na frente: `tests/lib/x` ↔ `src/lib/x`
    if (re.test(semPrefixo) || re.test(`src/${semPrefixo}`)) return { area, nome }
  }
  return null
}

const semExtDeTeste = (p) => p.replace(/\.(test|spec)\.[jt]sx?$/, '').replace(/\.[jt]sx?$/, '')

/**
 * As chaves pelas quais um teste pode ser encontrado, e as chaves pelas quais
 * um arquivo de código procura. Um par casa quando compartilha uma chave.
 *
 * ⚠️ EXISTEM PARA NÃO COMPARAR TUDO COM TUDO.
 *
 * A primeira versão disto era um laço triplo — cada parte, cada teste, cada
 * arquivo — com uma regex dentro. Num repositório pequeno passou despercebido;
 * num projeto de verdade (milhares de arquivos, centenas de testes, e a mesma
 * conta repetida para cada um dos 14 marcos do histórico) o processo principal
 * ficou a 99% de CPU e o aplicativo não abria. Indexado, é uma passada pelos
 * testes e uma pelos arquivos.
 *
 * O prefixo (`b:` de base, `p:` de caminho) impede que o nome de um arquivo
 * case com o caminho de outro por coincidência.
 */
function chavesDoTeste(caminho) {
  const base = semExtDeTeste(caminho).split('/').pop()
  const semPrefixo = semExtDeTeste(caminho.replace(RE_TESTE, ''))
  const chaves = []
  if (base) chaves.push(`b:${base}`)
  if (semPrefixo) chaves.push(`p:${semPrefixo}`)
  return chaves
}

function chavesDoAlvo(alvo) {
  const sem = semExtDeTeste(alvo)
  const base = sem.split('/').pop()
  const chaves = []
  if (base) chaves.push(`b:${base}`)
  chaves.push(`p:${sem.replace(/^src\//, '')}`)
  chaves.push(`p:${sem}`)
  return chaves
}

/**
 * O teste `caminho` verifica o arquivo de código `alvo`?
 *
 * Existe para quando o MAPA não diz. Um mapa que declara `tests` é sempre mais
 * confiável — só o autor sabe que `tests/fluxo-compra.test.ts` cobre o carrinho
 * inteiro. Mas mapa sem `tests` não pode significar "este projeto não tem
 * testes": significa apenas que ninguém escreveu a lista.
 *
 * Duas convenções, e nada além delas: mesmo nome de arquivo, ou mesmo caminho
 * a menos do prefixo de teste. Chutar mais que isso produziria "✓ Testado" sem
 * teste, que é a única coisa pior que "● Pronto" com teste.
 */
export function testeCobre(caminho, alvo) {
  if (!ehTeste(caminho) || typeof alvo !== 'string') return false
  const doAlvo = new Set(chavesDoAlvo(alvo))
  return chavesDoTeste(caminho).some((k) => doAlvo.has(k))
}

/** O índice de `chave → testes`, montado uma vez por varredura. */
export function indexarTestes(arquivos) {
  const indice = new Map()
  for (const caminho of arquivos) {
    if (!ehTeste(caminho)) continue
    for (const k of chavesDoTeste(caminho)) {
      const lista = indice.get(k)
      if (lista) lista.push(caminho)
      else indice.set(k, [caminho])
    }
  }
  return indice
}

/** Os testes que cobrem `alvo`, pelo índice. */
export function testesDe(indice, alvo) {
  const out = []
  for (const k of chavesDoAlvo(alvo)) {
    const lista = indice.get(k)
    if (lista) out.push(...lista)
  }
  return out
}

const idDe = (area, nome) =>
  `f-${`${area}-${nome}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`

// ------------------------------------------------------------- humanização

/** Prefixo convencional → como uma pessoa descreveria. */
const TIPO = {
  feat: { verbo: 'Foi adicionado algo novo', peso: 'novidade' },
  fix: { verbo: 'Um problema foi corrigido', peso: 'correcao' },
  perf: { verbo: 'Algo ficou mais rápido', peso: 'melhoria' },
  refactor: { verbo: 'O código foi reorganizado por dentro', peso: 'interno' },
  style: { verbo: 'Ajuste de aparência do código', peso: 'interno' },
  test: { verbo: 'Foram criadas verificações automáticas', peso: 'garantia' },
  docs: { verbo: 'A documentação foi atualizada', peso: 'documento' },
  ci: { verbo: 'Mudou a checagem automática do projeto', peso: 'garantia' },
  build: { verbo: 'Mudou a forma como o projeto é montado', peso: 'interno' },
  chore: { verbo: 'Manutenção de rotina', peso: 'interno' },
  revert: { verbo: 'Uma mudança anterior foi desfeita', peso: 'correcao' },
}

function separarTipo(subject) {
  const m = /^(\w+)(\([^)]*\))?!?:\s*(.+)$/.exec(subject)
  if (!m) return { tipo: null, escopo: null, texto: subject }
  return {
    tipo: TIPO[m[1].toLowerCase()] ? m[1].toLowerCase() : null,
    escopo: m[2] ? m[2].slice(1, -1) : null,
    texto: m[3],
  }
}

/** Primeira letra maiúscula, ponto final. Sem reescrever o conteúdo. */
function frase(t) {
  const s = t.trim().replace(/\s+/g, ' ')
  const cap = s.charAt(0).toUpperCase() + s.slice(1)
  return /[.!?]$/.test(cap) ? cap : `${cap}.`
}

function humanizar(commit, features) {
  const { tipo, texto } = separarTipo(commit.subject)
  const meta = tipo ? TIPO[tipo] : null

  const areas = [...new Set(features.map((f) => f.nome))]
  const soDocumento = commit.files.every((f) => /^docs?\//.test(f.path) || /\.mdx?$/.test(f.path))
  const soTeste = commit.files.every((f) => /^tests?\//.test(f.path))

  const headline = commit.isMerge
    ? `Um bloco de trabalho foi integrado ao projeto.`
    : frase(texto)

  const what = commit.isMerge
    ? 'Várias mudanças que estavam sendo feitas em separado passaram a fazer parte do projeto principal.'
    : `${meta ? meta.verbo + '. ' : ''}${commit.files.length === 1 ? 'Um arquivo foi tocado' : `${commit.files.length} arquivos foram tocados`}, com ${commit.insertions} linhas escritas e ${commit.deletions} removidas.`

  const why = commit.body?.trim()
    ? primeiroParagrafo(commit.body)
    : 'A mensagem da mudança não explicou o motivo.'

  const impact = soDocumento
    ? 'Nada no software mudou. Só a documentação.'
    : soTeste
      ? 'Nada que o usuário vê mudou. Foram adicionadas verificações que rodam sozinhas.'
      : meta?.peso === 'garantia'
        ? 'Não muda o que o usuário vê. Aumenta a chance de um erro ser pego antes de ir ao ar.'
        : meta?.peso === 'interno'
          ? 'Provavelmente nada muda para quem usa. É arrumação interna.'
          : `Pode afetar: ${areas.slice(0, 4).join(', ') || 'partes ainda não classificadas'}.`

  const sinais = detectarAtencao(commit)

  return {
    headline,
    what,
    why,
    impact,
    affects: areas.slice(0, 6),
    needsYourAttention: sinais.length > 0,
    attentionReason: sinais[0],
  }
}

function primeiroParagrafo(body) {
  const limpo = body
    .split('\n')
    .filter((l) => !/^(Co-Authored-By|Claude-Session|Signed-off-by|https?:\/\/)/i.test(l.trim()))
    .join('\n')
    .trim()
  const p = limpo.split(/\n\s*\n/)[0] ?? ''
  return p ? frase(p.slice(0, 400)) : 'A mensagem da mudança não explicou o motivo.'
}

/** Sinais crus e verificáveis. Nada de adivinhação sobre segurança. */
function detectarAtencao(commit) {
  const avisos = []
  const caminhos = commit.files.map((f) => f.path)

  /*
   * Esta regra fala do PASSADO: um `.env` que já entrou num commit. O aviso
   * útil — a chave que ainda dá para tirar antes de virar histórico — mora
   * agora em `secrets.js`, que procura o segredo em si (formato, valor,
   * placeholder) nos arquivos ainda não commitados, em vez de adivinhar pelo
   * nome do arquivo. Aqui ficou só o registro do fato consumado.
   */
  if (caminhos.some((p) => /^\.env($|\.)/.test(p) && !/\.example$/.test(p))) {
    avisos.push('Um arquivo de senhas/chaves (.env) entrou no repositório. Isso normalmente não deveria acontecer.')
  }
  if (caminhos.some((p) => /(^|\/)(auth|session|login|middleware|permission|tenant)/i.test(p))) {
    avisos.push('Essa mudança mexeu em controle de acesso — quem pode entrar e ver o quê. Vale conferir.')
  }
  if (caminhos.some((p) => /^prisma\/migrations/.test(p))) {
    avisos.push('O formato do banco de dados mudou. Mudanças assim são difíceis de desfazer depois de publicadas.')
  }
  if (caminhos.some((p) => /^package\.json$/.test(p))) {
    avisos.push('A lista de bibliotecas do projeto mudou. Pode ter entrado código de terceiros.')
  }
  if (commit.insertions > 1500) {
    avisos.push(`Mudança muito grande: ${commit.insertions} linhas de uma vez. Difícil de revisar.`)
  }
  return avisos
}

// ------------------------------------------------------------------ estado

/**
 * Estado da feature a partir de evidência real do repositório.
 * Conservador de propósito: sem prova, não promove.
 *
 * ⚠️ ESTA É A ÚNICA DEFINIÇÃO DA REGRA. `map.js` (painel de hoje) e
 * `history.js` (reconstrução do passado) importam daqui. Uma segunda cópia
 * divergiria em silêncio, e o histórico passaria a contar uma evolução que
 * nunca aconteceu — este projeto já foi mordido por regra duplicada antes.
 */
export function estadoPorEvidencia({ temCodigo, temTeste, soDocumento }) {
  if (soDocumento) return 'planned'
  if (!temCodigo) return 'planned'
  if (temTeste) return 'tested'
  return 'implemented'
}

/**
 * As partes que um CONJUNTO DE ARQUIVOS revela, pela mesma classificação
 * heurística usada no snapshot (mesmas REGRAS, mesmo tratamento de teste).
 *
 * Existe para o histórico: reconstruir uma data significa ter só a lista de
 * arquivos daquele momento, sem commits e sem mapa. Quem nunca rodou o
 * onboarding também tem passado, e ele precisa ser contado pela mesma régua do
 * presente — por isso isto vive aqui, ao lado das regras, e não em history.js.
 */
export function partesDeArquivos(caminhos) {
  const lista = (Array.isArray(caminhos) ? caminhos : []).filter((p) => typeof p === 'string')
  // Código primeiro: um teste só sabe a que parte pertence depois de saber que
  // partes existem — a mesma ordem de `commitsParaSnapshot`.
  const codigo = lista.filter((p) => !ehTeste(p))
  const partes = new Map()

  for (const caminho of [...codigo, ...lista.filter(ehTeste)]) {
    const alvo = ehTeste(caminho)
      ? (classificarTeste(caminho) ?? porNomeDeArquivo(caminho, codigo))
      : null
    const { area, nome } = alvo ?? classificar(caminho)
    const id = idDe(area, nome)
    const atual = partes.get(id) ?? {
      id,
      area,
      name: nome,
      arquivos: 0,
      temCodigo: false,
      temTeste: false,
      soDocumento: true,
    }
    atual.arquivos += 1
    if (ehTeste(caminho)) atual.temTeste = true
    else if (!/^docs?\//.test(caminho)) atual.temCodigo = true
    if (!/^docs?\//.test(caminho)) atual.soDocumento = false
    partes.set(id, atual)
  }

  return [...partes.values()].map((p) => ({
    ...p,
    state: estadoPorEvidencia(p),
  }))
}

// ---------------------------------------------------------------- snapshot

export function commitsParaSnapshot(meta, commits) {
  /** @type {Map<string, any>} */
  const feats = new Map()
  const eventos = []

  // Merges não trazem arquivos (o git não emite numstat para eles) e não
  // significam nada para quem não programa. Ficam de fora do feed.
  const relevantes = commits.filter((c) => !c.isMerge && c.files.length > 0)

  for (const c of relevantes) {
    // features tocadas por este commit
    const tocadas = new Map()
    const caminhos = c.files.map((f) => f.path)
    // Código primeiro: um teste só sabe a que parte pertence depois de saber
    // que partes existem neste commit.
    const codigo = caminhos.filter((p) => !ehTeste(p))

    for (const caminho of [...codigo, ...caminhos.filter(ehTeste)]) {
      // Arquivo de teste conta para a parte que ele verifica, não para si mesmo.
      const alvo = ehTeste(caminho)
        ? (classificarTeste(caminho) ?? porNomeDeArquivo(caminho, codigo))
        : null
      const { area, nome } = alvo ?? classificar(caminho)
      const id = idDe(area, nome)
      if (!tocadas.has(id)) tocadas.set(id, { id, area, nome, files: [] })
      tocadas.get(id).files.push(caminho)
    }

    for (const t of tocadas.values()) {
      const atual = feats.get(t.id) ?? {
        id: t.id,
        area: t.area,
        name: t.nome,
        origin: 'discovered',
        summary: '',
        relatedIds: [],
        files: [],
        lastTouchedAt: c.at,
        commits: 0,
        temCodigo: false,
        temTeste: false,
      }
      atual.commits += 1
      for (const p of t.files) {
        if (!atual.files.includes(p)) atual.files.push(p)
        if (ehTeste(p)) atual.temTeste = true
        else if (!/^docs?\//.test(p)) atual.temCodigo = true
      }
      // commits vêm do mais novo para o mais antigo
      if (new Date(c.at) > new Date(atual.lastTouchedAt)) atual.lastTouchedAt = c.at
      feats.set(t.id, atual)
    }

    // ligações: features tocadas no mesmo commit se relacionam
    const ids = [...tocadas.keys()]
    for (const id of ids) {
      const f = feats.get(id)
      for (const outro of ids) {
        if (outro !== id && !f.relatedIds.includes(outro)) f.relatedIds.push(outro)
      }
    }

    const listaFeats = [...tocadas.values()]
    const human = humanizar(c, listaFeats)
    const principal = listaFeats.sort((a, b) => b.files.length - a.files.length)[0]

    eventos.push({
      id: c.hash,
      at: c.at,
      type: 'work.completed',
      source: c.agent ? 'agent' : 'git',
      agent: c.agent ?? undefined,
      featureId: principal ? principal.id : 'f-bastidores-outros-arquivos',
      claim: c.agent ? `${c.subject}\n\n${c.body}`.trim().slice(0, 700) : undefined,
      human,
      technical: {
        filesChanged: c.files.length,
        insertions: c.insertions,
        deletions: c.deletions,
        files: c.files.slice(0, 24).map((f) => f.path),
        dependenciesAdded: [],
        dependenciesRemoved: [],
      },
      evidence: montarEvidencias(c),
      risk: undefined,
    })
  }

  const features = [...feats.values()].map((f) => {
    const soDocumento = f.files.every((p) => /^docs?\//.test(p))
    return {
      id: f.id,
      area: f.area,
      name: f.name,
      state: estadoPorEvidencia({ temCodigo: f.temCodigo, temTeste: f.temTeste, soDocumento }),
      origin: 'discovered',
      summary: resumoDe(f),
      relatedIds: f.relatedIds.slice(0, 6),
      files: f.files.slice(0, 40),
      lastTouchedAt: f.lastTouchedAt,
      attention: 'none',
    }
  })

  return {
    project: {
      id: 'p-real',
      name: meta.name,
      path: meta.path,
      pitch: `Projeto real, lido do seu computador. Branch ${meta.branch}.`,
      connectedAgents: [...new Set(relevantes.map((c) => c.agent).filter(Boolean))],
      live: minutosDesde(relevantes[0]?.at) < 90,
      createdAt: meta.firstCommitAt,
    },
    features,
    events: eventos,
  }
}

function resumoDe(f) {
  const n = f.files.length
  return `${f.commits} ${f.commits === 1 ? 'mudança' : 'mudanças'} em ${n} ${n === 1 ? 'arquivo' : 'arquivos'} desta parte.`
}

function montarEvidencias(c) {
  const out = []
  if (c.agent) {
    out.push({
      id: `${c.hash}-claim`,
      kind: 'agent_claim',
      confidence: 0.3,
      detail: 'O commit traz assinatura de um agente de IA.',
      at: c.at,
    })
  }
  out.push({
    id: `${c.hash}-files`,
    kind: 'file_modified',
    confidence: 0.6,
    detail: `${c.files.length} arquivo(s) alterado(s) no repositório, +${c.insertions} −${c.deletions}.`,
    at: c.at,
  })
  if (c.files.some((f) => /^tests?\//.test(f.path))) {
    out.push({
      id: `${c.hash}-test`,
      kind: 'test_passed',
      confidence: 0.55,
      detail: 'Arquivos de teste foram tocados. O WTF ainda não executou os testes — só viu que existem.',
      at: c.at,
    })
  }
  return out
}

function minutosDesde(iso) {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / 60000
}
