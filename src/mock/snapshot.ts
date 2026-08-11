import type {
  Evidence,
  Feature,
  ProjectSnapshot,
  WtfEvent,
} from '@/types/protocol'

/**
 * Dados falsos — mas no formato REAL do protocolo.
 * Quando o Evidence Engine existir, esta função vira uma chamada de IPC e
 * nenhum componente muda.
 */

const ev = (
  id: string,
  kind: Evidence['kind'],
  confidence: number,
  detail: string,
  at: string,
): Evidence => ({ id, kind, confidence, detail, at })

const features: Feature[] = [
  {
    id: 'f-login',
    area: 'Contas',
    name: 'Entrar na conta',
    state: 'tested',
    origin: 'planned',
    summary: 'A pessoa entra com e-mail e senha e continua conectada.',
    relatedIds: ['f-cadastro', 'f-senha', 'f-perfil'],
    files: ['src/auth/login.ts', 'src/auth/session.ts', 'middleware.ts'],
    lastTouchedAt: '2026-08-11T16:21:00-03:00',
    attention: 'none',
  },
  {
    id: 'f-cadastro',
    area: 'Contas',
    name: 'Criar conta',
    state: 'validated',
    origin: 'planned',
    summary: 'Alguém novo cria uma conta informando nome, e-mail e senha.',
    relatedIds: ['f-login'],
    files: ['src/auth/signup.ts'],
    lastTouchedAt: '2026-08-09T11:02:00-03:00',
  },
  {
    id: 'f-senha',
    area: 'Contas',
    name: 'Recuperar senha',
    state: 'implemented',
    origin: 'planned',
    summary: 'Quem esqueceu a senha recebe um link por e-mail para criar outra.',
    relatedIds: ['f-login', 'f-emails'],
    files: ['src/auth/reset.ts', 'src/email/templates/reset.tsx'],
    lastTouchedAt: '2026-08-11T14:47:00-03:00',
    attention: 'warning',
  },
  {
    id: 'f-perfil',
    area: 'Contas',
    name: 'Meus dados',
    state: 'planned',
    origin: 'planned',
    summary: 'A pessoa vê e altera os próprios dados.',
    relatedIds: ['f-login'],
    files: [],
    lastTouchedAt: '2026-08-04T09:00:00-03:00',
  },
  {
    id: 'f-produtos',
    area: 'Loja',
    name: 'Página do produto',
    state: 'validated',
    origin: 'planned',
    summary: 'Mostra foto, preço e descrição de um café.',
    relatedIds: ['f-categorias', 'f-carrinho'],
    files: ['src/app/produto/[slug]/page.tsx'],
    lastTouchedAt: '2026-08-10T18:30:00-03:00',
  },
  {
    id: 'f-categorias',
    area: 'Loja',
    name: 'Categoria de produtos',
    state: 'building',
    origin: 'planned',
    summary: 'Lista os cafés agrupados por tipo: coado, espresso, descafeinado.',
    relatedIds: ['f-produtos', 'f-busca'],
    files: ['src/app/categoria/[slug]/page.tsx', 'src/components/GradeProdutos.tsx'],
    lastTouchedAt: '2026-08-11T16:44:00-03:00',
  },
  {
    id: 'f-busca',
    area: 'Loja',
    name: 'Busca',
    state: 'planned',
    origin: 'planned',
    summary: 'Encontrar um café digitando o nome.',
    relatedIds: ['f-categorias'],
    files: [],
    lastTouchedAt: '2026-08-04T09:00:00-03:00',
  },
  {
    id: 'f-carrinho',
    area: 'Carrinho',
    name: 'Carrinho de compras',
    state: 'implemented',
    origin: 'planned',
    summary: 'Guarda o que a pessoa escolheu antes de pagar.',
    relatedIds: ['f-produtos', 'f-checkout'],
    files: ['src/store/carrinho.ts', 'src/components/Carrinho.tsx'],
    lastTouchedAt: '2026-08-11T15:04:00-03:00',
  },
  {
    id: 'f-checkout',
    area: 'Pagamentos',
    name: 'Finalizar compra',
    state: 'planned',
    origin: 'planned',
    summary: 'Endereço, frete e pagamento.',
    relatedIds: ['f-carrinho', 'f-pagamento'],
    files: [],
    lastTouchedAt: '2026-08-04T09:00:00-03:00',
  },
  {
    id: 'f-pagamento',
    area: 'Pagamentos',
    name: 'Receber pagamento',
    state: 'planned',
    origin: 'planned',
    summary: 'Cobrança por cartão e Pix.',
    relatedIds: ['f-checkout'],
    files: [],
    lastTouchedAt: '2026-08-04T09:00:00-03:00',
  },
  {
    id: 'f-emails',
    area: 'Comunicação',
    name: 'E-mails automáticos',
    state: 'implemented',
    origin: 'discovered',
    summary: 'Mensagens que o sistema envia sozinho, como confirmação de pedido.',
    relatedIds: ['f-senha'],
    files: ['src/email/enviar.ts'],
    lastTouchedAt: '2026-08-11T14:47:00-03:00',
  },
  {
    id: 'f-admin',
    area: 'Bastidores',
    name: 'Painel do dono',
    state: 'implemented',
    origin: 'discovered',
    summary: 'Área para você cadastrar produtos e ver pedidos.',
    relatedIds: [],
    files: ['src/app/admin/page.tsx'],
    lastTouchedAt: '2026-08-08T21:12:00-03:00',
  },
]

