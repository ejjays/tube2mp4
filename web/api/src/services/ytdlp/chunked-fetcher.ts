import { Readable } from 'node:stream';
import { logger } from '../../utils/infra/logger.util.js';
import {
  request,
  interceptors,
  getGlobalDispatcher,
  type Dispatcher,
} from 'undici';
import { resolveAndValidateHost } from '../../utils/network/security.util.js';
import { USER_AGENT } from './config.js';

const CHUNK_SIZE = 8_000_000n;
const TRANSPLANT_DEBOUNCE = 3;
const MAX_TRANSPLANTS = 5;
const PREFLIGHT_HEAD_ATTEMPTS = 3;
const MAX_DROP_RETRIES = 5;

const minBig = (x: bigint, y: bigint): bigint => (x < y ? x : y);

export interface UrlSource {
  url: string;
  headers?: Record<string, string>;
}

export interface ChunkedFetchOptions {
  urlProvider: () => Promise<UrlSource>;
  // recover from expired media URLs
  transplant?: () => Promise<void>;
  controller?: AbortController;
  dispatcher?: Dispatcher;
  service?: string;
  start?: bigint;
}
export interface ChunkedFetchResult {
  stream: Readable;
  size: bigint;
  contentType?: string;
}

function buildDefaultHeaders(service: string): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    accept: '*/*',
  };
  if (service === 'youtube') {
    headers.referer = 'https://www.youtube.com/';
    headers.origin = 'https://www.youtube.com';
  }
  return headers;
}

function parseTotalSize(
  headers: Record<string, string | string[] | undefined>
): bigint {
  const cr = headers['content-range'];
  if (typeof cr === 'string') {
    const match = /\/(\d+)\s*$/u.exec(cr);
    if (match) return BigInt(match[1]);
  }
  const len = headers['content-length'];
  return typeof len === 'string' ? BigInt(len) : 0n;
}

async function preflightHead(
  opts: ChunkedFetchOptions,
  controller: AbortController
): Promise<{ url: string; size: bigint; contentType?: string }> {
  const defaults = buildDefaultHeaders(opts.service || 'youtube');
  let attempts = PREFLIGHT_HEAD_ATTEMPTS;
  let lastUrl = '';

  while (attempts-- > 0) {
    const { url, headers } = await opts.urlProvider();
    lastUrl = url;
    // prevent SSRF attacks
    await resolveAndValidateHost(new URL(url).hostname);

    // range probe; phone relay lacks HEAD
    const response = await request(url, {
      method: 'GET',
      headers: { ...defaults, ...(headers || {}), range: 'bytes=0-0' },
      dispatcher: opts.dispatcher,
      signal: controller.signal,
    });
    await response.body.dump().catch(() => {});

    if (response.statusCode === 403 && opts.transplant) {
      try {
        await opts.transplant();
        continue;
      } catch {
        break;
      }
    }

    if (response.statusCode === 200 || response.statusCode === 206) {
      const ct = response.headers['content-type'];
      const contentType = typeof ct === 'string' ? ct : undefined;
      const size = parseTotalSize(response.headers);
      if (size > 0n) return { url, size, contentType };
    }

    break;
  }

  throw new Error(
    `chunked-fetcher: pre-flight failed (last url=${lastUrl.substring(0, 80)})`
  );
}

