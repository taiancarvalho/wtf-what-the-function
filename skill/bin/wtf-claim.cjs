#!/usr/bin/env node
/**
 * WTF Claim — CLI para o agente declarar intenção e conclusão.
 *
 * Uso:
 *   node wtf-claim.cjs start --feature "Página de categorias" --text "Vou criar a listagem"
 *   node wtf-claim.cjs done  --feature "Página de categorias" --text "Criei e liguei no menu"
 *   node wtf-claim.cjs start --feature "X" --files a.ts,b.ts
 *
 * Grava em `.wtf/events.jsonl` do projeto (CLAUDE_PROJECT_DIR → process.cwd()).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Data ISO 8601 com offset local
function isoLocal(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const p = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `.${p(d.getMilliseconds(), 3)}` +
    `${sign}${p(Math.trunc(off / 60))}:${p(off % 60)}`
  );
}

const USO = [
  'Uso: wtf-claim.cjs <start|done> --feature "<nome da feature>" [--text "<detalhe>"] [--files a.ts,b.ts]',
  '',
  'Exemplos:',
  '  wtf-claim.cjs start --feature "Página de categorias" --text "Vou criar a listagem por tipo de torra"',
  '  wtf-claim.cjs done  --feature "Página de categorias" --text "Criei a página e liguei no menu"',
].join('\n');

function falhar(msg) {
  process.stderr.write(`WTF: ${msg}\n\n${USO}\n`);
  process.exit(1);
}

// Parse manual de argumentos: aceita --flag=valor e --flag valor
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          out[a.slice(2)] = next;
          i++;
        } else {
          out[a.slice(2)] = true;
        }
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const acao = args._[0];

const VEREDITOS = { 'falso-positivo': 'falso-positivo', 'problema-real': 'real' };

if (acao !== 'start' && acao !== 'done' && !VEREDITOS[acao]) {
  falhar(
    `ação inválida${acao ? ` ("${acao}")` : ''}. ` +
      `Use "start", "done", "falso-positivo" ou "problema-real".`
  );
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/*
 * `falso-positivo` — a IA PROPÕE, o dono do projeto confirma.
 *
 * A varredura de segurança acerta o formato e erra o contexto: um e-mail
 * institucional que a lei obriga a mostrar, um número sorteado que parece
 * telefone, um telefone de exemplo dentro de um campo. Quando alguém pede à IA
 * que confira, ela costuma acertar quais são inofensivos — e até aqui não
 * tinha onde dizer isso. O aviso voltava a cada varredura, para sempre.
 *
 * ⚠️ ISTO NÃO SILENCIA NADA SOZINHO, E É DE PROPÓSITO.
 *
 * Deixar a IA arquivar o próprio alerta de segurança seria ela corrigindo a
 * própria prova — exatamente o que este produto existe para impedir. O que
 * este comando grava é uma PROPOSTA, com o motivo escrito por extenso. Ela
 * aparece no painel ao lado do achado, e some com um clique de quem manda no
 * projeto. Um clique para os sete, se forem sete.
 *
 *   node .wtf/bin/wtf-claim.cjs falso-positivo \
 *     --arquivo src/pages/Contato.tsx --linha 18 \
 *     --motivo "É o e-mail institucional do encarregado de dados; a LGPD exige
 *               que ele apareça na tela."
 */
/*
 * `problema-real` — o outro lado, e o que faltava.
 *
 * Sem ele, o painel só sabia distinguir "ninguém olhou" de "alguém disse que
 * não é nada". O item que a IA CONFERIU E CONFIRMOU ficava com a mesma cara de
 * um que ninguém abriu — e é justamente o que precisa gritar até ser
 * consertado. Marcar como real não conserta nada; deixa o aviso em pé e diz,
 * ao lado dele, por que ele é sério.
 */
if (VEREDITOS[acao]) {
  const arquivo = typeof args.arquivo === 'string' ? args.arquivo.trim() : '';
  const linha = Number.parseInt(args.linha, 10);
  const motivo = typeof args.motivo === 'string' ? args.motivo.trim() : '';

  if (!arquivo) falhar('--arquivo é obrigatório: o caminho onde está o achado.');
  if (!Number.isFinite(linha) || linha < 1) falhar('--linha é obrigatório e deve ser um número.');
  if (!motivo) {
    falhar(
      '--motivo é obrigatório. Quem vai decidir é o dono do projeto, e sem o ' +
        'motivo ele não tem como decidir nada.'
    );
  }

  const alvo = path.join(projectDir, '.wtf', 'seguranca-propostas.json');
  let dados = { v: 1, itens: {} };
  try {
    const bruto = fs.readFileSync(alvo, 'utf8');
    const lido = JSON.parse(bruto);
    if (lido && typeof lido === 'object' && lido.itens && typeof lido.itens === 'object') {
      dados = { v: 1, itens: lido.itens };
    }
  } catch {
    /* sem arquivo ainda, ou ilegível: começamos do zero */
  }

  dados.itens[`${arquivo}:${linha}`] = {
    at: isoLocal(),
    motivo,
    por: 'claude-code',
    veredito: VEREDITOS[acao],
  };

  try {
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, JSON.stringify(dados, null, 2) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`WTF: falha ao gravar a proposta: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(
    VEREDITOS[acao] === 'real'
      ? `WTF: ${arquivo}:${linha} marcado como problema real. ` +
          `O aviso continua no painel, agora com o motivo e em destaque.\n`
      : `WTF: proposta registrada para ${arquivo}:${linha}. ` +
          `Ela aparece no painel para o dono do projeto confirmar.\n`
  );
  process.exit(0);
}

const feature = typeof args.feature === 'string' ? args.feature.trim() : '';
if (!feature) {
  falhar('--feature é obrigatório e deve receber um texto descrevendo a feature.');
}

const evento = {
  v: 1,
  id: crypto.randomUUID(),
  at: isoLocal(),
  kind: acao === 'start' ? 'claim.started' : 'claim.completed',
  agent: 'claude-code',
  sessionId: process.env.CLAUDE_SESSION_ID || 'cli',
  feature,
};

if (typeof args.text === 'string' && args.text.trim()) {
  evento.text = args.text.trim();
}

if (typeof args.files === 'string') {
  const files = args.files
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  if (files.length) evento.files = files;
}

try {
  const dir = path.join(projectDir, '.wtf');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    path.join(dir, 'events.jsonl'),
    JSON.stringify(evento).replace(/\n/g, ' ') + '\n',
    'utf8'
  );
} catch (err) {
  process.stderr.write(`WTF: falha ao gravar evento: ${err.message}\n`);
  process.exit(1);
}

process.stdout.write(`WTF: registrado "${acao}" para "${feature}"\n`);
