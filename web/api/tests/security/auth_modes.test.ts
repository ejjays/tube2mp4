import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { logger } from '../../src/utils/infra/logger.util.js';
import {
  resolveAuthMode,
  assertProdConfig,
} from '../../src/utils/network/auth.util.js';

// non-local test client
const REMOTE = '203.0.113.7';

describe('resolveAuthMode', () => {
  it('honors explicit AUTH_MODE=open', () => {
    expect(resolveAuthMode({ AUTH_MODE: 'open' } as NodeJS.ProcessEnv)).toBe(
      'open'
    );
  });

  it('honors explicit AUTH_MODE=apikey', () => {
    expect(resolveAuthMode({ AUTH_MODE: 'apikey' } as NodeJS.ProcessEnv)).toBe(
      'apikey'
    );
  });

  it('is case-insensitive', () => {
    expect(resolveAuthMode({ AUTH_MODE: 'OPEN' } as NodeJS.ProcessEnv)).toBe(
      'open'
    );
  });

  it('infers apikey when API_KEY is set', () => {
    expect(resolveAuthMode({ API_KEY: 'x' } as NodeJS.ProcessEnv)).toBe(
      'apikey'
    );
  });

  it('fails closed (deny) in production when nothing is configured', () => {
    expect(
      resolveAuthMode({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)
    ).toBe('deny');
  });

  it('stays open in dev when nothing is configured', () => {
    expect(
      resolveAuthMode({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)
    ).toBe('open');
  });
});

describe('production auth posture (request level)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('deny mode blocks remote requests with 403', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_KEY', '');
    vi.stubEnv('AUTH_MODE', '');
    const res = await request(app).get('/proxy').set('X-Forwarded-For', REMOTE);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Public access is not configured');
  });

  it('deny mode still allows localhost', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_KEY', '');
    vi.stubEnv('AUTH_MODE', '');
    // localhost bypasses deny
    const res = await request(app).get('/proxy');
    expect(res.status).toBe(403);
    expect(res.body.error).not.toBe('Public access is not configured');
  });

  it('explicit open mode lets a remote request reach the sig gate', async () => {
    vi.stubEnv('AUTH_MODE', 'open');
    const res = await request(app).get('/proxy').set('X-Forwarded-For', REMOTE);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/signature|Unsigned/u);
  });
});

describe('assertProdConfig posture warnings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns (not throws) in deny mode', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(() =>
      assertProdConfig({
        NODE_ENV: 'production',
        PROXY_SIGNING_SECRET: 's',
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DENY MODE'));
  });

  it('warns in explicit open mode', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    assertProdConfig({
      NODE_ENV: 'production',
      PROXY_SIGNING_SECRET: 's',
      AUTH_MODE: 'open',
    } as NodeJS.ProcessEnv);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('OPEN MODE'));
  });
});
