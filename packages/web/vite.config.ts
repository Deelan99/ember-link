import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web app is served both by the Vite dev server (dev) and by the Fastify
// server out of `dist/` (prod). Links point at VITE_PUBLIC_URL if set, otherwise
// window.location.origin. API calls go to VITE_API_BASE if set, otherwise the
// same origin. (Test config lives in vitest.config.ts.)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
