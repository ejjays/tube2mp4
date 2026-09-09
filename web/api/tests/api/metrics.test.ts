import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import {
  recordRequest,
  recordFailure,
  getMetrics,
  resetMetrics,
} from '../../src/utils/infra/metrics.util.js';

const REMOTE = '203.0.113.5';

describe('metrics module', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('aggregates count, average, and max latency per route', () => {
    recordRequest('GET /info', 200, 100);
    recordRequest('GET /info', 200, 300);
    const { routes } = getMetrics();
    expect(routes['GET /info'].count).toBe(2);
    expect(routes['GET /info'].avgMs).toBe(200);
    expect(routes['GET /info'].maxMs).toBe(300);
    expect(routes['GET /info'].errors).toBe(0);
  });

  it('counts 5xx responses as errors', () => {
    recordRequest('GET /info', 500, 10);
    recordRequest('GET /info', 200, 10);
    const { routes, totalErrors } = getMetrics();
    expect(routes['GET /info'].errors).toBe(1);
    expect(totalErrors).toBe(1);
  });

  it('tallies failure reasons', () => {
    recordFailure('TimeoutError');
    recordFailure('TimeoutError');
    recordFailure('SsrfError');
    expect(getMetrics().failures).toEqual({ TimeoutError: 2, SsrfError: 1 });
  });

  it('folds overflow labels into "other" to bound memory', () => {
    for (let idx = 0; idx < 250; idx += 1) {
      recordFailure(`reason-${idx}`);
    }
    const { failures } = getMetrics();
    expect(Object.keys(failures)).toHaveLength(201);
    expect(failures.other).toBe(50);
  });

  it('reset clears all counters', () => {
    recordRequest('GET /info', 200, 10);
    recordFailure('X');
    resetMetrics();
    const snap = getMetrics();
    expect(snap.totalRequests).toBe(0);
    expect(snap.failures).toEqual({});
  });
});

describe('GET /metrics endpoint', () => {
  beforeEach(() => {
    resetMetrics();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the snapshot shape to localhost', async () => {
    recordRequest('GET /seed', 200, 42);
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      uptimeSec: expect.any(Number),
      totalRequests: expect.any(Number),
      totalErrors: expect.any(Number),
    });
    expect(res.body.routes['GET /seed'].count).toBe(1);
  });

  it('records real traffic through the middleware', async () => {
    await request(app).get('/ping');
    const res = await request(app).get('/metrics');
    expect(res.body.routes['GET /ping']?.count).toBeGreaterThanOrEqual(1);
  });

  it('forbids remote access when no API_KEY is set', async () => {
    vi.stubEnv('API_KEY', '');
    const res = await request(app)
      .get('/metrics')
      .set('X-Forwarded-For', REMOTE);
    expect(res.status).toBe(403);
  });

  it('allows remote access with the correct key', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app)
      .get('/metrics')
      .set('X-Forwarded-For', REMOTE)
      .set('x-api-key', 'secret');
    expect(res.status).toBe(200);
  });

  it('forbids remote access with a wrong key', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app)
      .get('/metrics')
      .set('X-Forwarded-For', REMOTE)
      .set('x-api-key', 'nope');
    expect(res.status).toBe(403);
  });
});
