import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

// malformed json trips the global error handler
function badJson() {
  return request(app)
    .post('/telemetry')
    .set('Content-Type', 'application/json')
    .send('{ broken');
}

describe('global error handler', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('hides internal details in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await badJson();
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal Server Error');
    expect(res.body.details).toBeUndefined();
  });

  it('keeps details outside production for debugging', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await badJson();
    expect(res.status).toBe(500);
    expect(typeof res.body.details).toBe('string');
  });
});
