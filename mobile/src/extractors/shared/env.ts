import type { ExtractorEnv } from '@phantom/extractors';
import { gatedFetch } from '../../lib/net';
import { error as logError } from '../../lib/log';

export const mobileSharedEnv: ExtractorEnv = {
  fetch: gatedFetch as unknown as typeof fetch,
  async streamUrl(url, headers) {
    const res = await gatedFetch(url, { headers });
    if (!res.ok || !res.body) {
      throw new Error(`streamUrl: ${res.status} ${res.statusText} for ${url}`);
    }
    return res.body as unknown as ReadableStream;
  },
  // lazy: authFetch pulls the native blob-util client, which breaks
  // node test collection for every importer — only load on demand
  async fetchSessionHeaders(url, headers) {
    try {
      const { cookieGet } = await import('../../lib/authFetch');
      const res = await cookieGet(url, headers);
      const bag = res.headers ?? {};
      const setCookie =
        bag['set-cookie'] ?? bag['Set-Cookie'] ?? bag['SET-COOKIE'] ?? null;
      return { ok: res.ok, status: res.status, setCookie };
    } catch (err) {
      logError('shared/env', `session fetch failed: ${(err as Error).message}`);
      return { ok: false, status: 0, setCookie: null };
    }
  },
};

export async function oembedThumbImpl(url: string): Promise<string | undefined> {
  try {
    const res = await gatedFetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { thumbnail_url?: string };
    return data.thumbnail_url;
  } catch (err) {
    logError('shared/env', `oembedThumb failed: ${(err as Error).message}`);
    return undefined;
  }
}

export async function ogImageThumbImpl(
  url: string
): Promise<string | undefined> {
  try {
    const res = await gatedFetch(url);
    if (!res.ok) return undefined;
    const html = await res.text();
    const match =
      /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/iu.exec(
        html
      );
    return match?.[1]?.replace(/&amp;/gu, '&') ?? undefined;
  } catch (err) {
    logError('shared/env', `ogImageThumb failed: ${(err as Error).message}`);
    return undefined;
  }
}

export const mobileSharedEnvWithThumbs: ExtractorEnv = {
  ...mobileSharedEnv,
  oembedThumb: oembedThumbImpl,
  ogImageThumb: ogImageThumbImpl,
};