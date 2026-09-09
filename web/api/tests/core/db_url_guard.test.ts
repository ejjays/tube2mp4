import { describe, it, expect, afterEach } from 'vitest';
import { resolveDbUrl } from '../../src/utils/infra/db.util.js';

describe('resolveDbUrl libsql override guard', () => {
  const origTursoUrl = process.env.TURSO_URL;
  const origNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.TURSO_URL = origTursoUrl;
    process.env.NODE_ENV = origNodeEnv;
  });

  it('rewrites libsql:// turso urls to https:// (documented prod format)', () => {
    process.env.NODE_ENV = 'production';
    process.env.TURSO_URL = 'libsql://phantom-db.turso.io';
    expect(resolveDbUrl(false)).toBe('https://phantom-db.turso.io');
  });

  it('passes https turso urls through unchanged', () => {
    process.env.NODE_ENV = 'production';
    process.env.TURSO_URL = 'https://phantom-db.turso.io';
    expect(resolveDbUrl(false)).toBe('https://phantom-db.turso.io');
  });

  it('throws a clear error on a production file: url', () => {
    process.env.NODE_ENV = 'production';
    process.env.TURSO_URL = 'file:local.db';
    expect(() => resolveDbUrl(false)).toThrow(
      'libsql native binding is overridden for termux — use an https (turso) url'
    );
  });

  it('preserves the file:test.db test exception', () => {
    process.env.NODE_ENV = 'test';
    process.env.TURSO_URL = 'file:local.db';
    expect(resolveDbUrl(true)).toBe('file:test.db');
  });
});
