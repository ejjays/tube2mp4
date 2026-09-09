import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync } from 'node:fs';

// https://vite.dev/config/
export default defineConfig({
  // served as an island under the astro site at c-phantom.pages.dev/app/
  base: '/app/',
  plugins: [
    {
      // rolldown creates outDir only during bundle write; sitemap plugin
      // writes robots.txt in closeBundle, so pre-create it (registered first)
      name: 'ensure-dist-dir',
      closeBundle() {
        mkdirSync('dist', { recursive: true });
      },
    },
    react(),
  ],
  build: {
    // no inline modulepreload polyfill (csp-friendly)
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // skipcq: JS-0045
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router)/.test(id))
            return 'react-vendor';
          if (/node_modules\/(framer-motion|lucide-react)/.test(id))
            return 'ui-vendor';
          if (/node_modules\/lottie/.test(id)) return 'lottie-vendor';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // whitelist tunnel host
    allowedHosts: ['50z6k4brxcik.share.zrok.io'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
