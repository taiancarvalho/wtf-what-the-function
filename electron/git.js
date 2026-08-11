// Leitura de metadados e commits de repositórios git.
// Somente leitura: nenhum comando altera o repositório.
// Sem shell — sempre execFile com array de argumentos (evita injeção via path).

import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFile = promisify(_execFile);

// git log --numstat de 60 commits pode passar de 1MB; folga generosa.
const MAX_BUFFER = 64 * 1024 * 1024;

// Sentinelas de registro (NUL) e de campo (SOH), usadas no --pretty=format.
// Não ocorrem em mensagens de commit nem em caminhos.
const REC = '\u0000';
const FS = '\u0001';

// Executa git no diretório informado (somente leitura).
async function git(dir, args) {
  const { stdout } = await execFile('git', args, {
    cwd: dir,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });
  return stdout;
}

// Versão que não lança — retorna null em erro.
async function gitSafe(dir, args) {
  try {
    return await git(dir, args);
  } catch {
    return null;
  }
}

export async function isGitRepo(dir) {
  if (!dir || typeof dir !== 'string') return false;
  const out = await gitSafe(dir, ['rev-parse', '--is-inside-work-tree']);
  return out !== null && out.trim() === 'true';
}

// Garante que dir é repo; caso contrário, erro claro.
async function assertRepo(dir) {
  if (!(await isGitRepo(dir))) {
    throw new Error(`Não é um repositório git: ${dir}`);
  }
}

export async function readProjectMeta(dir) {
  await assertRepo(dir);

  // Raiz do worktree — o nome do projeto vem dela, não do subdiretório.
  const topRaw = await gitSafe(dir, ['rev-parse', '--show-toplevel']);
  const root = topRaw && topRaw.trim() ? topRaw.trim() : path.resolve(dir);

  const branchRaw = await gitSafe(dir, ['branch', '--show-current']);
  const branch = branchRaw && branchRaw.trim() ? branchRaw.trim() : null;

  const remoteRaw = await gitSafe(dir, ['remote', 'get-url', 'origin']);
  const remote = remoteRaw && remoteRaw.trim() ? remoteRaw.trim() : null;

  // Commit-raiz (sem parents) alcançável a partir do HEAD.
  const firstRaw = await gitSafe(dir, [
    'log', '--max-parents=0', '--reverse', '--pretty=format:%aI',
  ]);
  const firstCommitAt = firstRaw
    ? (firstRaw.split('\n').map((l) => l.trim()).filter(Boolean)[0] || null)
    : null;

  return {
    name: path.basename(root),
    path: root,
    branch,
    remote,
    firstCommitAt,
  };
}

/** Existe pelo menos um commit alcançável? Repo novo em folha responde não. */
async function temCommits(dir) {
  const r = await gitSafe(dir, ['rev-parse', '--verify', 'HEAD']);
  return Boolean(r && r.trim());
}

