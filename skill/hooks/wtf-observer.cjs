#!/usr/bin/env node
/**
 * WTF Observer — hook do Claude Code.
 *
 * Lê um payload JSON via stdin e registra eventos em `.wtf/events.jsonl`
 * do projeto observado. Silencioso: nunca escreve em stdout e sempre
 * termina com exit code 0, mesmo em erro.
 *
 * Payload esperado (campos usados):
 * {
 *   "hook_event_name": "SessionStart" | "SessionEnd" | "Stop" | "PostToolUse",
 *   "session_id": "abc123",
 *   "cwd": "/caminho/do/projeto",
 *   "tool_name": "Edit" | "Write" | "MultiEdit" | "NotebookEdit" | "Bash" | ...,
 *   "tool_input": {
 *     "file_path": "/caminho/arquivo.ts",   // Edit/Write/MultiEdit
 *     "notebook_path": "/caminho/nb.ipynb", // NotebookEdit
 *     "command": "npm run build"            // Bash
 *   }
 * }
 *
 * Diretório do projeto: CLAUDE_PROJECT_DIR → payload.cwd → process.cwd().
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ REGRA CENTRAL — O CONSENTIMENTO É A PASTA `.wtf/`                        │
 * │                                                                          │
 * │ Este arquivo pode estar instalado GLOBALMENTE (em `~/.claude/hooks/`),   │
 * │ e nesse caso ele roda em TODOS os projetos que a pessoa abrir. Isso só   │
 * │ é aceitável porque ele SAI EM SILÊNCIO, sem gravar nada e com código 0,  │
 * │ quando o projeto onde rodou NÃO tem a pasta `.wtf/`.                     │
 * │                                                                          │
 * │ Ele nunca cria essa pasta. Quem cria é a pessoa, clicando em "habilitar  │
 * │ neste projeto" no aplicativo do WTF. Instalado em todo lugar, inerte por │
 * │ padrão: só observa onde foi convidado.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Data ISO 8601 com offset local (evita forçar UTC)
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

// Append de uma única linha JSON; nunca lança.
// Não cria `.wtf/` — a essa altura ela já foi verificada em habilitado().
function appendEvent(projectDir, event) {
  try {
    const dir = path.join(projectDir, '.wtf');
    fs.appendFileSync(
      path.join(dir, 'events.jsonl'),
      JSON.stringify(event).replace(/\n/g, ' ') + '\n',
      'utf8'
    );
  } catch (_) {
    // somente-leitura ou disco cheio: ignora silenciosamente
  }
}

// Comandos de leitura triviais que não viram evento
const TRIVIAL = [
  /^ls(\s|$)/,
  /^cat(\s|$)/,
  /^pwd(\s|$)/,
  /^echo(\s|$)/,
  /^grep(\s|$)/,
  /^find(\s|$)/,
  /^rtk\s+(read|ls|wc)(\s|$)/,
  /^git\s+status(\s|$)/,
  /^git\s+log(\s|$)/,
  /^git\s+diff(\s|$)/,
];

function isTrivial(cmd) {
  const c = String(cmd || '').trim().replace(/^\(+\s*/, '');
  return TRIVIAL.some((re) => re.test(c));
}

// Converte caminho absoluto em relativo ao projeto
function toRelative(projectDir, filePath) {
  try {
    const rel = path.relative(projectDir, path.resolve(projectDir, filePath));
    return rel && !rel.startsWith('..') ? rel : filePath;
  } catch (_) {
    return filePath;
  }
}

function baseEvent(kind, sessionId) {
  return {
    v: 1,
    id: crypto.randomUUID(),
    at: isoLocal(),
    kind,
    agent: 'claude-code',
    sessionId: sessionId || 'unknown',
  };
}

/** O projeto tem `.wtf/`? É esta pasta, e só ela, que autoriza o registro. */
function habilitado(projectDir) {
  try {
    return fs.statSync(path.join(projectDir, '.wtf')).isDirectory();
  } catch (_) {
    return false;
  }
}

/**
 * Deduplicação entre o hook GLOBAL e o hook LOCAL.
 *
 * Quem instalou o WTF na versão antiga tem uma cópia deste arquivo dentro do
 * projeto (`.claude/hooks/wtf-observer.cjs`) e outra entrada de hook no
 * `settings.local.json`. Com o hook global também registrado, os dois rodariam
 * no mesmo evento e o evento entraria duas vezes em `events.jsonl`.
 *
 * A escolha: quem cede é o GLOBAL. Descobrimos qual cópia está rodando pelo
 * caminho deste próprio arquivo — se ele NÃO está dentro do projeto, é a cópia
 * global; e se existe uma cópia local, ela dá conta, então saímos. O contrário
 * (o local ceder) seria pior: o local é o específico, e é ele que a pessoa vê
 * no projeto ao auditar o que está sendo registrado.
 */
function eDuplicataDoLocal(projectDir) {
  try {
    // realpath dos dois lados: em macOS o projeto pode chegar por um caminho
    // com symlink (/var → /private/var) e a comparação crua daria falso.
    const real = (p) => {
      try {
        return fs.realpathSync(p);
      } catch (_) {
        return p;
      }
    };
    const rel = path.relative(real(projectDir), real(__filename));
    const souLocal = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    if (souLocal) return false;
    return fs.existsSync(path.join(projectDir, '.claude', 'hooks', 'wtf-observer.cjs'));
  } catch (_) {
    return false;
  }
}

function handle(payload) {
  const projectDir =
    process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();

  // Sem `.wtf/`, o WTF não está habilitado aqui: nada é gravado, nada é criado.
  if (!habilitado(projectDir)) return;
  if (eDuplicataDoLocal(projectDir)) return;

  const sessionId = payload.session_id;
  const name = payload.hook_event_name;

  if (name === 'SessionStart') {
    appendEvent(projectDir, baseEvent('session.started', sessionId));
    return;
  }

  if (name === 'SessionEnd' || name === 'Stop') {
    appendEvent(projectDir, baseEvent('session.ended', sessionId));
    return;
  }

  if (name === 'PostToolUse') {
    const tool = payload.tool_name;
    const input = payload.tool_input || {};

    if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
      const fp = input.file_path || input.notebook_path;
      if (!fp) return;
      const ev = baseEvent('file.touched', sessionId);
      ev.files = [toRelative(projectDir, fp)];
      ev.tool = tool;
      appendEvent(projectDir, ev);
      return;
    }

    if (tool === 'Bash') {
      const cmd = input.command;
      if (!cmd || isTrivial(cmd)) return;
      const ev = baseEvent('command.run', sessionId);
      ev.text = String(cmd).slice(0, 300);
      ev.tool = 'Bash';
      appendEvent(projectDir, ev);
    }
  }
}

// Lê stdin inteiro e processa; qualquer erro é engolido
let raw = '';
try {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => {
    raw += c;
  });
  process.stdin.on('error', () => process.exit(0));
  process.stdin.on('end', () => {
    try {
      handle(JSON.parse(raw || '{}'));
    } catch (_) {
      /* payload inválido: ignora */
    }
    process.exit(0);
  });
} catch (_) {
  process.exit(0);
}
