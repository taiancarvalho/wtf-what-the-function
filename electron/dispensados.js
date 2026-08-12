/**
 * Achados de segurança que a pessoa marcou como falso alarme:
 * `<projeto>/.wtf/seguranca-dispensada.json`.
 *
 * A varredura é heurística — ela procura formatos, não certezas. Um e-mail de
 * remetente do sistema, um CPF de exemplo na documentação, uma chave de
 * sandbox: todos parecem exatamente o que ela procura, e nenhum é problema.
 *
 * Sem uma saída, o efeito é conhecido e é o pior possível: a varredura roda a
 * cada leitura, o mesmo aviso volta para sempre, e quem lê aprende a ignorar
 * avisos de segurança. Um alerta que nunca some ensina a não olhar.
 *
 * ⚠️ A DISPENSA CADUCA SOZINHA.
 *
 * O que é guardado não é "o arquivo tal, linha tal" — é a IMPRESSÃO DIGITAL do
 * achado, que inclui o trecho mascarado. Se o valor naquele lugar mudar, a
 * impressão muda, e o aviso VOLTA. Sem isso, dispensar "e-mail em
 * auth-providers.ts:14" silenciaria para sempre aquela linha — e o dia em que
 * alguém colasse ali uma chave de verdade seria o dia em que o painel ficaria
 * quieto. Dispensar vale para o achado que a pessoa viu, e só para ele.
 *
 * Formato: { v: 1, itens: { "<digital>": { at: ISO, por, nota } } }
 */

import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const arquivoDe = (dir) => path.join(dir, '.wtf', 'seguranca-dispensada.json')

/**
 * A impressão digital de um achado: o TIPO e o VALOR. Não o lugar.
 *
 * ⚠️ ISTO JÁ FOI `tipo|arquivo|linha|valor`, E ESTAVA ERRADO.
 *
 * Incluir arquivo e linha parecia mais seguro, e na prática era o contrário:
 * um e-mail institucional que a lei obriga a mostrar na tela é falso positivo
 * PARA SEMPRE, mas bastava alguém acrescentar uma linha acima dele para o
 * aviso voltar — e a pessoa marcava de novo, e de novo. Um alerta que
 * ressuscita a cada edição do arquivo ensina exatamente o que este painel
 * existe para evitar: a ignorar alertas.
 *
 * O que precisa continuar valendo é a outra metade: se o VALOR daquele lugar
 * mudar, a dispensa não vale mais. Foi julgado o `dpo@empresa.com`, não a
 * linha 18 — e o dia em que aparecer uma chave de verdade ali, o painel avisa,
 * porque o valor é outro.
 *
 * `trecho` já vem mascarado da varredura (nunca o valor inteiro), e é isso que
 * faz esta chave poder ser gravada em disco sem virar mais um lugar onde o
 * segredo existe.
 */
export function digitalDoAchado(achado) {
  if (!achado || typeof achado !== 'object') return null
  const { tipo, trecho } = achado
  if (typeof trecho !== 'string' || !trecho) return null
  return [tipo ?? '?', trecho].join('|')
}

/** Lê as dispensas. Nunca lança: arquivo ausente ou podre valem "nenhuma". */
export async function lerDispensados(dir) {
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
  const itens = dados?.itens
  if (!itens || typeof itens !== 'object') return {}

  // Entrada por entrada: uma linha estragada não derruba as outras.
  const out = {}
  for (const [chave, v] of Object.entries(itens)) {
    if (!chave || !v || typeof v !== 'object') continue
    const at = typeof v.at === 'string' && !Number.isNaN(new Date(v.at).getTime()) ? v.at : null
    if (!at) continue
    out[chave] = {
      at,
      por: typeof v.por === 'string' ? v.por : 'usuario',
      nota: typeof v.nota === 'string' ? v.nota : '',
    }
  }
  return out
}

/**
 * Marca um achado como falso alarme, ou alterna o estado dele.
 *
 * ⚠️ `acao: 'marcar'` NÃO É DETALHE — é o conserto de um bug que devolvia
 * avisos já resolvidos para a tela.
 *
 * Quando a impressão digital passou a ser TIPO + VALOR (para o mesmo e-mail
 * institucional em quatro páginas ser julgado de uma vez), vários achados
 * passaram a compartilhar a mesma chave. E o botão "concordo com todos" é um
 * laço: para os quatro e-mails, alternar quatro vezes é marcar, desmarcar,
 * marcar, desmarcar — a pessoa clicava em aceitar sete e seis voltavam. Pior
 * que não funcionar: parecia que o painel tinha ignorado a decisão dela.
 *
 * Alternar dentro de um laço é sempre errado. Quem aceita PEDE O ESTADO FINAL,
 * e pedir duas vezes o mesmo estado tem que dar no mesmo. A alternância
 * continua existindo para o clique único que também serve para desfazer.
 */
