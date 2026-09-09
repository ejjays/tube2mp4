import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { Server } from 'http';

describe('API Integration (Express Layer)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    return new Promise((resolve) => {
      // ephemeral port
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'string' ? 0 : address?.port || 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it('GET /ping should return 200 pong', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('pong');
  });

  it('GET /health should return 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      status: 'ok',
    });
  });

  it('GET /non-existent-route should return 404', async () => {
    const res = await fetch(`${baseUrl}/api/v1/invalid`);
    expect(res.status).toBe(404);
  });
});
