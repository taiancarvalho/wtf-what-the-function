# `.wtf/map.json` — o mapa do projeto

Arquivo produzido **uma vez** pelo onboarding (skill `wtf-mapear`) e atualizado
quando o projeto ganha partes novas.

## O que ele é, e o que ele NÃO é

Ele é o **vocabulário** do projeto: quais são as partes, como se chamam em
português, que arquivos e testes pertencem a cada uma, que story as descreve.

Ele **não** carrega estado. Nenhum campo diz "pronto", "testado" ou "funciona".

```
a IA escreve o mapa    →  quais partes existem e como se chamam
o WTF calcula o estado →  o que está provado sobre cada parte
```

Se o mapa pudesse dizer "pronto", o painel viraria a opinião da IA sobre o
próprio trabalho — que é exatamente o que este produto existe para evitar.

## Formato

```json
{
  "v": 1,
  "generatedAt": "2026-08-11T20:14:03-03:00",
  "by": "claude-code",
  "project": {
    "pitch": "Portal onde uma agência acompanha os resultados dos clientes dela."
  },
  "features": [
    {
      "id": "entrar-na-conta",
      "area": "Contas",
      "name": "Entrar na conta",
      "summary": "A pessoa entra no sistema por um link enviado no e-mail, sem senha.",
      "paths": ["src/lib/auth/**", "src/app/(auth)/**", "src/middleware.ts"],
      "tests": ["tests/lib/auth/**"],
      "planRef": "docs/planning/stories/1.3.autenticacao-magic-link.md",
      "planStatus": "done",
      "related": ["equipe-e-acessos", "separacao-entre-clientes"]
    }
  ]
}
```

### Campos

| Campo | Obrigatório | O que é |
|---|---|---|
| `id` | sim | slug estável, minúsculo, sem acento. Nunca muda depois de criado. |
| `area` | sim | agrupador humano: `Contas`, `Loja`, `Relatórios`, `Pagamentos`, `Bastidores`. |
| `name` | sim | nome da parte como o dono do projeto falaria. |
| `summary` | sim | uma frase explicando o que essa parte faz, sem jargão. |
| `paths` | sim | globs dos arquivos que compõem a parte. Podem se sobrepor entre features. |
| `tests` | **sim, se o projeto tiver testes** | globs dos testes que verificam esta parte. É o que permite o estado ✓ Testado. |
| `planRef` | não | caminho do documento que descreve esta parte (story, PRD, épico). |
| `planStatus` | não | o que **o documento** diz: `todo`, `doing`, `done`. É leitura do plano, não julgamento da IA. |
| `related` | não | ids de outras features ligadas a esta. |

### `tests` é o campo que faz o painel valer

Deixar `tests` vazio num projeto que TEM testes é o erro mais caro deste
formato. A distância entre **● Pronto** e **✓ Testado** é a razão de o WTF
existir: sem ela, o painel repete o que a IA disse em vez de provar.

O WTF tem uma rede de segurança — sem `tests`, ele tenta ligar teste e código
pela convenção de nomes (`tests/x.test.ts` ↔ `src/x.ts`). Mas ela só acerta o
óbvio. Um arquivo como `tests/fluxo-de-compra.test.ts`, que cobre carrinho,
frete e pagamento de uma vez, **só é encontrado se você o declarar** — e é
justamente o teste mais valioso do projeto.

Se o projeto realmente não tem teste nenhum, deixe vazio: aí o **● Pronto** é a
verdade, e é ela que o dono precisa ver.

### `planStatus` não é estado

`planStatus` é o que está **escrito no plano** — se a story diz `Status: Done`,
é `done`. Isso não significa que funciona; significa que alguém marcou como
feito num documento. O WTF usa esse campo apenas para saber **o que estava
previsto**, e é o que permite responder "o que ainda falta?".

Uma feature com `planStatus: "todo"` e nenhum arquivo em `paths` aparece como
**○ Planejado** — e é assim que o painel finalmente sabe mostrar o que falta,
em vez de só mostrar o que já existe.
