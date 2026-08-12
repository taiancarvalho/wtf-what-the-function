import { createContext, useContext } from 'react'

/**
 * Idiomas da interface.
 *
 * São só três, e de propósito: cada um precisa ser revisado por alguém que
 * fale a língua, senão o app fica dizendo coisa errada com confiança — que é
 * justamente o defeito que ele existe para combater.
 *
 * O idioma em que a IA ESCREVE é outra configuração, e essa aceita qualquer
 * língua (ver `ConfigProjeto.idiomaConteudo`). Dá para ter a interface em
 * inglês e as explicações em chinês.
 */
export type Idioma = 'pt-BR' | 'en' | 'es'

export const IDIOMAS: { id: Idioma; nome: string; nomeProprio: string }[] = [
  { id: 'pt-BR', nome: 'Português', nomeProprio: 'Português (Brasil)' },
  { id: 'en', nome: 'Inglês', nomeProprio: 'English' },
  { id: 'es', nome: 'Espanhol', nomeProprio: 'Español' },
]

/** Sugestões de idioma para o conteúdo. A lista não limita: aceita qualquer um. */
export const IDIOMAS_CONTEUDO: { codigo: string; nome: string }[] = [
  { codigo: 'pt-BR', nome: 'português do Brasil' },
  { codigo: 'en', nome: 'inglês' },
  { codigo: 'es', nome: 'espanhol' },
  { codigo: 'fr', nome: 'francês' },
  { codigo: 'de', nome: 'alemão' },
  { codigo: 'it', nome: 'italiano' },
  { codigo: 'zh', nome: 'chinês simplificado' },
  { codigo: 'ja', nome: 'japonês' },
  { codigo: 'ko', nome: 'coreano' },
  { codigo: 'hi', nome: 'híndi' },
  { codigo: 'ar', nome: 'árabe' },
  { codigo: 'ru', nome: 'russo' },
]

/**
 * O dicionário.
 *
 * Chaves em ponto, agrupadas por tela. Regras para quem for mexer:
 *   - nada de montar frase concatenando pedaços: idiomas ordenam diferente.
 *     Use `{}` para os valores e deixe a frase inteira em cada língua.
 *   - plural é função, não `s` no fim: em pt "1 arquivo/2 arquivos", em en
 *     "1 file/2 files", e há línguas com mais de duas formas.
 */
type Dic = Record<string, string>

