import { loadSnapshot } from '@/mock/snapshot'
import type {
  ConfigProjeto,
  ContextoPergunta,
  EstadoGlobal,
  Historico,
  ListaProjetos,
  ProjetoConhecido,
  PacoteInstalacao,
  PedacoResposta,
  ProjectSnapshot,
  RespostaTraducao,
  FimTerminal,
  SaidaTerminal,
  SessaoTerminal,
  TraducaoPendente,
  UsoProjeto,
} from '@/types/protocol'

/** De onde vieram os dados na tela. O usuário precisa saber disso. */
export type Fonte = 'real' | 'exemplo'

export interface Carga {
  snapshot: ProjectSnapshot
  fonte: Fonte
  erro?: string
}

interface PonteWtf {
  getSnapshot?: () => Promise<unknown>
  recalcularHistorico?: () => Promise<unknown>
  escolherProjeto?: () => Promise<unknown>
  listarProjetos?: () => Promise<unknown>
  abrirProjeto?: (caminho: string) => Promise<unknown>
  esquecerProjeto?: (caminho: string) => Promise<unknown>
  fixarProjeto?: (caminho: string, valor: boolean) => Promise<unknown>
  instalar?: () => Promise<unknown>
  desinstalar?: () => Promise<unknown>
  instalarGlobal?: () => Promise<unknown>
  desinstalarGlobal?: () => Promise<unknown>
  habilitarProjeto?: () => Promise<unknown>
  desabilitarProjeto?: () => Promise<unknown>
  lerPacoteInstalacao?: () => Promise<unknown>
  abrirTerminal?: (mensagem?: string) => Promise<unknown>
  terminalAbrir?: (opcoes: { mensagem?: string; cols?: number; rows?: number }) => Promise<unknown>
  terminalEscrever?: (id: string, dados: string) => Promise<unknown>
  terminalRedimensionar?: (id: string, cols: number, rows: number) => Promise<unknown>
  terminalEncerrar?: (id: string) => Promise<unknown>
  terminalColar?: (id: string, texto: string) => Promise<unknown>
  textoPedido?: (tipo: string) => Promise<string | null>
  gerados?: () => Promise<unknown>
  apagarGerado?: (chave: string) => Promise<unknown>
  dispensarAchado?: (achado: unknown, nota?: string, acao?: string) => Promise<unknown>
  recusarProposta?: (arquivo: string, linha: number) => Promise<unknown>
  aoSairDoTerminal?: (cb: (dados: SaidaTerminal) => void) => () => void
  aoTerminarTerminal?: (cb: (dados: FimTerminal) => void) => () => void
  mapear?: () => Promise<unknown>
  mapearPastas?: () => Promise<unknown>
  mapearDocumentos?: () => Promise<unknown>
  lerArquivo?: (relativo: string) => Promise<unknown>
  lerConfig?: () => Promise<unknown>
  salvarConfig?: (parcial: Partial<ConfigProjeto>) => Promise<unknown>
  resolver?: (eventId: string) => Promise<unknown>
  validar?: (featureId: string) => Promise<unknown>
  aoMudarProjeto?: (cb: (motivo: string) => void) => () => void
  perguntar?: (pedido: unknown) => Promise<unknown>
  aoReceberResposta?: (cb: (dados: PedacoResposta) => void) => () => void
  lerUso?: () => Promise<unknown>
  traducaoPendentes?: () => Promise<unknown>
  responderTraducao?: (resposta: RespostaTraducao) => Promise<unknown>
  aoPedirTraducao?: (cb: (dados: TraducaoPendente) => void) => () => void
  testarNotificacao?: () => Promise<unknown>
  aoIrPara?: (cb: (aba: string) => void) => () => void
}

/** Um arquivo do projeto, aberto dentro do app. */
export interface ArquivoAberto {
  caminho: string
  conteudo?: string
  linhas?: number
  bytes?: number
  ext?: string
  erro?: string
  binario?: boolean
}

function ponte(): PonteWtf | undefined {
  return (globalThis as { wtf?: PonteWtf }).wtf
}

