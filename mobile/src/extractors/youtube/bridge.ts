import type { SabrConfig } from '../../lib/download/youtubeSabr';
import { YT_INTERNAL_UA } from '../../lib/userAgents';
import {
  ExtractorError,
  privateVideo,
  ageRestricted,
  geoBlocked,
  restricted,
  notFound,
  noVideo,
  temporaryError,
} from '@phantom/extractors';
import { log, warn as logWarn } from '../../lib/log';
import { getYoutubeCookie } from '../../lib/settings';

export interface RawYtFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  qualityLabel?: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
  contentLength?: string;
  audioQuality?: string;
  language?: string;
  isOriginal?: boolean;
}

export interface RawYtResult {
  id: string;
  title?: string;
  author?: string;
  duration?: number;
  thumbnail?: string;
  client?: string;
  poToken?: boolean;
  formats: RawYtFormat[];
  adaptive: RawYtFormat[];
}

interface RawYtMeta {
  id: string;
  title?: string;
  author?: string;
  duration?: number;
  thumbnail?: string;
}

export interface YtSearchResult {
  id: string;
  title?: string;
  author?: string;
  durationSec?: number;
}

interface RawYtPlaylistEntry {
  id: string;
  title?: string;
  channel?: string;
  durationSec?: number;
  thumb?: string;
}

export interface RawYtPlaylist {
  id: string;
  title: string;
  author?: string;
  authorAvatar?: string;
  entries: RawYtPlaylistEntry[];
}

type Injector = (js: string) => void;
type Resolver = (value: RawYtResult | null) => void;
type PartialHandler = (meta: RawYtMeta) => void;
type SearchResolver = (value: YtSearchResult[] | null) => void;

let inject: Injector | null = null;
let ready = false;
const queue: string[] = [];

const BOOT_TIMEOUT_MS = 60000;
let resolveReady: () => void = () => {};
let readyPromise = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

function waitReady(timeoutMs: number): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  return Promise.race([
    readyPromise.then(() => true),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(ready), timeoutMs);
    }),
  ]);
}

export function resetReady(): void {
  ready = false;
  readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
}
const pending = new Map<
  string,
  {
    resolve: Resolver;
    reject: (reason: unknown) => void;
    onPartial?: PartialHandler;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const pendingSearch = new Map<
  string,
  { resolve: SearchResolver; timer: ReturnType<typeof setTimeout> }
>();
const pendingPlaylist = new Map<
  string,
  {
    resolve: (value: RawYtPlaylist | null) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

export function attachWebView(injectFn: Injector): void {
  inject = injectFn;
}

function flush(): void {
  while (queue.length > 0) {
    const js = queue.shift();
    if (js) inject?.(js);
  }
}

const YT_DEBUG = false;

const YT_API_UA = YT_INTERNAL_UA;
const YT_API_ORIGIN = 'https://www.youtube.com';

type RnFetchRequest = {
  reqId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

function handleRnFetch(req: RnFetchRequest): void {
  if (YT_DEBUG && req.url.includes('/youtubei/v1/player')) {
    const finalHeaders = {
      ...req.headers,
      'User-Agent': YT_API_UA,
      Origin: YT_API_ORIGIN,
    };
    let bodyOut = req.body || '';
    try {
      const parsed = JSON.parse(bodyOut) as {
        serviceIntegrityDimensions?: { poToken?: string };
      };
      if (parsed.serviceIntegrityDimensions?.poToken) {
        parsed.serviceIntegrityDimensions.poToken = `<len=${parsed.serviceIntegrityDimensions.poToken.length}>`;
      }
      bodyOut = JSON.stringify(parsed);
    } catch {
      /* keep raw */
    }
    logWarn('bridge', `[YT-DIAG] url=${req.url}`);
    logWarn('bridge', `[YT-DIAG] headers=${JSON.stringify(finalHeaders)}`);
    logWarn('bridge', `[YT-DIAG] body=${bodyOut}`);
  }
  void getYoutubeCookie()
    .then((cookie) =>
      fetch(req.url, {
        method: req.method,
        headers: {
          ...req.headers,
          'User-Agent': YT_API_UA,
          Origin: YT_API_ORIGIN,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: req.body,
        credentials: 'omit',
      })
    )
    .then(async (res) => {
      const body = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { ok: true, status: res.status, headers, body };
    })
    .catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }))
    .then((payload) => {
      inject?.(
        `window.__rnFetchResponse(${JSON.stringify(req.reqId)}, ${JSON.stringify(payload)}); true;`
      );
    });
}

export function mapYtError(reason?: string): ExtractorError {
  const text = (reason ?? '').toLowerCase();
  if (/this video is private|private video/u.test(text)) {
    return privateVideo('YouTube');
  }
  if (/confirm your age|age-restricted/u.test(text)) {
    return ageRestricted('YouTube');
  }
  if (/not a bot/u.test(text)) return temporaryError('YouTube');
  if (/your country|not available in|region/u.test(text)) {
    return geoBlocked('YouTube');
  }
  if (/members|join this channel/u.test(text)) {
    return restricted('YouTube', 'to channel members');
  }
  if (
    /removed|no longer available|unavailable|terminated|deleted/u.test(text)
  ) {
    return notFound('YouTube');
  }
  return noVideo('YouTube');
}

export function onWebViewMessage(raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.log) {
    log('bridge', `[JS-YT/wv] ${msg.stage}: ${msg.detail}`);
    return;
  }
  if (msg.ready) {
    ready = true;
    resolveReady();
    flush();
    return;
  }
  if (msg.rnFetch) {
    handleRnFetch(msg as unknown as RnFetchRequest);
    return;
  }
  if (msg.sabrConfig) {
    const cfg = msg.sabrConfig as unknown as SabrConfig;
    void import('../../lib/download/youtubeSabr').then(({ sabrSelfTest }) =>
      sabrSelfTest(cfg)
    );
    return;
  }

  const reqId = msg.reqId as string | undefined;
  if (!reqId) return;

  if (msg.search) {
    const searchEntry = pendingSearch.get(reqId);
    if (!searchEntry) return;
    clearTimeout(searchEntry.timer);
    pendingSearch.delete(reqId);
    searchEntry.resolve(msg.ok ? (msg.results as YtSearchResult[]) : null);
    return;
  }

  if (msg.playlist) {
    const pEntry = pendingPlaylist.get(reqId);
    if (!pEntry) return;
    clearTimeout(pEntry.timer);
    pendingPlaylist.delete(reqId);
    if (msg.ok && msg.data) {
      pEntry.resolve(msg.data as RawYtPlaylist);
    } else {
      pEntry.resolve(null);
    }
    return;
  }

  const entry = pending.get(reqId);
  if (!entry) return;

  if (msg.partial) {
    entry.onPartial?.(msg.meta as RawYtMeta);
    return;
  }

  clearTimeout(entry.timer);
  pending.delete(reqId);

  if (msg.ok) {
    entry.resolve(msg.data as RawYtResult);
  } else {
    logWarn('bridge', `[JS-YT/wv] extract failed: ${msg.error}`);
    entry.reject(mapYtError(msg.error as string | undefined));
  }
}