// Normaliza caminhos de rename do --numstat para o caminho NOVO.
// Formatos: "old => new" e "pre{a => b}post".
function normalizeRenamePath(p) {
  const brace = p.match(/^(.*)\{(.*?) => (.*?)\}(.*)$/);
  if (brace) {
    const joined = `${brace[1]}${brace[3]}${brace[4]}`;
    // Remove barras duplicadas quando um dos lados do rename é vazio.
    return joined.replace(/\/{2,}/g, '/').replace(/^\//, '');
  }
  const arrow = p.split(' => ');
  if (arrow.length === 2) return arrow[1];
  return p;
}

// "-" indica arquivo binário no --numstat; conta como 0.
function toCount(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

const AGENT_PATTERNS = [
  ['claude-code', /co-authored-by:\s*claude|generated with claude code|claude-session|noreply@anthropic\.com|claude code/i],
  ['codex', /chatgpt\.com\/codex|\bcodex\b/i],
  ['gemini-cli', /\bgemini\b/i],
  ['antigravity', /\bantigravity\b/i],
];

// Detecta o agente pelo corpo/trailers e pelo autor.
function detectAgent(body, author, authorEmail) {
  const hay = `${body}\n${author}\n${authorEmail}`;
  for (const [name, re] of AGENT_PATTERNS) {
    if (re.test(hay)) return name;
  }
  return null;
}

export async function readCommits(dir, limit = 60) {
  await assertRepo(dir);

  /*
   * Repositório recém-criado, ainda sem nenhum commit.
   *
   * `git log` falha aqui ("your current branch 'main' does not have any commits
   * yet"), e isso NÃO é um erro: é o primeiro minuto de vida de todo projeto —
   * exatamente quando alguém abriria o WTF pela primeira vez. Sem histórico
   * ainda, mas os arquivos no disco já contam a história.
   */
  if (!(await temCommits(dir))) return [];

  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 60;

  // Uma única chamada: cabeçalho delimitado por sentinelas + numstat do commit.
  const pretty = 'format:%x00%H%x01%h%x01%an%x01%ae%x01%aI%x01%P%x01%B%x01';
  const stdout = await git(dir, [
    'log',
    `--max-count=${n}`,
    '--numstat',
    '--find-renames',
    `--pretty=${pretty}`,
  ]);

  const commits = [];
  // Cada bloco = um commit (o trecho antes da 1ª sentinela é vazio).
  for (const block of stdout.split(REC)) {
    if (!block.trim()) continue;

    const parts = block.split(FS);
    if (parts.length < 7) continue;

    const [fullHash, hash, author, authorEmail, at, parents, message] = parts;
    const rest = parts.slice(7).join(FS); // após o cabeçalho vem o numstat

    const lines = message.split('\n');
    const subject = (lines[0] || '').trim();
    const body = lines.slice(1).join('\n').trim();

    const files = [];
    let insertions = 0;
    let deletions = 0;

    for (const line of rest.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const cols = t.split('\t');
      if (cols.length < 3) continue;
      const ins = toCount(cols[0]);
      const del = toCount(cols[1]);
      const filePath = normalizeRenamePath(cols.slice(2).join('\t'));
      insertions += ins;
      deletions += del;
      files.push({ path: filePath, insertions: ins, deletions: del });
    }

    const parentList = parents.trim() ? parents.trim().split(/\s+/) : [];

    commits.push({
      hash,
      fullHash,
      author,
      authorEmail,
      at,
      subject,
      body,
      isMerge: parentList.length > 1,
      files,
      insertions,
      deletions,
      agent: detectAgent(body, author, authorEmail),
    });
  }

  return commits;
}

/**
 * Arquivos que o Git rastreia HOJE.
 *
 * Existência é uma pergunta sobre o presente, não sobre o histórico recente:
 * uma parte estável pode não aparecer em nenhum dos últimos commits e ainda
 * assim estar lá, funcionando. Só leitura — `git ls-files` não altera nada.
 */
export async function readTrackedFiles(dir) {
  if (!(await isGitRepo(dir))) throw new Error(`Não é um repositório git: ${dir}`);

  const { stdout } = await execFile('git', ['ls-files', '-z'], {
    cwd: dir,
    maxBuffer: MAX_BUFFER,
  });

  return stdout.split(REC).filter(Boolean);
}

/**
 * Arquivos que existem no DISCO mas ainda não estão no histórico.
 *
 * Quem faz vibe coding passa horas sem commitar — e é exatamente enquanto
 * trabalha que quer olhar o painel. Se só o que está commitado conta, a IA
 * cria 12 arquivos novos e o painel fica mudo. Aqui lemos o estado real do
 * disco: `untracked` (arquivos novos, respeitando .gitignore) e `modified`
 * (rastreados com alteração pendente). Só leitura.
 */
export async function readWorkingFiles(dir) {
  if (!(await isGitRepo(dir))) return { untracked: [], modified: [] };

  const outrosRaw = await gitSafe(dir, [
    'ls-files', '--others', '--exclude-standard', '-z',
  ]);

  // Sem HEAD (repo sem commits) `diff HEAD` falha; caímos no diff do índice.
  let diffRaw = await gitSafe(dir, ['diff', '--name-only', '-z', 'HEAD']);
  if (diffRaw === null) diffRaw = await gitSafe(dir, ['diff', '--name-only', '-z']);

  const partir = (s) => (s ? s.split(REC).filter(Boolean) : []);

  return {
    untracked: partir(outrosRaw),
    modified: partir(diffRaw),
  };
}