export const podeEscolherProjeto = () => typeof ponte()?.escolherProjeto === 'function'

function ehSnapshot(v: unknown): v is ProjectSnapshot {
  return !!v && typeof v === 'object' && 'project' in v && 'events' in v
}

function erroDe(v: unknown): string | undefined {
  if (v && typeof v === 'object' && 'erro' in v) return String((v as { erro: unknown }).erro)
  return undefined
}

/** Tenta o projeto real; cai no exemplo quando não há nenhum apontado. */
export async function carregar(): Promise<Carga> {
  const p = ponte()
  if (p?.getSnapshot) {
    try {
      const r = await p.getSnapshot()
      if (ehSnapshot(r)) return { snapshot: r, fonte: 'real' }
      const erro = erroDe(r)
      if (erro) return { snapshot: await loadSnapshot(), fonte: 'exemplo', erro }
    } catch (e) {
      return {
        snapshot: await loadSnapshot(),
        fonte: 'exemplo',
        erro: e instanceof Error ? e.message : String(e),
      }
    }
  }
  return { snapshot: await loadSnapshot(), fonte: 'exemplo' }
}

export const podeVerHistorico = () => typeof ponte()?.recalcularHistorico === 'function'

/**
 * Força a reconstrução do histórico e devolve os marcos.
 *
 * Só use quando a tela precisa do passado JÁ: o snapshot normal já traz
 * `historico` do cache, e o recálculo acontece sozinho em segundo plano,
 * avisando por `aoMudarProjeto('historico')`.
 */
export async function recalcularHistorico(): Promise<Historico | null> {
  const p = ponte()
  if (!p?.recalcularHistorico) return null
  try {
    const r = await p.recalcularHistorico()
    if (r && typeof r === 'object' && 'marcos' in r) return r as Historico
    return null
  } catch {
    return null
  }
}

export const podeInstalar = () => typeof ponte()?.instalar === 'function'
export const podeVerPacote = () => typeof ponte()?.lerPacoteInstalacao === 'function'

/**
 * Tudo o que a instalação escreveria no projeto, com o texto integral de cada
 * arquivo — para a pessoa ler antes de aceitar. `null` fora do aplicativo.
 */
export async function lerPacoteInstalacao(): Promise<PacoteInstalacao | null> {
  const p = ponte()
  if (!p?.lerPacoteInstalacao) return null
  const r = (await p.lerPacoteInstalacao()) as PacoteInstalacao & { erro?: string }
  return Array.isArray(r?.itens) ? r : null
}
export const podeAbrirTerminal = () => typeof ponte()?.abrirTerminal === 'function'

/** Abre a IA numa janela nova. Com `mensagem`, ela já começa escrita. */
export async function abrirTerminal(
  mensagem?: string,
): Promise<{ agente?: string; erro?: string } | null> {
  const p = ponte()
  if (!p?.abrirTerminal) return null
  return (await p.abrirTerminal(mensagem)) as { agente?: string; erro?: string }
}

/**
 * O pedido de abrir o terminal embutido, do fundo da árvore até o rodapé.
 *
 * O botão que abre a IA mora dentro de um alerta, lá embaixo; o painel do
 * terminal mora no rodapé do app. Passar isso por props atravessaria meia
 * dúzia de componentes que não têm nada a ver com terminal — este mural de
 * recados é a menor ligação possível entre os dois.
 */
type OuvinteTerminal = (mensagem: string | undefined) => void
const ouvintesTerminal = new Set<OuvinteTerminal>()

/** Pede ao app que abra o terminal embutido, opcionalmente já com a mensagem. */
export function pedirTerminal(mensagem?: string): void {
  for (const cb of ouvintesTerminal) cb(mensagem)
}

/** O rodapé escuta os pedidos. Devolve como cancelar. */
export function aoPedirTerminal(cb: OuvinteTerminal): () => void {
  ouvintesTerminal.add(cb)
  return () => ouvintesTerminal.delete(cb)
}

export const podeTerminalEmbutido = () => typeof ponte()?.terminalAbrir === 'function'