const pt: Dic = {
  // home
  'home.dependeDeVoce': '{n} coisas dependem de você',
  'home.dependeDeVoce1': 'Uma coisa depende de você',
  'home.verNoFeed': 'Ver tudo',
  'home.verProgresso': 'Ver progresso',
  'home.verMapa': 'Ver do que é feito',
  'home.naoSalvo': '{n} arquivos ainda não foram guardados',
  'home.naoSalvo1': 'Um arquivo ainda não foi guardado',
  'home.naoSalvoNota': 'Enquanto não forem guardados, esse trabalho pode ser perdido. Partes envolvidas: {partes}.',
  'home.mudouDepois': '{n} partes mudaram depois que você aprovou',
  'home.mudouDepois1': 'Uma parte mudou depois que você aprovou',
  'home.agora': 'Acontecendo agora',
  'home.geral': 'Como está o projeto',
  'home.ultima': 'Última coisa que aconteceu',
  'home.tudoEmDia': 'Nada pedindo sua atenção agora.',
  'nav.home': 'Início',
  'nav.home.nota': 'Resumo do projeto',
  // navegação
  'nav.acontecendo': 'Acontecendo',
  'nav.acontecendo.nota': 'O que a IA mexeu',
  'nav.progresso': 'Progresso',
  'nav.progresso.nota': 'Onde estamos',
  'nav.mapa': 'Mapa',
  'nav.mapa.nota': 'Do que é feito',
  'nav.pastas': 'Pastas',
  'nav.pastas.nota': 'Onde cada coisa mora',
  'nav.config': 'Configurações',
  'nav.config.nota': 'Idioma, chaves e instalação',

  // configurações
  'config.titulo': 'Configurações',
  'config.paraQue': 'Tudo que você escolhe uma vez e não quer mais pensar: qual projeto o WTF está olhando, em que língua ele fala com você, como ele acessa a IA — e, principalmente, o que exatamente ele escreve dentro do seu projeto.',
  'config.projeto': 'Projeto',
  'config.projetoNota': 'A pasta que o WTF está acompanhando agora.',
  'config.trocar': 'Trocar de projeto',
  'config.abrir': 'Abrir um projeto',
  'config.idioma': 'Idioma',
  'config.idiomaNota': 'A língua do aplicativo e a língua em que a IA escreve as explicações. Podem ser diferentes.',
  'config.ia': 'Acesso à IA',
  'config.iaNota': 'A chave usada para responder às suas perguntas sobre o projeto. Fica guardada no seu computador.',
  'config.instala': 'O que o WTF instala no seu projeto',
  'config.instalaNota': 'Estes são todos os arquivos que o WTF escreve na sua pasta. Abra qualquer um e leia inteiro antes de aceitar.',
  'config.seguranca': 'Nada é sobrescrito sem backup, e desinstalar devolve o projeto exatamente ao estado anterior.',
  'config.lendo': 'Lendo o que seria instalado…',
  'config.semPacote': 'Não deu para ler a lista de arquivos agora. Isso só funciona dentro do aplicativo, com um projeto aberto.',
  'config.verConteudo': 'Ver o conteúdo completo',
  'config.selo.novo': 'novo',
  'config.selo.instalado': 'já instalado',
  'config.selo.desatualizado': 'desatualizado',
  'config.hooks': 'Avisos registrados',
  'config.hooksNota': 'Comandos que o seu agente passa a rodar sozinho para contar ao WTF o que está fazendo.',
  'config.nenhumHook': 'Nenhum aviso é registrado.',
  'config.gitignore': 'Linhas no .gitignore',
  'config.gitignoreNota': 'O que o WTF pede para o Git ignorar, para não sujar o histórico do seu projeto.',
  'config.nenhumGitignore': 'Nada é acrescentado ao .gitignore.',

  // pastas (MAPA.md)
  'pastas.titulo': 'Mapa de pastas',
  'pastas.paraQue': 'A resposta para "onde cada coisa mora": cada pasta do projeto com uma frase dizendo para que ela serve. Serve para você entender a organização do seu software — e para a IA não inventar uma pasta nova toda vez.',
  'pastas.atualizado': 'Atualizado {quando}',
  'pastas.temMapaProprioDica': 'Essa pasta é grande e tem um mapa só dela.',
  'pastas.vazioTitulo': 'Este projeto ainda não tem mapa de pastas',
  'pastas.vazioTexto': 'É um documento curto, escrito em português simples, que lista as pastas do projeto e explica para que cada uma serve. A IA percorre o projeto e escreve para você — depois é só corrigir o que estiver errado.',
  'pastas.criar': 'Criar o mapa de pastas',
  'pastas.criando': 'Lendo o projeto…',
  'pastas.rodape': 'é um arquivo comum, na raiz do projeto. Pode editar à mão: a sua opinião sobre o seu projeto vale mais que a da IA.',

  // barra lateral
  'lateral.exemplo': 'Projeto de exemplo',
  'lateral.abrirProjeto': 'Abrir um projeto de verdade',
  'lateral.trocarProjeto': 'Trocar de projeto',
  'lateral.trabalhando': 'A IA está trabalhando agora',
  'lateral.parado': 'Nada em andamento',
  'lateral.acompanhando': 'Acompanhando {agentes}',
  'lateral.semAgente': 'Lendo o histórico do projeto. Nenhum agente assinou as mudanças ainda.',

  // barra do topo
  'topo.atualizado': 'atualizado {quando}',
  'topo.agora': 'agora mesmo',
  'topo.hum': 'há 1 min',
  'topo.minutos': 'há {n} min',
  'topo.atualizar': 'Atualizar agora',
  'topo.trabalhar': 'Trabalhar',
  'topo.trabalharDica': 'Abrir a IA nesta pasta, numa janela de terminal',

  // feed
  'feed.titulo': '{projeto}, em português',
  'feed.agora': 'Acontecendo agora',
  'feed.naoSalvos': '{n} arquivos não guardados — esse trabalho pode ser perdido.',
  'feed.naoSalvo': '1 arquivo não guardado — esse trabalho pode ser perdido.',
  'feed.pedemAtencao': '{n} coisas pedem sua atenção',
  'feed.pedeAtencao': '1 coisa pede sua atenção',
  'feed.filtrando': 'Mostrando só o que pede atenção',
  'feed.precisaAtencao': 'Precisa da sua atenção',
  'feed.aguardando': 'Aguardando sua decisão',
  'feed.respondidoIA': 'Respondido pela IA',
  'feed.resolvidoVoce': 'Você marcou como resolvido',
  'feed.respostas': '{n} respostas',
  'feed.resposta': '1 resposta',
  'feed.respondeAo': 'Responde ao aviso',
  'feed.marcarResolvido': 'Marcar como resolvido',
  'feed.reabrir': 'Reabrir',
  'feed.porque': 'Por quê',
  'feed.paraVoce': 'Para você',
  'feed.oQueIADisse': 'Ver o que a IA declarou',
  'feed.comoSabe': 'Como o WTF sabe disso',
  'feed.verTecnico': 'Ver a parte técnica',
  'feed.verCodigo': 'Ver o código',
  'feed.comeco': 'Começo do projeto.',
  'feed.vazioTitulo': 'Ainda não há nada para contar.',
  'feed.vazioTexto':
    'Este projeto ainda não tem nenhuma versão guardada. Assim que a primeira for salva — ou assim que a IA começar a trabalhar — o que acontecer aparece aqui.',
  'feed.codigoDica': 'Código deste aviso. Use para se referir a ele quando falar com a IA.',

  // estados
  'estado.planned': 'Planejado',
  'estado.building': 'Construindo',
  'estado.implemented': 'Pronto',
  'estado.tested': 'Testado',
  'estado.validated': 'Você aprovou',
  'estado.planned.sentido': 'Está no seu plano. Ninguém começou ainda.',
  'estado.building.sentido': 'A IA avisou que começou. Ainda não terminou.',
  'estado.implemented.sentido': 'A IA terminou e o código existe. Não quer dizer que funciona.',
  'estado.tested.sentido': 'Alguma verificação automática passou. Ainda falta você conferir.',
  'estado.validated.sentido': 'Você abriu, olhou e disse que era isso que queria.',
  'estado.comSentido': '{estado} — {sentido}',

  // marcas
  'marca.mexendo': 'A IA está mexendo agora',
  'marca.naoSalvo': 'ainda não salvo',
  'marca.naoSalvos': '{n} ainda não salvos',
  'marca.revalidar': 'Mudou depois que você aprovou',
  'marca.foraDoPlano': 'Não estava no seu plano',

  // progresso
  'progresso.titulo': 'Onde estamos na construção',
  'progresso.partes': '{n} partes',
  'progresso.areas': '{n} áreas',
  'progresso.comNaoSalvo': '{n} com trabalho não salvo',
  'progresso.aprovar': 'Conferir e aprovar',
  'progresso.desfazerAprovacao': 'Desfazer aprovação',
  'progresso.limparFiltros': 'Limpar filtros',
  'progresso.escondidas': '{n} partes escondidas',

  // mapa
  'mapa.titulo': 'Do que seu software é feito',
  'mapa.ligadoA': 'Ligado a',
  'mapa.mexidoHoje': 'Mexido hoje',

  // ações
  'acao.oQueFazer': 'O que fazer',
  'acao.abrirIA': 'Abrir a IA com essa mensagem',
  'acao.copiar': 'Copiar mensagem',
  'acao.copiado': 'Copiado',
  'acao.colar': 'para colar numa conversa já aberta',

  // gerais
  'geral.arquivo': '1 arquivo',
  'geral.arquivos': '{n} arquivos',
  'geral.arquivosDica': 'Arquivos que o WTF associou a esta parte',
  'geral.fechar': 'Fechar',

  // feed (complementos)
  'feed.voce': 'você',
  'feed.comecou': 'começou {dia} às {hora} · ainda não terminou',
  'feed.mexidoSemAviso': '1 arquivo mexido · a IA não avisou o que está fazendo',
  'feed.mexidosSemAviso': '{n} arquivos mexidos · a IA não avisou o que está fazendo',
  'feed.diaHora': '{dia} às {hora}',
  'feed.respondidoIAEm': 'Respondido pela IA · {dia} às {hora}',
  'feed.abrirArquivo': 'Abrir o arquivo aqui do lado',

  // marcas (complementos)
  'marca.naoSalvoDica': 'Arquivos ainda não guardados no histórico do projeto.',
  'marca.revalidarDesde':
    'Você tinha aprovado em {quando}. Depois disso esta parte mudou.',
  'marca.revalidarSemData': 'Esta parte mudou depois que você aprovou.',
  'marca.atencaoCritica': 'Precisa da sua atenção agora',
  'marca.atencaoAviso': 'Tem algo aqui para você olhar',
  'marca.mexendoClaim': 'A IA está mexendo agora: “{claim}”',
  'marca.mexendoDica': 'O que a IA declarou ao começar este trabalho.',
  'marca.foraDoPlanoCurto': 'fora do plano',
  'marca.foraDoPlanoDica':
    'Esta parte não estava no seu plano — o WTF a descobriu no código.',

  // filtros
  'filtro.soForaDoPlano': 'só fora do plano',
  'filtro.soForaDoPlanoDica':
    'Mostrar somente as partes que não estavam no seu plano — o WTF as descobriu no código.',
  'filtro.soNaoSalvo': 'só não salvo',
  'filtro.soNaoSalvoDica':
    'Mostrar somente as partes com arquivos ainda não guardados no histórico do projeto.',
  'filtro.mostrarDeNovo': 'Mostrar de novo: {estado}',
  'filtro.esconder': 'Esconder {estado} — {sentido}',
  'filtro.nadaEscondido': 'Filtro ativo — nada escondido.',
  'filtro.escondida': '1 parte escondida pelo filtro.',
  'filtro.escondidas': '{n} partes escondidas pelo filtro.',
  'filtro.limpar': 'limpar filtros',
  'filtro.nenhuma': 'Nenhuma parte passa pelos filtros atuais.',
  'filtro.esconderColuna': 'Esconder a coluna {estado} — {sentido}',
  'filtro.colunaOculta': '1 coluna escondida.',
  'filtro.colunasOcultas': '{n} colunas escondidas.',
  'progresso.colunaVazia': 'nada aqui ainda',
  'progresso.semArrastar': 'ninguém arrasta os cards',
  'progresso.semArrastarDica':
    'Cada parte fica na coluna do que já foi provado no seu projeto. O card anda sozinho quando o código anda — por isso não dá para arrastar.',

  // progresso (complementos)
  'progresso.geralDica': 'Quanto do projeto inteiro já avançou — não muda com os filtros.',
  'progresso.palavraPartes': 'partes',
  'progresso.palavraAreas': 'áreas',
  'progresso.palavraNaoSalvo': 'com trabalho não salvo',
  'progresso.notaPorcentagem': 'A porcentagem acima continua sendo a do projeto inteiro.',

  // mapa (complementos)
  'mapa.tituloProjeto': 'Do que o {projeto} é feito',
  'mapa.mexidaHoje': '1 mexida hoje',
  'mapa.mexidasHoje': '{n} mexidas hoje',
  'mapa.atencao': 'atenção',
  'mapa.hoje': 'hoje',
  'mapa.hojeDica': 'Mexido nas últimas 24 horas',
  'mapa.nada': 'Nada.',
  'mapa.semArquivos': 'Nenhum arquivo ainda.',
  'mapa.mexidoEm': 'Mexido {dia} às {hora}',
  'mapa.parteDesconhecida': 'Parte desconhecida',
  'mapa.notaNumeros': 'Os números acima continuam sendo os do projeto inteiro.',

  // idioma
  'idioma.titulo': 'Idioma',
  'idioma.interface': 'Idioma do aplicativo',
  'idioma.conteudo': 'Idioma das explicações',
  'idioma.conteudoNota':
    'A língua em que a IA escreve o que aconteceu. Pode ser diferente da do aplicativo.',
  'idioma.outro': 'Outro idioma',
  'idioma.salvar': 'Salvar',

  // ações (o que aparece nos botões; o corpo da mensagem não é traduzido)
  'acao.resolver': 'Pedir para resolver',
  'acao.resolver.nota': 'A IA analisa o ponto de atenção e propõe uma solução antes de mexer.',
  'acao.explicar': 'Pedir para explicar',
  'acao.explicar.nota': 'A IA explica o risco em palavras simples, sem alterar nada.',
  'acao.verificar': 'Pedir para conferir se funciona',
  'acao.verificar.nota':
    'A IA testa de verdade e mostra a prova, em vez de dizer que está pronto.',
  'acao.salvar': 'Pedir para guardar o trabalho',
  'acao.salvar.nota': 'A IA revisa o que foi feito e guarda no histórico, em partes organizadas.',
  'acao.resumirPendente': 'Pedir um resumo do que está em aberto',
  'acao.resumirPendente.nota': 'A IA explica o que ficou pela metade, sem mexer em nada.',
  'acao.naoCopiou': 'Não consegui copiar. Selecione o texto abaixo e copie à mão.',
  'acao.abriuComMensagem': '{agente} abriu numa janela nova com a mensagem.',
  'acao.aIA': 'A IA',

  // topo (complementos)
  'topo.atualizarRotulo': 'Atualizar',
  'topo.agenteAbriu': '{agente} abriu numa janela nova.',
  'topo.terminalAberto': 'Terminal aberto na pasta do projeto.',

  // instalação
  'instalar.ligado': 'A IA está avisando o que faz neste projeto.',
  'instalar.desligar': 'desligar',
  'instalar.naoAvisa': 'A IA ainda não avisa o que está fazendo.',
  'instalar.naoAvisaNota':
    'Hoje o WTF só vê o que já foi salvo. Ligando isso, você passa a ver o que está sendo construído agora.',
  'instalar.ligar': 'Ligar no meu projeto',
  'instalar.antesDoWtf': 'Este projeto começou antes do WTF.',
  'instalar.mapeando':
    'A IA está lendo seu projeto. Quando ela terminar, o painel se organiza sozinho.',
  'instalar.mapearNota':
    'As abas Progresso e Mapa ainda mostram nomes técnicos. A IA pode ler seu plano e organizar tudo em palavras simples.',
  'instalar.mapear': 'Organizar meu projeto',

  // visualizador de arquivo
  'arquivo.umaLinha': '1 linha',
  'arquivo.linhas': '{n} linhas',
  'arquivo.fechar': 'Fechar o arquivo',
  'arquivo.abrindo': 'Abrindo…',
  'arquivo.naoEhTexto': 'Esse arquivo não é texto.',

  // perguntar sobre uma mudança
  'pergunta.abrir': 'Explique isso',
  'pergunta.titulo': 'Explique isso',
  'pergunta.fechar': 'Fechar',
  'pergunta.campo': 'O que você quer entender?',
  'pergunta.placeholder': 'Pergunte com suas palavras…',
  'pergunta.enviar': 'Perguntar',
  'pergunta.pensando': 'Lendo a mudança…',
  'pergunta.sugestoes': 'Ou comece por aqui',
  'pergunta.sugestao.perigoso': 'Isso é perigoso?',
  'pergunta.sugestao.quebrar': 'O que pode quebrar?',
  'pergunta.sugestao.fazer': 'Preciso fazer alguma coisa?',
  'pergunta.incompleta': 'A resposta foi interrompida antes do fim.',
  'pergunta.ressalva': 'Resposta gerada por IA a partir desta mudança. Pode errar.',
  'pergunta.semChave': 'Falta configurar uma chave para poder perguntar.',
  'pergunta.semChaveNota':
    'A resposta vem de um modelo de IA, e ele precisa de uma chave sua. Ela fica guardada de forma criptografada no seu computador, fora da pasta do projeto.',
  'pergunta.soNoApp': 'Perguntar só funciona no aplicativo.',

  // chaves de API
  'chaves.titulo': 'Chave para as explicações',
  'chaves.nota':
    'A chave fica guardada de forma criptografada no seu computador, fora da pasta do projeto — nunca entra no seu repositório.',
  'chaves.onde': 'Guardada em {caminho}',
  'chaves.campo': 'Chave do {provedor}',
  'chaves.placeholder': 'Cole a chave aqui',
  'chaves.salvar': 'Salvar',
  'chaves.salvando': 'Salvando…',
  'chaves.apagar': 'Apagar',
  'chaves.trocar': 'Trocar a chave',
  'chaves.cancelar': 'Cancelar',
  'chaves.atual': 'Chave configurada: {mascara}',
  'chaves.soNestaSessao': 'Vale só enquanto o WTF estiver aberto — não foi gravada.',
  'chaves.semCofre':
    'Seu sistema não ofereceu um cofre para guardar a chave. Dá para usar mesmo assim, informando a chave a cada sessão — mas nada será escrito em disco.',
  'chaves.soNoApp': 'Configurar chaves só funciona no aplicativo.',

  // marcas (complementos)
  'marca.mexendoDesde': 'A IA começou este trabalho em {quando}',
}

