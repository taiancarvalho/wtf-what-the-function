/**
 * Eventos do agente: `<projeto>/.wtf/events.jsonl` → modelo do WTF.
 *
 * Regra que atravessa o produto: o agente não escreve o estado do projeto.
 * Ele *declara* (claim), e declaração vale pouco. Aqui a declaração vira
 * evento no feed e, no máximo, empurra a feature até `implemented`. Prova de
 * que funciona continua vindo do Git e dos testes — nunca daqui.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

// ------------------------------------------------------------------ leitura

/**
 * Lê os eventos gravados pelo agente. Nunca lança por ausência de arquivo:
 * projeto sem skill instalada simplesmente não tem eventos.
 * Retorna do mais recente para o mais antigo (mesma ordem de `commitsParaSnapshot`).
 */
export async function readAgentEvents(dir) {
  let bruto
  try {
    bruto = await readFile(path.join(dir, '.wtf', 'events.jsonl'), 'utf8')
  } catch {
    return []
  }

  const out = []
  for (const linha of bruto.split('\n')) {
    const t = linha.trim()
    if (!t) continue
    // Arquivo append-only: a última linha pode estar truncada. Linha ruim
    // é descartada em silêncio — não é erro, é a vida real do arquivo.
    let ev
    try {
      ev = JSON.parse(t)
    } catch {
      continue
    }
    if (!ev || typeof ev !== 'object' || typeof ev.kind !== 'string') continue
    if (!ev.at || Number.isNaN(new Date(ev.at).getTime())) continue
    out.push(ev)
  }

  return out.sort((a, b) => new Date(b.at) - new Date(a.at))
}

// ------------------------------------------------------------------- estado

/** Ordem de promoção. Reimplementada aqui de propósito: main não importa de src/. */
const STATE_ORDER = ['planned', 'building', 'implemented', 'tested', 'validated']
const nivel = (s) => {
  const i = STATE_ORDER.indexOf(s)
  return i === -1 ? 0 : i
}
/** Nunca rebaixa: o que o Git já provou vale mais que o que a IA disse. */
const maiorEstado = (a, b) => (nivel(b) > nivel(a) ? b : a)

// ------------------------------------------------------------------- apoio

/** Chave de comparação: sem caixa, sem acento, sem pontuação. */
const chave = (texto) =>
  String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const idDe = (texto) => `f-agente-${chave(texto).replace(/ /g, '-') || 'sem-nome'}`

const minutosDesde = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity)

const asc = (a, b) => new Date(a.at) - new Date(b.at)

// -------------------------------------------------------- código do evento

/**
 * Código curto e estável de um evento — o mesmo que a pessoa vê no painel.
 *
 * ⚠️ CÓPIA DELIBERADA de `codigoCurto` em `src/lib/format.ts`. Main e renderer
 * são processos separados e o main não importa de `src/`. Se um lado mudar, o
 * outro TEM que mudar junto: é esse código que liga o aviso à resposta da IA,
 * e duas versões diferentes quebram a ligação em silêncio.
 */
function codigoCurto(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h.toString(36).toUpperCase().slice(-4).padStart(4, '0')
}

/** Códigos de 4 caracteres citados num texto livre. Sempre em maiúsculas. */
function codigosCitados(texto) {
  const achados = String(texto ?? '').toUpperCase().match(/\b[A-Z0-9]{4}\b/g)
  return achados ? [...new Set(achados)] : []
}

/** Tamanho máximo do trecho da resposta guardado no aviso original. */
const LIMITE_RESPOSTA = 400

const cortar = (texto) => {
  const t = String(texto ?? '').trim()
  return t.length <= LIMITE_RESPOSTA ? t : `${t.slice(0, LIMITE_RESPOSTA - 1).trimEnd()}…`
}

/**
 * Fecha o ciclo do aviso.
 *
 * A pessoa pede à IA para conferir citando o código ("confere o XVFT"), e a IA
 * responde citando o mesmo código. Sem isto a resposta virava um cartão novo e
 * solto, e o aviso original ficava "precisa da sua atenção" para sempre — o
 * jeito mais rápido de ensinar alguém a ignorar alertas.
 */
