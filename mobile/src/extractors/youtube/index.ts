import {
  VideoInfo,
  Format,
  noVideo,
  temporaryError,
  classifyThrown,
  buildVideoInfo,
} from '@phantom/extractors';
import {
  extractViaWebView,
  playlistViaWebView,
  type RawYtFormat,
  type RawYtResult,
  type RawYtPlaylist,
} from './bridge';
import { DESKTOP_UA } from '../../lib/userAgents';
import { getYoutubeCookie } from '../../lib/settings';

const YT_ID =
  /(?:v=|\/v\/|youtu\.be\/|shorts\/|live\/|embed\/)([0-9A-Za-z_-]{11})/u;
const YT_PLAYLIST_ID = /[&?]list=([0-9A-Za-z_-]+)/u;

const CODEC_RANK: Record<string, number> = { h264: 0, vp9: 1, av1: 2 };

const MP3_BITRATE_BPS = 190000;

function videoCodecOf(raw: RawYtFormat): string {
  const mime = raw.mimeType?.toLowerCase() ?? '';
  if (mime.includes('av01')) return 'av1';
  if (mime.includes('vp9') || mime.includes('vp09')) return 'vp9';
  if (mime.includes('avc1') || mime.includes('avc3')) return 'h264';
  return mime.includes('webm') ? 'vp9' : 'h264';
}

function codecRank(raw: RawYtFormat): number {
  return CODEC_RANK[videoCodecOf(raw)] ?? 3;
}

function baseFormat(raw: RawYtFormat, index: number): Format {
  const webm = raw.mimeType?.includes('webm') ?? false;
  const ext = raw.hasVideo ? (webm ? 'webm' : 'mp4') : webm ? 'webm' : 'm4a';
  const kbps = raw.bitrate ? Math.round(raw.bitrate / 1000) : undefined;
  return {
    formatId: String(raw.itag ?? `yt_${index}`),
    url: raw.url ?? '',
    extension: ext,
    resolution: raw.qualityLabel || (raw.height ? `${raw.height}p` : undefined),
    quality:
      raw.qualityLabel ||
      (raw.hasAudio && !raw.hasVideo ? raw.audioQuality || 'Audio' : undefined),
    width: raw.width,
    height: raw.height,
    tbr: kbps,
    vcodec: raw.hasVideo ? videoCodecOf(raw) : 'none',
    acodec: raw.hasAudio ? (webm ? 'opus' : 'aac') : 'none',
    isVideo: Boolean(raw.hasVideo),
    isAudio: Boolean(raw.hasAudio),
    isMuxed: Boolean(raw.hasVideo && raw.hasAudio),
    filesize: raw.contentLength ? Number(raw.contentLength) : undefined,
  };
}

function bestAudio(
  audios: RawYtFormat[],
  container: 'mp4' | 'webm'
): RawYtFormat | undefined {
  return audios
    .filter((a) => a.mimeType?.includes(container) ?? false)
    .sort((x, y) => (y.bitrate ?? 0) - (x.bitrate ?? 0))[0];
}

