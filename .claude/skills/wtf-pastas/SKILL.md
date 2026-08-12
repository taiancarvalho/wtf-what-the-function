---
name: wtf-pastas
description: Use ANTES de criar qualquer arquivo ou pasta neste projeto, para descobrir onde a coisa deve morar. Use também quando o usuário pedir para mapear, organizar ou documentar a estrutura de pastas, ou quando a organização tiver mudado. Lê e mantém o MAPA.md — a árvore de pastas com o propósito de cada uma.
---

# MAPA.md — onde cada coisa mora

Todo projeto acumula pastas cujo propósito só existe na cabeça de quem criou.
Quando um agente de IA entra e não sabe onde as coisas moram, ele inventa:
cria `docs/planning-v2/` ao lado de `docs/plano/`, salva uma decisão em três
lugares, e ninguém mais acha nada.

> **Só vale onde há `.wtf/`.** Se a pasta `.wtf/` não existir no projeto atual, o
> WTF não está habilitado aqui: não declare nada e não crie a pasta por conta
> própria. Quem habilita é o dono do projeto, pelo aplicativo.

O `MAPA.md` na raiz do projeto responde, em uma tela, **para que serve cada
pasta**. Ele existe para duas leituras:

- **você**, agente, antes de criar um arquivo: onde isso deve ir?
- **o dono do projeto**, que não programa: bater o olho e entender a
  organização do próprio software.

## Antes de criar qualquer arquivo

Leia o `MAPA.md` e obedeça. Se o que você vai criar se encaixa numa pasta que
já existe, use essa pasta — mesmo que você preferisse outra estrutura.

Se **não** se encaixa em nenhuma, pare e pense duas vezes. Criar pasta nova é a
decisão mais cara de organização que existe: ela vai atrair arquivos para
sempre. Quando for mesmo necessária, crie e **atualize o MAPA.md na mesma
tarefa**. Um mapa desatualizado é pior que mapa nenhum: as pessoas confiam nele.

## O formato

Árvore em bloco de código, com uma linha por pasta e o propósito à direita.
Separadores de seção agrupam as pastas por assunto quando o projeto for grande.

```text
meu-projeto/
│  ── PRODUTO ──
├── src/            o software em si · detalhe em src/MAPA.md
├── public/         imagens e arquivos que o navegador baixa direto
│
│  ── CONHECIMENTO ──
├── docs/           tudo que é escrito: plano, decisões, pesquisas
├── docs/decisoes/  por que cada escolha foi feita, uma por arquivo
│
│  ── BASTIDORES ──
├── tests/          verificações automáticas do que existe em src/
└── scripts/        comandos avulsos de manutenção
```

Regras do texto:

- **O propósito é uma frase curta, sem jargão.** Quem lê pode não saber o que é
  build, bundler ou pipeline. "arquivos que o navegador baixa direto" vale mais
  que "assets estáticos".
- **Diga para que serve, não o que é.** Ruim: "configuração do Vite". Bom:
  "ajustes de como o projeto é montado — mexer aqui é raro".
- Entre parênteses, quando ajudar, liste o que costuma morar ali:
  `(visão · oferta · métricas)`.
- Quando uma pasta for grande demais para uma linha, ela ganha o próprio
  `MAPA.md` e a linha aponta: `· detalhe em sistema/MAPA.md`.
- **Não liste tudo.** Pasta que não guarda decisão nenhuma (`node_modules`,
  `dist`, `.git`, caches) fica de fora. O mapa tem que caber numa tela; se
  passar de ~25 linhas, agrupe ou use mapas próprios por pasta.

## Como montar da primeira vez

1. Percorra o projeto ignorando o que é gerado (`node_modules`, `dist`,
   `build`, `.next`, `coverage`, `.git`, e o que estiver no `.gitignore`).
2. Para cada pasta que sobrou, abra dois ou três arquivos e descubra **o que
   aquilo faz pelo produto** — não o que a tecnologia dela é.
3. Agrupe em seções quando houver mais de ~8 pastas. Use nomes de seção que
   uma pessoa entenda: PRODUTO, CONHECIMENTO, BASTIDORES, NEGÓCIO.
4. Escreva o `MAPA.md` na raiz.
5. Diga ao usuário quais pastas você não conseguiu explicar — essas são
   exatamente as que ele vai querer renomear ou apagar.

## Quando atualizar

- criou pasta nova → atualize na mesma tarefa;
- percebeu que uma pasta virou outra coisa → corrija a frase;
- o usuário pediu para reorganizar → refaça e explique o que mudou.

Rodar de novo é seguro. **Preserve as frases que já estão escritas** quando a
pasta não mudou de propósito: elas podem ter sido escritas ou corrigidas pelo
dono do projeto, e a opinião dele sobre o próprio projeto vale mais que a sua.

## O que este mapa não é

Não é lista de arquivos, não é documentação de código, e não descreve
funcionalidade — para isso existe o `.wtf/map.json`, que é outra coisa: lá
ficam as **partes do produto** (Entrar na conta, Receber pagamento), aqui ficam
as **pastas do repositório**. Não misture os dois.

## Idioma

<!-- wtf:idioma -->
Escreva SEMPRE em português do Brasil. Isto vale para o `MAPA.md` inteiro — nomes de seção e o propósito de cada pasta — e para qualquer explicação destinada ao dono do projeto, mesmo que a conversa esteja em outra língua. Os nomes das pastas em si ficam como estão no disco.
<!-- /wtf:idioma -->