export async function alternarDispensado(dir, achado, nota, acao = 'alternar') {
  const chave = digitalDoAchado(achado)
  if (!dir || !chave) return { dispensado: false, itens: {} }

  const itens = await lerDispensados(dir)
  const jaTinha = Boolean(itens[chave])
  const tirar = jaTinha && acao !== 'marcar'

  if (tirar) delete itens[chave]
  else if (!jaTinha) {
    itens[chave] = { at: new Date().toISOString(), por: 'usuario', nota: String(nota ?? '') }
  }

  await mkdir(path.dirname(arquivoDe(dir)), { recursive: true })
  await writeFile(arquivoDe(dir), JSON.stringify({ v: 1, itens }, null, 2) + '\n', 'utf8')
  return { dispensado: !tirar, itens, jaEstava: jaTinha }
}

const arquivoPropostas = (dir) => path.join(dir, '.wtf', 'seguranca-propostas.json')

/**
 * As propostas de falso positivo escritas pela IA.
 *
 * Chave: `<arquivo>:<linha>`. É por arquivo e linha, e não pela impressão
 * digital completa, porque a IA não conhece o trecho mascarado — ela olhou o
 * arquivo, não o painel. Quando a pessoa ACEITA, aí sim gravamos a digital
 * inteira, e a dispensa passa a caducar se o valor daquele lugar mudar.
 */
export async function lerPropostas(dir) {
  if (!dir) return {}
  let dados
  try {
    dados = JSON.parse(await readFile(arquivoPropostas(dir), 'utf8'))
  } catch {
    return {}
  }
  const itens = dados?.itens
  if (!itens || typeof itens !== 'object') return {}

  const out = {}
  for (const [chave, v] of Object.entries(itens)) {
    if (!chave || !v || typeof v !== 'object') continue
    const motivo = typeof v.motivo === 'string' ? v.motivo.trim() : ''
    if (!motivo) continue // proposta sem motivo não dá para ninguém decidir
    out[chave] = {
      motivo,
      at: typeof v.at === 'string' ? v.at : null,
      por: typeof v.por === 'string' ? v.por : 'ia',
      // 'real' = a IA conferiu e CONFIRMOU. O aviso fica, e fica em destaque.
      veredito: v.veredito === 'real' ? 'real' : 'falso-positivo',
    }
  }
  return out
}

/** Tira uma proposta da lista — quando a pessoa aceita ou recusa. */
export async function removerProposta(dir, arquivo, linha) {
  if (!dir || !arquivo) return
  const itens = await lerPropostas(dir)
  delete itens[`${arquivo}:${linha}`]
  await mkdir(path.dirname(arquivoPropostas(dir)), { recursive: true })
  await writeFile(
    arquivoPropostas(dir),
    JSON.stringify({ v: 1, itens }, null, 2) + '\n',
    'utf8',
  )
}

/**
 * Separa os achados entre os que continuam valendo e os dispensados.
 *
 * Devolve os dois lados, nunca só um: o painel precisa poder dizer "3 achados,
 * e mais 2 que você marcou como falso alarme". Sumir com o que foi dispensado
 * transformaria uma decisão da pessoa em apagamento — e ela perderia o caminho
 * de voltar atrás.
 */
export function separarDispensados(varredura, dispensados, propostas) {
  if (!varredura || !Array.isArray(varredura.achados)) return varredura
  const mapa = dispensados ?? {}
  const sugeridas = propostas ?? {}

  const valem = []
  const fora = []
  for (const a of varredura.achados) {
    const chave = digitalDoAchado(a)
    const d = chave ? mapa[chave] : null
    if (d) {
      fora.push({ ...a, dispensadoEm: d.at, nota: d.nota })
      continue
    }
    // A proposta viaja COM o achado: quem lê o aviso lê, na mesma linha, o
    // motivo pelo qual a IA acha que ele não é problema.
    const p = sugeridas[`${a.arquivo}:${a.linha}`]
    valem.push(
      p ? { ...a, proposta: { motivo: p.motivo, at: p.at, por: p.por, veredito: p.veredito } } : a,
    )
  }

  return { ...varredura, achados: valem, dispensados: fora }
}

/**
 * Registra no histórico do projeto que uma decisão foi tomada.
 *
 * Vai para o mesmo `events.jsonl` que a IA usa, porque é o mesmo tipo de coisa:
 * algo que aconteceu, com data e motivo. Uma decisão que não deixa rastro é uma
 * decisão que ninguém consegue revisar depois — inclusive quem a tomou.
 */
export async function registrarDecisao(dir, achados) {
  if (!dir || !Array.isArray(achados) || achados.length === 0) return
  const evento = {
    v: 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    kind: 'seguranca.decidida',
    agent: 'wtf',
    sessionId: 'painel',
    quantos: achados.length,
    motivos: achados.map((a) => a?.nota || a?.rotulo).filter(Boolean),
  }
  try {
    await mkdir(path.join(dir, '.wtf'), { recursive: true })
    await appendFile(
      path.join(dir, '.wtf', 'events.jsonl'),
      JSON.stringify(evento).replace(/\n/g, ' ') + '\n',
      'utf8',
    )
  } catch {
    /* registrar é desejável, nunca obrigatório: não derruba a dispensa */
  }
}
