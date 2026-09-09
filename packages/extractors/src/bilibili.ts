import { Format, VideoInfo, ExtractorOptions } from './shared/types.js';
import { ExtractorEnv, defaultEnv } from './shared/env.js';
import { DESKTOP_UA, decodeEntities } from './shared/util.js';
import {
  noVideo,
  fromStatus,
  classifyThrown,
  ExtractorError,
} from './shared/errors.js';
import { envFetch, selectFormat, buildVideoInfo } from './shared/fetch.js';

const PLAYURL_API = 'https://api.bilibili.tv/intl/gateway/web/playurl';
const REFERER = 'https://www.bilibili.tv/';

interface BiliResource {
  quality?: number;
  bandwidth?: number;
  codecs?: string;
  size?: number;
  url?: string;
  width?: number;
  height?: number;
  frame_rate?: string;
}
interface BiliVideoEntry {
  video_resource?: BiliResource;
}
interface BiliPlayurl {
  duration?: number;
  video?: BiliVideoEntry[];
  audio_resource?: BiliResource[];
}
interface BiliResponse {
  data?: { playurl?: BiliPlayurl };
}

function parseIds(url: string): { aid?: string; epId?: string } {
  const play = /\/play\/(\d+)\/(\d+)/u.exec(url);
  if (play) return { epId: play[2] };
  const video = /\/video\/(\d+)/u.exec(url);
  if (video) return { aid: video[1] };
  return {};
}

function ogTag(html: string, prop: string): string | undefined {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const fwd = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
    'iu'
  );
  const bwd = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
    'iu'
  );
  const m = fwd.exec(html) || bwd.exec(html);
  return m ? m[1] : undefined;
}
function pickThumbnail(html: string): string | undefined {
  const ld = /"thumbnailUrl"\s*:\s*"([^"]+)"/u.exec(html);
  if (ld?.[1]) return ld[1];
  const og = ogTag(html, 'og:image');
  return og ? og.split('?')[0] : undefined;
}
function parseFrameRate(fr?: string): number | undefined {
  if (!fr) return undefined;
  const [num, den] = fr.split('/').map((part) => Number(part));
  if (!num || Number.isNaN(num)) return undefined;
  if (!den || Number.isNaN(den)) return Math.round(num);
  const value = num / den;
  return Number.isFinite(value) ? Math.round(value) : undefined;
}

async function fetchPageMeta(
  env: ExtractorEnv,
  url: string,
  cookie: Record<string, string>
): Promise<{ title?: string; thumbnail?: string; description?: string }> {
  try {
    const res = await envFetch(env, url, {
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        ...cookie,
      },
    });
    if (!res.ok) return {};
    const html = await res.text();
    const raw = ogTag(html, 'og:title');
    const title = raw
      ? decodeEntities(raw)
          .replace(/\s*[|\-–]\s*bili\s*bili\s*$/iu, '')
          .trim()
      : undefined;
    const descRaw = ogTag(html, 'og:description');
    return {
      title: title || undefined,
      thumbnail: pickThumbnail(html),
      description: descRaw
        ? decodeEntities(descRaw).trim() || undefined
        : undefined,
    };
  } catch {
    return {};
  }
}
function videoFormat(
  res: BiliResource,
  audioUrl: string | undefined,
  audioSize: number
): Format {
  const h = res.height || 0;
  const vSize = typeof res.size === 'number' ? res.size : 0;
  const total = vSize + audioSize;
  return {
    formatId: h ? `${h}p` : `q${res.quality ?? 'src'}`,
    url: res.url ?? '',
    extension: 'mp4',
    resolution: h ? `${h}p` : undefined,
    quality: h ? `${h}p` : undefined,
    width: res.width || undefined,
    height: h || undefined,
    fps: parseFrameRate(res.frame_rate),
    tbr: res.bandwidth ? Math.round(res.bandwidth / 1000) : undefined,
    vcodec: res.codecs || 'avc1',
    acodec: 'none',
    isVideo: true,
    isAudio: false,
    isMuxed: false,
    filesize: total > 0 ? total : undefined,
    audioUrl,
    muxAudioUrl: audioUrl,
    muxAudioExt: 'm4a',
  };
}
function audioFormat(a: BiliResource): Format {
  return {
    formatId: `audio-${a.quality ?? 'src'}`,
    url: a.url ?? '',
    extension: 'm4a',
    quality: 'Audio',
    tbr: a.bandwidth ? Math.round(a.bandwidth / 1000) : undefined,
    vcodec: 'none',
    acodec: 'aac',
    isVideo: false,
    isAudio: true,
    isMuxed: false,
    filesize: typeof a.size === 'number' ? a.size : undefined,
  };
}
function buildFormats(playurl: BiliPlayurl): {
  videoFormats: Format[];
  audioFormats: Format[];
} {
  const audios = (playurl.audio_resource ?? []).filter((a) => a.url);
  const audioFormats = audios
    .map(audioFormat)
    .sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0));
  const best = audioFormats[0];
  const aSize = best && typeof best.filesize === 'number' ? best.filesize : 0;
  const seen = new Set<number>();
  const videoFormats: Format[] = [];
  for (const e of playurl.video ?? []) {
    const r = e.video_resource;
    if (!r?.url) continue;
    if (!(r.codecs ?? '').toLowerCase().startsWith('avc')) continue;
    const h = r.height || 0;
    if (seen.has(h)) continue;
    seen.add(h);
    videoFormats.push(videoFormat(r, best?.url, aSize));
  }
  videoFormats.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return { videoFormats, audioFormats };
}