export function buildFormats(raw: RawYtResult): Format[] {
  const rawAll = [...(raw.formats || []), ...(raw.adaptive || [])].filter(
    (f) => f.url
  );
  // progressive (muxed) urls come back in paired mode (mm=18) and the
  // googlevideo cdn 403s those for some isps — it serves adaptive (mm=31)
  // fine. build the video ladder from the separate video stream and mux
  // the audio in (zero regression: that path already exists).
  const videoOnly = rawAll.filter((f) => f.hasVideo && !f.hasAudio);
  const audioOnly = rawAll.filter((f) => f.hasAudio && !f.hasVideo);

  const aac = bestAudio(audioOnly, 'mp4');
  const opus = bestAudio(audioOnly, 'webm');

  /* adaptive first: separate video (+mux audio). primary pick */
  const byHeight = new Map<number, RawYtFormat>();
  for (const video of videoOnly) {
    const height = video.height ?? 0;
    const current = byHeight.get(height);
    if (!current || codecRank(video) < codecRank(current)) {
      byHeight.set(height, video);
    }
  }

  let index = 0;
  const ladder = new Map<number, Format>();
  for (const video of byHeight.values()) {
    const height = video.height ?? 0;
    if (ladder.has(height)) continue;
    const audio = aac ?? opus;
    if (!audio?.url) continue;
    const format = baseFormat(video, index++);
    format.extension = 'mp4';
    format.muxAudioUrl = audio.url;
    format.muxAudioExt = audio.mimeType?.includes('mp4') ? 'm4a' : 'webm';
    const sum =
      (video.contentLength ? Number(video.contentLength) : 0) +
      (audio.contentLength ? Number(audio.contentLength) : 0);
    format.filesize = sum > 0 ? sum : undefined;
    ladder.set(height, format);
  }

  /* progressive (paired, mm=18) rungs fill only heights with no
     separate streams (live archives) — the cdn 403s paired urls on
     some isps, so adaptive must own every height it covers */
  const muxed = rawAll.filter((f) => f.hasVideo && f.hasAudio);
  muxed.forEach((fmt, i) => {
    const format = baseFormat(fmt, 1000 + i);
    if (!ladder.has(format.height ?? 0)) {
      ladder.set(format.height ?? 0, format);
    }
  });

  const videoLadder = [...ladder.values()].sort(
    (lhs, rhs) => (rhs.height ?? 0) - (lhs.height ?? 0)
  );
  const audioFormats: Format[] = [];
  if (aac) {
    const base = baseFormat(aac, 2000);
    audioFormats.push({ ...base, quality: 'Original' });
    const mp3Raw = opus ?? aac;
    let mp3Bytes = mp3Raw.contentLength
      ? Number(mp3Raw.contentLength)
      : base.filesize;
    if (raw.duration)
      mp3Bytes = Math.round((raw.duration * MP3_BITRATE_BPS) / 8);
    audioFormats.push({
      ...base,
      formatId: 'mp3',
      url: mp3Raw.url || base.url,
      extension: 'mp3',
      acodec: 'mp3',
      quality: 'MP3',
      filesize: mp3Bytes,
    });
  }
  return [...videoLadder, ...audioFormats];
}

function rawToPlaylist(raw: RawYtPlaylist): VideoInfo {
  const firstEntry = raw.entries[0];
  return {
    type: 'video',
    id: raw.id,
    title: raw.title,
    uploader: raw.author || firstEntry?.channel || 'YouTube',
    webpageUrl: `https://www.youtube.com/playlist?list=${raw.id}`,
    thumbnail: firstEntry
      ? `https://i.ytimg.com/vi/${firstEntry.id}/hqdefault.jpg`
      : undefined,
    formats: [],
    extractorKey: 'youtube',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
    playlist: {
      id: raw.id,
      title: raw.title,
      author: raw.author || firstEntry?.channel,
      authorAvatar: raw.authorAvatar,
      entries: raw.entries.map((e) => ({
        id: e.id,
        title: e.title,
        channel: e.channel,
        durationSec: e.durationSec,
        thumb: e.thumb,
      })),
    },
  };
}

export async function getInfo(
  url: string,
  onPartial?: (info: VideoInfo) => void
): Promise<VideoInfo | null> {
  const listMatch = url.match(YT_PLAYLIST_ID);
  const isBarePlaylist = listMatch && !url.match(YT_ID);

  if (isBarePlaylist) {
    const raw = await playlistViaWebView(listMatch[1]);
    if (!raw) throw noVideo('YouTube');
    if (raw.entries.length === 0) throw noVideo('YouTube');
    return rawToPlaylist(raw);
  }

  const match = url.match(YT_ID);
  const videoId = match ? match[1] : null;
  if (!videoId) return null;

  const cookie = await getYoutubeCookie();

  try {
    const raw = await extractViaWebView(videoId, (meta) => {
      onPartial?.(
        buildVideoInfo({
          id: meta.id,
          title: meta.title || 'YouTube Video',
          uploader: meta.author || 'YouTube',
          webpageUrl: `https://www.youtube.com/watch?v=${meta.id}`,
          thumbnail: meta.thumbnail,
          duration: meta.duration,
          extractorKey: 'youtube',
          isPartial: true,
        })
      );
    });
    if (!raw) throw temporaryError('YouTube');

    const formats = buildFormats(raw);
    if (formats.length === 0) throw noVideo('YouTube');

    return {
      type: 'video',
      id: videoId,
      title: raw.title || 'YouTube Video',
      uploader: raw.author || 'YouTube',
      webpageUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: raw.thumbnail,
      duration: raw.duration,
      formats,
      extractorKey: 'youtube',
      isJsInfo: true,
      fromBrain: false,
      isPartial: false,
      isIsrcMatch: false,
      isFullData: true,
      downloadHeaders: {
        'User-Agent': DESKTOP_UA,
        Accept: '*/*',
        Referer: 'https://www.youtube.com/',
        Origin: 'https://www.youtube.com',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };
  } catch (error) {
    throw classifyThrown(error, 'YouTube');
  }
}
