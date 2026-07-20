import { defineConfig } from 'vitest/config'

// Crypto tests run in a plain Node environment (Web Crypto is a global there).
// Kept separate from vite.config.ts to avoid mixing the React plugin's types
// with Vitest's bundled copy of Vite.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
