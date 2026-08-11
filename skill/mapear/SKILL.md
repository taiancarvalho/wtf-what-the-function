---
name: wtf-mapear
description: Use quando o WTF for ligado a um projeto que já está em andamento, quando o painel estiver com nomes técnicos ou partes faltando, ou quando o usuário pedir para mapear, remapear ou sincronizar o projeto com o WTF. Lê o plano e o código e escreve o mapa do projeto em linguagem humana.
---

# Mapear este projeto para o WTF

O WTF acabou de ser ligado a um projeto **que já estava em andamento**. Ele não
acompanhou a construção, então não sabe do que o projeto é feito — só enxerga
arquivos e commits.

Sua tarefa: escrever `.wtf/map.json`, o vocabulário do projeto.

O formato completo está em `.wtf/MAP-FORMAT.md`. **Leia esse arquivo antes de
começar.**

## A regra que não pode ser quebrada

Você descreve **o que existe e o que estava previsto**.
Você **não** decide o que está pronto, testado ou funcionando.

O WTF calcula isso sozinho, procurando evidência. Se você pudesse declarar
"pronto", o painel viraria a sua opinião sobre o seu próprio trabalho — e o
dono do projeto ficaria sem nenhuma verificação independente. É justamente
disso que ele precisa ser protegido.

Nenhum campo do `map.json` diz se algo funciona. Se você sentir vontade de
acrescentar um, não acrescente.

## Como fazer

### 1. Encontre o plano

Procure, nesta ordem, o que descreve o que o projeto **deveria** ser:

```
docs/planning/stories/    docs/product/    docs/prd*    PRD.md
docs/epics/               .aiox/           specs/       README.md
```

Se houver stories numeradas, elas são a melhor fonte: costumam trazer título,
`Status` e critérios de aceite. Leia o **título e o status** de cada uma. Não
precisa ler o corpo inteiro de todas.

Se não houver plano nenhum, tudo bem — trabalhe só com o código, e deixe
`planRef` e `planStatus` de fora.

### 2. Encontre as partes de verdade

Percorra o projeto e agrupe os arquivos por **função no produto**, não por
pasta. Um bom teste: se o dono do projeto perguntaria *"como está o X?"*, então
X é uma feature.

- `src/lib/auth/`, `src/app/(auth)/`, `middleware.ts` → **Entrar na conta**
- `src/lib/meta/`, `src/app/**/integracoes/` → **Conexão com a Meta**
- `prisma/` → **Banco de dados**

**Não crie features que são só categorias de arquivo.** "Motor interno",
"Peças da interface", "Configuração do projeto" e "Outros arquivos" não são
partes de um produto — são pastas com nome bonito. Se você não consegue
explicar para que serve numa frase sem jargão, provavelmente não é uma feature:
junte com outra ou deixe de fora.

Prefira **10 a 25 features**. Menos que isso esconde coisa; mais que isso vira
uma lista que ninguém lê.

### 3. Inclua o que ainda não existe

Esta é a parte que o WTF **não consegue fazer sozinho**, e é o principal motivo
desta skill existir.

Se o plano prevê algo que ainda não tem código — uma tela, um pagamento, um
relatório — **crie a feature mesmo assim**, com `paths` vazio ou quase vazio e
`planStatus: "todo"`.

Sem isso, o painel só sabe mostrar o que já existe, e a barra de progresso fica
sempre perto de 100% — mentindo para o dono do projeto.

### 4. Ligue os testes

Para cada feature, procure os testes que a verificam e liste em `tests`.

```
src/lib/meta/**   →   tests/lib/meta/**
```

Isso importa mais do que parece: é o único jeito de uma parte chegar ao estado
**✓ Testado**. Feature sem `tests` preenchido nunca passa de **● Pronto**, por
mais bem feita que esteja.

### 5. Escreva os nomes e resumos em português de gente

O leitor não sabe o que é TypeScript, middleware, ORM ou JWT.

| Bom | Ruim |
|---|---|
| Entrar na conta | AuthService |
| Separação entre clientes | Tenant isolation |
| Puxar dados do Facebook | Meta API sync |
| Cálculo dos números do relatório | Metrics registry |

O `summary` é uma frase, sem lista e sem markdown, explicando **o que aquilo
faz para quem usa o produto**:

> "A pessoa entra no sistema por um link enviado no e-mail, sem precisar de senha."

### 6. Grave e confira

Escreva `.wtf/map.json` seguindo o formato. Depois:

- todo `id` é único, minúsculo, sem acento e sem espaço?
- todo `related` aponta para um `id` que existe?
- todo `name` é entendível por alguém que nunca programou?
- as features previstas mas ainda não construídas estão lá?
- nenhum campo declara que algo funciona?

Ao terminar, diga ao usuário, em português simples, quantas partes você
encontrou, quantas ainda não têm código, e quais você teve dificuldade de
nomear — essas são as que ele vai querer corrigir.

## Remapear

Rodar de novo é seguro. Preserve os `id` que já existem — eles são a memória do
painel. Renomear um `id` faz o WTF achar que a parte antiga sumiu e uma nova
apareceu, e o dono do projeto perde o histórico daquela parte.
