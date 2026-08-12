/**
 * Avisos do sistema operacional: `<projeto>/.wtf/notified.json`.
 *
 * ⚠️  A REGRA QUE MANDA EM TUDO AQUI
 * ==================================
 * NOTIFICAÇÃO QUE APARECE DEMAIS É DESLIGADA PELO USUÁRIO — e aí ela deixa de
 * existir justamente no dia em que importa. Este módulo notifica POUCO, e só o
 * que exige uma DECISÃO da pessoa:
 *
 *   • um assunto novo pedindo atenção  → "algo depende de você"
 *   • uma parte aprovada que mudou     → a aprovação dela caducou
 *
 * E NÃO notifica: commit novo, arquivo tocado, tradução pronta, trabalho não
 * salvo. Nada disso exige decisão imediata; notificar isso é o caminho mais
 * curto para a pessoa desligar tudo. Antes de acrescentar um gatilho aqui,
 * pergunte: "isso pede uma decisão dela AGORA?". Se a resposta não for um sim
 * óbvio, não entra.
 *
 * Três travas moram junto com a regra:
 *   1. consentimento — `config.notificar` nasce em 'nao' (ver config.js).
 *   2. antirrepetição — o mesmo assunto nunca notifica duas vezes.
 *   3. silêncio noturno — nada entre 22h e 7h; fica guardado e sai depois.
 *
 * Formato do arquivo: { v: 1, itens: { "<chave>": "<ISO>" } }
 * Como os outros módulos de estado, a leitura é TOLERANTE: arquivo ausente,
 * JSON quebrado ou formato estranho valem todos a mesma coisa — nada notificado.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const arquivoDe = (dir) => path.join(dir, '.wtf', 'notified.json')

/** Início e fim do silêncio noturno, em horas locais. */
export const NOITE_COMECA = 22
export const NOITE_TERMINA = 7

/**
 * Código curto de um evento.
 *
 * ⚠️ DUPLICADO de `src/lib/format.ts` e `electron/events.js` — o processo main
 * não importa de `src/`. Se um lado mudar, os outros TÊM que mudar junto.
 */
function codigoCurto(id) {
  let h = 0
  for (let i = 0; i < String(id).length; i++) {
    h = (h * 31 + String(id).charCodeAt(i)) >>> 0
  }
  return h.toString(36).toUpperCase().slice(-4).padStart(4, '0')
}

/*
 * Os textos vivem aqui, e não no i18n do renderer, porque quem escreve a
 * notificação é o processo main — ele não tem React nem contexto de idioma.
 */
const TEXTOS = {
  'pt-BR': {
    umTitulo: (parte) => `${parte} precisa da sua decisão`,
    variosTitulo: (n) => `${n} coisas precisam da sua decisão`,
    variosCorpo: 'Abra o WTF para ver o que está esperando por você.',
    revalidarTitulo: (parte) => `${parte} mudou depois que você aprovou`,
    revalidarCorpo: 'A sua aprovação anterior caducou. Vale olhar de novo.',
    testeTitulo: 'Os avisos do WTF estão funcionando',
    testeCorpo: 'É assim que o WTF vai te chamar quando algo depender de você.',
    semMotivo: 'Abra o WTF para ver o que está esperando por você.',
  },
  en: {
    umTitulo: (parte) => `${parte} needs your decision`,
    variosTitulo: (n) => `${n} things need your decision`,
    variosCorpo: 'Open WTF to see what is waiting for you.',
    revalidarTitulo: (parte) => `${parte} changed after you approved it`,
    revalidarCorpo: 'Your earlier approval no longer holds. Worth another look.',
    testeTitulo: 'WTF notifications are working',
    testeCorpo: 'This is how WTF will reach you when something depends on you.',
    semMotivo: 'Open WTF to see what is waiting for you.',
  },
  es: {
    umTitulo: (parte) => `${parte} necesita tu decisión`,
    variosTitulo: (n) => `${n} cosas necesitan tu decisión`,
    variosCorpo: 'Abre WTF para ver qué está esperándote.',
    revalidarTitulo: (parte) => `${parte} cambió después de que la aprobaste`,
    revalidarCorpo: 'Tu aprobación anterior caducó. Vale la pena mirarla otra vez.',
    testeTitulo: 'Los avisos de WTF funcionan',
    testeCorpo: 'Así te va a avisar WTF cuando algo dependa de ti.',
    semMotivo: 'Abre WTF para ver qué está esperándote.',
  },
}

const textosDe = (config) => TEXTOS[config?.idiomaInterface] ?? TEXTOS['pt-BR']

/** Está dentro do silêncio noturno? */
export function noiteSilenciosa(agora, config) {
  if (config?.silencioNoturno === false) return false
  const h = (agora instanceof Date ? agora : new Date(agora)).getHours()
  return h >= NOITE_COMECA || h < NOITE_TERMINA
}

