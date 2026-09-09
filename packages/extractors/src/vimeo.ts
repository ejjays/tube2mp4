import { Format, VideoInfo, ExtractorOptions } from './shared/types.js';
import { ExtractorEnv, defaultEnv } from './shared/env.js';
import { normalizeTitle, normalizeArtist } from './shared/social.js';
import { noVideo, classifyThrown } from './shared/errors.js';
import { DESKTOP_UA, VIMEO_REFERER } from './shared/util.js';
import {
  envFetch,
  probeFileSize,
  selectFormat,
  buildVideoInfo,
} from './shared/fetch.js';
import { parseHlsMaster, hlsVariantsToFormats } from './shared/hls.js';

interface Progressive {
  quality?: string;
  width?: number;
  height?: number;
  fps?: number;
  url: string;
}
interface VimeoConfig {
  video?: {
    id?: number | string;
    title?: string;
    duration?: number;
    owner?: { name?: string };
    thumbs?: Record<string, string>;
  };
  request?: {
    files?: {
      progressive?: Progressive[];
      hls?: { default_cdn?: string; cdns?: Record<string, { url?: string }> };
    };
  };
}

interface VmMeta {
  id: string;
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
}

function buildInfo(meta: VmMeta, url: string, formats: Format[]): VideoInfo {
  const info = buildVideoInfo({
    id: meta.id,
    title: meta.title || 'Vimeo Video',
    uploader: meta.uploader || 'Vimeo',
    webpageUrl: url,
    thumbnail: meta.thumbnail,
    duration: meta.duration,
    formats,
    extractorKey: 'vimeo',
    downloadHeaders: { 'User-Agent': DESKTOP_UA, Referer: VIMEO_REFERER },
  });
  info.title = normalizeTitle(info as unknown as Record<string, unknown>);
  info.uploader = normalizeArtist(info as unknown as Record<string, unknown>);
  return info;
}

function parseId(url: string): { id: string; hash?: string } | null {
  const match = url.match(
    /(?:player\.vimeo\.com\/video\/|vimeo\.com\/(?:video\/)?)(\d+)(?:\/([a-z0-9]+))?/iu
  );
  return match ? { id: match[1], hash: match[2] } : null;
}

function sliceJson(text: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let idx = start; idx < text.length; idx += 1) {
    const ch = text[idx];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, idx + 1);
    }
  }
  return null;
}

function pickThumb(thumbs?: Record<string, string>): string | undefined {
  if (!thumbs) return undefined;
  const sized = Object.entries(thumbs)
    .filter(([key]) => /^\d+$/u.test(key))
    .sort((lhs, rhs) => Number(rhs[0]) - Number(lhs[0]));
  return sized[0]?.[1] ?? thumbs.base ?? Object.values(thumbs)[0];
}

function buildFormats(progressive: Progressive[]): Format[] {
  const seen = new Set<string>();
  const formats: Format[] = [];
  for (const prog of progressive) {
    if (!prog.url) continue;
    const quality = prog.quality || (prog.height ? `${prog.height}p` : 'src');
    if (seen.has(quality)) continue;
    seen.add(quality);
    formats.push({
      formatId: quality,
      url: prog.url,
      extension: 'mp4',
      resolution:
        prog.width && prog.height ? `${prog.width}x${prog.height}` : undefined,
      quality,
      width: prog.width,
      height: prog.height,
      fps: prog.fps,
      vcodec: 'h264',
      acodec: 'aac',
      isMuxed: true,
      isVideo: true,
      isAudio: false,
    });
  }
  formats.sort((lhs, rhs) => (rhs.height ?? 0) - (lhs.height ?? 0));
  return formats;
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
    const master = parseHlsMaster(await res.text(), masterUrl);
    return hlsVariantsToFormats(master, { durationSec });
  } catch {
    return [];
  }
}