function ligarRespostas(feed, claims) {
  const porCodigo = new Map()
  for (const e of feed) {
    const c = codigoCurto(e.id)
    // Colisão é irrelevante nesta escala, mas se houver, o mais recente vence:
    // é a ele que a pessoa estava olhando quando pediu para conferir.
    if (!porCodigo.has(c)) porCodigo.set(c, e)
  }

  const idsDeClaim = new Set(claims.map((c) => c.id))

  for (const c of claims.slice().sort(asc)) {
    if (!c.text) continue
    const resposta = feed.find((e) => e.id === c.id)
    if (!resposta) continue
    const proprio = codigoCurto(c.id)

    for (const cod of codigosCitados(c.text)) {
      if (cod === proprio) continue
      const alvo = porCodigo.get(cod)
      if (!alvo) continue
      // Não se responde ao futuro, nem uma resposta responde outra resposta.
      if (new Date(alvo.at) > new Date(c.at)) continue
      if (idsDeClaim.has(alvo.id) && alvo.respondeA) continue

      // O primeiro que responde é o que fecha; respostas seguintes não
      // sobrescrevem, senão o registro de quem fechou o ciclo se perde.
      if (!alvo.respondidoPor) {
        alvo.respondidoPor = { eventId: c.id, at: c.at, texto: cortar(c.text) }
      }
      if (!resposta.respondeA) resposta.respondeA = cod
    }
  }

  return feed
}

// ---------------------------------------------------------------- mesclagem

/**
 * Enriquece o snapshot do Git com o que o agente declarou.
 * Função pura: clona o que precisa e não mexe no parâmetro recebido.
 */
export function mesclarClaims(snapshot, agentEvents) {
  const base = snapshot ?? { project: {}, features: [], events: [] }
  const eventos = (agentEvents ?? []).slice().sort(asc) // aqui é mais fácil pensar em ordem cronológica

  const features = base.features.map((f) => ({ ...f, relatedIds: [...(f.relatedIds ?? [])], files: [...(f.files ?? [])] }))
  const feed = base.events.map((e) => ({ ...e }))

  // índice por nome normalizado, para casar declaração com feature já descoberta
  const porNome = new Map()
  for (const f of features) porNome.set(chave(f.name), f)

  const claims = eventos.filter(
    (e) => (e.kind === 'claim.started' || e.kind === 'claim.completed') && e.feature,
  )
  const toques = eventos.filter((e) => e.kind === 'file.touched')

  // agrupa claims por feature declarada
  const grupos = new Map()
  for (const c of claims) {
    const k = chave(c.feature)
    if (!grupos.has(k)) grupos.set(k, { rotulo: c.feature, lista: [] })
    grupos.get(k).lista.push(c)
  }

  for (const { rotulo, lista } of grupos.values()) {
    // 1. garante a feature no mapa. Se a IA declarou, então estava previsto.
    let feat = porNome.get(chave(rotulo))
    if (!feat) {
      feat = {
        id: idDe(rotulo),
        area: 'Declarado pela IA',
        name: rotulo,
        state: 'planned',
        origin: 'planned',
        summary: 'Parte que a IA declarou estar tocando. Ainda sem prova vinda do código.',
        relatedIds: [],
        files: [],
        lastTouchedAt: lista[lista.length - 1].at,
        attention: 'none',
      }
      features.push(feat)
      porNome.set(chave(rotulo), feat)
    }

    let abertoEm = null // claim.started ainda sem par
    let temCompleted = false

    for (const c of lista) {
      const arquivosDoTrecho =
        c.kind === 'claim.completed' && abertoEm
          ? arquivosEntre(toques, c.sessionId, abertoEm.at, c.at)
          : []

      feed.push(montarEvento(c, feat, arquivosDoTrecho))

      if (c.kind === 'claim.started') abertoEm = c
      else {
        temCompleted = true
        abertoEm = null
        for (const p of arquivosDoTrecho) if (!feat.files.includes(p)) feat.files.push(p)
      }

      if (new Date(c.at) > new Date(feat.lastTouchedAt ?? 0)) feat.lastTouchedAt = c.at
    }

    // 2. estado a partir do par de claims.
    if (abertoEm) {
      // começou e não disse que terminou → está construindo agora.
      feat.state = maiorEstado(feat.state, 'building')

      // `working` vive fora do `state` de propósito. São dois eixos diferentes:
      // `state` é o que foi *provado* (Git, testes) e por isso nunca é rebaixado;
      // `working` é o que está *acontecendo agora*, e é só declaração da IA.
      // Se misturássemos os dois, uma feature já `implemented`/`tested` engoliria
      // o claim em silêncio — o usuário nunca veria que a IA está mexendo nela
      // neste momento. Separado, nada se apaga: a prova continua de pé e a
      // atividade em curso aparece do lado.
      feat.working = true
      feat.workingSince = abertoEm.at
      if (abertoEm.text) feat.workingClaim = abertoEm.text
    } else if (temCompleted) {
      // terminou segundo a IA → no mínimo `implemented`.
      // `claim.completed` NÃO promove para `tested`: declaração não é prova.
      // Só teste/build executado sobe daí, e isso vem do Git, não daqui.
      feat.state = maiorEstado(feat.state, 'implemented')
    }
  }

  // 4. trabalho que a IA fez sem declarar nada.
  // O hook grava `file.touched` o tempo todo; até aqui esses eventos morriam
  // no arquivo e o painel ficava mudo enquanto a IA criava dezenas de arquivos.
  // Cada rajada órfã (fora de qualquer par de claims) vira um cartão só.
  for (const r of rajadasOrfas(toques, claims)) {
    feed.push(montarProgresso(r, features))
  }

  /*
   * O que foi decidido sobre os avisos de segurança também é história.
   *
   * Sem isto, marcar sete avisos como falso alarme era uma ação sem rastro: o
   * painel simplesmente tinha menos avisos no dia seguinte, e ninguém saberia
   * dizer se eles foram resolvidos, dispensados ou se a varredura falhou.
   * Decisão que some é decisão que não dá para revisar.
   */
  for (const d of eventos.filter((e) => e.kind === 'seguranca.decidida')) {
    feed.push(montarDecisaoDeSeguranca(d))
  }

  // 5. feed único, do mais recente para o mais antigo
  feed.sort((a, b) => new Date(b.at) - new Date(a.at))

  // 5b. o ciclo fecha: claim que cita o código de um aviso responde àquele aviso
  ligarRespostas(feed, claims)

  // 6. agentes vistos e sinal de vida
  const agentes = [...new Set([...(base.project.connectedAgents ?? []), ...eventos.map((e) => e.agent).filter(Boolean)])]
  const sessaoRecente = eventos.some(
    (e) => e.kind === 'session.started' && minutosDesde(e.at) < 30,
  )

  return {
    ...base,
    project: {
      ...base.project,
      connectedAgents: agentes,
      live: base.project.live === true || sessaoRecente,
    },
    features,
    events: feed,
  }
}