/**
 * Os assuntos que pedem atenção, no formato mínimo que a notificação precisa.
 *
 * Versão enxuta de `montarAssuntos` (src/lib/assuntos.ts): a notificação conta
 * ASSUNTOS, nunca eventos — três respostas continuam sendo um aviso só. Quem
 * decide se o assunto ainda cobra é a ÚLTIMA resposta, não o aviso original.
 */
function assuntosPendentes(snapshot) {
  const eventos = Array.isArray(snapshot?.events) ? snapshot.events : []
  const porCodigo = new Map()
  for (const e of eventos) {
    const c = codigoCurto(e.id)
    if (!porCodigo.has(c)) porCodigo.set(c, e)
  }

  const raizDe = (evento) => {
    const visitados = new Set([evento.id])
    let atual = evento
    while (atual.respondeA) {
      const anterior = porCodigo.get(atual.respondeA)
      if (!anterior || visitados.has(anterior.id)) break
      visitados.add(anterior.id)
      atual = anterior
    }
    return atual
  }

  const raizes = []
  const respostasPor = new Map()
  for (const e of eventos) {
    const raiz = e.respondeA ? raizDe(e) : e
    if (raiz.id === e.id) {
      raizes.push(e)
      continue
    }
    const lista = respostasPor.get(raiz.id)
    if (lista) lista.push(e)
    else respostasPor.set(raiz.id, [e])
  }

  const maisAntigoPrimeiro = (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  const nomeDaParte = new Map(
    (Array.isArray(snapshot?.features) ? snapshot.features : []).map((f) => [f.id, f.name]),
  )

  const pendentes = []
  for (const aviso of raizes) {
    const respostas = (respostasPor.get(aviso.id) ?? []).slice().sort(maisAntigoPrimeiro)
    const ultimo = respostas.at(-1) ?? aviso
    if (aviso.resolvido) continue
    if (!ultimo.human?.needsYourAttention) continue
    pendentes.push({
      id: aviso.id,
      /*
       * NUNCA cair no identificador. "f1 precisa da sua decisão" numa
       * notificação do sistema é exatamente o tipo de vazamento técnico que
       * este produto existe para eliminar — e aqui doeria mais, porque a
       * notificação chega fora do app, sem contexto nenhum.
       */
      parte: nomeDaParte.get(aviso.featureId) || aviso.human?.headline || '',
      motivo: ultimo.human?.attentionReason || '',
    })
  }
  return pendentes
}

/**
 * A decisão, pura: o que deveria ser notificado agora.
 *
 * Não toca em Electron nem em disco — é aqui que mora a regra do módulo, e é
 * por isso que ela é testável (ver tests/notify.test.ts).
 *
 * @param {object|null} antes  snapshot anterior (`null` na primeira leitura)
 * @param {object|null} depois snapshot novo
 * @param {Record<string,string>} jaNotificados chaves já avisadas
 * @param {Date} agora
 * @param {object} config preferências do projeto
 * @returns {{chaves: string[], titulo: string, corpo: string, aba: string}[]}
 */
export function decidirNotificacoes(antes, depois, jaNotificados = {}, agora = new Date(), config = {}) {
  // 1. Consentimento. Sem 'sim' explícito, nada sai. Nunca.
  if (config?.notificar !== 'sim') return []
  // 2. Silêncio noturno: nada sai, e nada é marcado como notificado — o aviso
  //    continua pendente e sai na próxima verificação em horário decente.
  if (noiteSilenciosa(agora, config)) return []
  // 3. Primeira leitura da sessão é só linha de base. Sem isto, abrir o app
  //    despejaria o histórico inteiro de uma vez na cara da pessoa.
  if (!antes || !depois) return []

  const txt = textosDe(config)
  const avisos = []

  // ---------------------------------------------------- assuntos pendentes
  const pendentesAntes = new Set(assuntosPendentes(antes).map((a) => a.id))
  const novos = assuntosPendentes(depois).filter(
    (a) => !pendentesAntes.has(a.id) && !jaNotificados[`assunto:${a.id}`],
  )

  if (novos.length === 1) {
    const a = novos[0]
    avisos.push({
      chaves: [`assunto:${a.id}`],
      titulo: a.parte ? txt.umTitulo(a.parte) : txt.variosTitulo(1),
      corpo: a.motivo || txt.semMotivo,
      aba: 'timeline',
    })
  } else if (novos.length > 1) {
    // Agregada: uma notificação para a rajada inteira. Cinco avisos viram uma
    // interrupção, não cinco.
    avisos.push({
      chaves: novos.map((a) => `assunto:${a.id}`),
      titulo: txt.variosTitulo(novos.length),
      corpo: txt.variosCorpo,
      aba: 'timeline',
    })
  }

  // --------------------------------------- parte aprovada que mudou depois
  // O aviso mais valioso do produto: a pessoa olhou, aprovou, e o chão se
  // moveu embaixo dela. Por isso ele merece uma notificação só dele.
  const revalidarAntes = new Set(
    (Array.isArray(antes.features) ? antes.features : [])
      .filter((f) => f.revalidar)
      .map((f) => f.id),
  )
  for (const f of Array.isArray(depois.features) ? depois.features : []) {
    if (!f.revalidar || revalidarAntes.has(f.id)) continue
    if (!f.name && !f.summary) continue
    const chave = `revalidar:${f.id}`
    if (jaNotificados[chave]) continue
    avisos.push({
      chaves: [chave],
      // Sem nome, a notificação não sai: melhor calar do que dizer "f-1".
      titulo: txt.revalidarTitulo(f.name || f.summary || ''),
      corpo: txt.revalidarCorpo,
      aba: 'build',
    })
  }

  return avisos
}

// ------------------------------------------------------------------ disco

/** Lê o que já foi notificado. Nunca lança. */
export async function lerNotificados(dir) {
  if (!dir) return {}
  let bruto
  try {
    bruto = await readFile(arquivoDe(dir), 'utf8')
  } catch {
    return {}
  }
  let dados
  try {
    dados = JSON.parse(bruto)
  } catch {
    return {}
  }
  const itens = dados && typeof dados === 'object' ? dados.itens : null
  if (!itens || typeof itens !== 'object') return {}

  const limpo = {}
  for (const [chave, quando] of Object.entries(itens)) {
    if (typeof chave !== 'string' || !chave.trim()) continue
    if (typeof quando === 'string' && quando) limpo[chave.trim()] = quando
  }
  return limpo
}

/** Registra as chaves como já notificadas. Falhar aqui não quebra nada. */
export async function marcarNotificados(dir, chaves, agora = new Date()) {
  const atuais = await lerNotificados(dir)
  const lista = Array.isArray(chaves) ? chaves.filter((c) => typeof c === 'string' && c) : []
  if (lista.length === 0) return atuais

  const quando = (agora instanceof Date ? agora : new Date(agora)).toISOString()
  const final = { ...atuais }
  for (const c of lista) final[c] = quando
  if (!dir) return final
  try {
    await mkdir(path.join(dir, '.wtf'), { recursive: true })
    await writeFile(arquivoDe(dir), `${JSON.stringify({ v: 1, itens: final }, null, 2)}\n`, 'utf8')
  } catch {
    /* avisar é serviço secundário: falhar ao anotar não pode derrubar o painel */
  }
  return final
}

// --------------------------------------------------------------- Electron

/**
 * Dispara UMA notificação do sistema.
 *
 * `janela` entra por parâmetro para o módulo não depender do estado do main.
 * Com a janela em foco, nada é mostrado: quem já está olhando o painel não
 * precisa de aviso — precisa ser deixado em paz.
 *
 * Clicar traz a janela para frente e manda o renderer abrir a aba certa.
 */
export async function notificar({ titulo, corpo, aba }, janela) {
  if (!titulo) return { enviada: false, motivo: 'sem-titulo' }
  if (janela && !janela.isDestroyed?.() && janela.isFocused?.()) {
    return { enviada: false, motivo: 'janela-em-foco' }
  }

  let Notification
  try {
    ;({ Notification } = await import('electron'))
  } catch {
    return { enviada: false, motivo: 'sem-electron' }
  }
  if (!Notification?.isSupported?.()) return { enviada: false, motivo: 'sem-suporte' }

  const n = new Notification({ title: titulo, body: corpo ?? '', silent: false })
  n.on('click', () => {
    if (!janela || janela.isDestroyed?.()) return
    janela.show?.()
    janela.focus?.()
    if (aba) janela.webContents?.send?.('wtf:ir-para', aba)
  })
  n.show()
  return { enviada: true }
}

/** A notificação de exemplo do botão "Testar aviso" em Configurações. */
export async function notificarTeste(janela, config = {}) {
  const txt = textosDe(config)
  /*
   * O teste ignora foco, silêncio noturno e antirrepetição de propósito: ele
   * existe para a pessoa DESCOBRIR se o sistema dela está bloqueando os avisos.
   * Um teste que não aparece porque a janela está em foco não testa nada.
   */
  let Notification
  try {
    ;({ Notification } = await import('electron'))
  } catch {
    return { enviada: false, motivo: 'sem-electron' }
  }
  if (!Notification?.isSupported?.()) return { enviada: false, motivo: 'sem-suporte' }

  const n = new Notification({ title: txt.testeTitulo, body: txt.testeCorpo })
  n.on('click', () => {
    if (!janela || janela.isDestroyed?.()) return
    janela.show?.()
    janela.focus?.()
  })
  n.show()
  return { enviada: true }
}
