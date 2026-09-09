import { AppState } from 'react-native';
import { log } from '../log';
import {
  SNIFFER_JS,
  PageScan,
  ScannedVideo,
  dedupeVideos,
  isMediaUrl,
  parseHlsMessage,
  parseWebViewMessage,
} from './sniffer';

const TAG = 'webviewExtraction';

interface WebViewHandle {
  navigate: (uri: string) => void;
  injectJavaScript: (js: string) => void;
}

interface Pending {
  url: string;
  pageUrl: string;
  resolve: (scan: PageScan | null) => void;
  timer: ReturnType<typeof setTimeout>;
  onScan?: (scan: PageScan) => void;
  isDirect?: boolean;
  start: number;
}

let handle: WebViewHandle | null = null;
let active: Pending | null = null;
const queue: Pending[] = [];
const inflight = new Map<string, Promise<PageScan | null>>();
let extraVideos: ScannedVideo[] = [];
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probed: string[] = [];
let pendingHls = 0;
let latestScan: PageScan | null = null;
let lastEmptyKey = '';
let stableCount = 0;
let scanCounter = 0;
let currentScanId: number | undefined;
let lastInjectedUrl: string | undefined;

const PROBE_GRACE = 1_500;
const MAX_PROBES = 4;
const STABLE_SETTLE = 3;
const MIN_PATIENCE = 8_000;

// players park a placeholder <video src> = page url until the stream loads
function hasRealVideos(scan: PageScan): boolean {
  return scan.videos.some((video) => video.url !== scan.url);
}

