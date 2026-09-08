import { Format } from './types.js';
import { estimateSize } from './util.js';

export interface HlsVariant {
  url: string;
  width: number;
  height: number;
  bandwidth: number;
  frameRate?: number;
  codecs: string;
}

export interface HlsMaster {
  variants: HlsVariant[];
  /** absolute URL of the EXT-X-MEDIA audio rendition, if any */
  audioUrl?: string;
}

function vcodecFrom(codecs: string): string {
  if (/av01/iu.test(codecs)) return 'av1';
  if (/hvc1|hev1/iu.test(codecs)) return 'hevc';
  return 'h264';
}

/** Line scan, not a whole-document regex — no backtracking surface on hostile input. */
export function parseHlsMaster(master: string, masterUrl: string): HlsMaster {
  const lines = master.split(/\r?\n/u);
  const variants: HlsVariant[] = [];
  let audioUrl: string | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/iu.test(line)) {
      const uri = line.match(/URI="([^"]+)"/u)?.[1];
      if (uri && !audioUrl) audioUrl = absoluteUrl(uri, masterUrl);
      continue;
    }

    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

    const uri = lines[i + 1]?.trim();
    if (!uri || uri.startsWith('#')) continue;

    const dims = line.match(/RESOLUTION=(\d+)x(\d+)/u);
    const width = dims ? Number(dims[1]) : 0;
    const height = dims ? Number(dims[2]) : 0;
    const bandwidth = Number(
      line.match(/AVERAGE-BANDWIDTH=(\d+)/u)?.[1] ??
        line.match(/(?:^|[^-\w])BANDWIDTH=(\d+)/u)?.[1] ??
        0
    );
    const frameRate = Number(line.match(/FRAME-RATE=([\d.]+)/u)?.[1] ?? '0');

    const url = absoluteUrl(uri, masterUrl);
    if (!url) continue;

    variants.push({
      url,
      width,
      height,
      bandwidth,
      frameRate:
        Number.isFinite(frameRate) && frameRate > 0 ? frameRate : undefined,
      codecs: line.match(/CODECS="([^"]+)"/u)?.[1] ?? '',
    });
  }

  return { variants, audioUrl };
}

function absoluteUrl(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

/** Dedupes by label, sorts best-first. Short-edge label: 720x1280 reads "720p". */
export function hlsVariantsToFormats(
  master: HlsMaster,
  options: { durationSec?: number; keepAlive?: boolean } = {}
): Format[] {
  const seen = new Set<number>();
  const formats: Format[] = [];

  for (const variant of master.variants) {
    const short =
      variant.width && variant.height
        ? Math.min(variant.width, variant.height)
        : 0;
    const label = short || variant.height;
    if (label > 0) {
      if (seen.has(label)) continue;
      seen.add(label);
    }
    formats.push({
      formatId: label ? `${label}p` : 'source',
      url: variant.url,
      hlsAudioUrl: master.audioUrl,
      extension: 'mp4',
      resolution:
        variant.width && variant.height
          ? `${variant.width}x${variant.height}`
          : undefined,
      quality: short ? `${short}p` : 'Source',
      width: variant.width || undefined,
      height: variant.height || undefined,
      fps: variant.frameRate ? Math.round(variant.frameRate) : undefined,
      tbr: variant.bandwidth ? Math.round(variant.bandwidth / 1000) : undefined,
      filesize: estimateSize(variant.bandwidth, options.durationSec ?? 0),
      vcodec: vcodecFrom(variant.codecs),
      acodec: 'aac',
      isMuxed: true,
      isVideo: true,
      isAudio: false,
      isHls: true,
      hlsKeepAlive: options.keepAlive ?? true,
    });
  }

  formats.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return formats;
}

/** sum #EXTINF segment durations — used for media (non-master) playlists */
export function mediaPlaylistDuration(playlist: string): number {
  let total = 0;
  for (const match of playlist.matchAll(/#EXTINF:([\d.]+)/gu)) {
    total += Number(match[1]);
  }
  return Number.isFinite(total) ? total : 0;
}
