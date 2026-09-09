import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

vi.mock('undici', () => ({
  request: vi.fn(),
  getGlobalDispatcher: vi.fn(() => ({ compose: () => ({}) })),
  interceptors: { redirect: vi.fn(() => ({})) },
}));

vi.mock('../../src/utils/network/security.util.js', () => ({
  resolveAndValidateHost: vi.fn().mockResolvedValue('142.250.0.1'),
}));

import { request } from 'undici';
import {
  fetchChunked,
  _internals,
} from '../../src/services/ytdlp/chunked-fetcher.js';

const mockedRequest = vi.mocked(request);

// undici response shape for test stubs
function makeResponse(opts: {
  statusCode: number;
  body?: Buffer | Buffer[];
  contentLength?: bigint;
  contentType?: string;
}) {
  const chunks = Array.isArray(opts.body)
    ? opts.body
    : opts.body
      ? [opts.body]
      : [];
  const headers: Record<string, string> = {};
  if (opts.contentLength !== undefined) {
    headers['content-length'] = String(opts.contentLength);
  }
  if (opts.contentType) headers['content-type'] = opts.contentType;

  // readable supports drain and async iteration
  const body = Readable.from(
    chunks.length ? chunks : [Buffer.alloc(0)]
  ) as Readable & { dump: () => Promise<void> };
  body.dump = () => {
    body.resume();
    return Promise.resolve();
  };

  return { statusCode: opts.statusCode, headers, body } as unknown as Awaited<
    ReturnType<typeof request>
  >;
}

async function consume(stream: Readable): Promise<Buffer> {
  const buffers: Buffer[] = [];
  for await (const chunk of stream) buffers.push(chunk as Buffer);
  return Buffer.concat(buffers);
}

const STUB_URL = 'https://googlevideo.com/test?v=abc';
const TOTAL_BYTES = 20_000_000n;
const CHUNK = _internals.CHUNK_SIZE;

