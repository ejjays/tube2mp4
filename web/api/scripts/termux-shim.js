import { Module, createRequire } from 'module';

createRequire(import.meta.url);

// mock native modules
const originalRequire = Module.prototype.require;
Module.prototype.require = function (name, ...args) {
  if (name.includes('libsql') || name === '@libsql/client') {
    try {
      return originalRequire.apply(this, [name, ...args]);
    } catch (err) {
      // bypass native noise
      const msg = err instanceof Error ? err.message : String(err);
      console.debug('[System] LibSQL unavailable:', msg);
      return {
        createClient: () => ({
          execute: () => Promise.resolve({ rows: [] }),
          batch: () => Promise.resolve([]),
          close: () => {
            /* no-op */
          },
        }),
      };
    }
  }
  if (name === '@ffmpeg-installer/ffmpeg') {
    return { path: 'ffmpeg', version: 'system', url: 'https://ffmpeg.org/' };
  }
  return originalRequire.apply(this, [name, ...args]);
};

console.log('[env] termux bypass active');

// skip server boot under tests
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  await import('../dist/api/src/app.js');
}
