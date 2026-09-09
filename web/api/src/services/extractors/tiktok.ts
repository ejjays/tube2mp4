import { Readable } from 'node:stream';
import { createTikTokExtractor } from '@phantom/extractors';
import { sharedBackendEnv } from './sharedEnv.js';
import { secureFetch } from '../../utils/network/security.util.js';
import type {
  Extractor,
  ExtractorOptions,
  VideoInfo,
} from '../../types/index.js';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const tkExtractor = createTikTokExtractor(sharedBackendEnv);

export async function getInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  try {
    return (await tkExtractor.getInfo(
      url,
      options as unknown as Parameters<typeof tkExtractor.getInfo>[1]
    )) as VideoInfo | null;
  } catch {
    return null;
  }
}

export async function getStream(
  videoInfo: VideoInfo,
  options: ExtractorOptions = {}
): Promise<Readable> {
  const selected =
    videoInfo.formats.find(
      (format) => String(format.formatId) === String(options.formatId)
    ) || videoInfo.formats[0];
  if (!selected?.url) throw new Error('No stream URL found');

  // cookies + referer + range authorize cdn; the shared proxy path
  // strips cookies, so stream direct like before
  const headers: Record<string, string> = {
    'User-Agent': DESKTOP_UA,
    Referer: 'https://www.tiktok.com/',
    Range: 'bytes=0-',
  };
  const cookie = tkExtractor.cookieFor(videoInfo.id);
  if (cookie) headers.Cookie = cookie;

  const response = await secureFetch(selected.url, { headers });
  if (!response.ok || !response.body) {
    throw new Error(`TikTok stream failed: HTTP ${response.status}`);
  }
  return Readable.fromWeb(
    response.body as import('node:stream/web').ReadableStream
  );
}

export const tiktok: Extractor = {
  getInfo: getInfo as unknown as Extractor['getInfo'],
  getStream: getStream as unknown as Extractor['getStream'],
};
