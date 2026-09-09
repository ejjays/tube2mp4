import { Format, VideoInfo, ExtractorOptions } from './shared/types.js';
import { ExtractorEnv, defaultEnv } from './shared/env.js';
import { normalizeTitle, normalizeArtist } from './shared/social.js';
import { DESKTOP_UA } from './shared/util.js';
import {
  notFound,
  restricted,
  noVideo,
  fromStatus,
  classifyThrown,
  ExtractorError,
} from './shared/errors.js';
import { envFetch, selectFormat, buildVideoInfo } from './shared/fetch.js';
import {
  parseHlsMaster,
  hlsVariantsToFormats,
  mediaPlaylistDuration,
} from './shared/hls.js';

const REFERER = 'https://www.dailymotion.com/';

interface DmStream {
  type?: string;
  url?: string;
}
interface DmMeta {
  id?: string;
  title?: string;
  duration?: number;
  owner?: { screenname?: string; username?: string };
  thumbnails?: Record<string, string>;
  qualities?: Record<string, DmStream[]>;
  error?: { title?: string; raw_message?: string; code?: string | number };
}

function parseId(url: string): string | null {
  const m = url.match(
    /(?:dailymotion\.com\/(?:embed\/)?video\/|dai\.ly\/)([a-z0-9]+)/iu
  );
  return m ? m[1] : null;
}

function pickThumb(thumbs?: Record<string, string>): string | undefined {
  if (!thumbs) return undefined;
  const entries = Object.entries(thumbs).sort(
    (a, b) => Number(b[0]) - Number(a[0])
  );
  return entries[0]?.[1] ?? Object.values(thumbs)[0];
}

function dmError(error: NonNullable<DmMeta['error']>): ExtractorError {
  const code = String(error.code ?? '');
  if (code === '404') return notFound('Dailymotion');
  if (code === 'DM016') return restricted('Dailymotion', 'by its owner');
  return error.title
    ? new ExtractorError(
        `This Dailymotion video can't be loaded — ${error.title}.`,
        false
      )
    : noVideo('Dailymotion');
}

async function fetchHlsVariants(
  env: ExtractorEnv,
  masterUrl: string,
  durationSec: number,
  headers: Record<string, string>
): Promise<Format[]> {
  try {
    const res = await envFetch(env, masterUrl, { headers });
    if (!res.ok) return [];
    const text = await res.text();
    const master = parseHlsMaster(text, masterUrl);
    const effective = durationSec || mediaPlaylistDuration(text);
    return hlsVariantsToFormats(master, { durationSec: effective });
  } catch {
    return [];
  }
}

export function createDailymotionExtractor(env: ExtractorEnv = defaultEnv) {
  async function getInfo(
    url: string,
    _opts: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    const id = parseId(url);
    if (!id) return null;
    try {
      const res = await envFetch(
        env,
        `https://www.dailymotion.com/player/metadata/video/${id}`,
        { headers: { 'User-Agent': DESKTOP_UA, Referer: REFERER } }
      );
      if (!res.ok) throw fromStatus(res.status, 'Dailymotion');
      const meta = (await res.json()) as DmMeta;
      if (meta.error) throw dmError(meta.error);
      const master = meta.qualities?.auto?.[0]?.url;
      if (!master) throw noVideo('Dailymotion');

      let formats = await fetchHlsVariants(env, master, meta.duration ?? 0, {
        'User-Agent': DESKTOP_UA,
        Referer: REFERER,
      });
      if (formats.length === 0) {
        formats = [
          {
            formatId: 'auto',
            url: master,
            extension: 'mp4',
            quality: 'Auto',
            vcodec: 'h264',
            acodec: 'aac',
            isVideo: true,
            isAudio: false,
            isMuxed: true,
            isHls: true,
            hlsKeepAlive: true,
            note: 'hls m3u8',
          },
        ];
      }

      const info = buildVideoInfo({
        id: String(meta.id ?? id),
        title: meta.title ?? 'Dailymotion Video',
        uploader:
          meta.owner?.screenname ?? meta.owner?.username ?? 'Dailymotion',
        webpageUrl: url,
        thumbnail: pickThumb(meta.thumbnails),
        duration: meta.duration,
        formats,
        extractorKey: 'dailymotion',
        downloadHeaders: { 'User-Agent': DESKTOP_UA, Referer: REFERER },
      });
      info.title = normalizeTitle(info as unknown as Record<string, unknown>);
      info.uploader = normalizeArtist(
        info as unknown as Record<string, unknown>
      );
      return info;
    } catch (error: unknown) {
      if (error instanceof ExtractorError) throw error;
      throw classifyThrown(error, 'Dailymotion');
    }
  }

  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const selected = selectFormat(videoInfo, options);
    if (!selected?.url) throw noVideo('Dailymotion');
    if (selected.isHls || selected.url.includes('.m3u8')) {
      if (!env.remuxHls) throw new Error('HLS needs remuxHls');
      return env.remuxHls(selected.url, {});
    }
    return env.streamUrl(selected.url, {});
  }

  return { getInfo, getStream };
}
