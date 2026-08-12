# MAPA.md — onde cada coisa mora

Este arquivo diz **para que serve cada pasta** do projeto. Antes de criar um
arquivo novo, leia aqui onde ele deve morar. Se criar uma pasta nova, atualize
este mapa na mesma tarefa.

```text
wtf/
│  ── O PAINEL (o que a pessoa vê) ──
├── src/                 a tela do WTF: tudo que aparece na janela do aplicativo
├── src/views/           as páginas inteiras do painel (início · linha do tempo · mapa · pastas · documentos · ajustes)
├── src/components/      pedaços reaproveitados das telas (busca · terminal · barra de cima · caixas de pergunta)
├── src/lib/             as regras por trás das telas (idiomas · resumos · organização dos assuntos)
├── src/types/           o combinado de como painel e bastidores conversam entre si
├── src/mock/            um exemplo de dados falsos, para ver a tela funcionando sem projeto real
│
│  ── OS BASTIDORES (o que roda escondido) ──
├── electron/            o motor do aplicativo: lê o projeto, o histórico, os riscos e entrega ao painel
├── bin/                 o comando `wtf` que se digita no terminal para abrir o painel na pasta atual
├── scripts/             comandos avulsos de manutenção, rodados à mão de vez em quando
│
│  ── AS INSTRUÇÕES PARA A IA ──
├── skill/               fonte de verdade das instruções que a IA recebe · cada subpasta é uma habilidade
├── skill/btw/           responder uma pergunta do dono sem parar o trabalho em andamento
├── skill/documentos/    organizar e mapear os documentos escritos do projeto
├── skill/guardrails/    descobrir e escrever as regras do que não se deve fazer no projeto
├── skill/mapear/        traduzir o projeto para linguagem humana e alimentar o painel
├── skill/pastas/        manter este MAPA.md em dia
├── skill/hooks/         o vigia que escuta a IA trabalhando e registra o que ela faz
├── skill/bin/           o programinha que a IA chama para declarar o que vai fazer
│
│  ── VERIFICAÇÃO ──
└── tests/               conferências automáticas de que os bastidores continuam funcionando
```

## Pastas que não entram aqui

`node_modules/`, `dist/`, `dist-electron/`, `release/` são geradas pela máquina
e podem ser apagadas a qualquer momento.

`.wtf/` e `.claude/skills/wtf*/` também são geradas: são as cópias instaladas
das habilidades que vivem em `skill/`. **Mexa sempre em `skill/`** — editar a
cópia instalada é trabalho perdido na próxima instalação.
