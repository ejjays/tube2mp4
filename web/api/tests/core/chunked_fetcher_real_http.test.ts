import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

// allow 127.0.0.1 past ssrf guard
vi.mock('../../src/utils/network/security.util.js', () => ({
  resolveAndValidateHost: vi.fn().mockResolvedValue('127.0.0.1'),
}));

import { fetchChunked } from '../../src/services/ytdlp/chunked-fetcher.js';

const TOTAL_SIZE = 9_000_000;
const TEST_DATA = Buffer.alloc(TOTAL_SIZE);
for (let i = 0; i < TOTAL_SIZE; i++) TEST_DATA[i] = i & 0xff;

let server: http.Server;
let baseUrl: string;
let stale403Count = 0;

function handleRange(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const range = req.headers.range;
  const match = range?.match(/bytes=(\d+)-(\d+)?/u);
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

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const isStale = req.url?.startsWith('/stale');
  if (isStale && stale403Count < 1) {
    stale403Count++;
    res.statusCode = 403;
    res.end();
    return;
  }

  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.setHeader('content-length', String(TOTAL_SIZE));
    res.setHeader('content-type', 'video/mp4');
    res.end();
    return;
  }

  handleRange(req, res);
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
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
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

beforeEach(() => {
  stale403Count = 0;
});

describe('chunked-fetcher: real HTTP integration', () => {
  it('downloads multi-chunk file with full byte integrity', async () => {
    const url = `${baseUrl}/fresh`;
    const { stream, size, contentType } = await fetchChunked({
      urlProvider: () => Promise.resolve({ url }),
    });

    expect(size).toBe(BigInt(TOTAL_SIZE));
    expect(contentType).toBe('video/mp4');

    const collected = await consume(stream);
    expect(collected).toHaveLength(TOTAL_SIZE);
    expect(collected.equals(TEST_DATA)).toBe(true);
  });

  it('handles real 206 Partial Content with correct Range slices', async () => {
    const url = `${baseUrl}/fresh`;
    const { stream } = await fetchChunked({
      urlProvider: () => Promise.resolve({ url }),
    });
    const collected = await consume(stream);

    // first chunk should match TEST_DATA[0..8M]
    expect(collected.subarray(0, 100).equals(TEST_DATA.subarray(0, 100))).toBe(
      true
    );
    // boundary across chunks
    expect(
      collected
        .subarray(7_999_900, 8_000_100)
        .equals(TEST_DATA.subarray(7_999_900, 8_000_100))
    ).toBe(true);
    // last chunk tail
    expect(
      collected
        .subarray(TOTAL_SIZE - 100)
        .equals(TEST_DATA.subarray(TOTAL_SIZE - 100))
    ).toBe(true);
  });

  it('transplant fires on real 403 HEAD and recovers', async () => {
    let currentUrl = `${baseUrl}/stale`;
    const transplant = vi.fn(() => {
      currentUrl = `${baseUrl}/fresh`;
      return Promise.resolve();
    });

    const { stream, size } = await fetchChunked({
      urlProvider: () => Promise.resolve({ url: currentUrl }),
      transplant,
    });

    expect(size).toBe(BigInt(TOTAL_SIZE));

    const collected = await consume(stream);
    expect(collected).toHaveLength(TOTAL_SIZE);
    expect(collected.equals(TEST_DATA)).toBe(true);
    expect(transplant).toHaveBeenCalledTimes(1);
  });

  it('aborts mid-stream releases connection cleanly', async () => {
    const url = `${baseUrl}/fresh`;
    const controller = new AbortController();
    const { stream } = await fetchChunked({
      urlProvider: () => Promise.resolve({ url }),
      controller,
    });

    let bytesRead = 0;
    try {
      for await (const chunk of stream) {
        bytesRead += (chunk as Buffer).length;
        if (bytesRead >= 4_000_000) {
          controller.abort();
          break;
        }
      }
    } catch {
      // expected when abort interrupts iteration
    }

    expect(bytesRead).toBeGreaterThanOrEqual(4_000_000);
    expect(bytesRead).toBeLessThan(TOTAL_SIZE);
  });
});
