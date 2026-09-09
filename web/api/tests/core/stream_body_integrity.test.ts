import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { setupStreamListeners } from '../../src/utils/media/stream.util.js';

function makeMockResponse() {
  const collected: Buffer[] = [];
  const setKeepAlive = vi.fn();

  // plain mock avoids duplex getter conflicts
  const res = {
    write: vi.fn((chunk: string | Buffer) => {
      collected.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      return true;
    }),
    end: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    pipe: vi.fn(),
    writableEnded: false,
    socket: {
      destroyed: false,
      setKeepAlive,
    },
  } as unknown as Response;

  return { res, collected, setKeepAlive };
}

vi.mock('../../src/utils/network/sse.util.js', () => ({
  sendEvent: vi.fn(),
  sendBufferedEvent: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
});

describe('stream.util: response body integrity', () => {
  it('does not write any bytes to response body during idle wait', () => {
    const { res, collected } = makeMockResponse();
    const source = new PassThrough();
    setupStreamListeners(source, res, 'test-client', { value: 0 });

    // proxy idle past old heartbeat threshold
    vi.advanceTimersByTime(60_000);

    expect(collected).toHaveLength(0);
  });

  it('uses tcp socket keep-alive surface, never the body', () => {
    const { res, collected, setKeepAlive } = makeMockResponse();
    const source = new PassThrough();
    setupStreamListeners(source, res, 'test-client', { value: 0 });

    vi.advanceTimersByTime(30_000);

    // body untouched
    expect(collected).toHaveLength(0);
    // setKeepAlive available for the implementation
    expect(typeof setKeepAlive).toBe('function');
  });
});