/** Arquivos distintos tocados na mesma sessão, entre o início e o fim do trabalho. */
function arquivosEntre(toques, sessionId, de, ate) {
  const ini = new Date(de).getTime()
  const fim = new Date(ate).getTime()
  const set = new Set()
  for (const t of toques) {
    if (sessionId && t.sessionId !== sessionId) continue
    const q = new Date(t.at).getTime()
    if (q < ini || q > fim) continue
    for (const p of t.files ?? []) set.add(p)
  }
  return [...set]
}

// --------------------------------------------------------- rajadas órfãs

/** Distância máxima entre dois toques para eles ainda serem "o mesmo trabalho". */
const JANELA_RAJADA_MS = 12 * 60 * 1000

/** Id da gaveta de sobra do mapa, usada como último recurso de featureId. */
const ID_SOBRA = 'f-outros'

/**
 * Intervalos `claim.started` → `claim.completed`, por sessão. Tudo que cai
 * dentro de um deles já tem cartão de claim: não pode virar cartão de novo.
 */
function intervalosDeClaim(claims) {
  const abertos = new Map() // sessionId+feature → started
  const fechados = []
  for (const c of claims.slice().sort(asc)) {
    const k = `${c.sessionId ?? ''} ${chave(c.feature)}`
    if (c.kind === 'claim.started') abertos.set(k, c)
    else {
      const ini = abertos.get(k)
      if (!ini) continue
      abertos.delete(k)
      fechados.push({
        sessionId: c.sessionId,
        de: new Date(ini.at).getTime(),
        ate: new Date(c.at).getTime(),
      })
    }
  }
  return fechados
}

/**
 * Quebra os toques órfãos em rajadas: mesma sessão e menos de 12 minutos entre
 * um toque e o seguinte. Uma rajada de 12 arquivos é UM cartão, não 12.
 */
