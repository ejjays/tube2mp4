import { Format } from '../../types/index.js';

export interface RawFormat {
  url?: string;
  bitrate?: number;
  average_bitrate?: number;
  height?: number;
  width?: number;
  fps?: string | number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  formatId?: string | number;
  format_id?: string | number;
  itag?: string | number;
  ext?: string;
  extension?: string;
  resolution?: string;
  quality_label?: string;
  quality?: string;
  abr?: number;
  tbr?: number;
  isAudio?: boolean;
  is_audio?: boolean;
  hasAudio?: boolean;
  has_audio?: boolean;
  isVideo?: boolean;
  is_video?: boolean;
  hasVideo?: boolean;
  has_video?: boolean;
  isMuxed?: boolean;
  is_muxed?: boolean;
  audioUrl?: string;
  audio_url?: string;
  language?: string;
  format_note?: string;
  language_preference?: number;
  is_original?: boolean;
  is_dubbed?: boolean;
  audio_track?: {
    id?: string;
    display_name?: string;
    audio_is_default?: boolean;
  };
  [key: string]: unknown;
}

export interface AudioTrackInfo {
  language?: string;
  languageName?: string;
  isOriginal?: boolean;
}

export function resolveAudioTrack(format: RawFormat): AudioTrackInfo {
  const audioTrack = format.audio_track;

  let language: string | undefined =
    (typeof format.language === 'string' && format.language) || undefined;
  if (!language && audioTrack?.id) {
    language = String(audioTrack.id).split('.')[0] || undefined;
  }

  let languageName: string | undefined = audioTrack?.display_name || undefined;

  const note = String(format.format_note || '').toLowerCase();
  const noteSaysOriginal = note.includes('original');
  const noteSaysDubbed = note.includes('dub');
  const langPref = Number(format.language_preference);

  const isOriginal =
    format.is_original === true ||
    audioTrack?.audio_is_default === true ||
    (Number.isFinite(langPref) && langPref >= 10) ||
    noteSaysOriginal ||
    (note.includes('default') && !noteSaysDubbed);

  if (!languageName && format.format_note) {
    const cleaned = String(format.format_note)
      .replace(/,\s*(ultralow|low|medium|high).*$/iu, '')
      .replace(/\((default|original)\)/giu, '')
      .trim();
    languageName = cleaned || undefined;
  }

  if (!language && !languageName) return {};
  return { language, languageName, isOriginal: isOriginal || undefined };
}

export function estimateFilesize(format: RawFormat, duration: number): number {
  if (format.filesize) return Number(format.filesize);
  if (format.filesize_approx) return Number(format.filesize_approx);

  const bitrate =
    Number(format.average_bitrate || format.bitrate) ||
    (format.tbr ? Number(format.tbr) * 1024 : 0);

  if (bitrate && duration) {
    return (bitrate * duration) / 8;
  }
  return 0;
}

export function getFormatHeight(format: RawFormat): number {
  if (format.height) return Number(format.height);

  const resolution =
    format.resolution || format.quality_label || format.quality || '';
  const match = String(resolution).match(/(\d{3,4})p/u);
  if (match) return parseInt(match[1], 10);

  return 0;
}

function resolveResolution(format: RawFormat): {
  resolution: string;
  height: number;
} {
  let height = getFormatHeight(format);
  let resolution = String(
    format.resolution || format.quality_label || format.quality || ''
  );

  const dimMatch = resolution.match(/(\d{1,5})x(\d{1,5})/u);
  if (dimMatch) {
    const width = parseInt(dimMatch[1], 10);
    const hValue = parseInt(dimMatch[2], 10);
    height = Math.min(width, hValue);
  }

  if (height) {
    resolution = `${height}p`;
  } else if (resolution) {
    const hMatch = resolution.match(/(\d{3,4})p?/u);
    if (hMatch) {
      resolution = `${hMatch[1]}p`;
      height = parseInt(hMatch[1], 10);
    }
  }

  if (!resolution || resolution === '') resolution = 'Unknown';
  return { resolution, height };
}

