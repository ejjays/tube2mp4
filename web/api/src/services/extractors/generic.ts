import { Readable } from 'node:stream';
import { logger } from '../../utils/infra/logger.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../types/index.js';
import { getProxiedStream } from '../../utils/network/proxy.util.js';
import { secureFetch } from '../../utils/network/security.util.js';
import { runYtdlpLocal } from '../ytdlp/info-core.js';

// Pure reference (§1.1): extension list from the onLoadResource generic matcher
const MEDIA_EXT_RE =
  /[.](mp4|m3u8|webm|mkv|m4a|mov|3gp|mp3|aac|ogg|flv|wav)(?:[?#]|$)/iu;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function isDirectMediaUrl(url: string): boolean {
  return MEDIA_EXT_RE.test(url);
}

interface YtDlpJson {
  title?: string;
  uploader?: string;
  channel?: string;
  thumbnail?: string;
  duration?: number;
  webpage_url?: string;
  extractor?: string;
  extractor_key?: string;
  formats?: Array<{
    format_id?: string | number;
    url?: string;
    protocol?: string;
    ext?: string;
    vcodec?: string;
    acodec?: string;
    filesize?: number;
    height?: number;
    width?: number;
    tbr?: number;
    format_note?: string;
  }>;
}

function probeDirect(url: string): Promise<VideoInfo | null> {
  return secureFetch(url, {
    method: 'HEAD',
    headers: { 'User-Agent': UA },
  })
    .then((res) => {
      if (!res.ok) return null;
      const extMatch = url.match(/[.]([a-z0-9]{2,5})(?:[?#]|$)/iu);
      const ext =
        extMatch && /^(mp4|m3u8|webm|mkv|m4a|mov|3gp|mp3|aac|ogg|flv|wav)$/iu.test(extMatch[1])
          ? extMatch[1].toLowerCase()
          : /m3u8/iu.test(url)
            ? 'm3u8'
            : 'mp4';
      const size = Number(res.headers.get('content-length') || 0);
      const isHls = ext === 'm3u8';
      const audioExt = /^(mp3|aac|ogg|m4a|wav)$/iu.test(ext);
      const format: Format = {
        formatId: ext,
        url,
        extension: ext,
        isVideo: !audioExt,
        isAudio: audioExt,
        isMuxed: !isHls,
        filesize: size > 0 ? size : undefined,
        note: isHls ? 'hls' : 'direct',
      };
      return {
        type: 'video' as const,
        id: `gen_${Buffer.from(url).toString('base64').substring(0, 10)}`,
        title: 'Video',
        uploader: 'Direct URL',
        webpageUrl: url,
        formats: [format],
        extractorKey: 'generic',
        fromBrain: false,
        isPartial: false,
        isIsrcMatch: false,
        isJsInfo: true,
        isFullData: false,
      };
    })
    .catch((error: unknown) => {
      logger.warn(
        `[Generic] direct probe failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    });
}

function mapFormats(meta: YtDlpJson): Format[] {
  const seen = new Set<string>();
  const out: Format[] = [];
  const formats = meta.formats ?? [];
  for (const item of formats) {
    if (!item.url || !/^https?:/iu.test(item.url)) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    const isHls =
      item.protocol?.includes('m3u8') ||
      /[.]m3u8(?:[?#]|$)/iu.test(item.url);
    const audioOnly = !item.vcodec || item.vcodec === 'none';
    const videoOnly = !item.acodec || item.acodec === 'none';
    out.push({
      formatId: String(item.format_id ?? out.length),
      url: item.url,
      extension: isHls ? 'm3u8' : (item.ext ?? 'mp4'),
      resolution: item.height ? `${item.height}p` : item.format_note,
      vcodec: videoOnly ? undefined : item.vcodec,
      acodec: audioOnly ? undefined : item.acodec,
      filesize: item.filesize,
      tbr: item.tbr,
      width: item.width,
      height: item.height,
      isVideo: !audioOnly,
      isAudio: audioOnly,
      isMuxed: !videoOnly && !audioOnly,
      note: isHls ? 'hls' : undefined,
    });
  }
  // prefer a muxed/complete source so the proxy can serve it directly
  return out.sort((left, right) => {
    const leftScore = Number(left.isMuxed) + Number(left.height != null);
    const rightScore = Number(right.isMuxed) + Number(right.height != null);
    return (
      rightScore - leftScore ||
      Number(right.filesize ?? 0) - Number(left.filesize ?? 0)
    );
  });
}

function ytDlpJson(url: string): Promise<YtDlpJson | null> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    runYtdlpLocal(
      [
        '--no-playlist',
        '--skip-download',
        '--no-warnings',
        '--no-check-certificates',
        '-J',
        url,
      ],
      controller.signal
    )
      .then((result) => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(result.stdout) as YtDlpJson);
        } catch {
          if (result.stderr.trim()) {
            logger.warn(
              `[Generic] yt-dlp failed (${url}): ${result.stderr.trim().slice(0, 300)}`
            );
          }
          resolve(null);
        }
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        logger.warn(
          `[Generic] yt-dlp error (${url}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        resolve(null);
      });
  });
}

export async function getInfo(
  url: string,
  _options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  logger.info(`[Metadata] Engine: Generic | URL: ${url}`);
  if (isDirectMediaUrl(url)) return probeDirect(url);

  const meta = await ytDlpJson(url);
  if (!meta) return null;

  const formats = mapFormats(meta);
  if (formats.length === 0) {
    logger.warn(`[Generic] no formats for ${url}`);
    return null;
  }
  const audioFormats = formats.filter((format) => format.isAudio);

  return {
    type: 'video',
    id: `gen_${Buffer.from(url).toString('base64').substring(0, 10)}`,
    title: meta.title || 'Unknown Video',
    uploader: meta.uploader || meta.channel || 'Unknown',
    thumbnail: meta.thumbnail || undefined,
    duration: meta.duration,
    webpageUrl: meta.webpage_url || url,
    formats,
    audioFormats: audioFormats.length > 0 ? audioFormats : undefined,
    extractorKey: 'generic',
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isJsInfo: true,
    isFullData: false,
  };
}

export function getStream(
  videoInfo: VideoInfo,
  options: ExtractorOptions = {}
): Promise<Readable> {
  const opts = options as ExtractorOptions & { type?: string };
  const wantAudio =
    opts.type === 'audio' ||
    opts.format === 'mp3' ||
    opts.format === 'm4a' ||
    opts.format === 'audio';

  const pool = wantAudio
    ? videoInfo.formats.filter((format) => format.isAudio) ?? []
    : videoInfo.formats;
  const selected =
    (wantAudio ? pool : videoInfo.formats).find(
      (format) => format.formatId === opts.formatId
    ) ||
    (wantAudio ? pool[0] : videoInfo.formats.find((format) => format.isMuxed)) ||
    videoInfo.formats[0];

  if (!selected?.url) throw new Error('No stream URL found');

  const pageUrl =
    videoInfo.webpageUrl && /^https?:/iu.test(videoInfo.webpageUrl)
      ? new URL(videoInfo.webpageUrl).origin
      : undefined;

  return Promise.resolve(
    getProxiedStream(selected.url, {
      'User-Agent': UA,
      ...(pageUrl ? { Referer: pageUrl } : {}),
    })
  );
}