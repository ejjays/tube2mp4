import { buildPageHeaders } from '@phantom/extractors';
import { DESKTOP_UA } from '../../lib/userAgents';
import { gatedFetch, timeoutSignal } from '../../lib/net';

const HEADERS = buildPageHeaders(DESKTOP_UA);

export type PageFetchOptions = {
  cookie?: string;
};

export type PageFetchResult = { html: string; targetUrl: string };

export async function fetchPageHtml(
  target: string,
  options: PageFetchOptions,
  timeoutMs = 10000
): Promise<PageFetchResult | null> {
  const cookie = typeof options.cookie === 'string' ? options.cookie : null;
  const response = await gatedFetch(target, {
    headers: {
      ...HEADERS,
      ...(cookie && { Cookie: cookie }),
    },
    redirect: 'follow',
    signal: timeoutSignal(timeoutMs),
  });
  if (!response.ok) return null;
  return { html: await response.text(), targetUrl: response.url || target };
}

export function fetchFileSize(url: string): Promise<number | undefined> {
  return probeFileSize(url, { 'User-Agent': DESKTOP_UA });
}

// HEAD the media url for its size; referer+cookies sent because tokenized CDNs
// 403 bare requests. fail-soft: picker just shows no size.
export async function probeFileSize(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 5000
): Promise<number | undefined> {
  try {
    const head = await gatedFetch(url, {
      method: 'HEAD',
      headers,
      redirect: 'follow',
      signal: timeoutSignal(timeoutMs),
    });
    if (!head.ok) return undefined;
    const length = head.headers.get('content-length');
    return length ? parseInt(length, 10) : undefined;
  } catch {
    return undefined;
  }
}
