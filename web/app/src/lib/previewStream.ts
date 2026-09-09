// shared cached resolver for playback urls
// picker warms it; overlay consumes

export interface StreamUrlsResponse {
  videoUrl?: string;
  audioUrl?: string;
  directUrl?: string;
}

interface CacheEntry {
  promise: Promise<StreamUrlsResponse>;
  ts: number;
}

// re-resolve well before ~6h expiry
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const cleanPageUrl = (pageUrl: string) =>
  pageUrl.split('&id=')[0].split('?id=')[0];

const makeKey = (
  pageUrl: string,
  formatId: string,
  full: boolean,
  audioLang?: string
) =>
  `${cleanPageUrl(pageUrl)}::${formatId}::${full ? 'full' : 'fast'}::${audioLang || 'orig'}`;

export function resolveStreamUrls(
  backendUrl: string,
  pageUrl: string,
  formatId: string,
  clientId: string | undefined,
  full = false,
  audioLang?: string
): Promise<StreamUrlsResponse> {
  const key = makeKey(pageUrl, formatId, full, audioLang);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.promise;

  const endpoint = `${backendUrl}/stream-urls?url=${encodeURIComponent(
    cleanPageUrl(pageUrl)
  )}&formatId=${encodeURIComponent(formatId)}&id=${clientId ?? ''}${full ? '&full=1' : ''}${
    audioLang ? `&audioLang=${encodeURIComponent(audioLang)}` : ''
  }`;

  const promise = fetch(endpoint, {
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'bypass-tunnel-reminder': 'true',
    },
  })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<StreamUrlsResponse>;
    })
    .catch((error) => {
      // drop failed entry so retry works
      cache.delete(key);
      throw error;
    });

  cache.set(key, { promise, ts: Date.now() });
  return promise;
}

// fire-and-forget warm-up; ignores result/errors
export function prefetchStreamUrls(
  backendUrl: string,
  pageUrl: string | undefined,
  formatId: string | undefined,
  clientId: string | undefined
): void {
  if (!pageUrl || !formatId) return;
  resolveStreamUrls(backendUrl, pageUrl, formatId, clientId).catch(() => {
    /* warm-up failures surface on real open */
  });
}

// test hook
export function clearPreviewCache(): void {
  cache.clear();
}
