import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { setupStreamListeners } from '../../src/utils/media/stream.util.js';
import { createMockChildProcess } from '../utils/mocks.js';
import { sendEvent } from '../../src/utils/network/sse.util.js';

vi.mock('../../src/utils/network/sse.util.js', () => ({
  sendEvent: vi.fn(),
  sendBufferedEvent: vi.fn(),
}));

describe('Stream backpressure handling', () => {
  it('handles a chunk burst without losing bytes and flushes on end', async () => {
    const proc = createMockChildProcess();

    const res = new PassThrough();
    Object.assign(res, {
      headersSent: false,
      status: vi.fn(() => res),
      json: vi.fn(() => res),
      socket: { setKeepAlive: vi.fn(), destroyed: false },
    });

    const totalBytes = { value: 0 };

    setupStreamListeners(
      proc.stdout as unknown as import('node:stream').Readable,
      res as never,
      'test-client-id',
      totalBytes
    );

    const chunk = Buffer.alloc(64, 'x');
    for (let i = 0; i < 50; i++) proc.stdout.write(chunk);
    proc.stdout.end();

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(totalBytes.value).toBe(chunk.length * 50);
    const completed = vi
      .mocked(sendEvent)
      .mock.calls.map((call) => call[1])
      .find((evt) => evt?.status === 'completed');
    expect(completed).toMatchObject({ progress: 100 });
  });
});
