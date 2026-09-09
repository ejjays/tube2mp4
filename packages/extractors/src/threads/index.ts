import { VideoInfo, ExtractorOptions } from '../shared/types.js';
import { ExtractorEnv, defaultEnv } from '../shared/env.js';
import { DESKTOP_UA } from '../shared/util.js';
import { buildPageHeaders } from '../shared/headers.js';
import { noVideo, classifyThrown } from '../shared/errors.js';
import { envFetch, backfillSizes, selectFormat } from '../shared/fetch.js';
import { parseHtml } from './parser.js';
import { normalizeVideoInfo } from './normalizer.js';

const STREAM_REFERER = 'https://www.threads.com/';
const HEADERS = buildPageHeaders(DESKTOP_UA);

function buildEmbedUrl(url: string): string {
  let clean = url.split('?')[0];
  while (clean.endsWith('/')) clean = clean.slice(0, -1);
  return `${clean}/embed`;
}

async function fetchPage(
  env: ExtractorEnv,
  target: string,
  options: ExtractorOptions
): Promise<{ html: string; targetUrl: string } | null> {
  const cookie = typeof options.cookie === 'string' ? options.cookie : null;
  const res = await envFetch(env, target, {
    headers: { ...HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!res.ok) return null;
  const targetUrl = (res as unknown as { url?: string }).url || target;
  return { html: await res.text(), targetUrl };
}

export function createThreadsExtractor(env: ExtractorEnv = defaultEnv) {
  async function getInfo(
    url: string,
    options: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    try {
      const primary = await fetchPage(env, url, options);
      let videoInfo = primary
        ? normalizeVideoInfo(
            primary.targetUrl,
            parseHtml(primary.html, primary.targetUrl)
          )
        : null;

      if (!videoInfo || videoInfo.formats.length === 0) {
        const embed = await fetchPage(env, buildEmbedUrl(url), options);
        const alt = embed
          ? normalizeVideoInfo(
              embed.targetUrl,
              parseHtml(embed.html, embed.targetUrl)
            )
          : null;
        if (alt && alt.formats.length > 0) videoInfo = alt;
      }

      if (!videoInfo || videoInfo.formats.length === 0)
        throw noVideo('Threads');

      await backfillSizes(env, videoInfo.formats, { 'User-Agent': DESKTOP_UA });

      return videoInfo;
    } catch (error: unknown) {
      throw classifyThrown(error, 'Threads');
    }
  }

  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const sel = selectFormat(videoInfo, options);
    if (!sel?.url) throw noVideo('Threads');
    return env.streamUrl(sel.url, {
      'User-Agent': DESKTOP_UA,
      Referer: STREAM_REFERER,
      Origin: 'https://www.threads.com',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Range: 'bytes=0-',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
    });
  }

  return { getInfo, getStream };
}
