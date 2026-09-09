import { Format, VideoInfo, ExtractorOptions } from './shared/types.js';
import { ExtractorEnv, defaultEnv } from './shared/env.js';
import { normalizeTitle, normalizeArtist } from './shared/social.js';
import { DESKTOP_UA, decodeEntities } from './shared/util.js';
import {
  notFound,
  noVideo,
  fromStatus,
  classifyThrown,
  ExtractorError,
} from './shared/errors.js';
import { hostOf } from './shared/host.js';
import { envFetch, selectFormat, buildVideoInfo } from './shared/fetch.js';

const REFERER = 'https://www.pinterest.com/';
const PIDGETS_API = 'https://widgets.pinterest.com/v3/pidgets/pins/info/';

interface PinVideoEntry {
  url?: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
}
interface PinVideos {
  video_list?: Record<string, PinVideoEntry>;
}
interface PinStoryBlock {
  type?: string;
  video?: PinVideos;
}
interface PinStoryPage {
  blocks?: PinStoryBlock[];
}
interface PidgetsPin {
  id?: string;
  description?: string;
  is_video?: boolean;
  pinner?: { username?: string | null; full_name?: string | null };
  native_creator?: { username?: string | null; full_name?: string | null };
  rich_metadata?: { title?: string | null };
  videos?: PinVideos | null;
  story_pin_data?: { pages?: PinStoryPage[] } | null;
}
interface PidgetsResponse {
  status?: string;
  data?: (PidgetsPin | null)[] | null;
}