/** Um documento que a IA escreveu a pedido do painel, e que dá para apagar. */
export interface Gerado {
  chave: string
  arquivo: string
  bytes: number
  alteradoEm: string
}

export const podeApagarGerado = () => typeof ponte()?.apagarGerado === 'function'

/** O que existe hoje no projeto. Só leitura. */
export async function lerGerados(): Promise<Gerado[]> {
  const r = await ponte()?.gerados?.()
  return Array.isArray(r) ? (r as Gerado[]) : []
}

/**
 * Apaga UM documento gerado, pela chave.
 *
 * Nunca por caminho: o processo principal tem a lista fechada do que é
 * apagável, e é ele quem resolve o caminho. Um caminho vindo daqui seria um
 * jeito de apagar arquivo que ninguém escolheu apagar.
 */
export async function apagarGerado(chave: string): Promise<{ ok?: boolean; erro?: string }> {
  const r = await ponte()?.apagarGerado?.(chave)
  return (r as { ok?: boolean; erro?: string }) ?? { erro: 'Só funciona no aplicativo.' }
}

export const podeDispensar = () => typeof ponte()?.dispensarAchado === 'function'

/**
 * "Isso não é problema." Marca — ou desmarca — um achado como falso alarme.
 *
 * O que vai para o disco é a impressão digital do achado, trecho mascarado
 * incluído: se o valor daquele lugar mudar, a dispensa caduca e o aviso volta.
 * Ver `dispensados.js`.
 */
export async function dispensarAchado(
  achado: { tipo?: string; arquivo: string; linha: number; trecho: string },
  nota?: string,
  /**
   * `'marcar'` para aceitar (idempotente). Sem isto, aceitar vários achados que
   * compartilham o mesmo valor os ligava e desligava dentro do laço.
   */
  acao?: 'marcar' | 'alternar',
): Promise<{ dispensado?: boolean }> {
  const r = await ponte()?.dispensarAchado?.(achado, nota, acao)
  return (r as { dispensado?: boolean }) ?? {}
}

/** "Não, isso é problema mesmo": tira a proposta da IA sem dispensar o achado. */
export async function recusarProposta(arquivo: string, linha: number): Promise<void> {
  await ponte()?.recusarProposta?.(arquivo, linha)
}

/** Entrega um texto inteiro à sessão aberta. Colagem, nunca digitação. */
export async function terminalColar(id: string, texto: string): Promise<void> {
  await ponte()?.terminalColar?.(id, texto)
}

/**
 * Manda um pedido pronto para a IA — pelo terminal DE DENTRO quando ele existe.
 *
 * Os pedidos de mapa nasceram antes do terminal embutido e continuaram abrindo
 * uma janela de fora: clicar em "criar mapa" jogava para o Terminal do sistema
 * quem tinha acabado de ver o app ganhar um shell próprio. O texto vem do
 * processo principal, que é onde ele é definido, para o pedido ser exatamente
 * o mesmo nos dois caminhos.
 */
export async function pedirIA(
  tipo: 'mapear' | 'pastas' | 'documentos' | 'guardrails',
  reserva: () => Promise<{ agente?: string; erro?: string } | null>,
): Promise<{ agente?: string; erro?: string } | null> {
  const p = ponte()
  if (podeTerminalEmbutido() && p?.textoPedido) {
    const texto = await p.textoPedido(tipo)
    if (texto) {
      pedirTerminal(texto)
      return { agente: 'a IA' }
    }
  }
  return reserva()
}

/**
 * Abre um shell DENTRO do app, na pasta do projeto. Com `mensagem`, o agente
 * já começa rodando com o pedido escrito. A pasta nunca é escolhida aqui: o
 * main usa o projeto aberto, e só ele.
 */
export async function terminalAbrir(opcoes: {
  mensagem?: string
  cols?: number
  rows?: number
}): Promise<SessaoTerminal> {
  const p = ponte()
  if (!p?.terminalAbrir) return { erro: 'Só funciona no aplicativo, não no navegador.' }
  return (await p.terminalAbrir(opcoes)) as SessaoTerminal
}

