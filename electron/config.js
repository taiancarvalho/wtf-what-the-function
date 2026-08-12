/**
 * Preferências do projeto observado: `<projeto>/.wtf/config.json`.
 *
 * Duas coisas DIFERENTES vivem aqui, e confundi-las quebra o produto:
 *
 *   idiomaInterface  — os textos do próprio app. Só existem três: pt-BR, en, es.
 *   idiomaConteudo   — a língua em que a IA escreve as explicações e as
 *                      declarações. Pode ser QUALQUER língua, inclusive uma que
 *                      a interface não tenha (chinês, japonês, alemão...).
 *
 * Alguém pode querer ler o app em inglês e receber as explicações em chinês.
 * Por isso `nomeIdiomaConteudo` existe: é o nome POR EXTENSO que entra dentro
 * dos prompts e da skill ("chinês simplificado", "日本語"). Aceitamos qualquer
 * string; para os três idiomas conhecidos preenchemos sozinhos.
 *
 * Formato: { v: 1, idiomaInterface, idiomaConteudo, nomeIdiomaConteudo }
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const arquivoDe = (dir) => path.join(dir, '.wtf', 'config.json')

/** Os três idiomas que a INTERFACE tem. O conteúdo não se limita a estes. */
export const IDIOMAS_INTERFACE = ['pt-BR', 'en', 'es']

/** Nome por extenso dos idiomas que já conhecemos, no próprio idioma do app. */
export const NOMES_CONHECIDOS = {
  'pt-BR': 'português do Brasil',
  en: 'inglês',
  es: 'espanhol',
}

/** As três respostas possíveis para "posso traduzir usando o seu agente?". */
export const TRADUZIR_AUTO = ['perguntar', 'sim', 'nao']

/**
 * Teto de traduções por rodada.
 *
 * Antes eram 4 chamadas × 8 eventos = 32 traduções cada vez que o painel
 * recarregava. Ninguém autorizou isso. O padrão agora é conservador: 8 por
 * rodada. O resto entra nas rodadas seguintes e, uma vez traduzido, fica no
 * cache para sempre — a conta não se repete.
 */
export const MAX_TRADUCOES_PADRAO = 8

export const CONFIG_PADRAO = {
  v: 1,
  idiomaInterface: 'pt-BR',
  idiomaConteudo: 'pt-BR',
  nomeIdiomaConteudo: NOMES_CONHECIDOS['pt-BR'],
  /*
   * 'perguntar' é o padrão porque consumir recurso de alguém sem perguntar é
   * exatamente o comportamento que este produto existe para combater. Com
   * 'nao', o painel continua INTEIRO: ele segue lendo o repositório, mostrando
   * estados, avisos, mapa e progresso, com o texto heurístico de translate.js.
   * O caminho gratuito é um caminho completo, não uma versão capenga.
   */
  traduzirAuto: 'perguntar',
  maxTraducoesPorRodada: MAX_TRADUCOES_PADRAO,
  /*
   * O aviso de custo do "Explique isso" só aparece uma vez. Depois de aceito,
   * a pessoa já sabe que aquilo consome créditos da chave dela — repetir o
   * aviso a cada pergunta viraria mais um "OK, OK, OK".
   */
  avisoCustoAceito: false,
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * Nome por extenso de um código de idioma. Para os três conhecidos, sabemos a
 * resposta; para qualquer outro (`zh-Hans`, `de`...) o próprio código é o
 * melhor palpite até alguém informar o nome.
 */
export function nomeDoIdioma(codigo, nomeInformado) {
  const informado = str(nomeInformado)
  if (informado) return informado
  const c = str(codigo)
  return NOMES_CONHECIDOS[c] || c || CONFIG_PADRAO.nomeIdiomaConteudo
}

function normalizar(dados) {
  const bruto = dados && typeof dados === 'object' ? dados : {}

  const iface = IDIOMAS_INTERFACE.includes(str(bruto.idiomaInterface))
    ? str(bruto.idiomaInterface)
    : CONFIG_PADRAO.idiomaInterface

  // O idioma de conteúdo NÃO é validado contra a lista da interface de
  // propósito: qualquer língua do mundo é um valor legítimo aqui.
  const conteudo = str(bruto.idiomaConteudo) || iface

  // Modelo usado nas perguntas do "Explique isso". Guardado como texto livre:
  // a lista de modelos muda toda semana, e travar numa lista fixa deixaria o
  // app velho antes do próximo lançamento.
  const modelo = str(bruto.modeloPergunta)

  // Valor estranho vale 'perguntar': na dúvida, não gaste o recurso de ninguém.
  const auto = TRADUZIR_AUTO.includes(str(bruto.traduzirAuto))
    ? str(bruto.traduzirAuto)
    : CONFIG_PADRAO.traduzirAuto

  // Teto: inteiro entre 0 e 200. 0 é legítimo — significa "nunca traduza
  // sozinho", e o painel segue funcionando com o texto heurístico.
  const tetoBruto = Number(bruto.maxTraducoesPorRodada)
  const teto = Number.isFinite(tetoBruto)
    ? Math.min(200, Math.max(0, Math.floor(tetoBruto)))
    : MAX_TRADUCOES_PADRAO

  return {
    v: 1,
    idiomaInterface: iface,
    idiomaConteudo: conteudo,
    nomeIdiomaConteudo: nomeDoIdioma(conteudo, bruto.nomeIdiomaConteudo),
    traduzirAuto: auto,
    maxTraducoesPorRodada: teto,
    avisoCustoAceito: bruto.avisoCustoAceito === true,
    ...(modelo ? { modeloPergunta: modelo } : {}),
  }
}

/**
 * Lê as preferências. Nunca lança: arquivo ausente, JSON quebrado ou formato
 * estranho valem todos a mesma coisa — os padrões.
 */
export async function lerConfig(dir) {
  if (!dir) return { ...CONFIG_PADRAO }
  let bruto
  try {
    bruto = await readFile(arquivoDe(dir), 'utf8')
  } catch {
    return { ...CONFIG_PADRAO }
  }
  try {
    return normalizar(JSON.parse(bruto))
  } catch {
    return { ...CONFIG_PADRAO }
  }
}

/**
 * Salva um pedaço das preferências (merge sobre o que já existe) e devolve o
 * config final já normalizado.
 *
 * Regra: mudar `idiomaConteudo` sem informar o nome refaz o nome sozinho —
 * senão sobraria o nome da língua anterior dentro dos prompts, que é
 * exatamente o tipo de erro silencioso que ninguém percebe.
 */
export async function salvarConfig(dir, parcial) {
  const atual = await lerConfig(dir)
  const p = parcial && typeof parcial === 'object' ? parcial : {}

  const mesclado = { ...atual, ...p }
  const trocouConteudo = str(p.idiomaConteudo) && str(p.idiomaConteudo) !== atual.idiomaConteudo
  if (trocouConteudo && !str(p.nomeIdiomaConteudo)) mesclado.nomeIdiomaConteudo = ''

  const final = normalizar(mesclado)
  if (!dir) return final

  await mkdir(path.join(dir, '.wtf'), { recursive: true })
  await writeFile(arquivoDe(dir), `${JSON.stringify(final, null, 2)}\n`, 'utf8')
  return final
}
