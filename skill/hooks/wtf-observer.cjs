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

// Append de uma única linha JSON; nunca lança
function appendEvent(projectDir, event) {
  try {
    const dir = path.join(projectDir, '.wtf');
    fs.mkdirSync(dir, { recursive: true });
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

function handle(payload) {
  const projectDir =
    process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
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