/** As teclas digitadas viram bytes no shell. */
export async function terminalEscrever(id: string, dados: string): Promise<void> {
  await ponte()?.terminalEscrever?.(id, dados)
}

/** O painel mudou de tamanho: o programa lá dentro precisa saber. */
export async function terminalRedimensionar(
  id: string,
  cols: number,
  rows: number,
): Promise<void> {
  await ponte()?.terminalRedimensionar?.(id, cols, rows)
}

/** Fecha a sessão e mata o processo. */
export async function terminalEncerrar(id: string): Promise<void> {
  await ponte()?.terminalEncerrar?.(id)
}

/** A saída do shell, conforme chega. Devolve como cancelar. */
export function aoSairDoTerminal(cb: (dados: SaidaTerminal) => void): () => void {
  return ponte()?.aoSairDoTerminal?.(cb) ?? (() => {})
}

/** O shell terminou. Devolve como cancelar. */
export function aoTerminarTerminal(cb: (dados: FimTerminal) => void): () => void {
  return ponte()?.aoTerminarTerminal?.(cb) ?? (() => {})
}

export const podeLerArquivo = () => typeof ponte()?.lerArquivo === 'function'

/** Lê um arquivo do projeto para o visualizador lateral. */
export async function lerArquivo(relativo: string): Promise<ArquivoAberto> {
  const p = ponte()
  if (!p?.lerArquivo) {
    return { caminho: relativo, erro: 'Só funciona no aplicativo, não no navegador.' }
  }
  return (await p.lerArquivo(relativo)) as ArquivoAberto
}

export const podeConfigurar = () => typeof ponte()?.salvarConfig === 'function'

/** Preferências do projeto. `null` fora do app ou sem projeto aberto. */
export async function lerConfig(): Promise<ConfigProjeto | null> {
  const p = ponte()
  if (!p?.lerConfig) return null
  const r = (await p.lerConfig()) as { config?: ConfigProjeto; erro?: string }
  return r?.config ?? null
}

/**
 * Salva parte das preferências. Devolve o config final e a carga já atualizada
 * — o idioma novo já vale para as skills instaladas quando isto retorna.
 */
export async function salvarConfig(
  parcial: Partial<ConfigProjeto>,
): Promise<{ config: ConfigProjeto; carga: Carga | null } | null> {
  const p = ponte()
  if (!p?.salvarConfig) return null
  const r = (await p.salvarConfig(parcial)) as {
    config?: ConfigProjeto
    snapshot?: unknown
    erro?: string
  }
  if (!r?.config) return null
  return {
    config: r.config,
    carga: ehSnapshot(r.snapshot) ? { snapshot: r.snapshot, fonte: 'real' } : null,
  }
}

// ------------------------------------------------------------------- consumo

/** Contador zerado: o que a interface mostra fora do app ou sem gasto algum. */
export const USO_VAZIO: UsoProjeto = {
  v: 1,
  traducoes: { chamadas: 0, eventos: 0, cache: 0 },
  perguntas: { chamadas: 0, porProvedor: {} },
  desde: null,
}

/** Quanto recurso da pessoa o app já consumiu neste projeto. */
export async function lerUso(): Promise<UsoProjeto> {
  const p = ponte()
  if (!p?.lerUso) return USO_VAZIO
  const r = (await p.lerUso()) as { uso?: UsoProjeto } | undefined
  return r?.uso ?? USO_VAZIO
}

export const podeResponderTraducao = () => typeof ponte()?.responderTraducao === 'function'

/**
 * Quantas mudanças ainda estão no texto automático — perguntado pela tela.
 *
 * O aviso de pendência só era EMPURRADO quando a leitura de fundo topava com
 * ele. Quem abrisse a aba depois não via nada, e num projeto importado (que
 * chega com o histórico inteiro por traduzir) isso era um feed em linguagem de
 * commit sem porta de saída.
 */
export async function traducaoPendentes(): Promise<{
  pendentes: number
  disponivel: boolean
  auto?: string
}> {
  const r = await ponte()?.traducaoPendentes?.()
  return (r as { pendentes: number; disponivel: boolean }) ?? { pendentes: 0, disponivel: false }
}

