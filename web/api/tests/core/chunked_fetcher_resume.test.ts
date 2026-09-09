import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

// allow 127.0.0.1 past the ssrf guard
vi.mock('../../src/utils/network/security.util.js', () => ({
  resolveAndValidateHost: vi.fn().mockResolvedValue('127.0.0.1'),
}));

import { fetchChunked } from '../../src/services/ytdlp/chunked-fetcher.js';

const TOTAL_SIZE = 9_000_000;
const TEST_DATA = Buffer.alloc(TOTAL_SIZE);
for (let i = 0; i < TOTAL_SIZE; i++) TEST_DATA[i] = i & 0xff;

let server: http.Server;
let baseUrl: string;

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.setHeader('content-length', String(TOTAL_SIZE));
    res.setHeader('content-type', 'video/mp4');
    res.end();
    return;
  }
  const match = req.headers.range?.match(/bytes=(\d+)-(\d+)?/u);
  if (!match) {
    res.statusCode = 200;
    res.setHeader('content-length', String(TOTAL_SIZE));
    res.end(TEST_DATA);
    return;
  }
  const start = parseInt(match[1], 10);
  const end = match[2]
    ? Math.min(parseInt(match[2], 10), TOTAL_SIZE - 1)
    : TOTAL_SIZE - 1;
  const slice = TEST_DATA.subarray(start, end + 1);
  res.statusCode = 206;
  res.setHeader('content-length', String(slice.length));
  res.setHeader('content-range', `bytes ${start}-${end}/${TOTAL_SIZE}`);
  res.setHeader('content-type', 'video/mp4');
  res.end(slice);
}

async function consume(stream: Readable): Promise<Buffer> {
  const buffers: Buffer[] = [];
  for await (const chunk of stream) buffers.push(chunk as Buffer);
  return Buffer.concat(buffers);
}

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer(handleRequest);
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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

describe('chunked-fetcher: resume from a start offset', () => {
  it('reports total size but streams only the tail from `start`', async () => {
    const start = 5_000_001n; // deliberately mid-chunk and odd
    const { stream, size } = await fetchChunked({
      urlProvider: () => Promise.resolve({ url: `${baseUrl}/fresh` }),
      start,
    });

    // size reports total not remaining bytes
    expect(size).toBe(BigInt(TOTAL_SIZE));

    const collected = await consume(stream);
    expect(collected).toHaveLength(TOTAL_SIZE - Number(start));
    // verify data matches original file tail
    expect(collected.equals(TEST_DATA.subarray(Number(start)))).toBe(true);
  });

  it('start=0 streams the whole file (unchanged behavior)', async () => {
    const { stream, size } = await fetchChunked({
      urlProvider: () => Promise.resolve({ url: `${baseUrl}/fresh` }),
      start: 0n,
    });
    expect(size).toBe(BigInt(TOTAL_SIZE));
    const collected = await consume(stream);
    expect(collected).toHaveLength(TOTAL_SIZE);
    expect(collected.equals(TEST_DATA)).toBe(true);
  });

  it('rejects a start offset at/after the end', async () => {
    await expect(
      fetchChunked({
        urlProvider: () => Promise.resolve({ url: `${baseUrl}/fresh` }),
        start: BigInt(TOTAL_SIZE),
      })
    ).rejects.toThrow(/start .* >= size/u);
  });
});
