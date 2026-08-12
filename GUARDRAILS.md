# Guardrails — WTF

Regras específicas deste projeto. Se algo aqui conflitar com um pedido, pergunte
antes de fazer.

Este app existe para dar prova a quem não lê código. Por isso quase todo perigo
aqui é o mesmo: **dizer para a pessoa algo que não é verdade, ou mostrar a ela
algo que deveria ficar escondido.** As regras abaixo saem, na maioria, de erros
que já aconteceram.

## Dados sensíveis na tela

**Nunca** mostre o valor de um segredo ou de um dado pessoal por inteiro em
lugar nenhum da saída — nem no painel, nem no log, nem no que vai para a IA.
Por quê: o painel é fotografado, compartilhado e aparece em captura de tela.
Mostrar a chave inteira é o segundo vazamento (`1b04011`, `1912562`).
Como conferir: `npx vitest run tests/secrets.test.ts tests/exposed.test.ts` —
há asserções de que o valor completo não aparece em NENHUM campo.

**Nunca** inclua o valor achado na mensagem enviada para a IA, nem mascarado.
Por quê: o dado já está no arquivo e a IA vai abri-lo de qualquer jeito;
repeti-lo só o copia para mais lugares — fila do terminal, histórico da sessão,
captura de tela. Decisão registrada em `ba8d9ec`. A mensagem leva arquivo, linha
e rótulo, nunca o valor.

**Nunca** deixe um identificador técnico (`f1`, `f-1`, caminho de arquivo, saída
crua de comando) chegar ao usuário — muito menos numa notificação do sistema.
Por quê: já aconteceu duas vezes. A notificação lia `f.title` num tipo cujo campo
é `name` e saiu "f1 precisa da sua decisão", fora do app e sem contexto
(`41f5541`); e um `git log` cru apareceu em vermelho na barra lateral do app
feito para quem não sabe ler isso (`b58882d`). Quando não há nome humano,
prefira não falar a falar em código.

## O que o app promete

**Nunca** escreva no código do projeto observado. O WTF lê; quem executa é a IA,
a pedido da pessoa.
Por quê: decisão explícita do dono em `1b04011` — commitar enquanto o agente
trabalha guardaria arquivo pela metade, brigaria pelo índice do Git e
atrapalharia o plano de quem está construindo.

**Nunca** afirme que o projeto está seguro ou em conformidade com a LGPD.
Por quê: ninguém consegue afirmar isso olhando um repositório, e um "está tudo
certo" falso produz exatamente a confiança cega que este produto existe para
desfazer. A promessa de segurança foi REMOVIDA do README de propósito
(`1b04011`, seção "O que este produto NÃO promete").

**Nunca** deixe uma declaração da IA promover uma parte além do que a evidência
sustenta — declaração vai no máximo até "pronto", nunca até "testado", e nunca
rebaixa o que o Git provou.
Por quê: tela quebrada se vê; conta errada mente com confiança (`45f763a`).
Como conferir: `npx vitest run tests/map.test.ts tests/validated.test.ts`.

## Alarmes

**Nunca** aceite um falso positivo para ganhar cobertura na varredura.
Por quê: um alarme errado por dia ensina a pessoa a ignorar todos, e aí a lista
deixa de existir justamente quando importa. Por isso CPF e CNPJ validam dígito
verificador, cartão passa por Luhn, cartões de teste dos provedores são
ignorados, e `.env.example`/exemplos em markdown são calados (`1b04011`,
`1912562`).
Como conferir: os blocos "falso positivo é o inimigo" e "o que ele deve calar"
nos testes de `secrets` e `exposed`.

**Nunca** acrescente um evento novo às notificações do sistema sem perguntar se
ele merece interromper alguém.
Por quê: mesma lógica — notificação que aparece demais é desligada. A lista do
que notifica e do que NÃO notifica está fixada em `41f5541` e comentada no
módulo `electron/notify.js`.