/**
 * Responde ao pedido de tradução: uma vez, sempre ou nunca. Devolve o config
 * já gravado — a escolha vale para as próximas rodadas na hora.
 */
export async function responderTraducao(
  resposta: RespostaTraducao,
): Promise<ConfigProjeto | null> {
  const p = ponte()
  if (!p?.responderTraducao) return null
  const r = (await p.responderTraducao(resposta)) as { config?: ConfigProjeto } | undefined
  return r?.config ?? null
}

/** Inscreve no pedido de autorização de tradução. Devolve como cancelar. */
export function aoPedirTraducao(cb: (dados: TraducaoPendente) => void): () => void {
  const p = ponte()
  if (!p?.aoPedirTraducao) return () => {}
  return p.aoPedirTraducao(cb)
}

// --------------------------------------------------------------- avisos do SO

export const podeNotificar = () => typeof ponte()?.testarNotificacao === 'function'

/**
 * Dispara a notificação de exemplo. Devolve se ela de fato saiu — no macOS,
 * "não saiu" costuma significar que a permissão do sistema está negada, e a
 * pessoa precisa saber disso.
 */
export async function testarNotificacao(): Promise<{ enviada: boolean; motivo?: string }> {
  const p = ponte()
  if (!p?.testarNotificacao) return { enviada: false, motivo: 'sem-app' }
  const r = (await p.testarNotificacao()) as { enviada?: boolean; motivo?: string } | undefined
  return { enviada: r?.enviada === true, motivo: r?.motivo }
}

/** Inscreve na troca de aba pedida por um aviso clicado. Devolve como cancelar. */
export function aoIrPara(cb: (aba: string) => void): () => void {
  const p = ponte()
  if (!p?.aoIrPara) return () => {}
  return p.aoIrPara(cb)
}

// ------------------------------------------------------ perguntar sobre algo

export const podePerguntar = () => typeof ponte()?.perguntar === 'function'
/**
 * Faz a pergunta. Só devolve `{ ok }` ou `{ erro }` — o TEXTO da resposta chega
 * em pedaços por `aoReceberResposta`.
 */
export async function perguntar(pedido: {
  eventoId: string
  pergunta: string
  contexto: ContextoPergunta
}): Promise<{ ok?: boolean; erro?: string; cancelado?: boolean }> {
  const p = ponte()
  if (!p?.perguntar) return { erro: 'Só funciona no aplicativo, não no navegador.' }
  return (await p.perguntar(pedido)) as { ok?: boolean; erro?: string; cancelado?: boolean }
}

/** Inscreve nos pedaços da resposta. Devolve a função de cancelar. */
export function aoReceberResposta(cb: (dados: PedacoResposta) => void): () => void {
  const p = ponte()
  if (!p?.aoReceberResposta) return () => {}
  return p.aoReceberResposta(cb)
}

export const podeResolver = () => typeof ponte()?.resolver === 'function'

/**
 * Marca (ou desmarca) um aviso como resolvido pela pessoa. Devolve a carga já
 * atualizada, para o painel refletir a mudança sem esperar o watcher.
 */
export async function alternarResolvido(eventId: string): Promise<Carga | null> {
  const p = ponte()
  if (!p?.resolver) return null
  const r = (await p.resolver(eventId)) as { snapshot?: unknown; erro?: string }
  if (ehSnapshot(r?.snapshot)) return { snapshot: r.snapshot, fonte: 'real' }
  return null
}

export const podeValidar = () => typeof ponte()?.validar === 'function'

/**
 * A pessoa aprova (ou desfaz a aprovação de) uma parte do projeto. Devolve a
 * carga já atualizada, para o painel refletir a mudança na hora.
 */
export async function alternarValidado(featureId: string): Promise<Carga | null> {
  const p = ponte()
  if (!p?.validar) return null
  const r = (await p.validar(featureId)) as { snapshot?: unknown; erro?: string }
  if (ehSnapshot(r?.snapshot)) return { snapshot: r.snapshot, fonte: 'real' }
  return null
}

