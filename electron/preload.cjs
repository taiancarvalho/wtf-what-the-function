const { contextBridge, ipcRenderer } = require('electron')

// Superfície mínima. O renderer nunca toca em filesystem ou git direto.
contextBridge.exposeInMainWorld('wtf', {
  platform: process.platform,
  isElectron: true,
  /** Lê o projeto observado. `null` quando nenhum foi apontado. */
  getSnapshot: () => ipcRenderer.invoke('wtf:snapshot'),
  /** Abre o seletor de pasta e passa a observar o projeto escolhido. */
  escolherProjeto: () => ipcRenderer.invoke('wtf:escolher-projeto'),
  /** Instala a skill + hook no projeto observado (pede confirmação). */
  instalar: () => ipcRenderer.invoke('wtf:instalar'),
  desinstalar: () => ipcRenderer.invoke('wtf:desinstalar'),
  /** Abre o terminal do sistema na pasta, já com o agente rodando. */
  abrirTerminal: () => ipcRenderer.invoke('wtf:abrir-terminal'),
  /** Abre o agente já pedindo o mapeamento do projeto (onboarding). */
  mapear: () => ipcRenderer.invoke('wtf:mapear'),
  /** Lê um arquivo do projeto para exibir dentro do app. */
  lerArquivo: (relativo) => ipcRenderer.invoke('wtf:ler-arquivo', relativo),
  /**
   * Avisa quando o projeto mudou (commit novo ou declaração da IA).
   * Devolve a função para cancelar a inscrição.
   */
  aoMudarProjeto: (cb) => {
    const ouvinte = (_evento, motivo) => cb(motivo)
    ipcRenderer.on('wtf:mudou', ouvinte)
    return () => ipcRenderer.off('wtf:mudou', ouvinte)
  },
})
