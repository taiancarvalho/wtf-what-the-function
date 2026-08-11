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

## As três telas

- **Acontecendo** — o feed do seu software, em quatro níveis de profundidade:
  manchete → detalhes → técnico → código. O técnico está sempre um clique
  abaixo, nunca na superfície.
- **Progresso** — onde estamos na construção, por área, com filtros.
- **Mapa** — do que o software é feito, em blocos por área. Não é um grafo:
  grafo vira espaguete e é ilegível para quem o produto atende.

## Como funciona por dentro

```
git log + git ls-files      →  o que existe e o que está provado
.wtf/map.json               →  o vocabulário (escrito pela IA no onboarding)
.wtf/events.jsonl           →  o que a IA declarou (skill + hook)
.wtf/translations.json      →  cache das traduções
```

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
.claude/hooks/wtf-observer.cjs       registro determinístico do que foi tocado
.wtf/bin/wtf-claim.cjs               CLI que o agente chama para declarar
```

A skill depende do agente cooperar. O hook não — ele registra os arquivos
tocados mesmo quando o agente esquece de declarar.

## Rodar

```bash
npm install
npm run dev                                   # projeto de exemplo
WTF_PROJECT=~/caminho/do/projeto npm run dev  # projeto real
```

Ou abra o app e use "Abrir um projeto de verdade".

## Estado atual

Funciona de ponta a ponta contra repositórios reais. Ainda não existe:

- **Guard** — a camada de segurança/LGPD como recurso próprio (hoje o modelo
  sinaliza risco junto com a tradução)
- **Knowledge Map** — organização da bagunça documental dos agentes
- **Validação persistente** — o botão "Conferir e aprovar" ainda não grava, então
  o estado ✓✓ não é alcançável na prática

## Stack

Electron · React 19 · TypeScript · Vite · Tailwind v4 · Fraunces + Instrument Sans