export function createVimeoExtractor(env: ExtractorEnv = defaultEnv) {
  // restricted videos 403 /config; embed page embeds window.playerConfig
  async function playerPageConfig(
    id: string,
    hash?: string
  ): Promise<VimeoConfig | null> {
    const query = hash ? `?h=${hash}` : '';
    const res = await envFetch(
      env,
      `https://player.vimeo.com/video/${id}${query}`,
      {
        headers: { 'User-Agent': DESKTOP_UA, Referer: VIMEO_REFERER },
      }
    );
    if (!res.ok) return null;
    const html = await res.text();
    const at = html.indexOf('window.playerConfig');
    if (at < 0) return null;
    const open = html.indexOf('{', at);
    const json = open >= 0 ? sliceJson(html, open) : null;
    if (!json) return null;
    try {
      return JSON.parse(json) as VimeoConfig;
    } catch {
      return null;
    }
  }

  async function fetchConfig(
    id: string,
    hash?: string
  ): Promise<VimeoConfig | null> {
    const query = hash ? `?h=${hash}` : '';
    const res = await envFetch(
      env,
      `https://player.vimeo.com/video/${id}/config${query}`,
      { headers: { 'User-Agent': DESKTOP_UA, Referer: VIMEO_REFERER } }
    );
    if (res.ok) return (await res.json()) as VimeoConfig;
    if (hash) return playerPageConfig(id, hash);
    return null;
  }

  async function pageHash(
    id: string,
    url: string
  ): Promise<string | undefined> {
    try {
      const page = url.startsWith('http') ? url : `https://vimeo.com/${id}`;
      const res = await envFetch(env, page, {
        headers: { 'User-Agent': DESKTOP_UA },
      });
      if (!res.ok) return undefined;
      const html = await res.text();
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      const re = new RegExp(
        `player\\.vimeo\\.com/video/${escaped}\\?h=([a-z0-9]+)`,
        'iu'
      );
      return html.match(re)?.[1];
    } catch {
      return undefined;
    }
  }

  async function viaConfig(
    ref: { id: string; hash?: string },
    url: string
  ): Promise<VideoInfo | null> {
    let cfg = await fetchConfig(ref.id, ref.hash);
    if (!cfg && !ref.hash) {
      const hash = await pageHash(ref.id, url);
      if (hash) cfg = await fetchConfig(ref.id, hash);
    }
    if (!cfg) return null;
    const files = cfg.request?.files;

    const formats = buildFormats(files?.progressive ?? []);
    if (formats.length === 0) {
      const hls = files?.hls;
      const cdn = hls?.cdns?.[hls.default_cdn ?? ''];
      if (cdn?.url) {
        const variants = await fetchHlsVariants(
          env,
          cdn.url,
          cfg.video?.duration ?? 0,
          { 'User-Agent': DESKTOP_UA, Referer: VIMEO_REFERER }
        );
        if (variants.length) formats.push(...variants);
        else
          formats.push({
            formatId: 'auto',
            url: cdn.url,
            extension: 'mp4',
            quality: 'Auto',
            vcodec: 'h264',
            acodec: 'aac',
            isMuxed: true,
            isVideo: true,
            isAudio: false,
            isHls: true,
            hlsKeepAlive: true,
            note: 'hls m3u8',
          });
      }
    }
    if (formats.length === 0) return null;

    // progressive carries no size — HEAD each variant, fail-soft
    await Promise.all(
      formats.map(async (format) => {
        if (format.isHls || !format.url || format.filesize) return;
        const size = await probeFileSize(env, format.url, {
          'User-Agent': DESKTOP_UA,
          Referer: VIMEO_REFERER,
        });
        if (size) format.filesize = size;
      })
    );

    // older videos ship empty thumbs; oembed/og-image fallback
    let thumbnail = pickThumb(cfg.video?.thumbs);
    if (!thumbnail && env.oembedThumb) thumbnail = await env.oembedThumb(url);
    if (!thumbnail && env.ogImageThumb) thumbnail = await env.ogImageThumb(url);

    return buildInfo(
      {
        id: String(cfg.video?.id ?? ref.id),
        title: cfg.video?.title,
        uploader: cfg.video?.owner?.name,
        duration: cfg.video?.duration,
        thumbnail,
      },
      url,
      formats
    );
  }

  async function getInfo(
    url: string,
    _options: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    try {
      const ref = parseId(url);
      if (!ref) return null;
      const info = await viaConfig(ref, url);
      if (!info) throw noVideo('Vimeo');
      return info;
    } catch (error: unknown) {
      throw classifyThrown(error, 'Vimeo');
    }
  }

  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const selected = selectFormat(videoInfo, options);
    if (!selected?.url) throw noVideo('Vimeo');

    // progressive mp4 streams direct; only the hls fallback needs remuxing
    if (
      selected.isHls ||
      selected.note?.includes('hls') ||
      selected.url.includes('.m3u8')
    ) {
      if (!env.remuxHls) {
        throw new Error(
          'this vimeo stream is HLS (.m3u8) and needs remuxing to mp4 — ' +
            'pass env.remuxHls(url, headers) (e.g. spawn ffmpeg) to enable getStream()'
        );
      }
      return env.remuxHls(selected.url, {});
    }

    return env.streamUrl(selected.url, {});
  }

  return { getInfo, getStream };
}
