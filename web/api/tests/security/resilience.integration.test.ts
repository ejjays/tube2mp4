import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/utils/infra/db.util.js';
import { createRedisClient } from '../../src/utils/infra/redis.util.js';
import Redis from 'ioredis';

describe('Infrastructure Fault Injection', () => {
  it('Should handle Turso Database mid-flight dropouts without crashing', async () => {
    // mock DB
    vi.spyOn(db, 'execute').mockRejectedValueOnce(
      new Error('LibSQL Client Error: Cannot reach remote database')
    );

    const res = await request(app).get(
      '/info?url=https://open.spotify.com/track/404'
    );

    // verify fallback
    // expect 200
    expect(res.status).toBe(200);
  });

  it('Should survive Redis connection timeouts during heavy concurrency checks', async () => {
    const mockClient = createRedisClient('security');
    vi.spyOn(mockClient as unknown as Redis, 'incr').mockRejectedValueOnce(
      new Error('Redis command timeout (ETIMEDOUT)')
    );

    const res = await request(app)
      .post('/convert')
      .send({
        url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        format: 'mp3',
      });

    // check Redis
    // expect 500
    expect(res.status).toBe(500);
  });
});
