# WTF — What The Function

Entenda o que a IA está construindo no seu software, sem saber programar.

## O problema

A capacidade de produzir código cresceu absurdamente. A capacidade humana de
entender o código não cresceu.

Quem faz "vibe coding" aperta OK, OK, OK sem saber o que está sendo feito. Quem
programa não consegue ler tudo o que o agente escreveu. Nos dois casos, o
software cresce mais rápido do que o entendimento sobre ele.

O WTF é uma camada de observabilidade para software construído por IA. Ele não
mostra código: mostra **o que mudou, por que mudou, o que pode quebrar e o que
merece sua atenção** — em português, para uma pessoa que não sabe o que é
TypeScript.

## A regra que atravessa o produto

```
a IA declara  →  o WTF procura evidência  →  o estado muda
```

O agente **nunca** escreve o estado do projeto. Ele emite declarações; o WTF
guarda cada uma como evento imutável e só promove uma parte de estado quando
encontra evidência no repositório.

Por isso uma declaração de "terminei" vale como sinal fraco (confiança 0,3) e um
teste que passou vale como sinal forte (0,9). E por isso `claim.completed`
sozinho nunca marca nada como testado.

Sem essa separação, o painel viraria a opinião da IA sobre o próprio trabalho —
que é exatamente aquilo de que o dono do projeto precisa ser protegido.

## Os cinco estados

| | | |
|---|---|---|
| ○ | Planejado | está no plano, ninguém começou |
| ◐ | Construindo | a IA declarou que começou |
| ● | Pronto | o código existe. **Não quer dizer que funciona** |
| ✓ | Tem teste escrito | existe um teste para esta parte. **O WTF não o executou** |
| ✓✓ | Você aprovou | você abriu, olhou e disse que era isso |

A distância entre **Pronto** e **Você aprovou** é o produto.

## As telas

- **Início** — a fila de urgência: o que depende de você, o que pode ser
  perdido, o que mudou depois que você aprovou, o que está acontecendo agora.
  Bloco sem conteúdo some; quando não há nada pendente, ela diz isso.
- **Acontecendo** — o feed do seu software, em quatro níveis de profundidade:
  manchete → detalhes → técnico → código. O técnico está sempre um clique
  abaixo, nunca na superfície. Um aviso e suas respostas são **um assunto só**.
- **Progresso** — um quadro de cinco colunas, uma por estado. Ninguém arrasta
  card, e isso é a decisão: num quadro comum a posição é opinião de quem moveu
  e vira mentira quando alguém esquece. Aqui a coluna é derivada de evidência,
  e o card desliza sozinho quando o código prova que andou.
- **Histórico** — como o projeto chegou até aqui. As outras telas respondem
  sobre o agora; esta responde se ele está andando ou parado, em três leituras
  do mesmo fato: o gráfico, o ritmo e a régua de marcos em números.
- **Mapa** — do que o software é feito, em blocos por área. Não é um grafo:
  grafo vira espaguete e é ilegível para quem o produto atende.
- **Pastas** — para que serve cada pasta do repositório, em árvore. Serve para
  a IA saber onde guardar cada coisa, e para você entender a organização.
- **Documentos** — qual dos sete arquivos parecidos vale hoje sobre cada
  assunto. Em duas camadas separadas por posição: a leitura da IA, que é
  opinião e carrega a confiança estampada, ao lado dos fatos da varredura, que
  são verificáveis.
- **Segurança** — o que ficou exposto e as regras do que não se faz neste
  projeto. A varredura aparece mesmo quando não acha nada, porque "não apareceu
  aviso" e "ninguém procurou" não podem ser a mesma tela.
- **Configurações** — idioma, avisos do sistema, versão instalada e o que a
  instalação escreveu no projeto — com um botão para recusar cada habilidade
  opcional, na mesma linha em que você abre e lê o que ela manda a IA fazer.

### A escala visual