async function* readChunks(
  opts: ChunkedFetchOptions,
  size: bigint,
  controller: AbortController,
  start = 0n
): AsyncGenerator<Buffer> {
  const defaults = buildDefaultHeaders(opts.service || 'youtube');
  let read = start;
  let chunksSinceTransplant = 0;
  let transplantCount = 0;
  let dropRetries = 0;
  // combine simultaneous transplant requests
  let pendingTransplant: Promise<void> | null = null;

  while (read < size) {
    if (controller.signal.aborted) {
      throw new Error('chunked-fetcher: aborted');
    }

    const { url, headers } = await opts.urlProvider();
    const rangeEnd = read + CHUNK_SIZE;

    const response = await request(url, {
      method: 'GET',
      headers: {
        ...defaults,
        ...(headers || {}),
        range: `bytes=${read}-${rangeEnd}`,
      },
      dispatcher: opts.dispatcher,
      signal: controller.signal,
    });

    if (
      response.statusCode === 403 &&
      chunksSinceTransplant >= TRANSPLANT_DEBOUNCE &&
      opts.transplant
    ) {
      // prevent infinite 403 retries
      if (++transplantCount > MAX_TRANSPLANTS) {
        controller.abort();
        throw new Error(
          'chunked-fetcher: transplant limit reached (persistent 403)'
        );
      }
      chunksSinceTransplant = 0;
      response.body.on('data', () => {}).on('error', () => {});

      try {
        if (!pendingTransplant) {
          pendingTransplant = opts.transplant();
        }
        await pendingTransplant;
      } catch {
        // ignore
      } finally {
        pendingTransplant = null;
      }
      continue;
    }

    chunksSinceTransplant++;

    const expected = minBig(CHUNK_SIZE, size - read);
    const lenHeader = response.headers['content-length'];
    const claimed = typeof lenHeader === 'string' ? BigInt(lenHeader) : null;

    // detect truncated or throttled streams
    if (claimed !== null && claimed < expected / 2n) {
      controller.abort();
      throw new Error(
        `chunked-fetcher: truncated chunk (got ${claimed}, expected ~${expected})`
      );
    }

    try {
      for await (const data of response.body) {
        read += BigInt((data as Buffer).length);
        yield data as Buffer;
      }
    } catch (err) {
      // retry on temporary connection loss
      if (controller.signal.aborted) throw err;
      if (++dropRetries > MAX_DROP_RETRIES) {
        controller.abort();
        throw new Error(
          `chunked-fetcher: dropped at ${read}/${size} (${(err as Error).message})`,
          { cause: err }
        );
      }
      logger.warn(
        `[chunked] transient drop, retry ${dropRetries}/${MAX_DROP_RETRIES}`
      );
      await new Promise((resolve) => setTimeout(resolve, 300 * dropRetries));
      continue;
    }

    dropRetries = 0;
  }
}

export async function resolveFinalUrl(
  startUrl: string,
  dispatcher?: Dispatcher,
  signal?: AbortSignal
): Promise<string> {
  let current = startUrl;
  for (let hop = 0; hop < 5; hop++) {
    await resolveAndValidateHost(new URL(current).hostname);
    const res = await request(current, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT, accept: '*/*', range: 'bytes=0-0' },
      dispatcher,
      signal,
    });
    await res.body.dump().catch(() => {});
    const loc = res.headers.location;
    if (
      [301, 302, 307, 308].includes(res.statusCode) &&
      typeof loc === 'string'
    ) {
      current = new URL(loc, current).toString();
      continue;
    }
    break;
  }
  return current;
}

// fetch media in chunks with failover
export async function fetchChunked(
  opts: ChunkedFetchOptions
): Promise<ChunkedFetchResult> {
  const controller = opts.controller || new AbortController();
  const dispatcher = (opts.dispatcher ?? getGlobalDispatcher()).compose(
    interceptors.redirect({ maxRedirections: 5 })
  );
  const redirectOpts = { ...opts, dispatcher };
  const { size, contentType } = await preflightHead(redirectOpts, controller);

  if (size <= 0n) {
    throw new Error('chunked-fetcher: pre-flight returned zero size');
  }

  const start = opts.start && opts.start > 0n ? opts.start : 0n;
  if (start >= size) {
    throw new Error(`chunked-fetcher: start ${start} >= size ${size}`);
  }

  const generator = readChunks(redirectOpts, size, controller, start);

  const onAbort = () => {
    generator.return(undefined as unknown as Buffer).catch(() => {});
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });

  const stream = Readable.from(generator);
  stream.once('close', () => {
    controller.signal.removeEventListener('abort', onAbort);
    if (!controller.signal.aborted) controller.abort();
  });

  return { stream, size, contentType };
}

export const _internals = {
  CHUNK_SIZE,
  TRANSPLANT_DEBOUNCE,
  PREFLIGHT_HEAD_ATTEMPTS,
  buildDefaultHeaders,
  readChunks,
  preflightHead,
};
