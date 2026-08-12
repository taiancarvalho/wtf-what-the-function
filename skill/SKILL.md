---
name: wtf
description: Use SEMPRE que for começar ou terminar um trabalho neste projeto — implementar uma funcionalidade, corrigir um problema, mudar uma tela, mexer em configuração. Declara ao WTF o que você vai fazer antes de fazer, e o que fez depois de terminar, para que a pessoa dona do projeto acompanhe sem precisar ler código.
---

# WTF — declare o que você está fazendo

Este projeto é acompanhado pelo **WTF**, um aplicativo que mostra para o dono do
projeto — **uma pessoa que não sabe programar** — o que está sendo construído.

Ele não lê código. Ele lê o que você declara aqui.

> **Só vale onde há `.wtf/`.** Se a pasta `.wtf/` não existir no projeto atual, o
> WTF não está habilitado aqui: não declare nada e não crie a pasta por conta
> própria. Quem habilita é o dono do projeto, pelo aplicativo.

## A regra

**Antes** de começar um trabalho, declare. **Depois** de terminar, declare de novo.

```bash
node .wtf/bin/wtf-claim.cjs start --feature "<nome humano>" --text "<o que você vai fazer>"
```

```bash
node .wtf/bin/wtf-claim.cjs done --feature "<mesmo nome humano>" --text "<o que você fez>"
```

O `--feature` precisa ser **idêntico** no `start` e no `done`. É ele que junta os dois.

## Como escolher o `--feature`

É o nome de uma parte do produto **como o dono dele falaria**. Não é o nome do
arquivo, nem da classe, nem da rota.

| Você mexeu em | `--feature` correto | Errado |
|---|---|---|
| `src/auth/login.ts`, `session.ts` | `Entrar na conta` | `AuthService` |
| `src/app/checkout/**` | `Finalizar compra` | `CheckoutPage` |
| `prisma/schema.prisma` | `Banco de dados` | `PrismaSchema` |
| `.github/workflows/ci.yml` | `Checagens automáticas` | `CI pipeline` |

Se já existe uma feature com esse nome no projeto, **reutilize o nome exato**.
Nomes novos criam partes novas no mapa do dono do projeto — e um mapa cheio de
duplicatas ("Login", "login", "Tela de login") é inútil para ele.

## Como escrever o `--text`

Escreva para alguém que **não sabe o que é TypeScript, JSON ou middleware**.

Bom:

> "Vou mudar onde o sistema guarda a identificação de quem está conectado, para
> reduzir a chance de alguém roubar o acesso de um cliente."

Ruim:

> "Migrar sessão de localStorage para cookie httpOnly com SameSite=Lax."

Regras práticas:

- Uma ou duas frases. Sem lista, sem markdown.
- Nada de nome de arquivo, biblioteca, linguagem ou padrão de projeto.
- Diga **o efeito**, não a técnica. "Fica mais seguro" vale mais que "usa JWT".
- Se a mudança não muda nada para quem usa o produto, **diga isso**:
  "É arrumação interna, nada muda na tela."

## Quando declarar

Declare para cada trabalho **que faça sentido para o dono do projeto**.

**Declare:**
- implementar ou alterar uma funcionalidade
- corrigir um problema que a pessoa notaria
- mexer em segurança, dados pessoais, pagamento ou acesso
- mudar o formato do banco de dados
- adicionar uma dependência ou serviço externo (principalmente se for pago)

**Não declare:**
- ler arquivos, buscar, explorar o projeto
- responder pergunta sem alterar nada
- corrigir um erro de digitação num comentário

Na dúvida: se o dono do projeto perguntaria *"quando isso mudou?"*, declare.

## Um trabalho longo, várias declarações

Se o trabalho for grande, quebre em partes que façam sentido para uma pessoa:

```bash
node .wtf/bin/wtf-claim.cjs start --feature "Finalizar compra" --text "Vou montar a tela de endereço."
# ... trabalho ...
node .wtf/bin/wtf-claim.cjs done  --feature "Finalizar compra" --text "A tela de endereço já está no ar."

node .wtf/bin/wtf-claim.cjs start --feature "Receber pagamento" --text "Vou ligar o pagamento por Pix."
```

Não abra um `start` e esqueça o `done`. Um trabalho declarado e nunca concluído
aparece para o dono como **"◐ Construindo"** para sempre, e ele fica sem saber
se você travou ou desistiu.

## Quando o painel apontar algo de segurança

O WTF varre o projeto procurando chave escrita no código e dado de pessoa no
que vai para o navegador. Ele acerta o formato e erra o contexto: um e-mail
institucional que a lei obriga a mostrar, um número sorteado que parece
telefone, um telefone de exemplo dentro de um campo — todos têm exatamente a
cara do que ele procura.

Quando pedirem que você confira, e você concluir que um item é alarme falso,
**registre**:

```bash
node .wtf/bin/wtf-claim.cjs falso-positivo \
  --arquivo src/pages/Contato.tsx --linha 18 \
  --motivo "É o e-mail institucional do encarregado de dados; a lei exige que ele apareça na tela."
```

Isso **não tira o aviso**. Ele aparece no painel com o seu motivo ao lado, e o
dono do projeto confirma com um clique. É de propósito: um agente que arquiva
sozinho o próprio alerta de segurança está corrigindo a própria prova.

Escreva o motivo para quem não programa, e **não registre nada de que você
tenha dúvida** — na dúvida, deixe o aviso de pé e diga o que não conseguiu
concluir. Um falso positivo que sobra custa um clique; um problema real
silenciado custa o projeto.

## O que o WTF faz com isso

O que você declara é tratado como **declaração, não como verdade**.

```
você declara  →  o WTF procura evidência  →  o estado muda
```

O WTF confere no repositório se os arquivos mudaram mesmo, se os testes rodaram,
se a build passou. Sua declaração sozinha nunca marca uma parte como "testada" —
ela só conta como um sinal fraco entre outros.

Isso não é desconfiança do seu trabalho. É o que permite que o dono do projeto
confie no painel: **ele precisa saber a diferença entre "a IA disse que fez" e
"está provado que funciona".**

Por isso, seja honesto no `done`. Se você terminou mas não testou, diga:

> "A tela está pronta, mas eu não consegui testar o pagamento de verdade."

Isso vale muito mais para ele do que um "concluído" limpo e falso.

## Idioma

<!-- wtf:idioma -->
Escreva SEMPRE em português do Brasil. Isto vale para o `--text` das declarações
e para qualquer explicação destinada ao dono do projeto, mesmo que a conversa
esteja em outra língua.
<!-- /wtf:idioma -->
