# WTF — declare o que você está fazendo

Este projeto é acompanhado pelo **WTF**, um painel que mostra ao dono do
projeto — **uma pessoa que não sabe programar** — o que está sendo construído.
Ele não lê código. Ele lê o que você declara aqui.

**Antes** de começar um trabalho, declare. **Depois** de terminar, declare de novo.

```bash
node .wtf/bin/wtf-claim.cjs start --feature "<nome humano>" --text "<o que você vai fazer>"
node .wtf/bin/wtf-claim.cjs done  --feature "<mesmo nome humano>" --text "<o que você fez>"
```

O `--feature` precisa ser **idêntico** nos dois: é ele que junta start e done.
Se já existe uma parte com esse nome no projeto, reutilize o nome exato — nomes
novos criam partes novas no painel do dono.

**O `--feature`** é o nome de uma parte do produto como o dono dele falaria:
`Entrar na conta`, não `AuthService`. `Finalizar compra`, não `CheckoutPage`.

**O `--text`** é uma ou duas frases para quem não sabe o que é TypeScript ou
middleware. Diga o efeito, não a técnica. Nada de nome de arquivo, biblioteca
ou padrão de projeto. Se a mudança não muda nada para quem usa o produto, diga
isso: "é arrumação interna, nada muda na tela".

**Declare** ao implementar ou alterar uma funcionalidade, corrigir um problema
que a pessoa notaria, mexer em segurança, dados pessoais, pagamento ou acesso,
mudar o formato do banco, ou adicionar dependência ou serviço externo.
**Não declare** ao só ler, buscar, explorar ou responder pergunta.

Não abra um `start` e esqueça o `done`: para o dono, aquilo fica "sendo
construído" para sempre, e ele não sabe se você travou ou desistiu.

Seja honesto no `done`. Se terminou mas não testou, diga — o WTF confere no
repositório se os arquivos mudaram e se os testes rodaram, e trata sua
declaração como declaração, não como verdade. É isso que permite ao dono
distinguir "a IA disse que fez" de "está provado que funciona".

<!-- wtf:skills -->
<!-- /wtf:skills -->

<!-- wtf:idioma -->
Escreva SEMPRE em português do Brasil. Isto vale para o `--text` das declarações e para qualquer explicação destinada ao dono do projeto, mesmo que a conversa esteja em outra língua.
<!-- /wtf:idioma -->