function isHlsUrl(url: string): boolean {
  return /[.]m3u8(?:[?#]|$)/iu.test(url) || /m3u8/iu.test(url);
}

// m3u8 manifests get XHR-fetched + variant-parsed in-page (a <video> element
// can't read them); everything else gets the hidden metadata video probe
function armProbes(videos: ScannedVideo[]): void {
  for (const video of videos) {
    if (video.height || probed.includes(video.url)) continue;
    probed.push(video.url);
    if (isHlsUrl(video.url)) {
      pendingHls += 1;
      handle?.injectJavaScript(
        `window.__phantom_hls(${JSON.stringify(video.url)});`
      );
    } else {
      handle?.injectJavaScript(
        `window.__phantom_probe(${JSON.stringify(video.url)});`
      );
    }
  }
}

function clearProbeTimer(): void {
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
}

// hidden metadata-only player for a bare file url: browser fetches the
// headers (moov included), so dims resolve without downloading the media
function probePage(url: string): string {
  const html = `<html><body><video src="${url.replace(/"/gu, '%22')}" preload="metadata" playsinline muted autoplay style="display:none"></video></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function finish(scan: PageScan | null): void {
  if (!active) return;
  clearTimeout(active.timer);
  clearProbeTimer();
  const pending = active;
  active = null;
  inflight.delete(pending.url);
  handle?.navigate('about:blank');
  if (scan) {
    const merged = {
      ...scan,
      // probe page navigates a data: url; restore the real target
      url: pending.isDirect ? pending.url : scan.url,
      isDirect: pending.isDirect ? true : scan.isDirect,
      videos: dedupeVideos([...extraVideos, ...scan.videos]),
    };
    log(
      TAG,
      'scan resolved',
      merged.url,
      `| title: ${merged.title || '(empty)'}`,
      `| videos: ${merged.videos.length}`,
      merged.videos.map((video) => video.url),
      `| cookies: ${merged.cookies ? 'yes' : 'no'}`
    );
    pending.onScan?.(merged);
    pending.resolve(merged);
  } else {
    pending.resolve(null);
  }
  pump();
}

function pump(): void {
  if (active || queue.length === 0 || !handle) return;
  const pending = queue.shift();
  if (!pending) return;
  active = pending;
  pending.start = Date.now();
  extraVideos = [];
  latestScan = null;
  lastInjectedUrl = undefined;
  lastEmptyKey = '';
  stableCount = 0;
  probed = [];
  pendingHls = 0;
  log(TAG, 'extract start', pending.url);
  handle.navigate(pending.pageUrl);
  pending.timer = setTimeout(() => {
    log(TAG, 'timeout (30s), no scan', pending.url);
    finish(null);
  }, 30_000);
}

// android fires onLoadEnd for iframes and navigationStateChange repeats:
// inject once per distinct page url, or ids churn and scans go stale
function injectSniffer(url: string): void {
  if (!active || url === lastInjectedUrl) return;
  lastInjectedUrl = url;
  scanCounter += 1;
  currentScanId = scanCounter;
  handle?.injectJavaScript(`window.__phantom_scan_id=${scanCounter};${SNIFFER_JS}`);
}

export function attachGenericWebView(webview: WebViewHandle): void {
  handle = webview;
  pump();
}

export function detachGenericWebView(): void {
  handle = null;
  while (queue.length > 0) {
    const pending = queue.shift();
    if (pending) {
      inflight.delete(pending.url);
      pending.resolve(null);
    }
  }
  finish(null);
}

function scanIdOf(raw: string): number | undefined {
  try {
    const parsed = JSON.parse(raw) as { id?: number };
    return typeof parsed.id === 'number' ? parsed.id : undefined;
  } catch {
    return undefined;
  }
}

export function onGenericWebViewMessage(raw: string): void {
  const hls = parseHlsMessage(raw);
  if (hls) {
    if (!active) return;
    const id = scanIdOf(raw);
    if (id !== undefined && id !== currentScanId) {
      log(TAG, 'stale hls ignored', id, 'active', currentScanId);
      return;
    }
    pendingHls = Math.max(0, pendingHls - 1);
    if (!probed.includes(hls.url)) probed.push(hls.url);
    for (const video of hls.videos) {
      if (!extraVideos.some((existing) => existing.url === video.url)) {
        extraVideos.push(video);
      }
    }
    // settle only after every manifest fetch resolved, or variants get dropped
    if (pendingHls === 0 && latestScan) armProbeTimer();
    return;
  }
  const scan = parseWebViewMessage(raw);
  if (!active || !scan) return;
  const id = scanIdOf(raw);
  if (id !== undefined && id !== currentScanId) {
    log(TAG, 'stale scan ignored', id, 'active', currentScanId);
    return;
  }
  // SPA players populate the dom long after the first scans: hold when no real
  // media yet, and only settle once scans go quiet past a patience floor so
  // late-starting players still get caught
  if (hasRealVideos(scan)) {
    latestScan = scan;
    // xhr-fetched streams have no <video> element: probe them for metadata
    // (a direct-paste probe page already probes its own target)
    const missing = active.isDirect
      ? []
      : scan.videos
          .filter((video) => !video.height && !probed.includes(video.url))
          .slice(0, MAX_PROBES);
    if (missing.length > 0) {
      armProbes(missing);
      armProbeTimer();
      return;
    }
    if (pendingHls > 0) {
      armProbeTimer();
      return;
    }
    finish(scan);
    return;
  }
  latestScan = scan;
  const key = scan.videos
    .map((video) => `${video.url}|${video.width ?? ''}|${video.height ?? ''}`)
    .join(',');
  if (key === lastEmptyKey) {
    stableCount += 1;
    if (
      stableCount >= STABLE_SETTLE &&
      Date.now() - active.start >= MIN_PATIENCE
    ) {
      if (pendingHls > 0) {
        armProbeTimer();
        return;
      }
      // captured media requests count, even when every scan was empty
      const settled = extraVideos.length > 0 ? scan : null;
      log(TAG, 'idle scans, settling', active.url);
      finish(settled);
    }
  } else {
    lastEmptyKey = key;
    stableCount = 1;
  }
}

// keep settling on the freshest scan: probes that fail drop out of later
// scans, so draining the batch filters junk before the user sees it
function armProbeTimer(): void {
  if (probeTimer) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    const fresh = latestScan;
    if (!fresh || !hasRealVideos(fresh)) {
      finish(fresh);
      return;
    }
    const next = fresh.videos
      .filter((video) => !video.height && !probed.includes(video.url))
      .slice(0, MAX_PROBES);
    if (next.length > 0) {
      armProbes(next);
      armProbeTimer();
      return;
    }
    if (pendingHls > 0) {
      armProbeTimer();
      return;
    }
    log(TAG, 'probe grace elapsed, settling', active?.url);
    finish(fresh);
  }, PROBE_GRACE);
}

export function onWebViewPageEnded(url: string): void {
  injectSniffer(url);
}

export function onWebViewRequest(url: string): void {
  if (!active || !isMediaUrl(url)) return;
  log(TAG, 'media request', url);
  // probe page reports the target itself through its scan; don't resolve yet
  if (url === active.url) {
    if (!active.isDirect) {
      finish({
        url,
        title: '',
        videos: [{ url }],
        images: [],
      });
    }
    return;
  }
  if (!extraVideos.some((video) => video.url === url)) {
    extraVideos.push({ url });
  }
}

export function onWebViewFailed(): void {
  finish(null);
}

export function onWebViewHttpError(url: string): void {
  if (active && url === active.url) {
    log(TAG, 'http error on active page', url);
    finish(null);
  }
}

AppState.addEventListener('change', (state) => {
  if (state !== 'background') return;
  while (queue.length > 0) {
    const pending = queue.shift();
    if (pending) {
      inflight.delete(pending.url);
      pending.resolve(null);
    }
  }
  finish(null);
});

export function extractFromPage(
  url: string,
  onScan?: (scan: PageScan) => void
): Promise<PageScan | null> {
  const existing = inflight.get(url);
  if (existing) return existing;
  let pending: Pending | null = null;
  const promise = new Promise<PageScan | null>((resolve) => {
    // bare file paste: probe page loads its metadata so dims are known
    const isDirect = isMediaUrl(url);
    pending = {
      url,
      pageUrl: isDirect ? probePage(url) : url,
      resolve,
      timer: setTimeout(() => {}, 0),
      onScan,
      isDirect,
      start: Date.now(),
    };
  });
  if (!pending) throw new Error('unreachable');
  inflight.set(url, promise);
  queue.push(pending);
  pump();
  return promise;
}
