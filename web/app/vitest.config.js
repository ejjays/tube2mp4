import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    reporters: ['default', 'junit'],
    outputFile: './test-results.xml',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