function resolveCodecs(format: RawFormat) {
  const acodec = String(
    format.acodec ||
      (format.vcodec && format.vcodec !== 'none' ? 'yes' : 'none')
  );
  const vcodecStr = String(format.vcodec || '');
  const isMuxed =
    format.isMuxed ||
    format.is_muxed ||
    (vcodecStr !== 'none' &&
      vcodecStr !== '' &&
      acodec !== 'none' &&
      acodec !== '');

  return { acodec, vcodecStr, isMuxed: Boolean(isMuxed) };
}

function resolveVideoAudioFlags(format: RawFormat, acodec: string) {
  const isVideoFlag =
    format.isVideo === true ||
    format.is_video === true ||
    format.hasVideo === true ||
    format.has_video === true;

  const isVideo = isVideoFlag || (format.vcodec && format.vcodec !== 'none');

  const isAudio = Boolean(
    format.isAudio ||
    format.is_video === false ||
    format.is_audio ||
    format.hasAudio ||
    format.has_video ||
    (acodec !== 'none' && acodec !== '')
  );
  return { isVideo: Boolean(isVideo), isAudio };
}

function mapRawToFormat(format: RawFormat, duration: number): Format | null {
  if (!format.url) return null;

  const { resolution, height } = resolveResolution(format);
  const { acodec, vcodecStr, isMuxed } = resolveCodecs(format);
  const { isVideo, isAudio } = resolveVideoAudioFlags(format, acodec);
  const filesize = calculateFinalSize(format, duration);

  // force mp4 container for all video
  const rawExtension = format.extension || format.ext || 'mp4';
  const extension = isVideo && !isAudio ? 'mp4' : rawExtension;

  return {
    formatId: String(format.formatId || format.format_id || format.itag),
    extension,
    url: format.url,
    resolution,
    quality: resolution,
    filesize,
    fps: Number(format.fps) || 0,
    height,
    vcodec: vcodecStr || 'yes',
    acodec,
    isMuxed,
    isVideo,
    isAudio,
    audioUrl: format.audioUrl || format.audio_url || undefined,
    itag: Number(format.itag) || 0,
    width: Number(format.width) || 0,
  };
}

function calculateFinalSize(format: RawFormat, duration: number) {
  return Math.round(estimateFilesize(format, duration));
}

const AV1_FORMAT_IDS = new Set([
  '394',
  '395',
  '396',
  '397',
  '398',
  '399',
  '400',
  '401',
  '571',
]);

export function processVideoFormats(info: {
  duration?: number;
  formats?: RawFormat[];
  streaming_data?: { formats?: RawFormat[]; adaptive_formats?: RawFormat[] };
}): Format[] {
  const rawList: RawFormat[] = [
    ...(info.formats || []),
    ...(info.streaming_data?.formats || []),
    ...(info.streaming_data?.adaptive_formats || []),
  ];

  if (rawList.length === 0) return [];

  const uniqueFormats = new Map<string, Format>();
  const duration = info.duration || 0;

  const processed = rawList
    .map((format: RawFormat) => mapRawToFormat(format, duration))
    .filter((item): item is Format => item !== null)
    .filter(
      (format: Format) =>
        format.isVideo || String(format.formatId).startsWith('photo')
    )
    .filter((format: Format) => {
      // av1 must drop before dedup competition
      const vcodec = String(format.vcodec || '');
      if (vcodec.startsWith('av01')) return false;
      return !AV1_FORMAT_IDS.has(String(format.formatId || ''));
    });

  for (const format of processed) {
    const resKey = String(format.formatId).startsWith('photo')
      ? String(format.formatId)
      : format.resolution && format.resolution !== 'Unknown'
        ? format.resolution
        : `Unknown-${format.height || format.formatId}`;

    const key = `${resKey}-${format.extension}`;
    const existing = uniqueFormats.get(key);

    // prioritize muxed formats
    if (
      !existing ||
      (format.isMuxed && !existing.isMuxed) ||
      (format.isMuxed === existing.isMuxed &&
        (format.filesize || 0) > (existing.filesize || 0))
    ) {
      uniqueFormats.set(key, format);
    }
  }

  return Array.from(uniqueFormats.values()).sort(
    (first: Format, second: Format) =>
      (second.height || 0) - (first.height || 0)
  );
}

