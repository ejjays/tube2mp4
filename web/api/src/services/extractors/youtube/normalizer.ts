import { VideoInfo } from '../../../types/index.js';
import { logger } from '../../../utils/infra/logger.util.js';
import {
  processVideoFormats,
  processAudioFormats,
  RawFormat,
} from '../../../utils/media/format.util.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function normalizeVideoInfo(
  url: string,
  info: any,
  client?: any
): Promise<VideoInfo> {
  const basic = info.basic_info;
  const streamingData = info.streaming_data;

  const rawFormats = (streamingData?.formats || []) as any[];
  const adaptiveFormats = (streamingData?.adaptive_formats || []) as any[];
  const allRaw = rawFormats.concat(adaptiveFormats);

  // decipher streams
  await Promise.all(
    allRaw.map(async (raw) => {
      const isTest = process.env.NODE_ENV === 'test';
      const isYtLiveTest =
        isTest &&
        (process.env.TEST_LIVE === 'true' ||
          process.argv.join(' ').includes('yt_live.test.ts'));

      if (
        (!isTest || isYtLiveTest) &&
        !raw.url &&
        (raw.signature_cipher || raw.cipher) &&
        client?.session?.player
      ) {
        try {
          await raw.decipher(client.session.player);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.debug('[JS-YT] Decipher failed:', msg);
        }
      }
    })
  );

  // map formats
  const rawList: RawFormat[] = allRaw.map((raw) => ({
    url: raw.url,
    bitrate: raw.bitrate || raw.average_bitrate,
    average_bitrate: raw.average_bitrate || raw.bitrate,
    height: raw.height,
    width: raw.width,
    fps: raw.fps,
    vcodec: raw.video_codec || (raw.has_video ? 'h264' : 'none'),
    acodec: raw.audio_quality || (raw.has_audio ? 'aac' : 'none'),
    filesize: parseInt(raw.content_length || '0', 10),
    filesize_approx: parseInt(raw.content_length || '0', 10),
    itag: raw.itag,
    quality_label:
      raw.quality_label || (raw.width ? `${raw.height}p` : undefined),
    mime_type: raw.mime_type,
    has_audio: raw.has_audio,
    has_video: raw.has_video,
    isVideo: raw.has_video,
    isAudio: raw.has_audio && !raw.has_video,
    is_video: raw.has_video,
    is_audio: raw.has_audio && !raw.has_video,
    resolution: raw.quality_label || (raw.width ? `${raw.height}p` : undefined),
    quality: raw.quality_label,
    language: raw.audio_track?.id
      ? String(raw.audio_track.id).split('.')[0]
      : raw.language,
    is_original: raw.is_original,
    is_dubbed: raw.is_dubbed,
    audio_track: raw.audio_track
      ? {
          id: raw.audio_track.id,
          display_name: raw.audio_track.display_name,
          audio_is_default: raw.audio_track.audio_is_default,
        }
      : undefined,
  }));

  const formats = processVideoFormats({
    duration: basic.duration,
    formats: rawList,
  });

  const audioFormats = processAudioFormats({
    formats: rawList,
  });

  return {
    type: 'video',
    id: basic.id,
    title: basic.title,
    uploader: basic.author || 'YouTube User',
    thumbnail: basic.thumbnail?.[0]?.url || '',
    webpageUrl: url,
    duration: basic.duration || 0,
    formats,
    audioFormats,
    extractorKey: 'youtube',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  } as VideoInfo;
}