/** Abre o agente pedindo o mapeamento do projeto (onboarding). */
export async function mapearProjeto(): Promise<{ agente?: string; erro?: string } | null> {
  return pedirIA('mapear', async () => {
    const p = ponte()
    if (!p?.mapear) return null
    return (await p.mapear()) as { agente?: string; erro?: string }
  })
}

export const podeMapearPastas = () => typeof ponte()?.mapearPastas === 'function'

/**
 * Abre o agente pedindo o `MAPA.md` das pastas. O arquivo aparece no disco
 * depois, e o watcher avisa o painel — aqui só disparamos o pedido.
 */
export async function mapearPastas(): Promise<{ agente?: string; erro?: string } | null> {
  return pedirIA('pastas', async () => {
    const p = ponte()
    if (!p?.mapearPastas) return null
    return (await p.mapearPastas()) as { agente?: string; erro?: string }
  })
}

export const podeMapearDocumentos = () => typeof ponte()?.mapearDocumentos === 'function'

/**
 * Abre o agente pedindo o mapa dos documentos. O `.wtf/docs.json` aparece no
 * disco depois, e o watcher avisa o painel — aqui só disparamos o pedido.
 */
export async function mapearDocumentos(): Promise<{ agente?: string; erro?: string } | null> {
  return pedirIA('documentos', async () => {
    const p = ponte()
    if (!p?.mapearDocumentos) return null
    return (await p.mapearDocumentos()) as { agente?: string; erro?: string }
  })
}

/**
 * Pede as regras do que NÃO se faz neste projeto — o `GUARDRAILS.md`.
 *
 * Sem caminho de reserva: esta skill nasceu depois do terminal embutido, e não
 * tem versão "no terminal do sistema" para cair. Fora do aplicativo, o botão
 * nem aparece.
 */
export async function pedirGuardrails(): Promise<{ agente?: string; erro?: string } | null> {
  return pedirIA('guardrails', async () => null)
}

/** Inscreve no aviso de "o projeto mudou". Devolve a função de cancelar. */
export function aoMudarProjeto(cb: (motivo: string) => void): () => void {
  const p = ponte()
  if (!p?.aoMudarProjeto) return () => {}
  return p.aoMudarProjeto(cb)
}

/** Instala (ou remove) a skill no projeto. Devolve a carga já atualizada. */
export async function alternarInstalacao(
  acao: 'instalar' | 'desinstalar',
): Promise<Carga | null> {
  const p = ponte()
  const fn = acao === 'instalar' ? p?.instalar : p?.desinstalar
  if (!fn) return null
  const r = (await fn()) as { snapshot?: unknown; erro?: string; cancelado?: boolean }
  if (r?.cancelado) return null
  if (ehSnapshot(r?.snapshot)) return { snapshot: r.snapshot, fonte: 'real' }
  if (r?.erro) return { snapshot: await loadSnapshot(), fonte: 'exemplo', erro: r.erro }
  return null
}

// ------------------------------------------------------------ dois níveis

export const podeInstalarGlobal = () => typeof ponte()?.instalarGlobal === 'function'
export const podeHabilitarProjeto = () => typeof ponte()?.habilitarProjeto === 'function'

/**
 * Nível A — instala (ou remove) o WTF em `~/.claude`, valendo para todos os
 * projetos. O aplicativo pede confirmação antes, porque mexe na configuração
 * global do Claude Code. `null` quando a pessoa cancelou ou fora do app.
 */
export async function alternarInstalacaoGlobal(
  acao: 'instalar' | 'desinstalar',
): Promise<{ global: EstadoGlobal | null; carga: Carga | null } | null> {
  const p = ponte()
  const fn = acao === 'instalar' ? p?.instalarGlobal : p?.desinstalarGlobal
  if (!fn) return null
  const r = (await fn()) as {
    global?: EstadoGlobal
    snapshot?: unknown
    erro?: string
    cancelado?: boolean
  }
  if (r?.cancelado) return null
  if (r?.erro) return { global: null, carga: { snapshot: await loadSnapshot(), fonte: 'exemplo', erro: r.erro } }
  return {
    global: r?.global ?? null,
    carga: ehSnapshot(r?.snapshot) ? { snapshot: r.snapshot, fonte: 'real' } : null,
  }
}

