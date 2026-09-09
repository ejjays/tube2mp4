import { getProxiedStream } from '../../../utils/network/proxy.util.js';
import { logger } from '../../../utils/infra/logger.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../../types/index.js';
import { Readable } from 'node:stream';
import { normalizeVideoInfo } from './normalizer.js';
import { recordExtraction } from '../../../utils/infra/metrics.util.js';

// skip innertube; yt-dlp handles youtube
const YT_JS_DISABLED = process.env.DISABLE_YT_JS === '1';
// preload client for faster first request
const clientModule = YT_JS_DISABLED ? null : import('./client.js');

/*
* clients to try, in order. ANDROID_VR + poToken returns real urls; most
* others are SABR only. override with YT_JS_CLIENTS
*/
type YtClient = 'ANDROID_VR' | 'IOS' | 'WEB' | 'MWEB' | 'TV' | 'ANDROID';
const JS_CLIENTS = (process.env.YT_JS_CLIENTS || 'ANDROID_VR,IOS')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean) as YtClient[];

export async function getInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  if (!clientModule) return null;
  try {
    const { getYoutubeExtractorClient } = await clientModule;
    const client = await getYoutubeExtractorClient();
    const idMatch = url.match(
      /(?:v=|\/v\/|youtu\.be\/|shorts\/|live\/)([0-9A-Za-z_-]{11})/u
    );
    const videoId = idMatch ? idMatch[1] : url;

    if (options.onProgress) {
      options.onProgress('fetching_info', 20, 'Decrypting streams...');
    }

    /*
     * the bug that cost me hours: youtubei.js v17 takes the client in an
     * options object — getInfo(id, { client }). pass a bare string like
     * getInfo(id, 'ANDROID_VR') and it's silently ignored, so every call
     * quietly falls back to WEB client, which YouTube now serves
     * SABR only (formats but no downloadable URLs). the { client } form +
     * a poToken is the whole difference between "JS cant get URLs" and it
     * working fine
     */
    // ios urls 403 mid-download
    const DUB_CLIENT: YtClient = 'IOS';
    const baseOrder = [...JS_CLIENTS].sort(
      (clientA, clientB) =>
        Number(clientA === DUB_CLIENT) - Number(clientB === DUB_CLIENT)
    );

    // only ios lists dubs; overlap with base
    const dubInfoPromise = client
      .getInfo(videoId, { client: DUB_CLIENT })
      .then((full) => normalizeVideoInfo(url, full, client))
      .catch(() => null);

    let base: VideoInfo | null = null;
    let baseClient: YtClient | null = null;
    for (const clientType of baseOrder) {
      const startedAt = Date.now();
      try {
        const fullInfo = await client.getInfo(videoId, { client: clientType });
        const videoInfo = await normalizeVideoInfo(url, fullInfo, client);
        const playable =
          (videoInfo.formats?.length || 0) +
            (videoInfo.audioFormats?.length || 0) >
          0;
        recordExtraction(
          `youtube:js:${clientType}`,
          playable,
          Date.now() - startedAt
        );
        if (playable) {
          base = videoInfo;
          baseClient = clientType;
          break;
        }
        logger.debug(
          `[JS-YT] ${clientType} produced no playable formats for ${videoId}`
        );
      } catch (clientError: unknown) {
        recordExtraction(
          `youtube:js:${clientType}`,
          false,
          Date.now() - startedAt
        );
        logger.debug(
          `[JS-YT] ${clientType} failed: ${(clientError as Error).message}`
        );
      }
    }

    const dubInfo = await dubInfoPromise;
    // nothing usable, caller falls back to yt-dlp
    if (!base) return null;

    base.audioFormats = base.audioFormats || [];
    const langs = new Set(
      base.audioFormats.map((fmt) => (fmt.language || '').toLowerCase())
    );
    if (baseClient !== DUB_CLIENT && dubInfo) {
      for (const fmt of dubInfo.audioFormats || []) {
        const lang = (fmt.language || '').toLowerCase();
        if (!lang || fmt.isOriginal || langs.has(lang)) continue;
        langs.add(lang);
        base.audioFormats.push(fmt);
      }
    }

    if (options.onProgress) {
      options.onProgress('fetching_info', 50, 'Metadata parsed');
    }
    return base;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[JS-YT] Error extracting ${url}: ${message}`);
    return null;
  }
}

export function getStream(
  videoInfo: VideoInfo,
  options: ExtractorOptions = {}
): Promise<Readable> {
  const targetFormat =
    videoInfo.formats.find(
      (formatItem: Format) =>
        String(formatItem.formatId) === String(options.formatId)
    ) || videoInfo.formats[0];
  if (!targetFormat?.url) throw new Error('No stream URL found');

  return Promise.resolve(
    getProxiedStream(targetFormat.url, {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://www.youtube.com/',
    })
  );
}
