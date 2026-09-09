import { Format, VideoInfo } from '../shared/types.js';
import { normalizeTitle, normalizeArtist } from '../shared/social.js';
import { IgParsed, IgMedia } from './types.js';
import { buildVideoInfo } from '../shared/fetch.js';

function toFormat(media: IgMedia, index: number, total: number): Format {
  const dims =
    media.width && media.height ? `${media.width}x${media.height}` : undefined;
  const prefix = total > 1 ? `item${index + 1}_` : '';
  if (media.isVideo) {
    const muxed = media.isMuxed !== false;
    const audioUrl = muxed ? undefined : media.muxAudioUrl;
    return {
      formatId: media.formatId ?? `${prefix}hd`,
      url: media.url,
      extension: 'mp4',
      resolution: dims ?? 'Source',
      quality: media.quality ?? (total > 1 ? `Item ${index + 1}` : 'HD'),
      width: media.width,
      height: media.height,
      vcodec: 'h264',
      acodec: 'aac',
      isVideo: true,
      isAudio: false,
      isMuxed: muxed,
      audioUrl,
      muxAudioUrl: audioUrl,
      muxAudioExt: audioUrl ? (media.muxAudioExt ?? 'm4a') : undefined,
    };
  }
  return {
    formatId: media.formatId ?? `${prefix}photo`,
    url: media.url,
    extension: 'jpg',
    resolution: dims ?? 'Photo',
    quality: media.quality ?? (total > 1 ? `Item ${index + 1}` : 'Photo'),
    width: media.width,
    height: media.height,
    vcodec: 'none',
    acodec: 'none',
    isVideo: false,
    isAudio: false,
    isMuxed: false,
  };
}

export function normalizeVideoInfo(
  url: string,
  parsedData: IgParsed | null
): VideoInfo | null {
  if (!parsedData) return null;
  const total = parsedData.media.length;
  const formats: Format[] = parsedData.media.map((media, index) =>
    toFormat(media, index, total)
  );
  if (formats.length === 0) return null;
  const info = buildVideoInfo({
    id: parsedData.id || url,
    title: parsedData.title || 'Instagram Video',
    uploader: parsedData.uploader || 'Instagram User',
    webpageUrl: url,
    thumbnail: parsedData.thumbnail,
    formats,
    extractorKey: 'instagram',
    downloadHeaders: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Referer: 'https://www.instagram.com/',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Range: 'bytes=0-',
    },
  });
  if (parsedData.title) {
    info.metascraper = { title: parsedData.title };
  }
  info.title = normalizeTitle(info as unknown as Record<string, unknown>);
  info.uploader = normalizeArtist(info as unknown as Record<string, unknown>);
  return info;
}
