import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'expo-file-system': fileURLToPath(
        new URL('./tests/stubs/expo-file-system.ts', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // termux phantom-killer: one worker, sequential
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    maxConcurrency: 1,
    reporters: ['default', 'junit'],
    outputFile: './test-results.xml',
  },
});
