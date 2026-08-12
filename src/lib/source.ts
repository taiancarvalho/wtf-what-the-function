import { loadSnapshot } from '@/mock/snapshot'
import type { ProjectSnapshot } from '@/types/protocol'

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
  abrirTerminal?: (mensagem?: string) => Promise<unknown>
  mapear?: () => Promise<unknown>
  lerArquivo?: (relativo: string) => Promise<unknown>
  resolver?: (eventId: string) => Promise<unknown>
  validar?: (featureId: string) => Promise<unknown>
  aoMudarProjeto?: (cb: (motivo: string) => void) => () => void
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

export async function escolherProjeto(): Promise<Carga | null> {
  const p = ponte()
  if (!p?.escolherProjeto) return null
  const r = await p.escolherProjeto()
  if (ehSnapshot(r)) return { snapshot: r, fonte: 'real' }
  const erro = erroDe(r)
  if (erro) return { snapshot: await loadSnapshot(), fonte: 'exemplo', erro }
  return null
}