const en: Dic = {
  'home.dependeDeVoce': '{n} things depend on you',
  'home.dependeDeVoce1': 'One thing depends on you',
  'home.verNoFeed': 'See all',
  'home.verProgresso': 'See progress',
  'home.verMapa': 'See what it is made of',
  'home.naoSalvo': '{n} files have not been saved yet',
  'home.naoSalvo1': 'One file has not been saved yet',
  'home.naoSalvoNota': 'Until they are saved, this work can be lost. Parts involved: {partes}.',
  'home.mudouDepois': '{n} parts changed after you approved them',
  'home.mudouDepois1': 'One part changed after you approved it',
  'home.agora': 'Happening now',
  'home.geral': 'How the project is doing',
  'home.ultima': 'Last thing that happened',
  'home.tudoEmDia': 'Nothing needs your attention right now.',
  'nav.home': 'Home',
  'nav.home.nota': 'Project summary',
  'nav.acontecendo': 'Activity',
  'nav.acontecendo.nota': 'What the AI touched',
  'nav.progresso': 'Progress',
  'nav.progresso.nota': 'Where we are',
  'nav.mapa': 'Map',
  'nav.mapa.nota': 'What it is made of',
  'nav.pastas': 'Folders',
  'nav.pastas.nota': 'Where everything lives',
  'nav.config': 'Settings',
  'nav.config.nota': 'Language, keys and install',

  // settings
  'config.titulo': 'Settings',
  'config.paraQue': 'Everything you pick once and stop thinking about: which project WTF is watching, what language it speaks to you in, how it reaches the AI — and, above all, exactly what it writes inside your project.',
  'config.projeto': 'Project',
  'config.projetoNota': 'The folder WTF is following right now.',
  'config.trocar': 'Switch project',
  'config.abrir': 'Open a project',
  'config.idioma': 'Language',
  'config.idiomaNota': 'The language of the app and the language the AI writes explanations in. They can be different.',
  'config.ia': 'AI access',
  'config.iaNota': 'The key used to answer your questions about the project. It stays on your computer.',
  'config.instala': 'What WTF installs in your project',
  'config.instalaNota': 'These are all the files WTF writes into your folder. Open any of them and read it in full before accepting.',
  'config.seguranca': 'Nothing is overwritten without a backup, and uninstalling puts the project back exactly as it was.',
  'config.lendo': 'Reading what would be installed…',
  'config.semPacote': 'Could not read the file list right now. This only works inside the app, with a project open.',
  'config.verConteudo': 'See the full contents',
  'config.selo.novo': 'new',
  'config.selo.instalado': 'already installed',
  'config.selo.desatualizado': 'out of date',
  'config.hooks': 'Registered notices',
  'config.hooksNota': 'Commands your agent starts running on its own to tell WTF what it is doing.',
  'config.nenhumHook': 'No notices are registered.',
  'config.gitignore': 'Lines added to .gitignore',
  'config.gitignoreNota': 'What WTF asks Git to ignore, so your project history stays clean.',
  'config.nenhumGitignore': 'Nothing is added to .gitignore.',

  // pastas (MAPA.md)
  'pastas.titulo': 'Folder map',
  'pastas.paraQue': 'The answer to "where does everything live": every folder in the project with one sentence saying what it is for. It helps you understand how your software is organised — and stops the AI from inventing a new folder every time.',
  'pastas.atualizado': 'Updated {quando}',
  'pastas.temMapaProprioDica': 'This folder is big enough to have a map of its own.',
  'pastas.vazioTitulo': 'This project does not have a folder map yet',
  'pastas.vazioTexto': 'It is a short document, written in plain language, listing the project folders and explaining what each one is for. The AI walks through the project and writes it for you — then you just fix whatever it got wrong.',
  'pastas.criar': 'Create the folder map',
  'pastas.criando': 'Reading the project…',
  'pastas.rodape': 'is a plain file in the project root. Feel free to edit it by hand: what you think about your own project counts for more than what the AI thinks.',

  'lateral.exemplo': 'Sample project',
  'lateral.abrirProjeto': 'Open a real project',
  'lateral.trocarProjeto': 'Switch project',
  'lateral.trabalhando': 'The AI is working right now',
  'lateral.parado': 'Nothing in progress',
  'lateral.acompanhando': 'Watching {agentes}',
  'lateral.semAgente': 'Reading the project history. No agent has signed any changes yet.',

  'topo.atualizado': 'updated {quando}',
  'topo.agora': 'just now',
  'topo.hum': '1 min ago',
  'topo.minutos': '{n} min ago',
  'topo.atualizar': 'Refresh now',
  'topo.trabalhar': 'Work',
  'topo.trabalharDica': 'Open the AI in this folder, in a terminal window',

  'feed.titulo': '{projeto}, in plain words',
  'feed.agora': 'Happening now',
  'feed.naoSalvos': '{n} files not saved yet — this work can be lost.',
  'feed.naoSalvo': '1 file not saved yet — this work can be lost.',
  'feed.pedemAtencao': '{n} things need your attention',
  'feed.pedeAtencao': '1 thing needs your attention',
  'feed.filtrando': 'Showing only what needs attention',
  'feed.precisaAtencao': 'Needs your attention',
  'feed.aguardando': 'Waiting on your decision',
  'feed.respondidoIA': 'Answered by the AI',
  'feed.resolvidoVoce': 'You marked it as resolved',
  'feed.respostas': '{n} replies',
  'feed.resposta': '1 reply',
  'feed.respondeAo': 'Replies to notice',
  'feed.marcarResolvido': 'Mark as resolved',
  'feed.reabrir': 'Reopen',
  'feed.porque': 'Why',
  'feed.paraVoce': 'For you',
  'feed.oQueIADisse': 'See what the AI declared',
  'feed.comoSabe': 'How WTF knows this',
  'feed.verTecnico': 'See the technical part',
  'feed.verCodigo': 'See the code',
  'feed.comeco': 'Start of the project.',
  'feed.vazioTitulo': 'Nothing to tell yet.',
  'feed.vazioTexto':
    'This project has no saved version yet. As soon as the first one is saved — or as soon as the AI starts working — whatever happens shows up here.',
  'feed.codigoDica': 'Code for this notice. Use it to refer to it when talking to the AI.',

  'estado.planned': 'Planned',
  'estado.building': 'Building',
  'estado.implemented': 'Done',
  'estado.tested': 'Tested',
  'estado.validated': 'You approved',
  'estado.planned.sentido': 'It is in your plan. Nobody has started it.',
  'estado.building.sentido': 'The AI said it started. It has not finished yet.',
  'estado.implemented.sentido': 'The AI finished and the code exists. That does not mean it works.',
  'estado.tested.sentido': 'Some automatic check passed. You still have to look at it.',
  'estado.validated.sentido': 'You opened it, looked, and said it was what you wanted.',
  'estado.comSentido': '{estado} — {sentido}',

  'marca.mexendo': 'The AI is working on this now',
  'marca.naoSalvo': 'not saved yet',
  'marca.naoSalvos': '{n} not saved yet',
  'marca.revalidar': 'Changed after you approved',
  'marca.foraDoPlano': 'Was not in your plan',

  'progresso.titulo': 'Where the build stands',
  'progresso.partes': '{n} parts',
  'progresso.areas': '{n} areas',
  'progresso.comNaoSalvo': '{n} with unsaved work',
  'progresso.aprovar': 'Check and approve',
  'progresso.desfazerAprovacao': 'Undo approval',
  'progresso.limparFiltros': 'Clear filters',
  'progresso.escondidas': '{n} parts hidden',

  'mapa.titulo': 'What your software is made of',
  'mapa.ligadoA': 'Connected to',
  'mapa.mexidoHoje': 'Touched today',

  'acao.oQueFazer': 'What to do',
  'acao.abrirIA': 'Open the AI with this message',
  'acao.copiar': 'Copy message',
  'acao.copiado': 'Copied',
  'acao.colar': 'to paste into a conversation already open',

  'geral.arquivo': '1 file',
  'geral.arquivos': '{n} files',
  'geral.arquivosDica': 'Files WTF linked to this part',
  'geral.fechar': 'Close',

  'feed.voce': 'you',
  'feed.comecou': 'started {dia} at {hora} · not finished yet',
  'feed.mexidoSemAviso': '1 file touched · the AI did not say what it is doing',
  'feed.mexidosSemAviso': '{n} files touched · the AI did not say what it is doing',
  'feed.diaHora': '{dia} at {hora}',
  'feed.respondidoIAEm': 'Answered by the AI · {dia} at {hora}',
  'feed.abrirArquivo': 'Open the file right here',

  'marca.naoSalvoDica': 'Files not yet saved to the project history.',
  'marca.revalidarDesde': 'You had approved this on {quando}. It changed after that.',
  'marca.revalidarSemData': 'This part changed after you approved it.',
  'marca.atencaoCritica': 'Needs your attention now',
  'marca.atencaoAviso': 'There is something here for you to look at',
  'marca.mexendoClaim': 'The AI is working on this now: “{claim}”',
  'marca.mexendoDica': 'What the AI said when it started this work.',
  'marca.foraDoPlanoCurto': 'off the plan',
  'marca.foraDoPlanoDica':
    'This part was not in your plan — WTF found it in the code.',

  'filtro.soForaDoPlano': 'only off the plan',
  'filtro.soForaDoPlanoDica':
    'Show only the parts that were not in your plan — WTF found them in the code.',
  'filtro.soNaoSalvo': 'only unsaved',
  'filtro.soNaoSalvoDica':
    'Show only the parts with files not yet saved to the project history.',
  'filtro.mostrarDeNovo': 'Show again: {estado}',
  'filtro.esconder': 'Hide {estado} — {sentido}',
  'filtro.nadaEscondido': 'Filter on — nothing hidden.',
  'filtro.escondida': '1 part hidden by the filter.',
  'filtro.escondidas': '{n} parts hidden by the filter.',
  'filtro.limpar': 'clear filters',
  'filtro.nenhuma': 'No part passes the current filters.',
  'filtro.esconderColuna': 'Hide the {estado} column — {sentido}',
  'filtro.colunaOculta': '1 column hidden.',
  'filtro.colunasOcultas': '{n} columns hidden.',
  'progresso.colunaVazia': 'nothing here yet',
  'progresso.semArrastar': 'nobody drags the cards',
  'progresso.semArrastarDica':
    'Each part sits in the column of what has been proven in your project. The card moves on its own when the code moves — that is why you cannot drag it.',

  'progresso.geralDica': 'How far the whole project has come — filters do not change it.',
  'progresso.palavraPartes': 'parts',
  'progresso.palavraAreas': 'areas',
  'progresso.palavraNaoSalvo': 'with unsaved work',
  'progresso.notaPorcentagem': 'The percentage above is still the whole project.',

  'mapa.tituloProjeto': 'What {projeto} is made of',
  'mapa.mexidaHoje': '1 touched today',
  'mapa.mexidasHoje': '{n} touched today',
  'mapa.atencao': 'attention',
  'mapa.hoje': 'today',
  'mapa.hojeDica': 'Touched in the last 24 hours',
  'mapa.nada': 'Nothing.',
  'mapa.semArquivos': 'No files yet.',
  'mapa.mexidoEm': 'Touched {dia} at {hora}',
  'mapa.parteDesconhecida': 'Unknown part',
  'mapa.notaNumeros': 'The numbers above are still the whole project.',

  'idioma.titulo': 'Language',
  'idioma.interface': 'App language',
  'idioma.conteudo': 'Language of explanations',
  'idioma.conteudoNota':
    'The language the AI writes in. It can be different from the app language.',
  'idioma.outro': 'Another language',
  'idioma.salvar': 'Save',

  'acao.resolver': 'Ask it to fix this',
  'acao.resolver.nota': 'The AI looks into the issue and proposes a fix before touching anything.',
  'acao.explicar': 'Ask it to explain',
  'acao.explicar.nota': 'The AI explains the risk in plain words, without changing anything.',
  'acao.verificar': 'Ask it to check that this works',
  'acao.verificar.nota': 'The AI actually tests it and shows the proof, instead of saying it is done.',
  'acao.salvar': 'Ask it to save the work',
  'acao.salvar.nota': 'The AI reviews what was done and saves it to the history, in tidy pieces.',
  'acao.resumirPendente': 'Ask for a summary of what is open',
  'acao.resumirPendente.nota': 'The AI explains what was left half done, without touching anything.',
  'acao.naoCopiou': 'I could not copy it. Select the text below and copy it by hand.',
  'acao.abriuComMensagem': '{agente} opened in a new window with the message.',
  'acao.aIA': 'The AI',

  'topo.atualizarRotulo': 'Refresh',
  'topo.agenteAbriu': '{agente} opened in a new window.',
  'topo.terminalAberto': 'Terminal opened in the project folder.',

  'instalar.ligado': 'The AI is reporting what it does in this project.',
  'instalar.desligar': 'turn off',
  'instalar.naoAvisa': 'The AI is not reporting what it is doing yet.',
  'instalar.naoAvisaNota':
    'Right now WTF only sees what was already saved. Turn this on and you start seeing what is being built as it happens.',
  'instalar.ligar': 'Turn it on for my project',
  'instalar.antesDoWtf': 'This project started before WTF.',
  'instalar.mapeando':
    'The AI is reading your project. When it finishes, the panel organizes itself.',
  'instalar.mapearNota':
    'The Progress and Map tabs still show technical names. The AI can read your plan and sort it all out in plain words.',
  'instalar.mapear': 'Organize my project',

  'arquivo.umaLinha': '1 line',
  'arquivo.linhas': '{n} lines',
  'arquivo.fechar': 'Close the file',
  'arquivo.abrindo': 'Opening…',
  'arquivo.naoEhTexto': 'This file is not text.',

  'pergunta.abrir': 'Explain this',
  'pergunta.titulo': 'Explain this',
  'pergunta.fechar': 'Close',
  'pergunta.campo': 'What do you want to understand?',
  'pergunta.placeholder': 'Ask in your own words…',
  'pergunta.enviar': 'Ask',
  'pergunta.pensando': 'Reading the change…',
  'pergunta.sugestoes': 'Or start here',
  'pergunta.sugestao.perigoso': 'Is this dangerous?',
  'pergunta.sugestao.quebrar': 'What could break?',
  'pergunta.sugestao.fazer': 'Do I need to do anything?',
  'pergunta.incompleta': 'The answer was cut off before it finished.',
  'pergunta.ressalva': 'Answer generated by AI from this change alone. It can be wrong.',
  'pergunta.semChave': 'You need to set up a key before asking.',
  'pergunta.semChaveNota':
    'The answer comes from an AI model, and it needs a key of yours. It is stored encrypted on your computer, outside the project folder.',
  'pergunta.soNoApp': 'Asking only works inside the app.',

  'chaves.titulo': 'Key for the explanations',
  'chaves.nota':
    'The key is stored encrypted on your computer, outside the project folder — it never enters your repository.',
  'chaves.onde': 'Stored in {caminho}',
  'chaves.campo': '{provedor} key',
  'chaves.placeholder': 'Paste the key here',
  'chaves.salvar': 'Save',
  'chaves.salvando': 'Saving…',
  'chaves.apagar': 'Delete',
  'chaves.trocar': 'Replace the key',
  'chaves.cancelar': 'Cancel',
  'chaves.atual': 'Key set: {mascara}',
  'chaves.soNestaSessao': 'Valid only while WTF is open — it was not written to disk.',
  'chaves.semCofre':
    'Your system did not offer a vault to store the key. You can still use it by entering the key each session — but nothing will be written to disk.',
  'chaves.soNoApp': 'Setting up keys only works inside the app.',

  'marca.mexendoDesde': 'The AI started this work on {quando}',
}

