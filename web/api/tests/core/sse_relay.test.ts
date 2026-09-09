import { describe, it, expect, afterEach } from 'vitest';
import type { Response } from 'express';
import createRedisClient from '../../src/utils/infra/redis.util.js';
import { addClient, resetSSE } from '../../src/utils/network/sse.util.js';

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

// let async pub/sub delivery settle
const flush = () => new Promise((resolve) => setTimeout(resolve, 60));

async function relay(id: string, event: Record<string, unknown>) {
  await createRedisClient('sse-pub').publish(
    'sse:relay',
    JSON.stringify({ id, event })
  );
}

describe('SSE cross-node relay', () => {
  afterEach(() => resetSSE());

  it('delivers a relayed event to a locally-connected socket', async () => {
    const { res, writes } = mockRes();
    addClient('relay-target', res);

    // simulate another node publishing for this id
    await relay('relay-target', { status: 'success', text: 'from-other-node' });
    await flush();

    expect(writes.some((line) => line.includes('from-other-node'))).toBe(true);
  });

  it('does not deliver a relayed event to the wrong socket', async () => {
    const { res, writes } = mockRes();
    addClient('socket-A', res);

    await relay('socket-B', { status: 'success', text: 'wrong-target' });
    await flush();

    expect(writes.some((line) => line.includes('wrong-target'))).toBe(false);
  });
});
