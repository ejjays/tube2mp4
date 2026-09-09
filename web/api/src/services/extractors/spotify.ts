import {
  getInfo as getYtInfo,
  getStream as getYtStream,
} from './youtube/index.js';
import { logger } from '../../utils/infra/logger.util.js';
import { VideoInfo, ExtractorOptions, Format } from '../../types/index.js';
import { Readable } from 'node:stream';

type SpotifyData = {
  targetUrl: string;
  youtubeUrl?: string;
  fromBrain?: boolean;
  formats?: Format[];
  imageUrl?: string;
  cover?: string;
  thumbnail?: string;
  duration?: number;
  isrc?: string;
  title?: string;
  artist?: string;
  album?: string;
  previewUrl?: string;
  [key: string]: unknown;
};

interface SpotifyService {
  resolveSpotifyToYoutube(
    url: string,
    ids: string[],
    onProgress: (status: string, progress: number, extra: unknown) => void
  ): Promise<SpotifyData>;
}

async function getSpotifyService(): Promise<SpotifyService> {
  const spotifyModule =
    (await import('../spotify/index.js')) as unknown as SpotifyService;

  if (
    !spotifyModule ||
    typeof spotifyModule.resolveSpotifyToYoutube !== 'function'
  ) {
    logger.error('[JS-Spotify] Circular dependency error');
    throw new Error('Service initialization error.');
  }

  return spotifyModule as SpotifyService;
}

function mapToBrainResult(spotifyData: SpotifyData): VideoInfo {
  const resolvedYoutubeUrl = spotifyData.targetUrl || spotifyData.youtubeUrl;

  return {
    ...(spotifyData as unknown as VideoInfo),
    type: 'video',
    targetUrl: resolvedYoutubeUrl,
    cover: spotifyData.imageUrl || (spotifyData.cover as string),
    thumbnail: (spotifyData.imageUrl || spotifyData.thumbnail || '') as string,

    duration: (spotifyData.duration || 0) / 1000,
    extractorKey: 'spotify',
    isJsInfo: true,
    fromBrain: true,
    isPartial: false,
    isIsrcMatch: true,
    isFullData: true,
  };
}

function mapToJsResult(
  url: string,
  spotifyData: SpotifyData,
  ytInfo: VideoInfo
): VideoInfo {
  return {
    ...ytInfo,
    type: 'video',
    id: ytInfo.id,
    isrc: spotifyData.isrc || undefined,
    extractorKey: 'spotify',
    title: spotifyData.title || ytInfo.title,
    artist: spotifyData.artist || ytInfo.artist || 'Unknown Artist',
    uploader: spotifyData.artist || ytInfo.uploader || 'Unknown Uploader',
    album: spotifyData.album || '',
    imageUrl: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    cover: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    thumbnail: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    previewUrl: spotifyData.previewUrl || null,
    webpageUrl: url,
    targetUrl: spotifyData.targetUrl,
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };
}

// spotify js extractor
export async function getInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  try {
    const spotifyService = await getSpotifyService();

    const spotifyData: SpotifyData =
      await spotifyService.resolveSpotifyToYoutube(
        url,
        [],
        (status: string, progress: number, extra: unknown) => {
          if (options.onProgress)
            options.onProgress(
              status,
              progress,
              typeof extra === 'string' ? extra : undefined
            );
        }
      );

    if (!spotifyData?.targetUrl) {
      return null;
    }

    if (spotifyData.fromBrain && (spotifyData.formats?.length ?? 0) > 0) {
      return mapToBrainResult(spotifyData);
    }

    const ytInfo = await getYtInfo(spotifyData.targetUrl);
    if (!ytInfo) return null;
    return mapToJsResult(url, spotifyData, ytInfo);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[JS-Spotify] Error extracting ${url}: ${message}`);
    return null;
  }
}

export async function getStream(
  videoInfo: VideoInfo,
  options: ExtractorOptions = {}
): Promise<Readable> {
  // refresh expired urls
  if (videoInfo.fromBrain) {
    const liveYtInfo = await getYtInfo(videoInfo.targetUrl || '');
    if (!liveYtInfo) throw new Error('Failed to refresh stream URL');
    return getYtStream(liveYtInfo, options);
  }
  return getYtStream(videoInfo, options);
}
