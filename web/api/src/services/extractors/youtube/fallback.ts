import { VideoInfo } from '../../../types/index.js';
import { getYoutubeClient } from './client.js';
import { normalizeVideoInfo } from './normalizer.js';
import {
  processVideoFormats,
  RawFormat,
} from '../../../utils/media/format.util.js';

export async function getInfoFallback(url: string): Promise<VideoInfo> {
  const videoId = url.split('v=')[1]?.split('&')[0];
  if (!videoId) throw new Error('Could not extract video ID');

  const yt = await getYoutubeClient();
  const info = await yt.getInfo(videoId);

  processVideoFormats(
    info as unknown as {
      duration?: number;
      streaming_data: {
        formats: RawFormat[];
        adaptive_formats: RawFormat[];
      };
    }
  );
  return await normalizeVideoInfo(url, info, yt);
}