Uma base atravessa as nove telas: cinco tamanhos de letra e nada entre eles,
espaço entre grupos sempre maior que o espaço dentro deles, e **uma cor, um
significado** — carmim é atenção e nada mais, seleção é interação e nunca a cor
do estado. Cada tela é leitura à esquerda e um trilho de 400px à direita, com o
que se confere de relance separado do que se lê. A quebra é por `@container`,
não por viewport: a lateral pode estar fechada e o terminal docado, e quem
decide se cabem duas colunas é a largura que sobra ali.

### Perguntar sobre uma mudança

Cada mudança tem um código curto (`W34K`) e três saídas no próprio cartão:
pedir para resolver, pedir para explicar, pedir para conferir se funciona. Você
lê o texto que vai ser enviado antes de enviar, e ele vai para a IA aberta no
terminal do app.

**Não há chave de API para cadastrar.** Quem responde é a IA que você já tem
instalada. Isso é o produto inteiro sendo coerente: um painel que existe para
você não gastar às cegas não devia começar pedindo uma conta nova.

### A IA dentro do painel

O terminal fica no rodapé do app, com a IA rodando na pasta do projeto: você vê
o que ela está fazendo de um lado e o painel traduzindo do outro, sem trocar de
janela. Quem prefere a janela nativa do sistema tem o botão para isso.

Quando você manda um pedido, o WTF decide entre **colar** o texto na sessão
(quando foi ele quem pôs a IA ali e ela ainda está escutando) e **executar** a
IA com o pedido como argumento. Errar essa escolha teria consequência real: um
pedido colado num shell vazio vira comando executado no seu computador. Na
dúvida, ele executa — que é o lado seguro.

### Idiomas

Interface em português, inglês e espanhol. O idioma em que a **IA escreve** é
uma configuração separada e aceita qualquer língua — dá para ter o app em
inglês e as explicações em chinês. Trocar reescreve a instrução dentro da skill
instalada, então o agente obedece sem que ninguém peça.

## Como funciona por dentro

```
git log + git ls-files      →  o que existe e o que está provado
git status                  →  o que existe mas ainda não foi salvo
.wtf/map.json               →  o vocabulário (escrito pela IA no onboarding)
.wtf/events.jsonl           →  o que a IA declarou (skill + hook)
.wtf/translations.json      →  cache das traduções, por idioma
.wtf/validated.json         →  o que você aprovou, e com qual conteúdo
.wtf/resolved.json          →  os avisos que você encerrou
.wtf/config.json            →  idioma e preferências
MAPA.md                     →  para que serve cada pasta
```

O painel enxerga o **disco**, não só o histórico: quem faz vibe coding passa
horas sem salvar, e é justamente aí que abre o painel. Trabalho não salvo
aparece marcado como tal, porque pode ser perdido.

O WTF só **lê** o repositório observado. A única escrita é a instalação, feita
por clique explícito, com backup de tudo que já existia e desinstalação que
devolve o projeto ao estado anterior.

### Com quais IAs funciona

Quatro, e o WTF usa a primeira que encontrar instalada:

| | Claude Code | Codex | Gemini | opencode |
|---|---|---|---|---|
| Ler o projeto (estados, mapa, avisos, histórico) | ✅ | ✅ | ✅ | ✅ |
| Reconhecer quem escreveu cada mudança | ✅ | ✅ | ✅ | ✅ |
| Abrir a IA pelo painel | ✅ | ✅ | ✅ | ✅ |
| Escrever as explicações em português | ✅ | ✅ | ✅ | ✅ |
| Declarar o trabalho antes de fazer | ✅ | ✅ | ✅ | ✅ |
| Registro automático do que foi tocado | ✅ | — | — | — |

**A base não depende de IA nenhuma.** O WTF lê `git log`, `git ls-files` e
`git status`: estado das partes, o que mudou, o que não foi salvo, varredura de
segredos, mapa, pastas e documentos vêm do repositório. Um projeto tocado por
qualquer ferramenta aparece no painel.