function titleFrom(pin: PidgetsPin): string {
  const raw = pin.rich_metadata?.title ?? pin.description ?? '';
  const clean = decodeEntities(raw).replace(/\s+/gu, ' ').trim();
  if (!clean) return 'Pinterest Video';
  if (clean.length <= 100) return clean;
  const cut = clean.slice(0, 100);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))}…`;
}

function uploaderFrom(pin: PidgetsPin): string {
  return (
    pin.native_creator?.full_name ??
    pin.native_creator?.username ??
    pin.pinner?.full_name ??
    pin.pinner?.username ??
    'Pinterest'
  );
}

const PIN_PATH_RE = /\/pin\/(?:[\w-]+--)?(\d+)/iu;

export function isPinterestHost(url: string): boolean {
  const host = hostOf(url);
  if (host === 'pin.it') return true;
  return /(?:^|\.)pinterest\.(?:[a-z]{2,4}|com?\.[a-z]{2})$/u.test(host);
}

// Gate on isPinterestHost(), not a literal "pinterest." prefix: apex
// (pinterest.com) and ccTLDs must keep parsing, or the router sends them
// here and they resolve to null.
export function parsePinId(url: string): string | null {
  if (!isPinterestHost(url)) return null;
  const m = url.match(PIN_PATH_RE);
  return m ? m[1] : null;
}

async function resolveShortLink(
  env: ExtractorEnv,
  url: string
): Promise<string> {
  // A refused HEAD falls through to GET, but a transport failure must
  // propagate or it reads as "pin not found".
  let headRefused = false;
  try {
    const res = await envFetch(env, url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': DESKTOP_UA },
    } as RequestInit);
    if (res.ok || res.status < 400)
      return (res as unknown as { url: string }).url ?? url;
    headRefused = true;
  } catch (error: unknown) {
    if (!isHttpFailure(error)) throw error;
    headRefused = true;
  }
  if (headRefused) {
    const res = await envFetch(env, url, {
      redirect: 'follow',
      headers: { 'User-Agent': DESKTOP_UA },
    } as RequestInit);
    return (res as unknown as { url: string }).url ?? url;
  }
  return url;
}

function isHttpFailure(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return typeof status === 'number' && status > 0;
}

function buildFormats(videoList: Record<string, PinVideoEntry>): Format[] {
  const mp4s: Format[] = [];
  let hls: Format | null = null;
  const seenHeights = new Set<number>();
  for (const [key, entry] of Object.entries(videoList)) {
    if (!entry.url) continue;
    if (/\.m3u8/u.test(entry.url)) {
      hls ??= {
        formatId: 'hls-auto',
        url: entry.url,
        extension: 'mp4',
        quality: 'Auto',
        width: entry.width,
        height: entry.height,
        vcodec: 'h264',
        acodec: 'aac',
        isVideo: true,
        isAudio: true,
        isMuxed: true,
        isHls: true,
        hlsKeepAlive: true,
      };
      continue;
    }
    const height = entry.height ?? 0;
    if (height > 0 && seenHeights.has(height)) continue;
    if (height > 0) seenHeights.add(height);
    mp4s.push({
      formatId: height > 0 ? `${height}p` : key.toLowerCase(),
      url: entry.url,
      extension: 'mp4',
      resolution:
        entry.width && entry.height
          ? `${entry.width}x${entry.height}`
          : undefined,
      quality: height > 0 ? `${height}p` : undefined,
      width: entry.width,
      height: entry.height,
      vcodec: 'h264',
      acodec: 'aac',
      isVideo: true,
      isAudio: true,
      isMuxed: true,
    });
  }
  mp4s.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  if (mp4s.length === 0 && hls) return [hls];
  return mp4s;
}

function pickVideoList(pin: PidgetsPin): Record<string, PinVideoEntry> | null {
  const direct = pin.videos?.video_list;
  if (direct && Object.keys(direct).length > 0) return direct;
  for (const page of pin.story_pin_data?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      const list = block.video?.video_list;
      if (list && Object.keys(list).length > 0) return list;
    }
  }
  return null;
}

export function createPinterestExtractor(env: ExtractorEnv = defaultEnv) {
  async function getInfo(
    url: string,
    _opts: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    if (!isPinterestHost(url)) return null;
    try {
      const isShort = /(?:^|\/\/)pin\.it\//iu.test(url);
      let target = url;
      if (isShort) target = await resolveShortLink(env, url);
      const id = parsePinId(target);
      if (!id) {
        if (isShort) throw notFound('Pinterest', 'pin');
        return null;
      }
      const res = await envFetch(
        env,
        `${PIDGETS_API}?pin_ids=${encodeURIComponent(id)}`,
        {
          headers: { 'User-Agent': DESKTOP_UA, Referer: REFERER },
        }
      );
      if (!res.ok) throw fromStatus(res.status, 'Pinterest', 'pin');
      const body = (await res.json()) as PidgetsResponse;
      const pin = body.data?.[0];
      if (!pin) throw notFound('Pinterest', 'pin');
      const videoList = pickVideoList(pin);
      if (!videoList) throw noVideo('Pinterest');
      const formats = buildFormats(videoList);
      if (formats.length === 0) throw noVideo('Pinterest');
      const first = Object.values(videoList).find((e) => e.url);
      const durationMs = first?.duration ?? 0;
      const info = buildVideoInfo({
        id: pin.id ?? id,
        title: titleFrom(pin),
        uploader: uploaderFrom(pin),
        webpageUrl: `https://www.pinterest.com/pin/${id}/`,
        thumbnail: first?.thumbnail,
        duration: durationMs > 0 ? Math.round(durationMs / 1000) : undefined,
        formats,
        extractorKey: 'pinterest',
        downloadHeaders: { 'User-Agent': DESKTOP_UA, Referer: REFERER },
      });
      info.title = normalizeTitle(info as unknown as Record<string, unknown>);
      info.uploader = normalizeArtist(
        info as unknown as Record<string, unknown>
      );
      return info;
    } catch (error: unknown) {
      if (error instanceof ExtractorError) throw error;
      throw classifyThrown(error, 'Pinterest');
    }
  }

  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const selected = selectFormat(videoInfo, options);
    if (!selected?.url) throw noVideo('Pinterest');
    if (selected.isHls || selected.url.includes('.m3u8')) {
      if (!env.remuxHls) throw new Error('HLS needs remuxHls');
      return env.remuxHls(selected.url, {});
    }
    return env.streamUrl(selected.url, {});
  }

  return { getInfo, getStream };
}
