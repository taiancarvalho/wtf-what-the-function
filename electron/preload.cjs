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
  /**
   * Nível A — instala as skills e o hook em `~/.claude`, para todos os
   * projetos. Mexe na configuração global do Claude Code: pede confirmação.
   */
  instalarGlobal: () => ipcRenderer.invoke('wtf:instalar-global'),
  desinstalarGlobal: () => ipcRenderer.invoke('wtf:desinstalar-global'),
  /**
   * Nível B — cria (ou remove) a pasta `.wtf/` no projeto aberto. É a
   * existência dessa pasta que autoriza o WTF a registrar algo aqui; sem ela,
   * o hook global roda e sai em silêncio.
   */
  habilitarProjeto: () => ipcRenderer.invoke('wtf:habilitar-projeto'),
  desabilitarProjeto: () => ipcRenderer.invoke('wtf:desabilitar-projeto'),
  /**
   * O que a instalação escreveria no projeto, com o texto integral de cada
   * arquivo. Só leitura — serve para a pessoa ver antes de aceitar.
   */
  lerPacoteInstalacao: () => ipcRenderer.invoke('wtf:pacote-instalacao'),
  /** Abre o terminal do sistema na pasta, já com o agente rodando. */
  abrirTerminal: (mensagem) => ipcRenderer.invoke('wtf:abrir-terminal', mensagem),
  /** Abre o agente já pedindo o mapeamento do projeto (onboarding). */
  mapear: () => ipcRenderer.invoke('wtf:mapear'),
  /** Abre o agente pedindo o MAPA.md das pastas (para que serve cada uma). */
  mapearPastas: () => ipcRenderer.invoke('wtf:mapear-pastas'),
  /** Abre o agente pedindo o mapa dos documentos (qual é o vigente de cada assunto). */
  mapearDocumentos: () => ipcRenderer.invoke('wtf:mapear-documentos'),
  /** Marca/desmarca um aviso como resolvido pela pessoa (persiste em disco). */
  resolver: (eventId) => ipcRenderer.invoke('wtf:resolver', eventId),
  /** Aprova/desfaz a aprovação de uma parte do projeto (persiste em disco). */
  validar: (featureId) => ipcRenderer.invoke('wtf:validar', featureId),
  /** Lê as preferências do projeto (idioma da interface e do conteúdo). */
  lerConfig: () => ipcRenderer.invoke('wtf:config'),
  /** Salva as preferências (merge) e reaplica o idioma nas skills instaladas. */
  salvarConfig: (parcial) => ipcRenderer.invoke('wtf:salvar-config', parcial),
  /**
   * Consumo do projeto: quantas traduções e perguntas o app já gastou, e
   * quantas vezes reaproveitou o cache em vez de gastar de novo.
   */
  lerUso: () => ipcRenderer.invoke('wtf:uso'),
  /**
   * Responde ao pedido de tradução automática: 'agora' (uma vez), 'sempre'
   * (grava a autorização) ou 'nunca' (o painel segue no texto heurístico).
   */
  responderTraducao: (resposta) => ipcRenderer.invoke('wtf:responder-traducao', resposta),
  /**
   * Avisa que há eventos sem tradução e ninguém autorizou gastar para
   * traduzi-los. `{ pendentes, maxPorRodada }`. Devolve como cancelar.
   */
  aoPedirTraducao: (cb) => {
    const ouvinte = (_evento, dados) => cb(dados)
    ipcRenderer.on('wtf:traducao-pendente', ouvinte)
    return () => ipcRenderer.off('wtf:traducao-pendente', ouvinte)
  },
  /**
   * Dispara uma notificação de exemplo. É como a pessoa descobre se o sistema
   * dela está bloqueando os avisos do WTF.
   */
  testarNotificacao: () => ipcRenderer.invoke('wtf:testar-notificacao'),
  /**
   * O aviso do sistema foi clicado: abrir a aba certa. Devolve como cancelar.
   */
  aoIrPara: (cb) => {
    const ouvinte = (_evento, aba) => cb(aba)
    ipcRenderer.on('wtf:ir-para', ouvinte)
    return () => ipcRenderer.off('wtf:ir-para', ouvinte)
  },
  /** Lê um arquivo do projeto para exibir dentro do app. */
  lerArquivo: (relativo) => ipcRenderer.invoke('wtf:ler-arquivo', relativo),
  /**
   * Quais provedores TÊM chave, já mascarada. A chave em claro nunca cruza
   * esta ponte — ver o cabeçalho de electron/keys.js.
   */
  lerChaves: () => ipcRenderer.invoke('wtf:chaves'),
  /** Guarda a chave cifrada em userData, fora da pasta do projeto. */
  salvarChave: (provedor, chave) => ipcRenderer.invoke('wtf:salvar-chave', provedor, chave),
  apagarChave: (provedor) => ipcRenderer.invoke('wtf:apagar-chave', provedor),
  /** Pergunta sobre uma mudança. A resposta chega por `aoReceberResposta`. */
  perguntar: (pedido) => ipcRenderer.invoke('wtf:perguntar', pedido),
  /**
   * Os pedaços da resposta, conforme chegam. `{ id, pedaco }`, e ao final
   * `{ id, fim: true }` ou `{ id, erro }`. Devolve a função de cancelar.
   */
  aoReceberResposta: (cb) => {
    const ouvinte = (_evento, dados) => cb(dados)
    ipcRenderer.on('wtf:resposta', ouvinte)
    return () => ipcRenderer.off('wtf:resposta', ouvinte)
  },
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
