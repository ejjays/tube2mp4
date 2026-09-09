import { Format, VideoInfo, ExtractorOptions } from './shared/types.js';
import { ExtractorEnv, defaultEnv } from './shared/env.js';
import { normalizeTitle, normalizeArtist } from './shared/social.js';
import { DESKTOP_UA } from './shared/util.js';
import { buildPageHeaders } from './shared/headers.js';
import {
  noVideo,
  fromStatus,
  temporaryError,
  classifyThrown,
} from './shared/errors.js';
import { envFetch, selectFormat, buildVideoInfo } from './shared/fetch.js';

const REFERER = 'https://www.tiktok.com/';

const PAGE_HEADERS: Record<string, string> = {
  ...buildPageHeaders(DESKTOP_UA),
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

const COOKIE_CACHE_MAX = 100;

function createCookieStore() {
  const jar = new Map<string, string>();
  return {
    get: (id: string): string | undefined => jar.get(id),
    set: (id: string, value: string): void => {
      if (value && jar.size >= COOKIE_CACHE_MAX) {
        const oldest = jar.keys().next().value;
        if (oldest !== undefined) jar.delete(oldest);
      }
      if (value) jar.set(id, value);
    },
    clear: (): void => jar.clear(),
  };
}

type CookieStore = ReturnType<typeof createCookieStore>;

interface TikTokPlayAddr {
  Width?: number;
  Height?: number;
  DataSize?: number;
  UrlList?: string[];
}
interface TikTokBitrate {
  Bitrate?: number;
  GearName?: string;
  CodecType?: string;
  PlayAddr?: TikTokPlayAddr;
}
interface TikTokVideo {
  duration?: number;
  width?: number;
  height?: number;
  cover?: string;
  originCover?: string;
  playAddr?: string;
  codecType?: string;
  bitrateInfo?: TikTokBitrate[];
}
interface TikTokItem {
  id?: string;
  desc?: string;
  author?: { uniqueId?: string; nickname?: string };
  video?: TikTokVideo;
  imagePost?: { images?: { imageURL?: { urlList?: string[] } }[] };
}

export function parseUniversalData(html: string): TikTokItem | null {
  const match = html.match(
    /<script\b[^>]*\bid="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/u
  );
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]) as {
      __DEFAULT_SCOPE__?: {
        'webapp.video-detail'?: { itemInfo?: { itemStruct?: TikTokItem } };
      };
    };
    return (
      data.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct ??
      null
    );
  } catch {
    return null;
  }
}