export function createBilibiliExtractor(env: ExtractorEnv = defaultEnv) {
  async function getInfo(
    url: string,
    _options: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    const direct = parseIds(url);
    let target = url;
    let aid = direct.aid;
    let epId = direct.epId;
    if (!aid && !epId) {
      try {
        const res = await envFetch(env, url, {
          headers: { 'User-Agent': DESKTOP_UA },
          redirect: 'follow',
        } as RequestInit);
        target = (res as unknown as { url: string }).url || url;
        const p = parseIds(target);
        aid = p.aid;
        epId = p.epId;
      } catch {
        /* fall through */
      }
    }
    if (!aid && !epId) return null;

    const cookie: Record<string, string> = {};
    const maybeCookie = (env as { cookie?: string }).cookie;
    if (maybeCookie) cookie.Cookie = maybeCookie;

    try {
      const q = new URLSearchParams({ platform: 'web', s_locale: 'en_US' });
      if (aid) q.set('aid', aid);
      else if (epId) q.set('ep_id', epId);

      const [playRes, meta] = await Promise.all([
        envFetch(env, `${PLAYURL_API}?${q.toString()}`, {
          headers: {
            'User-Agent': DESKTOP_UA,
            Referer: REFERER,
            Accept: 'application/json',
            ...cookie,
          },
        }),
        fetchPageMeta(env, target, cookie),
      ]);
      if (!playRes.ok) throw fromStatus(playRes.status, 'Bilibili');
      const payload = (await playRes.json()) as BiliResponse;
      const playurl = payload?.data?.playurl;
      if (!playurl) throw noVideo('Bilibili');
      const { videoFormats, audioFormats } = buildFormats(playurl);
      if (videoFormats.length === 0 && audioFormats.length === 0)
        throw noVideo('Bilibili');
      const dur = playurl.duration
        ? Math.round(playurl.duration / 1000)
        : undefined;
      return buildVideoInfo({
        id: aid || epId || target,
        title: meta.title || 'Bilibili Video',
        uploader: 'Bilibili',
        webpageUrl: target,
        thumbnail: meta.thumbnail,
        description: meta.description,
        duration: dur,
        formats: videoFormats.length ? videoFormats : audioFormats,
        audioFormats: audioFormats.length ? audioFormats : undefined,
        extractorKey: 'bilibili',
        downloadHeaders: {
          'User-Agent': DESKTOP_UA,
          Referer: REFERER,
          Range: 'bytes=0-',
        },
      });
    } catch (error: unknown) {
      if (error instanceof ExtractorError) throw error;
      throw classifyThrown(error, 'Bilibili');
    }
  }

  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const opts = options as ExtractorOptions & {
      type?: string;
      format?: string;
    };
    const wantAudio =
      opts.type === 'audio' ||
      opts.format === 'mp3' ||
      opts.format === 'm4a' ||
      opts.format === 'audio';
    let sel: Format | undefined;
    if (wantAudio) {
      const pool =
        (videoInfo as unknown as { audioFormats?: Format[] }).audioFormats ??
        [];
      sel =
        selectFormat(videoInfo, opts, pool) ??
        pool[0] ??
        videoInfo.formats.find((f) => f.isAudio);
    } else {
      sel = selectFormat(videoInfo, opts);
    }
    if (!sel?.url) throw noVideo('Bilibili');
    return env.streamUrl(sel.url, {
      'User-Agent': DESKTOP_UA,
      Referer: REFERER,
    });
  }

  return { getInfo, getStream };
}
