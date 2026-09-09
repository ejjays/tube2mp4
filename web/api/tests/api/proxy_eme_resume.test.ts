import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request } from 'express';
import { Readable } from 'node:stream';
import type { Format } from '../../src/types/index.js';

/* **** small size ensures supertest completion while clen > 16mb triggers chunking **** */
const SIZE = 100_000n;

vi.mock('../../src/services/ytdlp/chunked-fetcher.js', () => ({
  resolveFinalUrl: vi.fn((url: string) => Promise.resolve(url)),
  fetchChunked: vi.fn((opts?: { start?: bigint }) => {
    const start = opts?.start ?? 0n;
    const remaining = Number(SIZE - start);
    return Promise.resolve({
      // ensure stream matches expected content length
      stream: Readable.from([Buffer.alloc(remaining, 7)]),
      size: SIZE,
      contentType: 'video/mp4',
    });
  }),
}));

import app from '../../src/app.js';
import { buildProxyUrl } from '../../src/utils/media/stream.util.js';
import { fetchChunked } from '../../src/services/ytdlp/chunked-fetcher.js';

const reqStub = {
  headers: {},
  get: () => 'localhost:5000',
  protocol: 'http',
} as unknown as Request;

// trigger chunking with large content length
const directFormat = {
  formatId: '313',
  extension: 'mp4',
  url: 'https://r1.googlevideo.com/videoplayback?id=xyz&clen=20000000&mime=video%2Fmp4',
} as unknown as Format;

const emePathOf = (signed: string): string => {
  const url = new URL(signed);
  return `${url.pathname}${url.search}&via=eme`;
};
const lastStart = (): bigint | undefined =>
  (
    vi.mocked(fetchChunked).mock.calls.at(-1)?.[0] as
      | { start?: bigint }
      | undefined
  )?.start;

describe('/proxy EME resume (Range -> 206)', () => {
  beforeEach(() => vi.mocked(fetchChunked).mockClear());

  it('serves 200 + full Content-Length when no Range header', async () => {
    const signed = buildProxyUrl(
      reqStub,
      directFormat,
      'https://youtube.com/watch?v=abc'
    ) as string;

    const res = await request(app).get(emePathOf(signed));

    expect(res.status).toBe(200);
    expect(res.headers['content-length']).toBe(String(SIZE));
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-range']).toBeUndefined();
    expect(lastStart()).toBe(0n);
  });

  it('honors Range with 206 + Content-Range and starts the fetch at the offset', async () => {
    const signed = buildProxyUrl(
      reqStub,
      directFormat,
      'https://youtube.com/watch?v=abc'
    ) as string;
    const START = 40_000;

    const res = await request(app)
      .get(emePathOf(signed))
      .set('Range', `bytes=${START}-`);

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(
      `bytes ${START}-${SIZE - 1n}/${SIZE}`
    );
    expect(res.headers['content-length']).toBe(String(SIZE - BigInt(START)));
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(lastStart()).toBe(BigInt(START));
  });
});
