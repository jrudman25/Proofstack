import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Bound worker parallelism and allow for slow jsdom startup under load:
    // unbounded workers intermittently time out and mask real regressions.
    maxWorkers: 4,
    testTimeout: 15000,
    projects: [
      { extends: true, test: { name: 'server', environment: 'node', include: ['**/*.{test,spec}.ts'] } },
      { extends: true, test: { name: 'browser', environment: 'jsdom', include: ['**/*.{test,spec}.tsx'] } },
    ],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