O **registro automático** é o hook, e ele só existe no Claude Code por enquanto
— é o que anota os arquivos tocados mesmo quando a IA esquece de declarar. Com
as outras, o painel sabe o que foi declarado e o que virou commit.

### Tradução

Sem chave de API: o WTF chama em modo headless a IA que você já tem
(`claude -p`, `codex exec`, `gemini -p`, `opencode run`) e guarda tudo em cache
— nada é traduzido duas vezes. Isso mantém o app local, gratuito e sem servidor.

Traduzir consome a assinatura de quem tem plano limitado, então o padrão é
**perguntar antes**, com teto de 8 por rodada. Respondida, a pergunta não se
repete: quem disse "sempre" passa a ver só quantas faltam na fila.

### O que a instalação coloca no seu projeto

```
.claude/skills/wtf/SKILL.md             o agente declara o que vai fazer
.claude/skills/wtf-mapear/SKILL.md      o agente mapeia projetos já em andamento
.claude/skills/wtf-pastas/SKILL.md      o agente descobre onde cada coisa mora
.claude/skills/wtf-documentos/SKILL.md  o agente organiza os documentos escritos
.claude/skills/wtf-guardrails/SKILL.md  o agente escreve as regras do que não se faz
.claude/skills/btw/SKILL.md             você pergunta sem parar o trabalho em curso
.claude/hooks/wtf-observer.cjs          registro determinístico do que foi tocado
.wtf/bin/wtf-claim.cjs                  CLI que o agente chama para declarar

AGENTS.md   ·   GEMINI.md               a mesma regra, para quem não lê .claude/
```

`AGENTS.md` (Codex e opencode) e `GEMINI.md` recebem apenas um trecho entre
marcadores — o arquivo pode ser seu, cheio de instruções da casa, e o que já
estiver escrito nele fica intacto. Desinstalar leva embora exatamente esse
trecho, e o arquivo só é apagado se não sobrar mais nada dentro.

O trecho é curto de propósito: esses arquivos são lidos em **toda** sessão, e
copiar as 691 linhas das habilidades para dentro deles seria cobrar isso de
cada pergunta feita à IA. Vai a regra de declarar, mais um índice apontando
para as habilidades no disco, que a IA lê quando precisar.

**Cinco das seis habilidades são opcionais** e podem ser recusadas na tela de
Configurações — cada uma é contexto que a IA carrega. Fora da escolha fica o
essencial: declarar, o CLI que recebe a declaração, o hook e o formato do mapa.

A instalação tem dois níveis: as instruções podem ficar em `~/.claude` e valer
para todos os projetos, enquanto a pasta `.wtf/` é o que autoriza o WTF a
registrar algo **naquele** projeto. Sem ela, o hook global fica inerte.

A skill depende do agente cooperar. O hook não — ele registra os arquivos
tocados mesmo quando o agente esquece de declarar.

## Instalar

Precisa de **Node 20.19+** (ou 22.12+) e **Git**. Roda em macOS, Windows e Linux.

```bash
node --version   # confira antes: o build não roda em Node mais antigo
```

```bash
git clone https://github.com/taiancarvalho/wtf-what-the-function.git
cd wtf-what-the-function
npm install
npm link
```

O `npm link` é o que cria o comando `wtf` no seu sistema. Sem ele, tudo
funciona igual chamando `node bin/wtf.mjs` de dentro da pasta do WTF.

A primeira abertura compila a interface e leva alguns segundos. As seguintes
são imediatas.

## Usar

De dentro de qualquer projeto que use Git:

```bash
cd ~/Projetos/minha-loja
wtf
```

O painel abre e o terminal continua seu — dá para trabalhar com os dois lado a
lado, que é o uso para o qual ele foi feito.