/**
 * Nível B — cria (ou remove) a pasta `.wtf/` no projeto aberto. É essa pasta
 * que autoriza o WTF a registrar algo aqui; sem ela o hook global fica inerte.
 * Desabilitar nunca apaga o histórico já gravado.
 */
export async function alternarProjeto(
  acao: 'habilitar' | 'desabilitar',
): Promise<Carga | null> {
  const p = ponte()
  const fn = acao === 'habilitar' ? p?.habilitarProjeto : p?.desabilitarProjeto
  if (!fn) return null
  const r = (await fn()) as { snapshot?: unknown; erro?: string; cancelado?: boolean }
  if (r?.cancelado) return null
  if (ehSnapshot(r?.snapshot)) return { snapshot: r.snapshot, fonte: 'real' }
  if (r?.erro) return { snapshot: await loadSnapshot(), fonte: 'exemplo', erro: r.erro }
  return null
}

export async function escolherProjeto(): Promise<Carga | null> {
  const p = ponte()
  if (!p?.escolherProjeto) return null
  const r = await p.escolherProjeto()
  if (ehSnapshot(r)) return { snapshot: r, fonte: 'real' }
  const erro = erroDe(r)
  if (erro) return { snapshot: await loadSnapshot(), fonte: 'exemplo', erro }
  return null
}

// --------------------------------------------------- projetos já conhecidos

export const podeTrocarDeProjeto = () => typeof ponte()?.listarProjetos === 'function'

/** Lista vazia: é o que a interface mostra fora do aplicativo. */
const SEM_PROJETOS: ListaProjetos = { atual: null, projetos: [] }

/**
 * Os projetos que a pessoa já abriu, cada um com seu resumo barato.
 *
 * Chamar isto NÃO custa nada: nenhum modelo é chamado, nada é traduzido e nada
 * é escrito em disco — só o projeto aberto é observado e traduzido. A regra
 * inteira está no topo de electron/projects.js.
 */
export async function listarProjetos(): Promise<ListaProjetos> {
  const p = ponte()
  if (!p?.listarProjetos) return SEM_PROJETOS
  const r = (await p.listarProjetos()) as Partial<ListaProjetos> | undefined
  if (!Array.isArray(r?.projetos)) return SEM_PROJETOS
  return { atual: r.atual ?? null, projetos: r.projetos }
}

/** Troca o projeto aberto. Devolve a carga nova, já pronta para pintar. */
export async function abrirProjeto(caminho: string): Promise<Carga | null> {
  const p = ponte()
  if (!p?.abrirProjeto) return null
  const r = await p.abrirProjeto(caminho)
  if (ehSnapshot(r)) return { snapshot: r, fonte: 'real' }
  const erro = erroDe(r)
  if (erro) return { snapshot: await loadSnapshot(), fonte: 'exemplo', erro }
  return null
}

/**
 * Tira o projeto da LISTA — e só da lista. Nenhum arquivo do projeto é
 * apagado ou alterado; ele volta a aparecer na próxima vez que for aberto.
 */
export async function esquecerProjeto(caminho: string): Promise<ProjetoConhecido[]> {
  const p = ponte()
  if (!p?.esquecerProjeto) return []
  const r = (await p.esquecerProjeto(caminho)) as { projetos?: ProjetoConhecido[] } | undefined
  return Array.isArray(r?.projetos) ? r.projetos : []
}

/** Fixa (ou desfixa) o projeto no topo da lista. */
export async function fixarProjeto(
  caminho: string,
  valor: boolean,
): Promise<ProjetoConhecido[]> {
  const p = ponte()
  if (!p?.fixarProjeto) return []
  const r = (await p.fixarProjeto(caminho, valor)) as { projetos?: ProjetoConhecido[] } | undefined
  return Array.isArray(r?.projetos) ? r.projetos : []
}
