import { describe, it, expect, vi } from 'vitest';
import {
  resumableFetchToSink,
  ResumeNotSupportedError,
  SizeMismatchError,
  EdgeFetchIncompleteError,
  type FetchLike,
  type MinimalResponse,
} from '../src/lib/resumableFetch';

const TOTAL = 100_000;
const DATA = new Uint8Array(TOTAL);
for (let i = 0; i < TOTAL; i++) DATA[i] = i & 0xff;

// reconstruct file from sink calls
function makeSink() {
  const buf = new Uint8Array(TOTAL + 1024);
  let max = 0;
  return {
    writeAt: (offset: number, chunk: Uint8Array) => {
      buf.set(chunk, offset);
      max = Math.max(max, offset + chunk.byteLength);
    },
    bytes: () => buf.subarray(0, max),
    length: () => max,
  };
}

// mock stream with optional network drop
function streamOf(
  slice: Uint8Array,
  errorAfter = -1
): ReadableStream<Uint8Array> {
  let pos = 0;
  const PIECE = 8192;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (errorAfter >= 0 && pos >= errorAfter) {
        controller.error(new Error('network drop'));
        return;
      }
      if (pos >= slice.byteLength) {
        controller.close();
        return;
      }
      let end = Math.min(pos + PIECE, slice.byteLength);
      if (errorAfter >= 0) end = Math.min(end, errorAfter);
      controller.enqueue(slice.subarray(pos, end));
      pos = end;
    },
  });
}

const resp = (
  status: number,
  headers: Record<string, string>,
  body: ReadableStream<Uint8Array> | null
): MinimalResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  body,
});

const rangeStart = (init: { headers?: Record<string, string> }): number => {
  const r = init.headers?.Range ?? init.headers?.range;
  const m = r ? /bytes=(\d+)-/u.exec(r) : null;
  return m ? Number(m[1]) : 0;
};

describe('resumableFetchToSink', () => {
  it('downloads a full file byte-for-byte (happy path, no Range)', async () => {
    const sink = makeSink();
    const fetchImpl: FetchLike = vi.fn(() =>
      Promise.resolve(
        resp(200, { 'content-length': String(TOTAL) }, streamOf(DATA))
      )
    );
    const result = await resumableFetchToSink({
      url: 'x',
      signal: new AbortController().signal,
      writeAt: sink.writeAt,
      fetchImpl,
    });
    expect(result).toEqual({ received: TOTAL, total: TOTAL });
    expect(sink.bytes()).toEqual(DATA);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('resumes after a mid-stream drop and reassembles byte-for-byte', async () => {
    const sink = makeSink();
    const DROP_AT = 40_000;
    let call = 0;
    const fetchImpl: FetchLike = vi.fn((_url, init) => {
      call += 1;
      const start = rangeStart(init as { headers?: Record<string, string> });
      if (call === 1) {
        // simulate initial drop
        return Promise.resolve(
          resp(
            200,
            { 'content-length': String(TOTAL) },
            streamOf(DATA, DROP_AT)
          )
        );
      }
      // simulate partial resume
      return Promise.resolve(
        resp(
          206,
          {
            'content-range': `bytes ${start}-${TOTAL - 1}/${TOTAL}`,
            'content-length': String(TOTAL - start),
          },
          streamOf(DATA.subarray(start))
        )
      );
    });

    const result = await resumableFetchToSink({
      url: 'x',
      signal: new AbortController().signal,
      writeAt: sink.writeAt,
      fetchImpl,
    });

    expect(result.received).toBe(TOTAL);
    expect(result.total).toBe(TOTAL);
    expect(sink.bytes()).toEqual(DATA);
    expect(call).toBeGreaterThanOrEqual(2);
    // verify resume offset matches drop
    const secondInit = (
      fetchImpl as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[1][1] as { headers?: Record<string, string> };
    expect(rangeStart(secondInit)).toBe(DROP_AT);
  });

  it('bails (no corruption) when the server ignores Range on resume (200 not 206)', async () => {
    const sink = makeSink();
    let call = 0;
    const fetchImpl: FetchLike = vi.fn(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          resp(200, { 'content-length': String(TOTAL) }, streamOf(DATA, 40_000))
        );
      }
      // reject full response on resume
      return Promise.resolve(
        resp(200, { 'content-length': String(TOTAL) }, streamOf(DATA))
      );
    });

    await expect(
      resumableFetchToSink({
        url: 'x',
        signal: new AbortController().signal,
        writeAt: sink.writeAt,
        fetchImpl,
      })
    ).rejects.toBeInstanceOf(ResumeNotSupportedError);
    // verify no data corruption
    expect(sink.length()).toBe(40_000);
  });

  it('bails on a total-size mismatch between attempts', async () => {
    const sink = makeSink();
    let call = 0;
    const fetchImpl: FetchLike = vi.fn((_url, init) => {
      call += 1;
      const start = rangeStart(init as { headers?: Record<string, string> });
      if (call === 1) {
        return Promise.resolve(
          resp(200, { 'content-length': String(TOTAL) }, streamOf(DATA, 40_000))
        );
      }
      // simulate size mismatch
      const bogusTotal = TOTAL + 5;
      return Promise.resolve(
        resp(
          206,
          {
            'content-range': `bytes ${start}-${bogusTotal - 1}/${bogusTotal}`,
            'content-length': String(bogusTotal - start),
          },
          streamOf(DATA.subarray(start))
        )
      );
    });

    await expect(
      resumableFetchToSink({
        url: 'x',
        signal: new AbortController().signal,
        writeAt: sink.writeAt,
        fetchImpl,
      })
    ).rejects.toBeInstanceOf(SizeMismatchError);
  });

  it('gives up with EdgeFetchIncomplete when resume never makes progress', async () => {
    const sink = makeSink();
    const fetchImpl: FetchLike = vi.fn((_url, init) => {
      const start = rangeStart(init as { headers?: Record<string, string> });
      if (start === 0) {
        return Promise.resolve(
          resp(200, { 'content-length': String(TOTAL) }, streamOf(DATA, 10_000))
        );
      }
      // simulate stalled resume
      return Promise.resolve(
        resp(
          206,
          {
            'content-range': `bytes ${start}-${TOTAL - 1}/${TOTAL}`,
            'content-length': String(TOTAL - start),
          },
          streamOf(DATA.subarray(start), 0)
        )
      );
    });

    await expect(
      resumableFetchToSink({
        url: 'x',
        signal: new AbortController().signal,
        writeAt: sink.writeAt,
        fetchImpl,
        maxAttempts: 3,
      })
    ).rejects.toBeInstanceOf(EdgeFetchIncompleteError);
  });

  it('stops promptly on abort', async () => {
    const sink = makeSink();
    const ac = new AbortController();
    const fetchImpl: FetchLike = vi.fn(() =>
      Promise.resolve(
        resp(
          200,
          { 'content-length': String(TOTAL) },
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (ac.signal.aborted) {
                controller.error(
                  Object.assign(new Error('aborted'), { name: 'AbortError' })
                );
                return;
              }
              controller.enqueue(DATA.subarray(0, 8192));
              // trigger abort during stream
              ac.abort();
            },
          })
        )
      )
    );

    await expect(
      resumableFetchToSink({
        url: 'x',
        signal: ac.signal,
        writeAt: sink.writeAt,
        fetchImpl,
        maxAttempts: 3,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
