const { contextBridge, ipcRenderer } = require('electron')

// Superfície mínima. O renderer nunca toca em filesystem ou git direto.
contextBridge.exposeInMainWorld('wtf', {
  platform: process.platform,
  isElectron: true,
  /** Lê o projeto observado. `null` quando nenhum foi apontado. */
  getSnapshot: () => ipcRenderer.invoke('wtf:snapshot'),
  /**
   * Reconstrói o histórico do projeto na hora (dezenas de leituras do git) e
   * devolve os marcos. O snapshot já traz o histórico do cache; isto só é
   * necessário quando a tela não quer esperar o recálculo de segundo plano.
   */
  recalcularHistorico: () => ipcRenderer.invoke('wtf:historico'),
  /** Abre o seletor de pasta e passa a observar o projeto escolhido. */
  escolherProjeto: () => ipcRenderer.invoke('wtf:escolher-projeto'),
  /**
   * Os projetos que a pessoa já abriu, com um resumo barato de cada um
   * (pendências, arquivos não salvos, se tem IA trabalhando agora).
   * Nenhum resumo chama modelo nem escreve em disco — ver electron/projects.js.
   */
  listarProjetos: () => ipcRenderer.invoke('wtf:projetos'),
  /** Troca o projeto aberto e devolve o snapshot novo. */
  abrirProjeto: (caminho) => ipcRenderer.invoke('wtf:abrir-projeto', caminho),
  /** Tira o projeto da LISTA. Nada dentro dele é apagado ou alterado. */
  esquecerProjeto: (caminho) => ipcRenderer.invoke('wtf:esquecer-projeto', caminho),
  /** Fixa (ou desfixa) o projeto no topo da lista. */
  fixarProjeto: (caminho, valor) => ipcRenderer.invoke('wtf:fixar-projeto', caminho, valor),
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
  /**
   * Terminal EMBUTIDO — o shell dentro do app. Este preload é sandboxed: o
   * pseudo-terminal vive no processo principal e só bytes cruzam a ponte.
   */
  terminalAbrir: (opcoes) => ipcRenderer.invoke('wtf:terminal-abrir', opcoes),
  terminalEscrever: (id, dados) => ipcRenderer.invoke('wtf:terminal-escrever', id, dados),
  terminalRedimensionar: (id, cols, rows) =>
    ipcRenderer.invoke('wtf:terminal-redimensionar', id, cols, rows),
  /** Entrega um texto inteiro à sessão, como colagem — não como digitação. */
  terminalColar: (id, texto) => ipcRenderer.invoke('wtf:terminal-colar', id, texto),
  /** O texto de um pedido pronto ('mapear', 'pastas', 'documentos', 'guardrails'). */
  textoPedido: (tipo) => ipcRenderer.invoke('wtf:texto-pedido', tipo),
  /** Documentos que a IA escreveu a pedido do painel. */
  gerados: () => ipcRenderer.invoke('wtf:gerados'),
  apagarGerado: (chave) => ipcRenderer.invoke('wtf:apagar-gerado', chave),
  /** Marca/desmarca um achado de segurança como falso alarme. */
  dispensarAchado: (achado, nota, acao) =>
    ipcRenderer.invoke('wtf:dispensar-achado', achado, nota, acao),
  recusarProposta: (arquivo, linha) => ipcRenderer.invoke('wtf:recusar-proposta', arquivo, linha),
  terminalEncerrar: (id) => ipcRenderer.invoke('wtf:terminal-encerrar', id),
  /** A saída do terminal, conforme chega. Devolve como cancelar. */
  aoSairDoTerminal: (cb) => {
    const ouvinte = (_evento, dados) => cb(dados)
    ipcRenderer.on('wtf:terminal-saida', ouvinte)
    return () => ipcRenderer.off('wtf:terminal-saida', ouvinte)
  },
  /** O shell terminou (saiu, ou foi fechado). Devolve como cancelar. */
  aoTerminarTerminal: (cb) => {
    const ouvinte = (_evento, dados) => cb(dados)
    ipcRenderer.on('wtf:terminal-fim', ouvinte)
    return () => ipcRenderer.off('wtf:terminal-fim', ouvinte)
  },
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
  /** Quantas mudanças ainda estão no texto automático. */
  traducaoPendentes: () => ipcRenderer.invoke('wtf:traducao-pendentes'),
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