| Comando | O que faz |
|---|---|
| `wtf` | abre o painel na pasta atual |
| `wtf ~/caminho/do/projeto` | abre na pasta indicada |
| `wtf minha-loja` | abre um projeto já conhecido, de qualquer lugar |
| `wtf --lista` | os projetos que o WTF conhece |
| `wtf --versao` | versão, commit e data do que está instalado |
| `wtf --atualizar` | traz a versão nova, instala e **recompila** |
| `wtf --del` | tira o WTF de todos os projetos onde ele está |
| `wtf --help` | a ajuda |

### Manter atualizado

```bash
wtf --atualizar
```

Ele faz `git pull --ff-only`, `npm install` e `npm run build` — este último é o
que costuma ser esquecido quando se atualiza na mão, e sem ele o código novo
fica no disco enquanto a tela continua a antiga.

Com trabalho não salvo na pasta do WTF, o comando **para e avisa**, em vez de
atualizar por cima. Se a história divergiu, ele também para: isso é caso para
uma pessoa olhar, não para um comando resolver sozinho.

O painel avisa sozinho, em Configurações, quando há versão nova — quem não abre
terminal também precisa saber.

### Sair de tudo

```bash
wtf --del
```

Quem instalou em oito projetos ao longo de meses não lembra quais são os oito.
O comando lista cada projeto e cada arquivo que vai remover, e só age depois de
você digitar `sim` — Enter não serve, porque Enter é o que se aperta sem ler.

O que ele **não** leva: o histórico de cada projeto (o que a IA declarou, as
traduções já pagas, o que você aprovou continuam em `.wtf/`), o que estiver
escrito no seu `AGENTS.md` fora dos marcadores do WTF, e a pasta do próprio
aplicativo — essa é você quem apaga.

### Sobre o ícone

Não há instalador nem ícone próprio: o app roda pelo Node que você já tem, e o
ícone é o genérico do Electron. Isso só muda com um instalador assinado, que
custa uma conta paga de desenvolvedor — e a decisão foi não fazer por ora.

### Mexer no código do próprio WTF

```bash
npm run dev
```

Recarrega ao salvar. `npm test` roda as conferências.

## O que este produto NÃO promete

**Não dizemos que seu software está seguro, nem que está em conformidade com a
LGPD.** Isso não é modéstia: é que ninguém consegue afirmar isso olhando um
repositório, e um "está tudo certo" falso é pior que silêncio — ele produz
exatamente a confiança cega que este produto existe para desfazer.

O que existe é específico e verificável: um aviso quando uma chave ou senha
está prestes a entrar no histórico do projeto. Ele evita um desastre concreto,
e não promete nenhum outro.

## Estado atual

Funciona de ponta a ponta contra repositórios reais, com **456 testes
automatizados** em 26 arquivos cobrindo os bastidores — a leitura do histórico,
a varredura de segredos, o instalador, o terminal embutido, as notificações e a
troca de projetos. Um app que cobra prova precisava ter prova de si mesmo.

As conferências rodam sozinhas no **Windows, no Linux e no macOS** a cada envio,
e o app é **aberto de verdade** nos três: se a janela não vier, se a tela não
carregar ou se ela chegar pequena demais para ser vista, o envio é reprovado.

Ainda não existe:

- **Registro automático fora do Claude Code** — o hook é a peça que anota o que
  a IA tocou sem depender de ela declarar, e por enquanto só existe ali. Codex,
  Gemini e opencode têm mecanismo equivalente; ainda não foi feito
- **Vários projetos ao mesmo tempo** — dá para trocar de projeto e o app lembra
  os que você já abriu, mas o acompanhado é um por vez
- **Instalador** — roda pelo comando `wtf`; não há `.dmg` assinado ainda
- **Testes da interface** — os 456 cobrem os bastidores. O CI prova que a janela
  abre nos três sistemas, não que ela está bonita: layout ainda é verificado a
  olho

## Stack

Electron · React 19 · TypeScript · Vite · Tailwind v4 · Fraunces + Instrument Sans

## Licença

[MIT](LICENSE) — use, copie, modifique e distribua à vontade, inclusive
comercialmente, mantendo o aviso de copyright.
