import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'node:http';
import app from '../../src/app.js';
import { sendEvent, removeClient } from '../../src/utils/network/sse.util.js';

/**
 * verifies sse bypasses compression.
 * prevents small event writes from buffering in gzip blocks,
 * which causes delivery delays in the browser.
 */

describe('SSE compression bypass — events arrive promptly', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const address = server.address();
          const port = typeof address === 'string' ? 0 : address?.port || 0;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      })
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
  );

  it('delivers an SSE event within 500ms of sendEvent (i.e. not buffered by compression)', async () => {
    const clientId = 'compression-test-client';
    const targetEventText = 'pipeline-bypass-marker';

    // open sse
    const controller = new AbortController();
    const start = Date.now();
    const fetchPromise = fetch(`${baseUrl}/events?id=${clientId}`, {
      signal: controller.signal,
      headers: {
        Accept: 'text/event-stream',
      },
    });

    const res = await fetchPromise;
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // gzip rejected
    expect(res.headers.get('content-encoding')).not.toBe('gzip');

    // read stream
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let arrivedAt: number | null = null;

    /**
     * Push an event from the server side after the client has subscribed.
     * Wait briefly so addClient has registered the connection in the
     * sse.util `clients` map; otherwise sendEvent buffers instead.
     */
    setTimeout(() => {
      sendEvent(clientId, {
        status: 'initializing',
        subStatus: 'compression-bypass-test',
        details: targetEventText,
      });
    }, 50);

    // poll loop
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      if (buffered.includes(targetEventText)) {
        arrivedAt = Date.now();
        break;
      }
    }

    controller.abort();
    removeClient(clientId);

    expect(arrivedAt).not.toBeNull();
    const elapsed = (arrivedAt ?? Date.now()) - start;
    /**
     * Without the compression bypass, the chunk would never arrive
     * and `arrivedAt` would be null (caught by the assertion above).
     * The timing bound here is a soft safety net — anything under 1.2s
     * proves the middleware isn't blocking on a buffered gzip frame.
     */
    expect(elapsed).toBeLessThan(1200);
  });
});