const SEARCH_TIMEOUT_MS = 15000;
const SEARCH_ATTEMPTS = 2;

function searchOnce(query: string): Promise<YtSearchResult[] | null> {
  return new Promise((resolve) => {
    if (!inject) {
      resolve(null);
      return;
    }
    const reqId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      pendingSearch.delete(reqId);
      logWarn('bridge', '[JS-YT/wv] search timed out');
      resolve(null);
    }, SEARCH_TIMEOUT_MS);
    pendingSearch.set(reqId, { resolve, timer });
    inject(
      `window.__search(${JSON.stringify(reqId)}, ${JSON.stringify(query)}); true;`
    );
  });
}

export async function searchViaWebView(
  query: string
): Promise<YtSearchResult[] | null> {
  if (!inject) return null;
  if (!(await waitReady(BOOT_TIMEOUT_MS))) {
    logWarn('bridge', '[JS-YT/wv] webview not ready for search');
    return null;
  }
  for (let attempt = 0; attempt < SEARCH_ATTEMPTS; attempt += 1) {
    const result = await searchOnce(query);
    if (result !== null) return result;
  }
  return null;
}

export async function extractViaWebView(
  videoId: string,
  onPartial?: PartialHandler
): Promise<RawYtResult | null> {
  const injectFn = inject;
  if (!injectFn) return null;
  if (!(await waitReady(BOOT_TIMEOUT_MS))) {
    logWarn('bridge', '[JS-YT/wv] webview not ready for extract');
    return null;
  }
  return new Promise((resolve, reject) => {
    const reqId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      pending.delete(reqId);
      logWarn('bridge', '[JS-YT/wv] extract timed out');
      reject(temporaryError('YouTube'));
    }, 45000);
    pending.set(reqId, { resolve, reject, onPartial, timer });
    injectFn(
      `window.__extract(${JSON.stringify(reqId)}, ${JSON.stringify(videoId)}); true;`
    );
  });
}

export async function playlistViaWebView(
  listId: string
): Promise<RawYtPlaylist | null> {
  const injectFn = inject;
  if (!injectFn) return null;
  if (!(await waitReady(BOOT_TIMEOUT_MS))) {
    logWarn('bridge', '[JS-YT/wv] webview not ready for playlist');
    return null;
  }
  return new Promise((resolve) => {
    const reqId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      pendingPlaylist.delete(reqId);
      logWarn('bridge', '[JS-YT/wv] playlist timed out');
      resolve(null);
    }, 120000);
    pendingPlaylist.set(reqId, { resolve, timer });
    injectFn(
      `window.__playlist(${JSON.stringify(reqId)}, ${JSON.stringify(listId)}); true;`
    );
  });
}
