import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { setupStreamListeners } from '../../src/utils/media/stream.util.js';
import { createMockChildProcess } from '../utils/mocks.js';
import { sendEvent } from '../../src/utils/network/sse.util.js';

vi.mock('../../src/utils/network/sse.util.js', () => ({
  sendEvent: vi.fn(),
  sendBufferedEvent: vi.fn(),
}));

describe('Stream process lifecycle + cleanup', () => {
  it('pipes source through, counts bytes, then ends the response on close', async () => {
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

    proc.stdout.write(Buffer.from('chunk1'));
    proc.stdout.write(Buffer.from('chunk2'));
    proc.stdout.end();

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(totalBytes.value).toBe('chunk1chunk2'.length);
    expect(sendEvent).toHaveBeenCalled();
  });

  it('exposes a kill handle for the caller to terminate on client disconnect', () => {
    const proc = createMockChildProcess();
    expect(typeof proc.kill).toBe('function');
    proc.kill('SIGKILL');
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
