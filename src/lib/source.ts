import { loadSnapshot } from '@/mock/snapshot'
import type {
  ConfigProjeto,
  ContextoPergunta,
  EstadoChaves,
  EstadoGlobal,
  PacoteInstalacao,
  PedacoResposta,
  ProjectSnapshot,
  ProvedorChave,
  RespostaTraducao,
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
  escolherProjeto?: () => Promise<unknown>
  instalar?: () => Promise<unknown>
  desinstalar?: () => Promise<unknown>
  instalarGlobal?: () => Promise<unknown>
  desinstalarGlobal?: () => Promise<unknown>
  habilitarProjeto?: () => Promise<unknown>
  desabilitarProjeto?: () => Promise<unknown>
  lerPacoteInstalacao?: () => Promise<unknown>
  abrirTerminal?: (mensagem?: string) => Promise<unknown>
  mapear?: () => Promise<unknown>
  mapearPastas?: () => Promise<unknown>
  mapearDocumentos?: () => Promise<unknown>
  lerArquivo?: (relativo: string) => Promise<unknown>
  lerConfig?: () => Promise<unknown>
  salvarConfig?: (parcial: Partial<ConfigProjeto>) => Promise<unknown>
  resolver?: (eventId: string) => Promise<unknown>
  validar?: (featureId: string) => Promise<unknown>
  aoMudarProjeto?: (cb: (motivo: string) => void) => () => void
  lerChaves?: () => Promise<unknown>
  salvarChave?: (provedor: string, chave: string) => Promise<unknown>
  apagarChave?: (provedor: string) => Promise<unknown>
  perguntar?: (pedido: unknown) => Promise<unknown>
  aoReceberResposta?: (cb: (dados: PedacoResposta) => void) => () => void
  lerUso?: () => Promise<unknown>
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

const SEM_CHAVES: EstadoChaves = { chaves: {}, podeGuardar: false }

/**
 * Quais provedores têm chave — mascarada. Fora do app, nenhuma: o navegador
 * não tem onde guardar isso com segurança, e fingir que tem seria pior.
 */
export async function lerChaves(): Promise<EstadoChaves> {
  const p = ponte()
  if (!p?.lerChaves) return SEM_CHAVES
  const r = (await p.lerChaves()) as EstadoChaves | undefined
  return r?.chaves ? r : { ...SEM_CHAVES, erro: erroDe(r) }
}

/**
 * Guarda a chave. Devolve o estado já atualizado, e `guardada: false` quando o
 * sistema não ofereceu cofre — a interface precisa contar isso à pessoa.
 */
export async function salvarChave(
  provedor: ProvedorChave,
  chave: string,
): Promise<EstadoChaves & { guardada?: boolean; aviso?: string }> {
  const p = ponte()
  if (!p?.salvarChave) return SEM_CHAVES
  const r = (await p.salvarChave(provedor, chave)) as EstadoChaves & {
    guardada?: boolean
    aviso?: string
  }
  return r?.chaves ? r : { ...SEM_CHAVES, erro: erroDe(r) }
}

export async function apagarChave(provedor: ProvedorChave): Promise<EstadoChaves> {
  const p = ponte()
  if (!p?.apagarChave) return SEM_CHAVES
  const r = (await p.apagarChave(provedor)) as EstadoChaves | undefined
  return r?.chaves ? r : { ...SEM_CHAVES, erro: erroDe(r) }
}

/**
 * Faz a pergunta. Só devolve `{ ok }` ou `{ erro }` — o TEXTO da resposta chega
 * em pedaços por `aoReceberResposta`.
 */
export async function perguntar(pedido: {
  eventoId: string
  pergunta: string
  contexto: ContextoPergunta
  provedor?: ProvedorChave
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
  const p = ponte()
  if (!p?.mapear) return null
  return (await p.mapear()) as { agente?: string; erro?: string }
}

export const podeMapearPastas = () => typeof ponte()?.mapearPastas === 'function'

/**
 * Abre o agente pedindo o `MAPA.md` das pastas. O arquivo aparece no disco
 * depois, e o watcher avisa o painel — aqui só disparamos o pedido.
 */
export async function mapearPastas(): Promise<{ agente?: string; erro?: string } | null> {
  const p = ponte()
  if (!p?.mapearPastas) return null
  return (await p.mapearPastas()) as { agente?: string; erro?: string }
}

export const podeMapearDocumentos = () => typeof ponte()?.mapearDocumentos === 'function'

/**
 * Abre o agente pedindo o mapa dos documentos. O `.wtf/docs.json` aparece no
 * disco depois, e o watcher avisa o painel — aqui só disparamos o pedido.
 */
export async function mapearDocumentos(): Promise<{ agente?: string; erro?: string } | null> {
  const p = ponte()
  if (!p?.mapearDocumentos) return null
  return (await p.mapearDocumentos()) as { agente?: string; erro?: string }
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
