import { Readable } from 'node:stream';
import type { ExtractorEnv } from '@phantom/extractors';
import { secureFetch } from '../../utils/network/security.util.js';
import { getProxiedStream } from '../../utils/network/proxy.util.js';
import { hlsRemuxStream } from '../ytdlp/turbo-mux.js';

const HLS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function remuxHls(
  url: string,
  _headers: Record<string, string>
): Promise<ReadableStream> {
  return Promise.resolve(
    Readable.toWeb(hlsRemuxStream(url, HLS_UA)) as unknown as ReadableStream
  );
}

function streamUrl(
  url: string,
  headers: Record<string, string>
): Promise<ReadableStream> {
  return Promise.resolve(
    Readable.toWeb(getProxiedStream(url, headers)) as unknown as ReadableStream
  );
}

/**
 * Vimeo falls back to these when the config payload has no thumb. Without
 * them the HLS/progressive path returns no thumbnail at all, and the
 * metascraper partial used to mask that by supplying meta.image.
 * Mirrors mobile's mobileSharedEnvWithThumbs.
 */
async function oembedThumbImpl(url: string): Promise<string | undefined> {
  try {
    const res = await secureFetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { thumbnail_url?: string };
    return data.thumbnail_url;
  } catch {
    return undefined;
  }
}

async function ogImageThumbImpl(url: string): Promise<string | undefined> {
  try {
    const res = await secureFetch(url);
    if (!res.ok) return undefined;
    const html = await res.text();
    const match =
      /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/iu.exec(
        html
      );
    return match?.[1]?.replace(/&amp;/gu, '&') ?? undefined;
  } catch {
    return undefined;
  }
}

export const sharedBackendEnv: ExtractorEnv = {
  fetch: secureFetch as unknown as typeof fetch,
  streamUrl,
  remuxHls,
  skipDurationFetch: true,
  oembedThumb: oembedThumbImpl,
  ogImageThumb: ogImageThumbImpl,
  get cookie() {
    return process.env.BILIBILI_COOKIE?.trim() || undefined;
  },
};