function rajadasOrfas(toques, claims) {
  const intervalos = intervalosDeClaim(claims)
  const dentroDeClaim = (t) => {
    const q = new Date(t.at).getTime()
    return intervalos.some(
      (i) => (!i.sessionId || i.sessionId === t.sessionId) && q >= i.de && q <= i.ate,
    )
  }

  const orfaos = toques.filter((t) => (t.files ?? []).length > 0 && !dentroDeClaim(t))

  // agrupa por sessão para não misturar dois agentes trabalhando ao mesmo tempo
  const porSessao = new Map()
  for (const t of orfaos) {
    const k = t.sessionId ?? ''
    if (!porSessao.has(k)) porSessao.set(k, [])
    porSessao.get(k).push(t)
  }

  const rajadas = []
  for (const lista of porSessao.values()) {
    let atual = null
    for (const t of lista.slice().sort(asc)) {
      const q = new Date(t.at).getTime()
      if (atual && q - atual.fim <= JANELA_RAJADA_MS) {
        atual.fim = q
        atual.eventos.push(t)
      } else {
        atual = { inicio: q, fim: q, eventos: [t] }
        rajadas.push(atual)
      }
    }
  }

  return rajadas.map((r) => {
    const arquivos = []
    for (const t of r.eventos) for (const p of t.files ?? []) if (!arquivos.includes(p)) arquivos.push(p)
    const ultimo = r.eventos[r.eventos.length - 1]
    return {
      id: `rajada-${ultimo.sessionId ?? 's'}-${ultimo.at}`,
      at: ultimo.at,
      de: r.eventos[0].at,
      agent: ultimo.agent ?? undefined,
      arquivos,
    }
  }).filter((r) => r.arquivos.length > 0)
}

/** Minutos entre dois instantes, sempre pelo menos 1 (0 min não diz nada a ninguém). */
const duracaoEmMinutos = (de, ate) =>
  Math.max(1, Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 60000))

// ------------------------------------------------------------- humanização

/**
 * Cartão de uma rajada órfã: a IA trabalhou e não declarou nada. Quem percebeu
 * foi o WTF, olhando os arquivos — e isso precisa ficar claro no texto.
 */
function montarProgresso(r, features) {
  // casa arquivo → feature pelos arquivos que cada feature já tem no snapshot.
  // Não inventamos feature nova: se nada casar, cai na primeira ou na sobra.
  const contagem = new Map()
  for (const p of r.arquivos) {
    for (const f of features) {
      if (f.files.includes(p)) {
        contagem.set(f.id, (contagem.get(f.id) ?? 0) + 1)
        break
      }
    }
  }

  let dono = null
  for (const f of features) {
    const n = contagem.get(f.id) ?? 0
    if (n > 0 && (!dono || n > (contagem.get(dono.id) ?? 0))) dono = f
  }

  const featureId = dono?.id ?? features[0]?.id ?? ID_SOBRA
  const partes = features.filter((f) => (contagem.get(f.id) ?? 0) > 0).map((f) => f.name)
  const rotulos = partes.length > 0 ? partes : [dono?.name ?? features[0]?.name ?? 'outras partes']

  const n = r.arquivos.length
  const headline =
    rotulos.length > 1
      ? `A IA mexeu em ${n} arquivos, em ${rotulos.length} partes do projeto.`
      : n === 1
        ? `A IA mexeu em um arquivo de "${rotulos[0]}".`
        : `A IA mexeu em ${n} arquivos de "${rotulos[0]}".`

  const minutos = duracaoEmMinutos(r.de, r.at)

  return {
    id: r.id,
    at: r.at,
    type: 'work.progress',
    source: 'agent',
    agent: r.agent,
    featureId,
    human: {
      headline,
      what:
        rotulos.length > 1
          ? `As partes tocadas foram: ${rotulos.join(', ')}.`
          : `O trabalho ficou todo dentro de "${rotulos[0]}".`,
      why: 'A IA não declarou o que estava fazendo. Quem percebeu foi o WTF, olhando os arquivos que ela abriu e alterou.',
      impact:
        'Esse trabalho ainda não foi salvo no histórico do projeto, então ainda não dá para saber se está completo nem se funciona.',
      affects: rotulos,
      needsYourAttention: false,
    },
    technical: {
      filesChanged: n,
      insertions: 0,
      deletions: 0,
      files: r.arquivos.slice(0, 24),
      dependenciesAdded: [],
      dependenciesRemoved: [],
    },
    evidence: [
      {
        id: `${r.id}-files`,
        kind: 'file_modified',
        confidence: 0.6,
        detail: `${n} arquivo(s) distinto(s) tocado(s) pela IA em cerca de ${minutos} minuto(s) de trabalho seguido.`,
        at: r.at,
      },
    ],
  }
}

