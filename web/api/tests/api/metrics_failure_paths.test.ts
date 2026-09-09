import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// force resolution failure to hit catch
vi.mock('../../src/services/ytdlp.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/ytdlp.service.js')
    >();
  return { ...actual, getVideoInfo: vi.fn().mockResolvedValue(null) };
});

import app from '../../src/app.js';
import {
  getMetrics,
  resetMetrics,
} from '../../src/utils/infra/metrics.util.js';

describe('controller failure metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('records a stream_urls failure when resolution fails', async () => {
    const res = await request(app)
      .get('/stream-urls')
      .query({ url: 'https://www.youtube.com/watch?v=nTbA7qrEsP0' });
    expect(res.status).toBe(500);
    expect(getMetrics().failures.stream_urls).toBe(1);
  });
});
