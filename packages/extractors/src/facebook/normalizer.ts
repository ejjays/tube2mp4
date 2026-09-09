import { VideoInfo, Format } from '../shared/types.js';
import { normalizeTitle, normalizeArtist } from '../shared/social.js';
import { FbParsed } from './types.js';
import { buildVideoInfo } from '../shared/fetch.js';

export function normalizeVideoInfo(
  url: string,
  parsedData: FbParsed | null
): VideoInfo | null {
  if (!parsedData) return null;

  const formats: Format[] = parsedData.formats.map((formatItem, index) => {
    const vcodec =
      formatItem.vcodec ?? (formatItem.ext === 'mp4' ? 'h264' : undefined);
    const acodec =
      formatItem.acodec ??
      (formatItem.ext === 'mp4' || formatItem.ext === 'm4a'
        ? 'aac'
        : undefined);

    const tier =
      formatItem.format_id === 'hd'
        ? 'HD'
        : formatItem.format_id === 'sd'
          ? 'SD'
          : formatItem.format_id?.startsWith('photo')
            ? 'Photo'
            : undefined;

    return {
      formatId: formatItem.format_id || `fb_${index}`,
      url: formatItem.url,
      extension: formatItem.ext ?? 'mp4',
      resolution: tier ?? 'Source',
      quality: tier,
      acodec,
      vcodec,
      isAudio: Boolean(acodec && acodec !== 'none'),
      isVideo: Boolean(vcodec && vcodec !== 'none'),
      isMuxed: Boolean(
        acodec && acodec !== 'none' && vcodec && vcodec !== 'none'
      ),
    };
  });

  if (formats.length === 0) return null;

  const info = buildVideoInfo({
    id: parsedData.id || url,
    title: parsedData.title || 'Facebook Video',
    uploader: parsedData.uploader || 'Facebook User',
    webpageUrl: url,
    thumbnail: parsedData.thumbnail || undefined,
    formats,
    extractorKey: 'facebook',
    isFullData: false,
  });

  if (parsedData.title) {
    info.metascraper = { title: parsedData.title };
  }

  info.title = normalizeTitle(info as unknown as Record<string, unknown>);
  info.uploader = normalizeArtist(info as unknown as Record<string, unknown>);

  return info;
}