const stubProvider =
  (url = STUB_URL) =>
  () =>
    Promise.resolve({ url });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('chunked-fetcher: cobalt parity', () => {
  it('1. uses 8MB Range chunks with bytes=N-N+CHUNK format', async () => {
    const fakeBody = Buffer.alloc(Number(CHUNK), 0xab);
    const finalBody = Buffer.alloc(Number(TOTAL_BYTES - CHUNK * 2n), 0xcd);

    mockedRequest
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          contentLength: TOTAL_BYTES,
          contentType: 'video/mp4',
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: fakeBody,
          contentLength: CHUNK,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: fakeBody,
          contentLength: CHUNK,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: finalBody,
          contentLength: TOTAL_BYTES - CHUNK * 2n,
        })
      );

    const { stream, size } = await fetchChunked({
      urlProvider: stubProvider(),
    });

    expect(size).toBe(TOTAL_BYTES);
    await consume(stream);

    const ranges = mockedRequest.mock.calls
      .slice(1)
      .map(
        (call) => (call[1] as { headers: Record<string, string> }).headers.range
      );

    expect(ranges[0]).toBe(`bytes=0-${CHUNK}`);
    expect(ranges[1]).toBe(`bytes=${CHUNK}-${CHUNK * 2n}`);
    expect(ranges[2]).toBe(`bytes=${CHUNK * 2n}-${CHUNK * 3n}`);
  });

  it('2. pre-flight HEAD calls transplant on 403 and retries', async () => {
    const transplant = vi.fn(() => Promise.resolve());

    mockedRequest
      .mockResolvedValueOnce(makeResponse({ statusCode: 403 }))
      .mockResolvedValueOnce(makeResponse({ statusCode: 403 }))
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, contentLength: 1000n })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: Buffer.alloc(1000),
          contentLength: 1000n,
        })
      );

    const { size } = await fetchChunked({
      urlProvider: stubProvider(),
      transplant,
    });

    expect(size).toBe(1000n);
    expect(transplant).toHaveBeenCalledTimes(2);
    expect(mockedRequest.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(mockedRequest.mock.calls[1][1]).toMatchObject({ method: 'GET' });
    expect(mockedRequest.mock.calls[2][1]).toMatchObject({ method: 'GET' });
  });

  it('2b. pre-flight HEAD bails after PREFLIGHT_HEAD_ATTEMPTS exhausted', async () => {
    const transplant = vi.fn(() => Promise.resolve());

    for (let i = 0; i < _internals.PREFLIGHT_HEAD_ATTEMPTS; i++) {
      mockedRequest.mockResolvedValueOnce(makeResponse({ statusCode: 403 }));
    }

    await expect(
      fetchChunked({
        urlProvider: stubProvider(),
        transplant,
      })
    ).rejects.toThrow(/pre-flight failed/u);

    expect(transplant).toHaveBeenCalledTimes(
      _internals.PREFLIGHT_HEAD_ATTEMPTS
    );
  });

  it('3. in-flight 403 only triggers transplant after debounce', async () => {
    const transplant = vi.fn(() => Promise.resolve());
    const totalSize = CHUNK * 5n;
    const fullChunk = Buffer.alloc(Number(CHUNK), 0xff);

    mockedRequest
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, contentLength: totalSize })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: fullChunk,
          contentLength: CHUNK,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: fullChunk,
          contentLength: CHUNK,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: fullChunk,
          contentLength: CHUNK,
        })
      )
      .mockResolvedValueOnce(makeResponse({ statusCode: 403 }))
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: fullChunk,
          contentLength: CHUNK,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: fullChunk,
          contentLength: CHUNK,
        })
      );

    const { stream } = await fetchChunked({
      urlProvider: stubProvider(),
      transplant,
    });
    await consume(stream);

    expect(transplant).toHaveBeenCalledTimes(1);
  });

  it('4. truncation guard aborts when received < expected/2', async () => {
    const totalSize = CHUNK * 2n;
    mockedRequest
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, contentLength: totalSize })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: Buffer.alloc(1),
          contentLength: 1n,
        })
      );

    const { stream } = await fetchChunked({
      urlProvider: stubProvider(),
    });

    await expect(consume(stream)).rejects.toThrow(/truncated chunk/u);
  });

  it('5. abort signal stops chunk loop mid-stream', async () => {
    const totalSize = CHUNK * 4n;
    const fullChunk = Buffer.alloc(Number(CHUNK), 0xee);
    const controller = new AbortController();

    mockedRequest.mockImplementation((_url, opts) => {
      const method = (opts as { method?: string })?.method;
      if (method === 'HEAD') {
        return Promise.resolve(
          makeResponse({ statusCode: 200, contentLength: totalSize })
        );
      }
      if (controller.signal.aborted) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }
      return Promise.resolve(
        makeResponse({
          statusCode: 200,
          body: fullChunk,
          contentLength: CHUNK,
        })
      );
    });

    const { stream } = await fetchChunked({
      urlProvider: stubProvider(),
      controller,
    });

    let bytesRead = 0;
    const consumePromise = (async () => {
      try {
        for await (const chunk of stream) {
          bytesRead += (chunk as Buffer).length;
          if (bytesRead >= Number(CHUNK)) controller.abort();
        }
      } catch {
        // expected on abort
      }
    })();

    await consumePromise;
    expect(bytesRead).toBeGreaterThanOrEqual(Number(CHUNK));
    expect(bytesRead).toBeLessThan(Number(totalSize));
  });

  it('6. urlProvider is called fresh on each request', async () => {
    const urls = [
      'https://googlevideo.com/v1?u=1',
      'https://googlevideo.com/v2?u=2',
      'https://googlevideo.com/v3?u=3',
      'https://googlevideo.com/v4?u=4',
    ];
    let idx = 0;
    const urlProvider = vi.fn(() =>
      Promise.resolve({ url: urls[idx++] || urls[0] })
    );

    const totalSize = CHUNK * 2n + 100n;
    const fullChunk = Buffer.alloc(Number(CHUNK), 0xaa);
    const tail = Buffer.alloc(100);

    mockedRequest
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, contentLength: totalSize })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: fullChunk,
          contentLength: CHUNK,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 200,
          body: fullChunk,
          contentLength: CHUNK,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, body: tail, contentLength: 100n })
      );

    const { stream } = await fetchChunked({ urlProvider });
    await consume(stream);

    expect(urlProvider).toHaveBeenCalledTimes(4);
  });

  it('7. youtube headers include referer/origin by default', () => {
    const headers = _internals.buildDefaultHeaders('youtube');
    expect(headers.referer).toBe('https://www.youtube.com/');
    expect(headers.origin).toBe('https://www.youtube.com');
    expect(headers['user-agent']).toBeDefined();
  });

  it('8. non-youtube service does not inject youtube headers', () => {
    const headers = _internals.buildDefaultHeaders('vk');
    expect(headers.referer).toBeUndefined();
    expect(headers.origin).toBeUndefined();
  });

  it('9. accepts HTTP 206 Partial Content from chunk GETs', async () => {
    const totalSize = CHUNK * 2n;
    const fullChunk = Buffer.alloc(Number(CHUNK), 0x11);

    mockedRequest
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, contentLength: totalSize })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 206,
          body: fullChunk,
          contentLength: CHUNK,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          statusCode: 206,
          body: fullChunk,
          contentLength: CHUNK,
        })
      );

    const { stream, size } = await fetchChunked({
      urlProvider: stubProvider(),
    });
    expect(size).toBe(totalSize);

    const collected = await consume(stream);
    expect(collected).toHaveLength(Number(totalSize));
  });

  it('10. debounce counter resets after transplant fires', async () => {
    const transplant = vi.fn(() => Promise.resolve());
    const totalSize = CHUNK * 8n;
    const fullChunk = Buffer.alloc(Number(CHUNK), 0x22);

    mockedRequest
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, contentLength: totalSize })
      )
      // chunks 1-3 succeed; counter reaches 3
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, body: fullChunk, contentLength: CHUNK })
      )
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, body: fullChunk, contentLength: CHUNK })
      )
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, body: fullChunk, contentLength: CHUNK })
      )
      // first 403 triggers transplant
      .mockResolvedValueOnce(makeResponse({ statusCode: 403 }))
      // chunk 4 retry succeeds, counter=1
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, body: fullChunk, contentLength: CHUNK })
      )
      // second 403 below debounce
      .mockResolvedValueOnce(makeResponse({ statusCode: 403 }))
      // 403 body yielded empty bytes
      // loop continues from same offset
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, body: fullChunk, contentLength: CHUNK })
      )
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, body: fullChunk, contentLength: CHUNK })
      )
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, body: fullChunk, contentLength: CHUNK })
      )
      .mockResolvedValueOnce(
        makeResponse({ statusCode: 200, body: fullChunk, contentLength: CHUNK })
      );

    const { stream } = await fetchChunked({
      urlProvider: stubProvider(),
      transplant,
    });
    try {
      await consume(stream);
    } catch {
      // assertion focuses on transplant count only
    }

    // exactly one transplant fired despite multiple 403s
    expect(transplant).toHaveBeenCalledTimes(1);
  });

  it('advances by actual bytes when a chunk lacks content-length', async () => {
    const totalSize = CHUNK * 2n; // 16MB
    const halfChunk = Number(CHUNK / 2n); // 4MB delivered per GET
    mockedRequest.mockImplementation((_url, opts) => {
      const range = (opts as { headers?: { range?: string } })?.headers?.range;
      // pre-flight probe carries the total size
      if (range === 'bytes=0-0') {
        return Promise.resolve(
          makeResponse({ statusCode: 206, contentLength: totalSize })
        );
      }
      // chunked transfer-encoding: body present, NO content-length header
      return Promise.resolve(
        makeResponse({ statusCode: 200, body: Buffer.alloc(halfChunk, 0x01) })
      );
    });

    const { stream, size } = await fetchChunked({
      urlProvider: stubProvider(),
    });
    expect(size).toBe(totalSize);
    const collected = await consume(stream);
    expect(collected).toHaveLength(Number(totalSize));
  });
});

describe('chunked-fetcher: transplant cap', () => {
  it('throws after the transplant limit on persistent 403', async () => {
    mockedRequest.mockImplementation(() =>
      Promise.resolve(makeResponse({ statusCode: 403 }))
    );
    const transplant = vi.fn().mockResolvedValue();
    const controller = new AbortController();
    const gen = _internals.readChunks(
      { urlProvider: stubProvider(), transplant, service: 'youtube' },
      1_000_000_000n,
      controller
    );

    await expect(
      (async () => {
        let next = await gen.next();
        while (!next.done) next = await gen.next();
      })()
    ).rejects.toThrow(/transplant limit/u);

    // bounded re-resolution, not infinite
    expect(transplant.mock.calls.length).toBeLessThanOrEqual(6);
  });
});