const es: Dic = {
  'home.dependeDeVoce': '{n} cosas dependen de ti',
  'home.dependeDeVoce1': 'Una cosa depende de ti',
  'home.verNoFeed': 'Ver todo',
  'home.verProgresso': 'Ver progreso',
  'home.verMapa': 'Ver de qué está hecho',
  'home.naoSalvo': '{n} archivos aún no se han guardado',
  'home.naoSalvo1': 'Un archivo aún no se ha guardado',
  'home.naoSalvoNota': 'Mientras no se guarden, este trabajo se puede perder. Partes implicadas: {partes}.',
  'home.mudouDepois': '{n} partes cambiaron después de que las aprobaste',
  'home.mudouDepois1': 'Una parte cambió después de que la aprobaste',
  'home.agora': 'Ocurriendo ahora',
  'home.geral': 'Cómo va el proyecto',
  'home.ultima': 'Lo último que ocurrió',
  'home.tudoEmDia': 'Nada necesita tu atención ahora mismo.',
  'nav.home': 'Inicio',
  'nav.home.nota': 'Resumen del proyecto',
  'nav.acontecendo': 'Actividad',
  'nav.acontecendo.nota': 'Lo que tocó la IA',
  'nav.progresso': 'Progreso',
  'nav.progresso.nota': 'Dónde estamos',
  'nav.mapa': 'Mapa',
  'nav.mapa.nota': 'De qué está hecho',
  'nav.pastas': 'Carpetas',
  'nav.pastas.nota': 'Dónde vive cada cosa',
  'nav.config': 'Configuración',
  'nav.config.nota': 'Idioma, claves e instalación',

  // configuración
  'config.titulo': 'Configuración',
  'config.paraQue': 'Todo lo que eliges una vez y no quieres volver a pensar: qué proyecto está mirando WTF, en qué idioma te habla, cómo accede a la IA y, sobre todo, qué escribe exactamente dentro de tu proyecto.',
  'config.projeto': 'Proyecto',
  'config.projetoNota': 'La carpeta que WTF está siguiendo ahora.',
  'config.trocar': 'Cambiar de proyecto',
  'config.abrir': 'Abrir un proyecto',
  'config.idioma': 'Idioma',
  'config.idiomaNota': 'El idioma de la aplicación y el idioma en que la IA escribe las explicaciones. Pueden ser distintos.',
  'config.ia': 'Acceso a la IA',
  'config.iaNota': 'La clave que se usa para responder tus preguntas sobre el proyecto. Se guarda en tu computadora.',
  'config.instala': 'Lo que WTF instala en tu proyecto',
  'config.instalaNota': 'Estos son todos los archivos que WTF escribe en tu carpeta. Abre cualquiera y léelo completo antes de aceptar.',
  'config.seguranca': 'Nada se sobrescribe sin copia de seguridad, y desinstalar deja el proyecto exactamente como estaba.',
  'config.lendo': 'Leyendo lo que se instalaría…',
  'config.semPacote': 'No se pudo leer la lista de archivos ahora. Esto solo funciona dentro de la aplicación, con un proyecto abierto.',
  'config.verConteudo': 'Ver el contenido completo',
  'config.selo.novo': 'nuevo',
  'config.selo.instalado': 'ya instalado',
  'config.selo.desatualizado': 'desactualizado',
  'config.hooks': 'Avisos registrados',
  'config.hooksNota': 'Comandos que tu agente empieza a ejecutar solo para contarle a WTF lo que está haciendo.',
  'config.nenhumHook': 'No se registra ningún aviso.',
  'config.gitignore': 'Líneas en el .gitignore',
  'config.gitignoreNota': 'Lo que WTF le pide a Git que ignore, para no ensuciar el historial de tu proyecto.',
  'config.nenhumGitignore': 'No se agrega nada al .gitignore.',

  // pastas (MAPA.md)
  'pastas.titulo': 'Mapa de carpetas',
  'pastas.paraQue': 'La respuesta a "dónde vive cada cosa": cada carpeta del proyecto con una frase que dice para qué sirve. Te ayuda a entender cómo está organizado tu software — y evita que la IA invente una carpeta nueva cada vez.',
  'pastas.atualizado': 'Actualizado {quando}',
  'pastas.temMapaProprioDica': 'Esta carpeta es grande y tiene un mapa propio.',
  'pastas.vazioTitulo': 'Este proyecto todavía no tiene mapa de carpetas',
  'pastas.vazioTexto': 'Es un documento corto, escrito en lenguaje sencillo, que lista las carpetas del proyecto y explica para qué sirve cada una. La IA recorre el proyecto y lo escribe por ti — después solo corriges lo que esté mal.',
  'pastas.criar': 'Crear el mapa de carpetas',
  'pastas.criando': 'Leyendo el proyecto…',
  'pastas.rodape': 'es un archivo común, en la raíz del proyecto. Puedes editarlo a mano: lo que tú opinas de tu propio proyecto vale más que lo que opina la IA.',

  'lateral.exemplo': 'Proyecto de ejemplo',
  'lateral.abrirProjeto': 'Abrir un proyecto real',
  'lateral.trocarProjeto': 'Cambiar de proyecto',
  'lateral.trabalhando': 'La IA está trabajando ahora',
  'lateral.parado': 'Nada en curso',
  'lateral.acompanhando': 'Siguiendo a {agentes}',
  'lateral.semAgente': 'Leyendo el historial del proyecto. Ningún agente ha firmado cambios todavía.',

  'topo.atualizado': 'actualizado {quando}',
  'topo.agora': 'ahora mismo',
  'topo.hum': 'hace 1 min',
  'topo.minutos': 'hace {n} min',
  'topo.atualizar': 'Actualizar ahora',
  'topo.trabalhar': 'Trabajar',
  'topo.trabalharDica': 'Abrir la IA en esta carpeta, en una ventana de terminal',

  'feed.titulo': '{projeto}, en palabras simples',
  'feed.agora': 'Ocurriendo ahora',
  'feed.naoSalvos': '{n} archivos sin guardar — este trabajo se puede perder.',
  'feed.naoSalvo': '1 archivo sin guardar — este trabajo se puede perder.',
  'feed.pedemAtencao': '{n} cosas necesitan tu atención',
  'feed.pedeAtencao': '1 cosa necesita tu atención',
  'feed.filtrando': 'Mostrando solo lo que necesita atención',
  'feed.precisaAtencao': 'Necesita tu atención',
  'feed.aguardando': 'Esperando tu decisión',
  'feed.respondidoIA': 'Respondido por la IA',
  'feed.resolvidoVoce': 'Lo marcaste como resuelto',
  'feed.respostas': '{n} respuestas',
  'feed.resposta': '1 respuesta',
  'feed.respondeAo': 'Responde al aviso',
  'feed.marcarResolvido': 'Marcar como resuelto',
  'feed.reabrir': 'Reabrir',
  'feed.porque': 'Por qué',
  'feed.paraVoce': 'Para ti',
  'feed.oQueIADisse': 'Ver lo que declaró la IA',
  'feed.comoSabe': 'Cómo lo sabe WTF',
  'feed.verTecnico': 'Ver la parte técnica',
  'feed.verCodigo': 'Ver el código',
  'feed.comeco': 'Inicio del proyecto.',
  'feed.vazioTitulo': 'Todavía no hay nada que contar.',
  'feed.vazioTexto':
    'Este proyecto aún no tiene ninguna versión guardada. En cuanto se guarde la primera — o en cuanto la IA empiece a trabajar — lo que ocurra aparecerá aquí.',
  'feed.codigoDica': 'Código de este aviso. Úsalo para referirte a él cuando hables con la IA.',

  'estado.planned': 'Planificado',
  'estado.building': 'En construcción',
  'estado.implemented': 'Listo',
  'estado.tested': 'Probado',
  'estado.validated': 'Lo aprobaste',
  'estado.planned.sentido': 'Está en tu plan. Nadie ha empezado.',
  'estado.building.sentido': 'La IA avisó que empezó. Todavía no ha terminado.',
  'estado.implemented.sentido': 'La IA terminó y el código existe. Eso no significa que funcione.',
  'estado.tested.sentido': 'Alguna comprobación automática pasó. Todavía falta que lo mires.',
  'estado.validated.sentido': 'Lo abriste, lo miraste y dijiste que era lo que querías.',
  'estado.comSentido': '{estado} — {sentido}',

  'marca.mexendo': 'La IA está trabajando en esto ahora',
  'marca.naoSalvo': 'sin guardar',
  'marca.naoSalvos': '{n} sin guardar',
  'marca.revalidar': 'Cambió después de que lo aprobaste',
  'marca.foraDoPlano': 'No estaba en tu plan',

  'progresso.titulo': 'Cómo va la construcción',
  'progresso.partes': '{n} partes',
  'progresso.areas': '{n} áreas',
  'progresso.comNaoSalvo': '{n} con trabajo sin guardar',
  'progresso.aprovar': 'Revisar y aprobar',
  'progresso.desfazerAprovacao': 'Deshacer aprobación',
  'progresso.limparFiltros': 'Limpiar filtros',
  'progresso.escondidas': '{n} partes ocultas',

  'mapa.titulo': 'De qué está hecho tu software',
  'mapa.ligadoA': 'Conectado a',
  'mapa.mexidoHoje': 'Tocado hoy',

  'acao.oQueFazer': 'Qué hacer',
  'acao.abrirIA': 'Abrir la IA con este mensaje',
  'acao.copiar': 'Copiar mensaje',
  'acao.copiado': 'Copiado',
  'acao.colar': 'para pegarlo en una conversación ya abierta',

  'geral.arquivo': '1 archivo',
  'geral.arquivos': '{n} archivos',
  'geral.arquivosDica': 'Archivos que WTF asoció a esta parte',
  'geral.fechar': 'Cerrar',

  'feed.voce': 'tú',
  'feed.comecou': 'empezó {dia} a las {hora} · todavía no ha terminado',
  'feed.mexidoSemAviso': '1 archivo tocado · la IA no avisó qué está haciendo',
  'feed.mexidosSemAviso': '{n} archivos tocados · la IA no avisó qué está haciendo',
  'feed.diaHora': '{dia} a las {hora}',
  'feed.respondidoIAEm': 'Respondido por la IA · {dia} a las {hora}',
  'feed.abrirArquivo': 'Abrir el archivo aquí al lado',

  'marca.naoSalvoDica': 'Archivos aún no guardados en el historial del proyecto.',
  'marca.revalidarDesde': 'Lo habías aprobado el {quando}. Después de eso esta parte cambió.',
  'marca.revalidarSemData': 'Esta parte cambió después de que la aprobaste.',
  'marca.atencaoCritica': 'Necesita tu atención ahora',
  'marca.atencaoAviso': 'Hay algo aquí para que mires',
  'marca.mexendoClaim': 'La IA está trabajando en esto ahora: “{claim}”',
  'marca.mexendoDica': 'Lo que la IA declaró al empezar este trabajo.',
  'marca.foraDoPlanoCurto': 'fuera del plan',
  'marca.foraDoPlanoDica':
    'Esta parte no estaba en tu plan — WTF la descubrió en el código.',

  'filtro.soForaDoPlano': 'solo fuera del plan',
  'filtro.soForaDoPlanoDica':
    'Mostrar solo las partes que no estaban en tu plan — WTF las descubrió en el código.',
  'filtro.soNaoSalvo': 'solo sin guardar',
  'filtro.soNaoSalvoDica':
    'Mostrar solo las partes con archivos aún no guardados en el historial del proyecto.',
  'filtro.mostrarDeNovo': 'Mostrar de nuevo: {estado}',
  'filtro.esconder': 'Ocultar {estado} — {sentido}',
  'filtro.nadaEscondido': 'Filtro activo — nada oculto.',
  'filtro.escondida': '1 parte oculta por el filtro.',
  'filtro.escondidas': '{n} partes ocultas por el filtro.',
  'filtro.limpar': 'limpiar filtros',
  'filtro.nenhuma': 'Ninguna parte pasa los filtros actuales.',
  'filtro.esconderColuna': 'Ocultar la columna {estado} — {sentido}',
  'filtro.colunaOculta': '1 columna oculta.',
  'filtro.colunasOcultas': '{n} columnas ocultas.',
  'progresso.colunaVazia': 'todavía nada aquí',
  'progresso.semArrastar': 'nadie arrastra las tarjetas',
  'progresso.semArrastarDica':
    'Cada parte está en la columna de lo que ya se demostró en tu proyecto. La tarjeta avanza sola cuando el código avanza — por eso no se puede arrastrar.',

  'progresso.geralDica': 'Cuánto ha avanzado el proyecto entero — no cambia con los filtros.',
  'progresso.palavraPartes': 'partes',
  'progresso.palavraAreas': 'áreas',
  'progresso.palavraNaoSalvo': 'con trabajo sin guardar',
  'progresso.notaPorcentagem': 'El porcentaje de arriba sigue siendo el del proyecto entero.',

  'mapa.tituloProjeto': 'De qué está hecho {projeto}',
  'mapa.mexidaHoje': '1 tocada hoy',
  'mapa.mexidasHoje': '{n} tocadas hoy',
  'mapa.atencao': 'atención',
  'mapa.hoje': 'hoy',
  'mapa.hojeDica': 'Tocado en las últimas 24 horas',
  'mapa.nada': 'Nada.',
  'mapa.semArquivos': 'Ningún archivo todavía.',
  'mapa.mexidoEm': 'Tocado {dia} a las {hora}',
  'mapa.parteDesconhecida': 'Parte desconocida',
  'mapa.notaNumeros': 'Los números de arriba siguen siendo los del proyecto entero.',

  'idioma.titulo': 'Idioma',
  'idioma.interface': 'Idioma de la aplicación',
  'idioma.conteudo': 'Idioma de las explicaciones',
  'idioma.conteudoNota':
    'El idioma en el que la IA escribe. Puede ser distinto al de la aplicación.',
  'idioma.outro': 'Otro idioma',
  'idioma.salvar': 'Guardar',

  'acao.resolver': 'Pedir que lo resuelva',
  'acao.resolver.nota': 'La IA revisa el punto de atención y propone una solución antes de tocar nada.',
  'acao.explicar': 'Pedir que lo explique',
  'acao.explicar.nota': 'La IA explica el riesgo en palabras simples, sin cambiar nada.',
  'acao.verificar': 'Pedir que compruebe si funciona',
  'acao.verificar.nota': 'La IA lo prueba de verdad y muestra la prueba, en vez de decir que ya está.',
  'acao.salvar': 'Pedir que guarde el trabajo',
  'acao.salvar.nota': 'La IA revisa lo que se hizo y lo guarda en el historial, en partes ordenadas.',
  'acao.resumirPendente': 'Pedir un resumen de lo que está pendiente',
  'acao.resumirPendente.nota': 'La IA explica lo que quedó a medias, sin tocar nada.',
  'acao.naoCopiou': 'No pude copiarlo. Selecciona el texto de abajo y cópialo a mano.',
  'acao.abriuComMensagem': '{agente} se abrió en una ventana nueva con el mensaje.',
  'acao.aIA': 'La IA',

  'topo.atualizarRotulo': 'Actualizar',
  'topo.agenteAbriu': '{agente} se abrió en una ventana nueva.',
  'topo.terminalAberto': 'Terminal abierta en la carpeta del proyecto.',

  'instalar.ligado': 'La IA está avisando lo que hace en este proyecto.',
  'instalar.desligar': 'apagar',
  'instalar.naoAvisa': 'La IA todavía no avisa lo que está haciendo.',
  'instalar.naoAvisaNota':
    'Hoy WTF solo ve lo que ya se guardó. Si activas esto, empiezas a ver lo que se está construyendo ahora.',
  'instalar.ligar': 'Activarlo en mi proyecto',
  'instalar.antesDoWtf': 'Este proyecto empezó antes que WTF.',
  'instalar.mapeando':
    'La IA está leyendo tu proyecto. Cuando termine, el panel se organiza solo.',
  'instalar.mapearNota':
    'Las pestañas Progreso y Mapa aún muestran nombres técnicos. La IA puede leer tu plan y ordenarlo todo en palabras simples.',
  'instalar.mapear': 'Organizar mi proyecto',

  'arquivo.umaLinha': '1 línea',
  'arquivo.linhas': '{n} líneas',
  'arquivo.fechar': 'Cerrar el archivo',
  'arquivo.abrindo': 'Abriendo…',
  'arquivo.naoEhTexto': 'Este archivo no es texto.',

  'pergunta.abrir': 'Explícame esto',
  'pergunta.titulo': 'Explícame esto',
  'pergunta.fechar': 'Cerrar',
  'pergunta.campo': '¿Qué quieres entender?',
  'pergunta.placeholder': 'Pregunta con tus palabras…',
  'pergunta.enviar': 'Preguntar',
  'pergunta.pensando': 'Leyendo el cambio…',
  'pergunta.sugestoes': 'O empieza por aquí',
  'pergunta.sugestao.perigoso': '¿Esto es peligroso?',
  'pergunta.sugestao.quebrar': '¿Qué se puede romper?',
  'pergunta.sugestao.fazer': '¿Tengo que hacer algo?',
  'pergunta.incompleta': 'La respuesta se interrumpió antes de terminar.',
  'pergunta.ressalva': 'Respuesta generada por IA a partir de este cambio. Puede equivocarse.',
  'pergunta.semChave': 'Falta configurar una clave para poder preguntar.',
  'pergunta.semChaveNota':
    'La respuesta viene de un modelo de IA, y necesita una clave tuya. Se guarda cifrada en tu computadora, fuera de la carpeta del proyecto.',
  'pergunta.soNoApp': 'Preguntar solo funciona en la aplicación.',

  'chaves.titulo': 'Clave para las explicaciones',
  'chaves.nota':
    'La clave se guarda cifrada en tu computadora, fuera de la carpeta del proyecto — nunca entra en tu repositorio.',
  'chaves.onde': 'Guardada en {caminho}',
  'chaves.campo': 'Clave de {provedor}',
  'chaves.placeholder': 'Pega la clave aquí',
  'chaves.salvar': 'Guardar',
  'chaves.salvando': 'Guardando…',
  'chaves.apagar': 'Borrar',
  'chaves.trocar': 'Cambiar la clave',
  'chaves.cancelar': 'Cancelar',
  'chaves.atual': 'Clave configurada: {mascara}',
  'chaves.soNestaSessao': 'Vale solo mientras WTF esté abierto — no se escribió en disco.',
  'chaves.semCofre':
    'Tu sistema no ofreció una bóveda para guardar la clave. Puedes usarla igual, indicándola en cada sesión — pero no se escribirá nada en disco.',
  'chaves.soNoApp': 'Configurar claves solo funciona en la aplicación.',

  'marca.mexendoDesde': 'La IA empezó este trabajo el {quando}',
}

const DICIONARIOS: Record<Idioma, Dic> = { 'pt-BR': pt, en, es }

export const IdiomaContext = createContext<Idioma>('pt-BR')

/**
 * `t('feed.pedemAtencao', { n: 3 })`.
 *
 * Chave sem tradução cai no português e devolve a chave crua em último caso —
 * aparecer "feed.xyz" na tela é feio, mas é honesto: mostra que falta traduzir,
 * em vez de fingir que está tudo certo.
 */
export function useT() {
  const idioma = useContext(IdiomaContext)
  return (chave: string, vars?: Record<string, string | number>) => {
    const texto = DICIONARIOS[idioma][chave] ?? DICIONARIOS['pt-BR'][chave] ?? chave
    if (!vars) return texto
    return texto.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
  }
}

export function useIdioma(): Idioma {
  return useContext(IdiomaContext)
}

/** Locale para datas e números. */
export const LOCALE: Record<Idioma, string> = {
  'pt-BR': 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
}
