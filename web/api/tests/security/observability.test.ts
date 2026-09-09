import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/node';
import request from 'supertest';
import app from '../../src/app.js';

// mock Sentry
vi.mock('@sentry/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/node')>();
  return {
    ...actual,
    captureException: vi.fn(),
  };
});

vi.mock('../../src/utils/network/cookie.util.js', () => ({
  getCookieArgs: vi.fn().mockRejectedValue(new Error('Fatal System Crash')),
}));

describe('Telemetry & Observability Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Should capture unexpected exceptions inside handlers and pass them to Sentry', async () => {
    // trigger error
    await request(app)
      .get('/info?url=https://www.youtube.com/watch?v=123')
      .send();

    // check Sentry
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
