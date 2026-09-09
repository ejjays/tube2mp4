import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { assertProdConfig } from '../../src/utils/network/auth.util.js';

// non-local test client
const REMOTE = '203.0.113.5';

describe('inbound API key auth', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled when API_KEY is unset', async () => {
    vi.stubEnv('API_KEY', '');
    const res = await request(app).get('/proxy').set('X-Forwarded-For', REMOTE);
    expect(res.status).toBe(403);
  });

  it('returns 401 for a remote request with no key', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app).get('/proxy').set('X-Forwarded-For', REMOTE);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong key', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app)
      .get('/proxy')
      .set('X-Forwarded-For', REMOTE)
      .set('x-api-key', 'nope');
    expect(res.status).toBe(401);
  });

  it('accepts a correct key header (then hits the 403 sig gate)', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app)
      .get('/proxy')
      .set('X-Forwarded-For', REMOTE)
      .set('x-api-key', 'secret');
    expect(res.status).toBe(403);
  });

  it('rejects a ?key= query (keys are header-only)', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app)
      .get('/proxy?key=secret')
      .set('X-Forwarded-For', REMOTE);
    expect(res.status).toBe(401);
  });

  it('exempts localhost even with no key', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app).get('/proxy');
    expect(res.status).toBe(403);
  });
});

describe('localhost bypass cannot be spoofed via header', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects a spoofed X-Forwarded-For: 127.0.0.1', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app)
      .get('/proxy')
      .set('X-Forwarded-For', '127.0.0.1');
    expect(res.status).toBe(401);
  });
});

describe('assertProdConfig', () => {
  it('passes in production without API_KEY (auth disabled)', () => {
    expect(() =>
      assertProdConfig({
        NODE_ENV: 'production',
        PROXY_SIGNING_SECRET: 's',
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it('throws in production without PROXY_SIGNING_SECRET', () => {
    expect(() =>
      assertProdConfig({
        NODE_ENV: 'production',
        API_KEY: 'x',
      } as NodeJS.ProcessEnv)
    ).toThrow();
  });

  it('passes in production with API_KEY and PROXY_SIGNING_SECRET', () => {
    expect(() =>
      assertProdConfig({
        NODE_ENV: 'production',
        API_KEY: 'x',
        PROXY_SIGNING_SECRET: 's',
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it('passes outside production', () => {
    expect(() =>
      assertProdConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });
});