const events: WtfEvent[] = [
  {
    id: 'e-011',
    at: '2026-08-11T16:44:00-03:00',
    type: 'work.started',
    source: 'agent',
    agent: 'claude-code',
    featureId: 'f-categorias',
    claim:
      'Vou implementar a página de categoria de produtos, com grade responsiva e filtro por tipo de torra.',
    human: {
      headline: 'Começou a montar a página que lista os cafés por categoria.',
      what:
        'A IA avisou que vai criar a tela onde os cafés aparecem agrupados por tipo — coado, espresso, descafeinado.',
      why: 'Está no seu plano: sem essa tela, a pessoa só chega no produto pela busca.',
      impact: 'Nada que já funciona deve ser afetado. É uma tela nova.',
      affects: ['Página do produto', 'Menu principal'],
      needsYourAttention: false,
    },
    evidence: [
      ev('ev-1', 'agent_claim', 0.3, 'Declaração do Claude Code via skill do WTF.', '2026-08-11T16:44:00-03:00'),
      ev('ev-2', 'file_created', 0.6, 'src/app/categoria/[slug]/page.tsx foi criado.', '2026-08-11T16:45:10-03:00'),
    ],
  },
  {
    id: 'e-010',
    at: '2026-08-11T16:21:00-03:00',
    type: 'work.completed',
    source: 'agent',
    agent: 'claude-code',
    featureId: 'f-login',
    claim:
      'Migrei a sessão de localStorage para cookies httpOnly com SameSite=Lax e rotação de refresh token.',
    human: {
      headline: 'O login passou a guardar sua identificação de forma mais protegida.',
      what:
        'Antes, parte das informações de quem está conectado ficava guardada dentro do navegador, onde outros programas da própria página conseguiriam ler. Agora essas informações ficam num lugar que só o servidor acessa.',
      why:
        'Reduz o risco de alguém roubar o acesso de um cliente através de um script malicioso na página.',
      impact:
        'Melhoria de segurança. Quem já estava conectado vai precisar entrar de novo uma única vez.',
      affects: ['Entrar na conta', 'Sair', 'Continuar conectado', 'Criar conta'],
      needsYourAttention: true,
      attentionReason:
        'Seus clientes atuais serão desconectados uma vez. Vale avisar antes de publicar.',
    },
    technical: {
      filesChanged: 5,
      insertions: 184,
      deletions: 97,
      files: [
        'src/auth/login.ts',
        'src/auth/session.ts',
        'middleware.ts',
        'package.json',
        '.env.example',
      ],
      dependenciesAdded: ['jose@5.9.6'],
      dependenciesRemoved: [],
      patch: `--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -12,9 +12,14 @@
-  const token = localStorage.getItem('session_token')
-  if (!token) return null
-  return JSON.parse(atob(token.split('.')[1]))
+  const jar = await cookies()
+  const token = jar.get('__Host-session')?.value
+  if (!token) return null
+  const { payload } = await jwtVerify(token, secret, {
+    algorithms: ['HS256'],
+  })
+  return payload
@@ -31,6 +36,9 @@
-  localStorage.setItem('session_token', token)
+  jar.set('__Host-session', token, {
+    httpOnly: true,
+    secure: true,
+    sameSite: 'lax',
+    path: '/',
+  })`,
    },
    evidence: [
      ev('ev-3', 'agent_claim', 0.3, 'Declaração do Claude Code via skill do WTF.', '2026-08-11T16:21:00-03:00'),
      ev('ev-4', 'file_modified', 0.6, '5 arquivos alterados, +184 −97.', '2026-08-11T16:21:30-03:00'),
      ev('ev-5', 'dependency_added', 0.5, 'Dependência jose@5.9.6 adicionada.', '2026-08-11T16:21:31-03:00'),
      ev('ev-6', 'test_passed', 0.9, '14 de 14 testes de autenticação passaram.', '2026-08-11T16:23:02-03:00'),
      ev('ev-7', 'build_passed', 0.8, 'Build de produção concluído sem erros.', '2026-08-11T16:24:41-03:00'),
    ],
  },
  {
    id: 'e-009',
    at: '2026-08-11T15:04:00-03:00',
    type: 'work.completed',
    source: 'agent',
    agent: 'claude-code',
    featureId: 'f-carrinho',
    claim: 'Adicionei controle de quantidade no carrinho com persistência em localStorage.',
    human: {
      headline: 'Agora dá para mudar a quantidade de cada café dentro do carrinho.',
      what:
        'Foram adicionados os botões de mais e menos, e o carrinho continua salvo se a pessoa fechar o site e voltar depois.',
      why: 'Estava no seu plano como parte do carrinho.',
      impact: 'O carrinho fica salvo no navegador da pessoa, não no seu servidor.',
      affects: ['Carrinho de compras', 'Página do produto'],
      needsYourAttention: false,
    },
    technical: {
      filesChanged: 3,
      insertions: 96,
      deletions: 12,
      files: ['src/store/carrinho.ts', 'src/components/Carrinho.tsx', 'src/components/BotaoQtd.tsx'],
      dependenciesAdded: [],
      dependenciesRemoved: [],
    },
    evidence: [
      ev('ev-8', 'agent_claim', 0.3, 'Declaração do Claude Code via skill do WTF.', '2026-08-11T15:04:00-03:00'),
      ev('ev-9', 'file_modified', 0.6, '3 arquivos alterados, +96 −12.', '2026-08-11T15:04:20-03:00'),
    ],
  },
  {
    id: 'e-008',
    at: '2026-08-11T14:47:00-03:00',
    type: 'risk.raised',
    source: 'wtf',
    featureId: 'f-senha',
    human: {
      headline: 'O link de recuperar senha não expira. Isso é arriscado.',
      what:
        'Quando alguém pede para trocar a senha, o sistema envia um link por e-mail. Esse link continua funcionando para sempre.',
      why:
        'O WTF percebeu isso conferindo o código que gera o link — nenhum prazo de validade foi definido.',
      impact:
        'Se alguém tiver acesso a um e-mail antigo dessa pessoa, consegue entrar na conta dela a qualquer momento.',
      affects: ['Recuperar senha', 'Entrar na conta'],
      needsYourAttention: true,
      attentionReason: 'Peça para a IA colocar um prazo de validade de 1 hora nesse link.',
    },
    risk: {
      id: 'r-1',
      category: 'security',
      level: 'warning',
      headline: 'Link de redefinição de senha sem expiração',
      detail:
        'O token gerado em src/auth/reset.ts não possui campo de expiração nem verificação de uso único.',
      featureId: 'f-senha',
    },
    evidence: [
      ev('ev-10', 'file_modified', 0.7, 'src/auth/reset.ts gera token sem campo `exp`.', '2026-08-11T14:47:00-03:00'),
    ],
  },
  {
    id: 'e-007',
    at: '2026-08-11T11:15:00-03:00',
    type: 'docs.reorganized',
    source: 'wtf',
    featureId: 'f-admin',
    human: {
      headline: 'Sete documentos de planejamento viraram um só, com capítulos.',
      what:
        'A IA vinha criando um arquivo novo a cada conversa: plano-geral, plano-v2, plano-final, plano-final-real. O WTF juntou tudo em um documento único e arquivou os antigos.',
      why: 'Você não deveria precisar adivinhar qual arquivo é o atual.',
      impact: 'Nada no software mudou. Só a organização dos documentos.',
      affects: [],
      needsYourAttention: false,
    },
    technical: {
      filesChanged: 8,
      insertions: 412,
      deletions: 398,
      files: [
        'docs/PLANEJAMENTO.md',
        'docs/_arquivo/plano-geral.md',
        'docs/_arquivo/plano-v2.md',
        'docs/_arquivo/plano-final.md',
        'docs/_arquivo/plano-final-real.md',
      ],
      dependenciesAdded: [],
      dependenciesRemoved: [],
    },
    evidence: [
      ev('ev-11', 'file_modified', 0.9, 'Consolidação executada pelo próprio WTF.', '2026-08-11T11:15:00-03:00'),
    ],
  },
  {
    id: 'e-006',
    at: '2026-08-10T18:30:00-03:00',
    type: 'user.validated',
    source: 'user',
    featureId: 'f-produtos',
    human: {
      headline: 'Você conferiu a página do produto e aprovou.',
      what: 'Marcado como validado por você.',
      why: 'Só você sabe se o resultado é o que queria.',
      impact: 'A partir de agora, o WTF avisa se essa parte for alterada.',
      affects: ['Página do produto'],
      needsYourAttention: false,
    },
    evidence: [
      ev('ev-12', 'user_validated', 1, 'Validado manualmente por você.', '2026-08-10T18:30:00-03:00'),
    ],
  },
  {
    id: 'e-005',
    at: '2026-08-10T17:52:00-03:00',
    type: 'work.completed',
    source: 'agent',
    agent: 'codex',
    featureId: 'f-produtos',
    claim: 'Refiz o layout da página de produto com galeria de imagens e schema.org.',
    human: {
      headline: 'A página do produto ganhou galeria de fotos.',
      what:
        'A foto principal agora tem miniaturas embaixo, e o Google passa a entender melhor que aquilo é um produto à venda.',
      why: 'Melhora a apresentação e ajuda o produto a aparecer na busca do Google.',
      impact: 'Visual e busca. Nada relacionado a pagamento ou dados de cliente.',
      affects: ['Página do produto'],
      needsYourAttention: false,
    },
    technical: {
      filesChanged: 4,
      insertions: 231,
      deletions: 88,
      files: [
        'src/app/produto/[slug]/page.tsx',
        'src/components/Galeria.tsx',
        'src/components/Miniaturas.tsx',
        'src/lib/schema.ts',
      ],
      dependenciesAdded: [],
      dependenciesRemoved: ['react-image-lightbox@5.1.4'],
    },
    evidence: [
      ev('ev-13', 'agent_claim', 0.3, 'Declaração do Codex via skill do WTF.', '2026-08-10T17:52:00-03:00'),
      ev('ev-14', 'file_modified', 0.6, '4 arquivos alterados, +231 −88.', '2026-08-10T17:52:40-03:00'),
      ev('ev-15', 'build_passed', 0.8, 'Build de produção concluído sem erros.', '2026-08-10T17:55:12-03:00'),
    ],
  },
  {
    id: 'e-004',
    at: '2026-08-09T11:02:00-03:00',
    type: 'user.validated',
    source: 'user',
    featureId: 'f-cadastro',
    human: {
      headline: 'Você conferiu o cadastro de conta e aprovou.',
      what: 'Marcado como validado por você.',
      why: 'Só você sabe se o resultado é o que queria.',
      impact: 'A partir de agora, o WTF avisa se essa parte for alterada.',
      affects: ['Criar conta'],
      needsYourAttention: false,
    },
    evidence: [
      ev('ev-16', 'user_validated', 1, 'Validado manualmente por você.', '2026-08-09T11:02:00-03:00'),
    ],
  },
  {
    id: 'e-003',
    at: '2026-08-08T21:12:00-03:00',
    type: 'evidence.found',
    source: 'wtf',
    featureId: 'f-admin',
    human: {
      headline: 'Apareceu um painel de administração que não estava no seu plano.',
      what:
        'A IA criou por conta própria uma área para cadastrar produtos e ver pedidos. Isso não estava escrito em lugar nenhum do que você pediu.',
      why:
        'Provavelmente ela concluiu que você precisaria disso para operar a loja.',
      impact:
        'É útil, mas essa área precisa de proteção — hoje qualquer pessoa com o endereço consegue abrir.',
      affects: ['Painel do dono'],
      needsYourAttention: true,
      attentionReason:
        'Decida se quer manter. Se mantiver, peça para exigir login de administrador.',
    },
    technical: {
      filesChanged: 6,
      insertions: 508,
      deletions: 0,
      files: [
        'src/app/admin/page.tsx',
        'src/app/admin/produtos/page.tsx',
        'src/app/admin/pedidos/page.tsx',
      ],
      dependenciesAdded: [],
      dependenciesRemoved: [],
    },
    evidence: [
      ev('ev-17', 'file_created', 0.7, '6 arquivos novos sob src/app/admin.', '2026-08-08T21:12:00-03:00'),
      ev('ev-18', 'route_registered', 0.8, 'Rota /admin registrada sem verificação de sessão.', '2026-08-08T21:12:05-03:00'),
    ],
  },
  {
    id: 'e-002',
    at: '2026-08-06T10:00:00-03:00',
    type: 'work.completed',
    source: 'agent',
    agent: 'claude-code',
    featureId: 'f-emails',
    claim: 'Configurei envio de e-mail transacional via Resend.',
    human: {
      headline: 'O sistema já consegue enviar e-mails sozinho.',
      what:
        'Foi ligado um serviço externo que envia mensagens automáticas, como confirmação de pedido e recuperação de senha.',
      why: 'Sem isso, nenhum e-mail sairia do sistema.',
      impact:
        'Passa a existir um custo mensal por e-mail enviado, e uma chave secreta foi adicionada ao projeto.',
      affects: ['E-mails automáticos', 'Recuperar senha'],
      needsYourAttention: true,
      attentionReason: 'Serviço externo pago. Confira o plano gratuito antes de publicar.',
    },
    technical: {
      filesChanged: 3,
      insertions: 74,
      deletions: 2,
      files: ['src/email/enviar.ts', '.env.example', 'package.json'],
      dependenciesAdded: ['resend@4.0.1'],
      dependenciesRemoved: [],
    },
    evidence: [
      ev('ev-19', 'agent_claim', 0.3, 'Declaração do Claude Code via skill do WTF.', '2026-08-06T10:00:00-03:00'),
      ev('ev-20', 'dependency_added', 0.5, 'Dependência resend@4.0.1 adicionada.', '2026-08-06T10:00:20-03:00'),
    ],
  },
  {
    id: 'e-001',
    at: '2026-08-04T09:00:00-03:00',
    type: 'work.progress',
    source: 'wtf',
    featureId: 'f-login',
    human: {
      headline: 'O WTF leu seu plano e montou o mapa inicial do projeto.',
      what:
        'Foram encontradas 12 partes previstas no seu documento de planejamento. Nenhuma delas tinha código ainda.',
      why: 'É o ponto de partida para acompanhar o que a IA vai construir.',
      impact: 'Nada foi alterado no seu projeto.',
      affects: [],
      needsYourAttention: false,
    },
    evidence: [
      ev('ev-21', 'file_created', 0.9, 'docs/PRD.md interpretado: 12 features previstas.', '2026-08-04T09:00:00-03:00'),
    ],
  },
]

export const snapshot: ProjectSnapshot = {
  project: {
    id: 'p-serra',
    name: 'Serra Café',
    path: '~/Projetos/serra-cafe',
    pitch: 'Uma loja online para vender café da minha torrefação.',
    connectedAgents: ['claude-code', 'codex'],
    live: true,
    createdAt: '2026-08-04T09:00:00-03:00',
  },
  features,
  events,
}

/** Simula o motor. Vira `window.wtf.getSnapshot()` quando o backend existir. */
export async function loadSnapshot(): Promise<ProjectSnapshot> {
  return snapshot
}
