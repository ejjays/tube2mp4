import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseExcludes = ['**/node_modules/**', '**/dist/**'];
const includeManual = process.env.VITEST_INCLUDE_MANUAL === '1';
const includeE2E = process.env.VITEST_INCLUDE_E2E === '1' || process.env.E2E === '1';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: { NODE_ENV: 'test' },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000,
    reporters: ['default', 'junit'],
    outputFile: './test-results.xml',
    exclude: [
      ...baseExcludes,
      ...(!includeManual ? ['tests/manual/**', 'tests/lite/**'] : []),
      ...(!includeE2E ? ['tests/e2e/**'] : []),
    ],
    pool: 'forks',
    maxWorkers: 1,
    isolate: true,
    sequence: {
      concurrent: false,
    },
    fileParallelism: false,
    maxConcurrency: 1,
    alias: {
      '@shared': `${__dirname}/../shared`,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 35,
        statements: 40,
        autoUpdate: false,
      },
      exclude: ['tests/**', 'eslint.config.js', 'vitest.config.js'],
    },
  },
});