## Arquivos e histórico

**Nunca** apague, mova ou junte um documento do projeto observado.
Por quê: documento apagado por engano é irrecuperável para quem não sabe usar
Git — e esse é exatamente o público (`49f3e68`). A skill de documentos é
proibida disso; a de guardrails também não corrige o que encontra.

**Nunca** aceite um caminho de arquivo vindo da interface para apagar algo. A
lista de apagáveis é fechada e mora no processo principal (`GERADOS`, em
`electron/gerados.js`); a interface manda uma chave.
Por quê: caminho vindo de fora é como se apaga o que não devia — nome de arquivo
do projeto ou travessia com `..` (`ba8d9ec`).
Como conferir: `npx vitest run tests/gerados.test.ts`, bloco "não apaga o que não
é dela".

**Nunca** ofereça `.wtf/events.jsonl` na lixeira de documentos gerados.
Por quê: o histórico do que a IA declarou é registro, não conteúdo. Apagá-lo é
outra decisão, com outro peso, e não vai escondida atrás de um ícone de lixeira
(`ba8d9ec`).

**Nunca** escreva nada no projeto sem que a pasta `.wtf/` exista. Ela É o
consentimento — sem ela, o hook sai em silêncio.
Por quê: regra de instalação em dois níveis fixada em `45f763a`.

**Nunca** toque no `settings.json` global do usuário além do estritamente
acordado.
Por quê: é arquivo dele, fora do projeto. Há 20 verificações provando que ele
sobrevive intacto, byte a byte (`45f763a`).
Como conferir: `npx vitest run tests/installer.test.ts`.

## Consumo pago

**Nunca** gaste crédito da pessoa sem ela ter dito sim, e nunca deixe um recurso
pago ligado por padrão.
Por quê: o painel traduzia sozinho ao abrir; passou a perguntar antes, com o
número na frente (`49f3e68`). Notificações e contador de consumo também nascem
desligados (`41f5541`).

## Duas cópias da mesma regra

**Nunca** mantenha duas implementações da mesma regra de negócio. A decisão de
estado é `estadoPorEvidencia`, exportada de `electron/translate.js`.
Por quê: "duas implementações da mesma regra já morderam este projeto duas vezes
hoje" (`cba5997`). Vale também para os três idiomas: `tests/i18n.test.ts` reprova
chave faltando e frase no idioma errado, defeito que já aconteceu (`ba8d9ec`).

## Precaução (sem erro registrado ainda)

**Sempre** trate `skill/` como a fonte de verdade das skills. As cópias em
`.claude/skills/` são geradas pelo instalador — editar a cópia é perder o
trabalho na próxima instalação (`b58882d`).

---

## Pontos que encontrei

Não alterei nada. A decisão é sua.

1. **Quatro cópias geradas estão versionadas.** O `.gitignore` ignora
   `.claude/skills/wtf/` e `.claude/skills/wtf-mapear/`, mas `btw`,
   `wtf-documentos`, `wtf-guardrails` e `wtf-pastas` estão no Git
   (`git ls-files .claude`). E as três últimas já divergem do original em
   `skill/` — parte da diferença é o bloco de idioma que o instalador reescreve,
   o que é esperado, mas é exatamente o cenário que o comentário do `.gitignore`
   diz querer evitar: "editar uma e esquecer a outra é questão de tempo".

2. **A seção "Estado atual" do README está desatualizada.** Ela lista como
   ausentes coisas que já existem: testes automatizados (367+), mapa de
   documentos, notificações do sistema e vários projetos ao mesmo tempo. Num app
   cuja tese é "não afirme o que não é verdade", o próprio README afirmando
   menos do que existe merece uma passada.

3. **Backups à mão soltos no repositório.** Há `*.wtf-backup-*` em `.wtf/` e em
   `.claude/hooks/`. Estão ignorados pelo Git, então não vazam — só ocupam
   espaço e confundem quem abrir a pasta.