// kept for callers that need explicit filtering
export function dropAV1Formats(formats: Format[]): Format[] {
  return formats.filter((format) => {
    const vcodec = String(format.vcodec || '');
    if (vcodec.startsWith('av01')) return false;
    return !AV1_FORMAT_IDS.has(String(format.formatId || ''));
  });
}

export function processAudioFormats(info: {
  formats?: RawFormat[];
  streaming_data?: { formats?: RawFormat[]; adaptive_formats?: RawFormat[] };
}): Format[] {
  const formats: RawFormat[] = [
    ...(info.formats || []),
    ...(info.streaming_data?.formats || []),
    ...(info.streaming_data?.adaptive_formats || []),
  ];

  if (formats.length === 0) return [];

  const uniqueFormats = new Map<string, Format>();

  const processed = formats
    .map((format: RawFormat): Format | null => {
      if (!format.url) return null;

      const { acodec, vcodecStr } = resolveCodecs(format);
      const { isVideo, isAudio } = resolveVideoAudioFlags(format, acodec);

      // check audio streams
      if (!isAudio || isVideo) return null;

      // drop opus/webm; poor device compatibility
      const rawExt = String(format.ext || format.extension || '');
      if (rawExt === 'webm' || rawExt === 'opus' || acodec.includes('opus'))
        return null;

      const abr = Number(format.abr || format.tbr || 0);
      const quality = abr > 0 ? `${Math.round(abr)}kbps` : 'Audio';
      let extension = String(format.ext || format.extension || 'm4a');
      const formatId = String(
        format.formatId || format.format_id || format.itag
      );

      if (
        extension === 'mp4' ||
        extension === 'm4a' ||
        acodec.includes('mp4a') ||
        formatId.includes('m4a')
      ) {
        extension = 'm4a';
      }

      const track = resolveAudioTrack(format);

      return {
        formatId,
        extension,
        url: format.url,
        quality,
        resolution: quality,
        filesize: Number(
          format.filesize ||
            format.filesize_approx ||
            estimateFilesize(format, 0)
        ),
        fps: 0,
        height: 0,
        vcodec: vcodecStr,
        acodec,
        isMuxed: false,
        isVideo: false,
        isAudio: true,
        itag: Number(format.itag) || 0,
        language: track.language,
        languageName: track.languageName,
        isOriginal: track.isOriginal,
      };
    })
    .filter((item): item is Format => item !== null);

  for (const format of processed) {
    const qualityKey =
      format.quality && format.quality !== 'Audio'
        ? format.quality
        : `Audio-${format.filesize || format.formatId}`;

    // keep dubs distinct by language
    const langKey = format.language ? `-${format.language}` : '';
    const key = `${qualityKey}-${format.extension}${langKey}`;
    const existing = uniqueFormats.get(key);
    if (!existing || (format.filesize || 0) > (existing.filesize || 0)) {
      uniqueFormats.set(key, format);
    }
  }

  return Array.from(uniqueFormats.values()).sort(
    (first: Format, second: Format) => {
      const origA = first.isOriginal ? 1 : 0;
      const origB = second.isOriginal ? 1 : 0;
      if (origA !== origB) return origB - origA;
      const abrA = parseInt(first.quality || '0', 10) || 0;
      const abrB = parseInt(second.quality || '0', 10) || 0;
      return abrB - abrA;
    }
  );
}
