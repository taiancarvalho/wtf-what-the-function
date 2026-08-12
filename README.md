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
| ✓ | Testado | alguma verificação automática passou |
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
- **Mapa** — do que o software é feito, em blocos por área. Não é um grafo:
  grafo vira espaguete e é ilegível para quem o produto atende.
- **Pastas** — para que serve cada pasta do repositório, em árvore. Serve para
  a IA saber onde guardar cada coisa, e para você entender a organização.

### Perguntar sobre uma mudança

Cada mudança tem um código curto (`W34K`) e um botão de lâmpada: você pergunta
em linguagem natural e a resposta chega numa barra lateral, sem sair do painel.
A chave de acesso fica cifrada no cofre do sistema operacional, **nunca** dentro
da pasta do projeto — `.wtf/` vai para backup e aparece em compartilhamento de
tela. Sem cofre disponível, o app se recusa a gravar e mantém só em memória.

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

### Tradução

Sem chave de API. O WTF usa o agente que você já tem instalado, em modo
headless, e guarda tudo em cache — nada é traduzido duas vezes. Isso mantém o
app local, gratuito e sem servidor.

### O que a instalação coloca no seu projeto

```
.claude/skills/wtf/SKILL.md          o agente declara o que vai fazer
.claude/skills/wtf-mapear/SKILL.md   o agente mapeia projetos já em andamento
.claude/skills/wtf-pastas/SKILL.md   o agente descobre onde cada coisa mora
.claude/hooks/wtf-observer.cjs       registro determinístico do que foi tocado
.wtf/bin/wtf-claim.cjs               CLI que o agente chama para declarar
```

A skill depende do agente cooperar. O hook não — ele registra os arquivos
tocados mesmo quando o agente esquece de declarar.

## Instalar e abrir

```bash
git clone https://github.com/taiancarvalho/wtf-what-the-function.git
cd wtf-what-the-function
npm install
npm link          # opcional: cria o comando `wtf` no sistema
```

Depois, de dentro de qualquer projeto:

```bash
cd ~/Projetos/minha-loja
wtf               # abre o painel nesta pasta e devolve o terminal
```

Sem `npm link`, use `npm start` dentro da pasta do WTF, ou `wtf ~/caminho/do/projeto`.

Não há ícone no Dock nem instalador: o app roda pelo Node que você já tem, e o
ícone é o genérico do Electron. Isso só muda com um instalador assinado, que
custa uma conta paga de desenvolvedor — e a decisão foi não fazer por ora.

Para mexer no código do próprio WTF: `npm run dev` (recarrega ao salvar).

## Estado atual

Funciona de ponta a ponta contra repositórios reais. Ainda não existe:

- **Testes automatizados do próprio WTF** — a incoerência do projeto: um app
  que cobra prova não tem prova nenhuma de si mesmo. É o próximo da fila.
- **Knowledge Map** — o `MAPA.md` resolve "onde as coisas moram"; falta
  resolver "qual destes sete documentos é o atual"
- **Guard** — a camada de segurança/LGPD como recurso próprio (hoje o modelo
  sinaliza risco junto com a tradução, e funciona melhor que o previsto)
- **Notificações do sistema** — com o app fechado, você não sabe que algo pede
  decisão
- **Vários projetos ao mesmo tempo** — hoje é um por vez
- **Anthropic e OpenAI** — estruturados no código, só OpenRouter ligado
- **Instalador** — roda com `npm run dev`; não há `.dmg` ainda

## Stack

Electron · React 19 · TypeScript · Vite · Tailwind v4 · Fraunces + Instrument Sans

## Licença

[MIT](LICENSE) — use, copie, modifique e distribua à vontade, inclusive
comercialmente, mantendo o aviso de copyright.
