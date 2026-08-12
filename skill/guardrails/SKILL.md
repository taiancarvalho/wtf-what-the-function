---
name: wtf-guardrails
description: Use quando o usuário pedir para criar, revisar ou atualizar as regras de segurança do projeto, quando um risco novo for descoberto, ou ao começar a trabalhar num projeto que ainda não tem GUARDRAILS.md. Analisa o projeto e escreve as regras do que NÃO se deve fazer nele.
---

# GUARDRAILS.md — o que não se faz neste projeto

Um agente de IA sabe programar, mas não sabe **o que dói neste projeto
específico**. Ele não sabe que aqui os dados de um cliente nunca podem aparecer
para outro, que aquele endereço não pode ir para o navegador, que aquela tabela
não pode ser apagada.

Esse conhecimento existe — está espalhado em decisões antigas, em erros que já
aconteceram, em conversas que ninguém registrou. Sua tarefa é reuni-lo num só
lugar, em regras curtas e verificáveis, e escrever em `GUARDRAILS.md` na raiz.

> **Só vale onde há `.wtf/`.** Se a pasta `.wtf/` não existir no projeto atual, o
> WTF não está habilitado aqui: não escreva nada e não crie a pasta. Quem
> habilita é o dono do projeto, pelo aplicativo.

## O que este documento é

Uma lista de **proibições e obrigações**, escritas para serem obedecidas por
quem chegar depois — inclusive por você, na próxima sessão, sem memória nenhuma
desta.

Não é documentação de arquitetura. Não é boas práticas gerais de programação
("use nomes descritivos"). É **o que é perigoso NESTE projeto**.

## Como descobrir as regras

Olhe, nesta ordem, e cite a evidência de cada regra:

1. **O que já deu errado.** Procure no histórico por correções urgentes,
   reversões e mensagens com "fix", "corrige", "vazamento", "urgente". Erro que
   já aconteceu uma vez é a melhor fonte de regra que existe.
2. **O que o projeto protege.** Há separação entre clientes? Dados pessoais?
   Pagamento? Chaves de serviços externos? Cada resposta vira uma regra.
3. **As verificações automáticas que já existem.** Se o projeto tem testes que
   travam algo, aquilo é uma regra que alguém já achou importante — e agora
   ganha nome em português.
4. **As decisões registradas.** Documentos de decisão costumam dizer "não
   faremos X porque Y". Isso é guardrail pronto.
5. **O que o WTF já sabe.** Se houver `.wtf/map.json`, as partes marcadas como
   sensíveis apontam onde o cuidado é maior.

## O formato

Regras curtas, no imperativo, agrupadas. Cada uma com **por que existe** e,
quando houver, **como conferir**.

```markdown
# Guardrails — Portal da Agência

Regras específicas deste projeto. Se algo aqui conflitar com um pedido,
pergunte antes de fazer.

## Dados de cliente

**Nunca** consulte as tabelas de métricas sem filtrar por cliente.
Por quê: uma consulta sem filtro mostra os números de um cliente para outro.
Já aconteceu em março, numa listagem do painel.
Como conferir: `npm run test:invariants` reprova a consulta e diz o arquivo.

## Segredos

**Nunca** escreva chave de serviço, senha ou token dentro do código.
Por quê: tudo em `src/` chega ao navegador; qualquer pessoa lê no inspecionar.
Como conferir: o painel avisa antes de a chave entrar no histórico.

## Banco de dados

**Nunca** rode alteração de estrutura direto em produção.
Por quê: não há como desfazer sem perder dados.
```

Regras do texto:

- **Uma regra por parágrafo**, começando com **Nunca** ou **Sempre**. Regra que
  precisa de três frases para ser entendida não vai ser obedecida.
- **Sem jargão sempre que possível** — o dono do projeto também lê este arquivo.
- **Nada de regra genérica.** "Escreva código limpo" não é guardrail. Se a regra
  serve para qualquer projeto do mundo, ela não pertence aqui.
- **Cite a evidência.** "Já aconteceu em março" vale mais que "é boa prática".
  Sem evidência, diga que é precaução — e deixe claro que é.
- Entre **5 e 15 regras**. Menos que isso não cobre; mais que isso ninguém lê,
  e uma lista que ninguém lê é pior que lista nenhuma.

## O que você NÃO faz

**Não altere código para "corrigir" o que encontrar.** Você está escrevendo as
regras, não aplicando. Se descobrir uma violação enquanto lê, anote no fim do
documento, numa seção "Pontos que encontrei", e deixe a decisão para o dono.

**Não invente regra por precaução vaga.** Um guardrail falso gasta a atenção de
todo mundo e ensina a ignorar a lista.

## Ao terminar

Diga, em português simples: quantas regras escreveu, quais vieram de erro real
já ocorrido, quais são precaução, e o que você encontrou que talvez já esteja
sendo violado hoje. Esse último ponto é o mais valioso — e é decisão do dono do
projeto, nunca sua.

## Manter vivo

Releia este documento quando um risco novo aparecer, e ao terminar um trabalho
que mexeu em algo sensível. Regra que descreve um perigo que não existe mais
deve ser removida: lista desatualizada perde autoridade, e quando ela perde
autoridade as regras que ainda importam morrem junto.
