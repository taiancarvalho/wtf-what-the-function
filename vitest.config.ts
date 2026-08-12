import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Testes do motor, não da tela.
 *
 * O que decide se uma parte está pronta, se algo foi provado e se um aviso
 * ainda cobra atenção mora em funções puras — é o que precisa de prova. Tela
 * quebrada se vê; conta errada, não: ela mente com confiança, que é o defeito
 * exato que este app existe para combater.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
