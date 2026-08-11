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
 */
function estadoDe({ temCodigo, temTeste, soDocumento }) {
  if (soDocumento) return 'planned'
  if (!temCodigo) return 'planned'
  if (temTeste) return 'tested'
  return 'implemented'
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
    for (const f of c.files) {
      const { area, nome } = classificar(f.path)
      const id = idDe(area, nome)
      if (!tocadas.has(id)) tocadas.set(id, { id, area, nome, files: [] })
      tocadas.get(id).files.push(f.path)
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
        if (/^tests?\//.test(p)) atual.temTeste = true
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
      state: estadoDe({ temCodigo: f.temCodigo, temTeste: f.temTeste, soDocumento }),
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
