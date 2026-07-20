import { defineConfig } from 'vitest/config'

// node:sqlite is a newer built-in that Vite's bundler doesn't yet know about,
// so tell Vitest to leave it (and other node: builtins) to Node's own loader.
export default defineConfig({
  test: {
    environment: 'node',
    server: {
      deps: {
        external: [/^node:/, 'node:sqlite'],
      },
    },
  },
})
