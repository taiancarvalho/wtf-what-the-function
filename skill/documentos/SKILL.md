---
name: wtf-documentos
description: Use quando o usuário pedir para organizar, mapear ou fazer uma faxina nos documentos do projeto, quando não souber qual documento é o atual entre vários parecidos, ou antes de escrever um documento novo — para descobrir se já existe um que deveria ser atualizado. Produz o mapa dos documentos em .wtf/docs.json.
---

# O mapa dos documentos

Agentes de IA escrevem muito. A cada conversa nasce um `plano.md`, depois um
`plano-v2.md`, depois um `plano-final.md` — e um `plano-final-real.md`. Meses
depois ninguém sabe qual vale, e a pessoa que não programa tem menos chance
ainda de descobrir.

Num projeto real medido durante o desenvolvimento do WTF havia **635 documentos**,
com 26 arquivos chamados `README`, 14 `CLAUDE.md` e 13 `AGENTS.md`. O problema
ali não era duplicata: era não saber por onde começar.

Sua tarefa é responder três perguntas, e escrevê-las em `.wtf/docs.json`:

1. **Quais documentos importam** para o dono do projeto?
2. **Qual é o vigente** quando existem vários sobre o mesmo assunto?
3. **O que parece abandonado** e pode ser arquivado?

> **Só vale onde há `.wtf/`.** Se a pasta `.wtf/` não existir no projeto atual, o
> WTF não está habilitado aqui: não escreva nada e não crie a pasta. Quem
> habilita é o dono do projeto, pelo aplicativo.

## O que você NÃO faz

**Você não apaga, não move e não junta arquivo nenhum.** Você lê, classifica e
escreve o mapa. Consolidar é decisão do dono do projeto, e só acontece se ele
pedir — aí sim você mexe, uma coisa de cada vez, dizendo antes o que vai fazer.

Um documento apagado por engano é irrecuperável para quem não sabe usar Git. É
o tipo de estrago que destrói a confiança no produto inteiro.

## Onde olhar, e onde não olhar

Comece pela raiz e por `docs/`. **Ignore** o que não é do dono do projeto:

```
node_modules/  dist/  build/  .next/  coverage/  vendor/
.git/  qualquer pasta de framework ou ferramenta instalada
```

Se uma pasta guarda material de uma ferramenta que foi instalada (padrões,
templates, skills de terceiros), ela não é conhecimento do projeto — é
dependência. Trate como tal e diga isso no mapa, em vez de listar centenas de
arquivos que ninguém escreveu ali dentro.

Se o total de documentos passar de ~60, **não leia todos**. Leia os da raiz e de
`docs/`, e para o resto use o nome, o caminho e a data. Diga no fim quantos você
não abriu — número honesto vale mais que cobertura fingida.

## Como decidir qual é o vigente

Use evidência, nesta ordem:

1. **Referência**: um documento citado por outros (ou pelo README) está vivo.
   Um que ninguém cita é candidato a órfão.
2. **Data**: o mais recentemente alterado costuma ser o atual — mas não sempre:
   um documento estável pode ser o vigente e não ser tocado há meses.
3. **Conteúdo**: se um diz "substitui o anterior" ou "descontinuado", acabou a
   dúvida.
4. **Nome**: `-v2`, `-final`, `-old`, `-backup` são pistas fortes, e mentirosas
   com frequência. `plano-final.md` de janeiro perde para `plano.md` de ontem.

Quando a evidência for fraca, diga que está incerto. **Nunca chute com cara de
certeza**: o dono vai apagar um arquivo confiando em você.

## O formato — `.wtf/docs.json`

```json
{
  "v": 1,
  "geradoEm": "2026-08-12T14:02:11-03:00",
  "totalEncontrados": 635,
  "totalLidos": 48,
  "ignorados": [
    { "pasta": ".aiox-core/", "motivo": "material de uma ferramenta instalada, não escrito neste projeto", "arquivos": 512 }
  ],
  "assuntos": [
    {
      "assunto": "Plano do produto",
      "resumo": "o que vai ser construído e em que ordem",
      "vigente": "docs/planning/PLANEJAMENTO.md",
      "confianca": "alta",
      "porque": "é o único citado pelo README e foi atualizado esta semana",
      "outros": [
        { "caminho": "docs/plano-v2.md", "situacao": "provavelmente antigo", "porque": "nada aponta para ele desde março" }
      ]
    }
  ],
  "orfaos": [
    { "caminho": "docs/ideias-soltas.md", "porque": "nenhum outro documento o cita" }
  ]
}
```

Campos obrigatórios: `v`, `geradoEm`, `totalEncontrados`, `totalLidos`,
`assuntos`. `confianca` é `alta`, `media` ou `baixa`.

## Como escrever os textos

`assunto`, `resumo` e `porque` são lidos por quem **não programa**.

| Bom | Ruim |
|---|---|
| Plano do produto | PRD e épicos |
| Regras de segurança | Security guidelines |
| Decisões registradas | ADRs |
| nada aponta para ele desde março | orphaned since March |

O `porque` é o mais importante de todos: é ele que permite ao dono discordar de
você. "É o mais recente" é fraco; "é o único citado pelo README e foi atualizado
esta semana" é verificável.

## Ao terminar

Diga, em português simples: quantos documentos existem, quantos você leu,
quantos ignorou e por quê, quais assuntos têm mais de um candidato, e onde você
ficou em dúvida. As dúvidas são o mais útil — são exatamente onde o dono do
projeto sabe algo que você não tem como saber.
