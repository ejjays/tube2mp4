import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('cors hardening', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sends literal * (no credentials) in open mode, never reflects origin', async () => {
    vi.stubEnv('ALLOWED_ORIGINS', '');
    const res = await request(app)
      .get('/ping')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('only echoes allowlisted origins when ALLOWED_ORIGINS is set', async () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://good.example');
    const ok = await request(app)
      .get('/ping')
      .set('Origin', 'https://good.example');
    expect(ok.headers['access-control-allow-origin']).toBe(
      'https://good.example'
    );
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const bad = await request(app)
      .get('/ping')
      .set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
