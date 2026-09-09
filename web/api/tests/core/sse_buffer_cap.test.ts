import { describe, it, expect, afterEach } from 'vitest';
import type { Response } from 'express';
import {
  sendEvent,
  addClient,
  resetSSE,
} from '../../src/utils/network/sse.util.js';

function mockRes() {
  const writes: string[] = [];
  const res = {
    setHeader() {},
    getHeader() {
      return undefined;
    },
    writeHead() {},
    write(chunk: string) {
      writes.push(chunk);
      return true;
    },
    on() {},
  };
  return { res: res as unknown as Response, writes };
}

describe('SSE buffer is bounded for disconnected clients', () => {
  afterEach(() => resetSSE());

  it('replays at most the cap of buffered events on connect', () => {
    const id = 'never-connected';
    for (let i = 0; i < 300; i++) {
      sendEvent(id, { status: 'progress', progress: i });
    }
    const { res, writes } = mockRes();
    addClient(id, res);

    const dataWrites = writes.filter((line) => line.startsWith('data:'));
    expect(dataWrites.length).toBeLessThanOrEqual(100);
  });
});
