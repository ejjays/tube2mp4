import { Format, VideoInfo } from '@phantom/extractors';

export type DownloadState = {
  status: 'downloading' | 'muxing' | 'saving' | 'saved' | 'error';
  progress: number;
};

export type DownloadMeta = {
  title?: string;
  author?: string;
};

export function formatSize(bytes?: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function formatLabel(format: Format): string {
  return format.quality || format.resolution || format.formatId;
}

export type BadgeInfo = { label: string; tone: 'cyan' | 'amber' };

export function qualityText(format: Format): string {
  const raw = format.quality || format.resolution || '';
  if (raw.includes('4320')) return '8K';
  if (raw.includes('2160')) return '4K';
  if (raw.includes('1440')) return '2K';
  return formatLabel(format);
}

export function extLabel(format: Format): string {
  return (format.extension || 'RAW').toUpperCase();
}

export function isAudioOnly(format: Format): boolean {
  return format.isAudio && !format.isVideo;
}

export function titleFor(format: Format): string {
  return isAudioOnly(format) ? extLabel(format) : qualityText(format);
}

export function subtitleFor(format: Format): string {
  const size = formatSize(format.filesize);
  if (isAudioOnly(format)) {
    const tag =
      format.extension === 'mp3' && !format.noTranscode
        ? 'Converted'
        : 'Original';
    return size ? `${tag} · ${size}` : tag;
  }
  return size ? `${size} · ${extLabel(format)}` : extLabel(format);
}

export function badgeFor(format: Format): BadgeInfo | null {
  if (isAudioOnly(format)) {
    // converted mp3 HIGH, native source MAX
    return format.extension === 'mp3' && !format.noTranscode
      ? { label: 'HIGH', tone: 'cyan' }
      : { label: 'MAX', tone: 'amber' };
  }
  return null;
}

// synthetic mp3 option (HIGH / Converted) transcoded from a direct source.
function mp3Option(src: Format): Format {
  return {
    ...src,
    formatId: 'audio-mp3',
    extension: 'mp3',
    isAudio: true,
    isVideo: false,
    isMuxed: false,
    noTranscode: false,
    audioDemux: false,
    quality: undefined,
    resolution: undefined,
    width: undefined,
    height: undefined,
    filesize: undefined,
    muxAudioUrl: undefined,
    hlsAudioUrl: undefined,
  };
}

/*
 * audio mode's dropdown = a consistent MAX (original/lossless) + HIGH (mp3,
 * converted) pair on every platform. native audio-only formats are used as-is
 * for MAX; platforms with only muxed video get their audio demuxed (m4a, copy)
 * or transcoded (mp3). hls sources skip the mp3 path (needs a direct file).
 * returns [] when there's genuinely no audio (silent video / image post).
 */
export function buildAudioOptions(info: VideoInfo): Format[] {
  const { formats } = info;
  const natives = formats.filter(isAudioOnly);
  const bestNative =
    [...natives].sort(
      (first, second) => (second.tbr ?? 0) - (first.tbr ?? 0)
    )[0] ?? natives[0];

  if (bestNative) {
    const options: Format[] = [bestNative];
    if (
      !bestNative.isHls &&
      !bestNative.hlsAudioUrl &&
      bestNative.extension !== 'mp3'
    ) {
      options.push(mp3Option(bestNative));
    }
    return options;
  }

  // no audio-only track — a video format may carry a separate progressive audio
  // track (reddit DASH, bilibili); it's already audio bytes, download directly
  const sep = formats.find(
    (format) => format.muxAudioUrl && !format.hlsAudioUrl
  );
  if (sep?.muxAudioUrl) {
    const max: Format = {
      ...sep,
      formatId: 'audio-max',
      url: sep.muxAudioUrl,
      extension: sep.muxAudioExt || 'm4a',
      isAudio: true,
      isVideo: false,
      isMuxed: false,
      audioDemux: false,
      quality: undefined,
      resolution: undefined,
      width: undefined,
      height: undefined,
      filesize: undefined,
      muxAudioUrl: undefined,
      hlsAudioUrl: undefined,
      noTranscode: undefined,
    };
    return [max, mp3Option(max)];
  }

  // else derive from a progressive muxed video (not hls, since demux/transcode
  // need a real downloaded file, not a playlist)
  const muxed = formats.find(
    (format) =>
      format.isVideo && format.isAudio && !format.isHls && !!format.url
  );
  if (!muxed) return [];

  return [
    {
      ...muxed,
      formatId: 'audio-max',
      extension: 'm4a',
      isAudio: true,
      isVideo: false,
      isMuxed: false,
      audioDemux: true,
      quality: undefined,
      resolution: undefined,
      width: undefined,
      height: undefined,
      filesize: undefined,
      muxAudioUrl: undefined,
      hlsAudioUrl: undefined,
      noTranscode: undefined,
    },
    mp3Option(muxed),
  ];
}

/* prefer muxed stream; reddit split a/v previews silent */
export function previewableFormat(
  formats: Format[],
  selected: Format | null,
  isAudio: boolean,
  extractorKey?: string
): Format | null {
  if (isAudio) return null;
  if (selected?.isMuxed && selected?.isVideo && selected?.url) {
    return selected;
  }
  const muxed = formats.find(
    (format) => format.isMuxed && format.isVideo && Boolean(format.url)
  );
  if (muxed) return muxed;
  // reddit: preview video track, no audio
  if (extractorKey === 'reddit') {
    if (selected?.isVideo && selected?.url) return selected;
    return (
      formats.find((format) => format.isVideo && Boolean(format.url)) ?? null
    );
  }
  return null;
}

export function dlLabel(state?: DownloadState): string {
  if (state?.status === 'downloading') return `${state.progress}%`;
  if (state?.status === 'saving') return `${state.progress}%`;
  if (state?.status === 'saved') return 'Done ✓';
  if (state?.status === 'error') return 'Retry';
  return 'Download';
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function prettyName(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*[\]{}#%^`]/gu, '')
    .replace(/[\r\n\t]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!cleaned) return 'video';
  if (cleaned.length <= 64) return cleaned;
  const suffix = hashString(cleaned).slice(0, 4);
  return `${cleaned.slice(0, 59).trim()} ${suffix}`;
}

export function refererFor(extractorKey: string): string {
  if (extractorKey === 'tiktok') return 'https://www.tiktok.com/';
  if (extractorKey === 'x') return 'https://x.com/';
  if (extractorKey === 'threads') return 'https://www.threads.com/';
  if (extractorKey === 'bluesky') return 'https://bsky.app/';
  if (extractorKey === 'reddit') return 'https://www.reddit.com/';
  return 'https://www.facebook.com/';
}
