#!/usr/bin/env node
/**
 * Instala o hook que roda os testes antes de cada push.
 *
 * Por que aqui e não no GitHub Actions: repositório privado consome cota de
 * minutos, e cota vira fatura. Este projeto não cria custo para ninguém sem
 * aviso — nem para quem o usa, nem para quem o mantém. Rodar na máquina custa
 * cinco segundos e zero centavo.
 *
 * Quando o repositório for público, o CI na nuvem passa a ser gratuito e aí
 * vale ligar: lá ele protege também o que vem de outras pessoas.
 *
 *     node scripts/instalar-hook-local.mjs
 *     node scripts/instalar-hook-local.mjs --remover
 */

import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const alvo = path.join(raiz, '.git', 'hooks', 'pre-push')

const MARCA = '# wtf:pre-push'

const HOOK = `#!/bin/sh
${MARCA}
# Roda os testes antes do push. Para pular numa emergência:  git push --no-verify

echo "WTF: rodando os testes antes do push…"
if ! npm test --silent; then
  echo ""
  echo "  Push cancelado: os testes não passaram."
  echo "  Conserte, ou use 'git push --no-verify' se souber o que está fazendo."
  echo ""
  exit 1
fi
`

const remover = process.argv.includes('--remover')

if (remover) {
  try {
    const atual = await readFile(alvo, 'utf8')
    if (!atual.includes(MARCA)) {
      console.log('O hook de pre-push existente não é do WTF. Nada foi removido.')
      process.exit(0)
    }
    await rm(alvo)
    console.log('Hook removido. Os testes não rodam mais antes do push.')
  } catch {
    console.log('Não havia hook para remover.')
  }
  process.exit(0)
}

// Nunca sobrescrever hook de outra pessoa sem avisar.
try {
  const atual = await readFile(alvo, 'utf8')
  if (!atual.includes(MARCA)) {
    console.error(
      `\n  Já existe um hook de pre-push que não é do WTF:\n  ${alvo}\n\n` +
        '  Nada foi alterado. Junte os dois à mão se quiser os dois comportamentos.\n',
    )
    process.exit(1)
  }
} catch {
  /* não existe ainda: seguir */
}

await mkdir(path.dirname(alvo), { recursive: true })
await writeFile(alvo, HOOK, 'utf8')
await chmod(alvo, 0o755)

console.log(`
  Pronto. Os testes passam a rodar antes de cada push.

  custo:    zero — roda na sua máquina
  duração:  ~5 segundos
  pular:    git push --no-verify
  remover:  node scripts/instalar-hook-local.mjs --remover
`)