/**
 * O cartão de "eu decidi sobre estes avisos".
 *
 * Fica no feed junto com o resto porque é isso que ele é: parte do que
 * aconteceu no projeto, com data e motivo. `needsYourAttention: false` porque
 * a decisão já foi tomada — o cartão informa, não cobra.
 */
function montarDecisaoDeSeguranca(e) {
  const n = Number(e.quantos) || 1
  const plural = n > 1
  const motivos = Array.isArray(e.motivos) ? e.motivos.filter(Boolean).slice(0, 6) : []

  return {
    id: e.id,
    at: e.at,
    type: 'risk.cleared',
    source: 'user',
    featureId: 'seguranca',
    human: {
      headline: plural
        ? `Você marcou ${n} avisos de segurança como falso alarme.`
        : 'Você marcou um aviso de segurança como falso alarme.',
      what: motivos.length
        ? `O motivo de cada um:\n${motivos.map((m) => `• ${m}`).join('\n')}`
        : 'Eles saíram da lista de coisas sensíveis.',
      why:
        'A varredura procura formatos, não certezas — e-mail institucional, ' +
        'dado de exemplo e número sorteado têm a cara do que ela caça.',
      impact:
        'Estes avisos não aparecem mais. Se o valor de algum deles mudar, ele ' +
        'volta a ser avisado: o que foi julgado foi aquele valor, não o lugar.',
      affects: [],
      needsYourAttention: false,
    },
    evidence: [],
  }
}

function montarEvento(c, feat, arquivos) {
  const comecou = c.kind === 'claim.started'
  const nome = feat.name

  const human = comecou
    ? {
        headline: `A IA começou a trabalhar em "${nome}".`,
        what: c.text
          ? `A IA avisou que ia mexer nesta parte. Nas palavras dela: ${c.text}`
          : 'A IA avisou que ia mexer nesta parte do projeto.',
        why: 'Foi o que a IA declarou ao iniciar o trabalho.',
        impact: 'Ainda não mudou nada que dê para conferir. É só um aviso de que o trabalho começou.',
        affects: [nome],
        needsYourAttention: false,
      }
    : {
        headline: `A IA terminou "${nome}".`,
        what: c.text
          ? `A IA declarou ter concluído esta parte. Nas palavras dela: ${c.text}`
          : 'A IA declarou ter concluído esta parte.',
        why: 'Foi o que a IA declarou ao encerrar o trabalho.',
        impact:
          arquivos.length > 0
            ? `A IA disse que terminou e ${arquivos.length === 1 ? 'um arquivo foi alterado' : `${arquivos.length} arquivos foram alterados`}. Isso mostra que houve trabalho, mas não é prova de que funciona — ninguém testou ainda.`
            : 'A IA disse que terminou. Isso não é prova de que funciona: é só a declaração dela, sem nada verificado.',
        affects: [nome],
        needsYourAttention: false,
      }

  const evidencias = [
    {
      id: `${c.id}-claim`,
      kind: 'agent_claim',
      confidence: 0.3,
      detail: comecou ? 'A IA declarou que começou este trabalho.' : 'A IA declarou que terminou este trabalho.',
      at: c.at,
    },
  ]
  if (arquivos.length > 0) {
    evidencias.push({
      id: `${c.id}-files`,
      kind: 'file_modified',
      confidence: 0.6,
      detail: `${arquivos.length} arquivo(s) distinto(s) tocado(s) pela IA entre o início e o fim deste trabalho.`,
      at: c.at,
    })
  }

  return {
    id: c.id,
    at: c.at,
    type: comecou ? 'work.started' : 'work.completed',
    source: 'agent',
    agent: c.agent ?? undefined,
    featureId: feat.id,
    claim: c.text ?? undefined,
    human,
    technical: {
      filesChanged: arquivos.length,
      insertions: 0,
      deletions: 0,
      files: arquivos.slice(0, 24),
      dependenciesAdded: [],
      dependenciesRemoved: [],
    },
    evidence: evidencias,
  }
}
