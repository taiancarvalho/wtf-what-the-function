/**
 * Observação do projeto: quando algo muda lá fora, o painel recarrega sozinho.
 *
 * Três fontes, nada além disso:
 *   .git (HEAD, ORIG_HEAD, refs/heads, logs/HEAD) → motivo 'git'
 *   .wtf/events.jsonl                            → motivo 'claim'
 *   .wtf/map.json                                → motivo 'mapa'
 *   .wtf/docs.json                               → motivo 'docs'
 *   MAPA.md (na raiz)                            → motivo 'pastas'
 *
 * Nada de recursivo: num projeto grande, observar a árvore inteira come CPU
 * e ainda pega node_modules. Só os caminhos acima.
 */

import fs from 'node:fs'
import path from 'node:path'

const DEBOUNCE_MS = 400

/**
 * @param {string | null | undefined} dir  pasta do projeto observado
 * @param {(motivo: 'git' | 'claim' | 'mapa' | 'docs' | 'pastas') => void} aoMudar
 * @returns {() => void} parar() — idempotente, fecha tudo e limpa os timers
 */
export function observarProjeto(dir, aoMudar) {
  if (!dir) return () => {}

  /** @type {Set<fs.FSWatcher>} */
  const watchers = new Set()
  /** @type {Map<string, NodeJS.Timeout>} */
  const timers = new Map()
  let vivo = true

  // Um git commit cospe vários eventos de fs. O painel só precisa saber uma vez.
  function avisar(motivo) {
    if (!vivo) return
    clearTimeout(timers.get(motivo))
    timers.set(
      motivo,
      setTimeout(() => {
        timers.delete(motivo)
        if (!vivo) return
        try {
          aoMudar(motivo)
        } catch {
          // callback do chamador não derruba o watcher
        }
      }, DEBOUNCE_MS),
    )
  }

  /**
   * fs.watch lança em alguns sistemas de arquivos (rede, FUSE) e ainda pode
   * emitir 'error' depois de criado. Nos dois casos: seguir a vida.
   * @returns {fs.FSWatcher | null}
   */
  function observar(alvo, opcoes, ouvinte) {
    if (!vivo) return null
    let w
    try {
      w = fs.watch(alvo, opcoes, ouvinte)
    } catch {
      return null
    }
    w.on('error', () => {
      watchers.delete(w)
      try {
        w.close()
      } catch {
        /* já morto */
      }
    })
    watchers.add(w)
    return w
  }

  // ------------------------------------------------------------------- git

  const git = path.join(dir, '.git')
  // Arquivos soltos: HEAD (troca de branch), ORIG_HEAD (rebase/merge).
  for (const arquivo of ['HEAD', 'ORIG_HEAD']) {
    observar(path.join(git, arquivo), {}, () => avisar('git'))
  }
  // Diretórios rasos: refs/heads (ponteiro do branch) e logs (reflog do commit).
  observar(path.join(git, 'refs', 'heads'), {}, () => avisar('git'))
  observar(path.join(git, 'logs'), {}, (_tipo, nome) => {
    if (!nome || nome === 'HEAD') avisar('git')
  })

  // --------------------------------------------------------- claim e mapa

  // Nem events.jsonl nem map.json existem no começo: a skill só é instalada
  // depois, e o map.json é escrito pelo agente durante o onboarding. Então
  // observamos o ancestral mais próximo que existe e promovemos quando o
  // filho aparecer. Como os dois moram no mesmo diretório, o watcher de
  // diretório é um só — cada arquivo ganha o seu quando surge.
  const wtf = path.join(dir, '.wtf')

  /** os arquivos de dentro de .wtf e o motivo que cada um dispara */
  const alvos = [
    { nome: 'events.jsonl', motivo: 'claim' },
    { nome: 'map.json', motivo: 'mapa' },
    { nome: 'docs.json', motivo: 'docs' },
  ]

  /** @type {Map<string, fs.FSWatcher>} motivo → watcher do arquivo já promovido */
  const watchersArquivo = new Map()
  /** @type {fs.FSWatcher | null} */
  let watcherDir = null
  /** 'wtf' | 'projeto' — em que nível o watcher de diretório está agora */
  let nivelDir = null

  function existe(p) {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  }

  function fechar(w) {
    if (!w) return
    watchers.delete(w)
    try {
      w.close()
    } catch {
      /* já morto */
    }
  }

  function fecharArquivo(motivo) {
    const w = watchersArquivo.get(motivo)
    if (!w) return
    watchersArquivo.delete(motivo)
    fechar(w)
  }

  /** Promove um alvo para watcher do próprio arquivo, quando ele já existe. */
  function armarArquivo(alvo) {
    if (!vivo) return
    const caminho = path.join(wtf, alvo.nome)
    if (!existe(caminho)) {
      fecharArquivo(alvo.motivo)
      return
    }
    if (watchersArquivo.has(alvo.motivo)) return
    const w = observar(caminho, {}, () => {
      // Arquivo pode ter sido recriado (rename): reavalia o alvo.
      if (!existe(caminho)) {
        fecharArquivo(alvo.motivo)
        armarDiretorio()
        return
      }
      avisar(alvo.motivo)
    })
    if (w) watchersArquivo.set(alvo.motivo, w)
  }

  /** Um watcher só para o diretório: ele cobre os dois arquivos. */
  function armarDiretorio() {
    if (!vivo) return

    if (existe(wtf)) {
      if (nivelDir === 'wtf') return
      fechar(watcherDir)
      watcherDir = observar(wtf, {}, (_tipo, nome) => {
        for (const alvo of alvos) {
          if (nome && nome !== alvo.nome) continue
          if (!existe(path.join(wtf, alvo.nome))) continue
          armarArquivo(alvo) // promove para o arquivo
          avisar(alvo.motivo)
        }
      })
      nivelDir = watcherDir ? 'wtf' : null
      // O .wtf pode já vir com os arquivos dentro.
      for (const alvo of alvos) armarArquivo(alvo)
      return
    }

    if (nivelDir === 'projeto') return
    fechar(watcherDir)
    watcherDir = observar(dir, {}, (_tipo, nome) => {
      if (nome && nome !== '.wtf') return
      if (!existe(wtf)) return
      armarDiretorio() // promove para .wtf
      for (const alvo of alvos) {
        if (!existe(path.join(wtf, alvo.nome))) continue
        avisar(alvo.motivo)
      }
    })
    nivelDir = watcherDir ? 'projeto' : null
  }

  armarDiretorio()

  // ------------------------------------------------------ MAPA.md das pastas

  /** O mesmo arquivo, escrito com maiúsculas diferentes conforme o sistema. */
  const NOMES_MAPA = ['MAPA.md', 'Mapa.md', 'mapa.md']

  /** @type {fs.FSWatcher | null} watcher do próprio arquivo, quando ele existe */
  let watcherMapa = null

  function caminhoDoMapa() {
    for (const nome of NOMES_MAPA) {
      const p = path.join(dir, nome)
      if (existe(p)) return p
    }
    return null
  }

  /**
   * Promove para watcher do arquivo quando ele aparece. Enquanto não existe, o
   * watcher da raiz (logo abaixo) é quem percebe a criação — o MAPA.md nasce
   * depois, escrito pelo agente.
   */
  function armarMapa() {
    if (!vivo) return
    const alvo = caminhoDoMapa()
    if (!alvo) {
      fechar(watcherMapa)
      watcherMapa = null
      return
    }
    if (watcherMapa) return
    watcherMapa = observar(alvo, {}, () => {
      // Reescrito por rename (o agente sobrescreve o arquivo inteiro): o
      // watcher antigo aponta para um inode que não existe mais.
      if (!existe(alvo)) {
        fechar(watcherMapa)
        watcherMapa = null
        avisar('pastas')
        return
      }
      avisar('pastas')
    })
  }

  // A raiz sempre é observada, e raso: é onde o MAPA.md aparece e some.
  observar(dir, {}, (_tipo, nome) => {
    if (nome && !NOMES_MAPA.includes(nome)) return
    // Sem nome de arquivo (acontece em alguns sistemas), só avisamos se o
    // mapa existe — do contrário qualquer mexida na raiz recarregaria o painel.
    if (!nome && !caminhoDoMapa()) return
    armarMapa()
    avisar('pastas')
  })

  armarMapa()

  return function parar() {
    if (!vivo) return
    vivo = false
    watcherMapa = null
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
    watchersArquivo.clear()
    watcherDir = null
    nivelDir = null
    for (const w of watchers) {
      try {
        w.close()
      } catch {
        /* já morto */
      }
    }
    watchers.clear()
  }
}