function buildVideoFormats(video: TikTokVideo): Format[] {
  const mapped = (video.bitrateInfo ?? [])
    .map((rung): Format | null => {
      const url = rung.PlayAddr?.UrlList?.[0];
      if (!url) return null;
      const width = rung.PlayAddr?.Width ?? video.width;
      const height = rung.PlayAddr?.Height ?? video.height;
      const short = width && height ? Math.min(width, height) : undefined;
      const isHevc = rung.CodecType?.includes('265') ?? false;
      return {
        formatId: rung.GearName || `${short ?? 'src'}p`,
        url,
        extension: 'mp4',
        width,
        height,
        resolution: width && height ? `${width}x${height}` : undefined,
        quality: short ? `${short}p${isHevc ? ' (HEVC)' : ''}` : undefined,
        vcodec: isHevc ? 'hevc' : 'h264',
        acodec: 'aac',
        tbr: rung.Bitrate ? Math.round(rung.Bitrate / 1000) : undefined,
        filesize:
          typeof rung.PlayAddr?.DataSize === 'number'
            ? rung.PlayAddr.DataSize
            : undefined,
        isMuxed: true,
        isVideo: true,
        isAudio: false,
      };
    })
    .filter((format): format is Format => format !== null);

  mapped.sort((lhs, rhs) => {
    const byHeight = (rhs.height ?? 0) - (lhs.height ?? 0);
    if (byHeight !== 0) return byHeight;
    if (lhs.vcodec !== rhs.vcodec) return lhs.vcodec === 'h264' ? -1 : 1;
    return (rhs.tbr ?? 0) - (lhs.tbr ?? 0);
  });
  const seen = new Set<number>();
  const deduped = mapped.filter((format) => {
    const key = format.height ?? 0;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length === 0 && video.playAddr) {
    deduped.push({
      formatId: 'source',
      url: video.playAddr,
      extension: 'mp4',
      width: video.width,
      height: video.height,
      resolution:
        video.width && video.height
          ? `${video.width}x${video.height}`
          : undefined,
      vcodec: video.codecType?.includes('265') ? 'hevc' : 'h264',
      acodec: 'aac',
      isMuxed: true,
      isVideo: true,
      isAudio: false,
    });
  }
  return deduped;
}

function buildPhotoFormats(item: TikTokItem): Format[] {
  return (item.imagePost?.images ?? [])
    .map((image, index): Format | null => {
      const url = image.imageURL?.urlList?.[0];
      if (!url) return null;
      return {
        formatId: `image_${index}`,
        url,
        extension: 'jpeg',
        isMuxed: false,
        isVideo: false,
        isAudio: false,
      };
    })
    .filter((format): format is Format => format !== null);
}

function setCookiesOf(res: Response): string[] {
  const getter = (res.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie;
  if (typeof getter === 'function') {
    try {
      return getter.call(res.headers) ?? [];
    } catch {
      return [];
    }
  }
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function captureCookies(store: CookieStore, id: string, res: Response): string {
  const header = setCookiesOf(res)
    .map((entry) => entry.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
  store.set(id, header);
  return header;
}

export function createTikTokExtractor(env: ExtractorEnv = defaultEnv) {
  const cookies = createCookieStore();

  async function getInfo(
    url: string,
    _options: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    try {
      const response = await envFetch(env, url, {
        headers: PAGE_HEADERS,
        redirect: 'follow',
      } as RequestInit);
      if (!response.ok) throw fromStatus(response.status, 'TikTok');
      const targetUrl = (response as unknown as { url?: string }).url || url;
      const html = await response.text();
      const item = parseUniversalData(html);
      if (!item) {
        const walled =
          /tiktok\.com\/login|captcha|verify|robot check|please wait/iu.test(
            html
          );
        throw walled ? temporaryError('TikTok') : noVideo('TikTok');
      }
      const isPhoto = Boolean(item.imagePost?.images?.length);
      const formats = isPhoto
        ? buildPhotoFormats(item)
        : item.video
          ? buildVideoFormats(item.video)
          : [];
      if (formats.length === 0) throw noVideo('TikTok');

      const info = buildVideoInfo({
        id: item.id || url,
        title: item.desc || 'TikTok Video',
        uploader:
          item.author?.nickname || item.author?.uniqueId || 'TikTok User',
        webpageUrl: targetUrl,
        thumbnail: item.video?.cover || item.video?.originCover || undefined,
        duration: item.video?.duration,
        formats,
        extractorKey: 'tiktok',
        isFullData: !isPhoto,
      });
      info.title = normalizeTitle(info as unknown as Record<string, unknown>);
      info.uploader = normalizeArtist(
        info as unknown as Record<string, unknown>
      );

      const cookie = captureCookies(cookies, info.id, response);
      info.downloadHeaders = {
        'User-Agent': DESKTOP_UA,
        Referer: REFERER,
        Range: 'bytes=0-',
        ...(cookie ? { Cookie: cookie } : {}),
      };
      return info;
    } catch (error: unknown) {
      throw classifyThrown(error, 'TikTok');
    }
  }

  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const selected = selectFormat(videoInfo, options);
    if (!selected?.url) throw noVideo('TikTok');
    const headers: Record<string, string> = {
      'User-Agent': DESKTOP_UA,
      Referer: REFERER,
      Range: 'bytes=0-',
    };
    const cookie = cookies.get(videoInfo.id);
    if (cookie) headers.Cookie = cookie;
    return env.streamUrl(selected.url, headers);
  }

  return {
    getInfo,
    getStream,
    __resetCookiesForTests: cookies.clear,
    /** cookie harvested for this media id, for CDN auth on a custom stream path */
    cookieFor: cookies.get,
  };
}
