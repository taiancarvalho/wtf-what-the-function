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

if (acao !== 'start' && acao !== 'done') {
  falhar(`ação inválida${acao ? ` ("${acao}")` : ''}. Use "start" ou "done".`);
}

const feature = typeof args.feature === 'string' ? args.feature.trim() : '';
if (!feature) {
  falhar('--feature é obrigatório e deve receber um texto descrevendo a feature.');
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

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
