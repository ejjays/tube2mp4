/**
 * resume-on-drop fetch for EME downloads.
 * safety checks prevent corruption via 206 status and size locks.
 */

export interface MinimalResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}

export type FetchLike = (
  url: string,
  init: { signal?: AbortSignal; headers?: Record<string, string> }
) => Promise<MinimalResponse>;

export interface ResumableFetchOptions {
  url: string;
  signal: AbortSignal;
  writeAt: (offset: number, chunk: Uint8Array) => void | Promise<void>;
  onProgress?: (received: number, total: number) => void;
  onFlush?: (offset: number) => void | Promise<void>;
  flushEvery?: number;
  maxAttempts?: number;
  startOffset?: number;
  fetchImpl?: FetchLike;
}

export interface ResumableFetchResult {
  received: number;
  total: number;
}

export class ResumeNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumeNotSupported';
  }
}

export class SizeMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeResumeMismatch';
  }
}

export class EdgeFetchIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeFetchIncomplete';
  }
}

const abortError = (): Error => {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
};

const backoff = (attempt: number): number => Math.min(400 * attempt, 3000);
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const totalFromResponse = (res: MinimalResponse): number => {
  if (res.status === 206) {
    const cr = res.headers.get('content-range');
    const match = cr ? /\/(\d+)\s*$/u.exec(cr) : null;
    return match ? Number(match[1]) : 0;
  }
  return Number(res.headers.get('content-length')) || 0;
};

async function pumpStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  opts: ResumableFetchOptions,
  state: { offset: number; total: number; flushedAt: number }
): Promise<boolean> {
  const { signal, writeAt, onProgress, onFlush, flushEvery = 0 } = opts;
  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (readErr) {
        if (signal.aborted) throw readErr;
        return true;
      }
      if (result.done) break;
      const { value } = result;
      if (value && value.byteLength > 0) {
        await writeAt(state.offset, value);
        state.offset += value.byteLength;
        if (
          flushEvery > 0 &&
          onFlush &&
          state.offset - state.flushedAt >= flushEvery
        ) {
          await onFlush(state.offset);
          state.flushedAt = state.offset;
        }
        onProgress?.(state.offset, state.total);
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  return false;
}

export async function resumableFetchToSink(
  opts: ResumableFetchOptions
): Promise<ResumableFetchResult> {
  const {
    url,
    signal,
    onProgress,
    onFlush,
    maxAttempts = 5,
    startOffset = 0,
    fetchImpl = fetch as unknown as FetchLike,
  } = opts;

  const state = { offset: startOffset, total: 0, flushedAt: startOffset };
  let attempt = 0;

  const giveUp = (): never => {
    if (state.total > 0 && state.offset < state.total) {
      throw new EdgeFetchIncompleteError(
        `incomplete after retries: ${state.offset}/${state.total}`
      );
    }
    throw new Error('resumable fetch stalled with no progress');
  };

  for (;;) {
    if (signal.aborted) throw abortError();

    const offsetAtStart = state.offset;
    const isResume = state.offset > 0;

    let response: MinimalResponse;
    try {
      response = await fetchImpl(url, {
        signal,
        headers: isResume ? { Range: `bytes=${state.offset}-` } : {},
      });
    } catch (err) {
      if (signal.aborted) throw err;
      attempt += 1;
      if (attempt >= maxAttempts) throw err;
      await sleep(backoff(attempt));
      continue;
    }

    if (!response.ok || !response.body) {
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw new Error(`resumable fetch failed: status ${response.status}`);
      }
      await sleep(backoff(attempt));
      continue;
    }

    if (isResume && response.status !== 206) {
      throw new ResumeNotSupportedError(
        `resume expected 206, got ${response.status}`
      );
    }

    const respTotal = totalFromResponse(response);
    if (respTotal > 0) {
      if (state.total === 0) state.total = respTotal;
      else if (respTotal !== state.total) {
        throw new SizeMismatchError(
          `size changed mid-download: ${respTotal} != ${state.total}`
        );
      }
    }

    const dropped = await pumpStream(response.body.getReader(), opts, state);

    const madeProgress = state.offset > offsetAtStart;

    if (!dropped && (state.total === 0 || state.offset >= state.total)) {
      if (onFlush && state.offset > state.flushedAt) {
        await onFlush(state.offset);
      }
      onProgress?.(state.offset, state.total);
      return { received: state.offset, total: state.total };
    }

    attempt = madeProgress ? 0 : attempt + 1;
    if (attempt >= maxAttempts) giveUp();
    await sleep(backoff(attempt));
  }
}
