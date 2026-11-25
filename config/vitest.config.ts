import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 4,
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    environmentMatchGlobs: [['tests/client/**', 'jsdom']],
    coverage: { reporter: ['text'] },
  },
})
