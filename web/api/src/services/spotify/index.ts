import { isHost } from '../../utils/network/host.util.js';
import {
  getFromBrain,
  saveToBrain,
  updatePreviewInBrain,
  parseCachedMapping,
} from './brain.js';
import { logger } from '../../utils/infra/logger.util.js';
import { fetchInitialMetadata, fetchPreviewUrlManually } from './metadata.js';
import { fetchIsrcFromDeezer } from './external.js';
import { runPriorityRace } from './resolver.js';
import { SpotifyMetadata } from '../../types/index.js';

type OnProgressFn = (
  stage: string,
  progress: number,
  message?: string,
  details?: string
) => void;

interface CachedEntry {
  data: SpotifyMetadata;
  timestamp: number;
}

const RESOLUTION_CACHE = new Map<string, CachedEntry>();
const RESOLUTION_EXPIRY = 60 * 60 * 1000;

export async function refreshPreviewIfNeeded(
  cleanUrl: string,
  brainData: SpotifyMetadata,
  onProgress: OnProgressFn = (_s, _p, _m, _d) => {
    /* noop */
  }
): Promise<void> {
  const currentPreview = brainData.previewUrl;
  const isExpiringCDN =
    currentPreview != null && isHost(currentPreview, 'scdn.co') ||
    currentPreview != null && isHost(currentPreview, 'spotify') ||
    currentPreview != null && isHost(currentPreview, 'dzcdn.net') ||
    currentPreview != null && isHost(currentPreview, 'mzstatic.com') ||
    currentPreview != null && isHost(currentPreview, 'itunes.apple.com');

  if (currentPreview && !isExpiringCDN) return;

  try {
    onProgress('initializing', 20, 'Refreshing 30s preview...');

    let fresh = await fetchPreviewUrlManually(cleanUrl);
    let freshIsrc: string | null = null;

    if (!fresh) {
      const dData = await fetchIsrcFromDeezer(
        brainData.title,
        brainData.artist,
        brainData.isrc && brainData.isrc !== 'NONE' ? brainData.isrc : null,
        brainData.duration
      );
      fresh = dData?.preview || null;
      freshIsrc = dData?.isrc || null;
    }

    if (fresh) {
      brainData.previewUrl = fresh;
      if (freshIsrc && (!brainData.isrc || brainData.isrc === 'NONE')) {
        brainData.isrc = freshIsrc;
      }
      onProgress(
        'initializing',
        20,
        'Preview Refreshed',
        JSON.stringify({
          metadata_update: { previewUrl: fresh, isrc: brainData.isrc },
        })
      );
      updatePreviewInBrain(cleanUrl, fresh).catch(() => {
        /* ignore */
      });
    }
  } catch (error: unknown) {
    logger.debug(
      '[SpotifyIndex] Preview refresh error:',
      (error as Error).message
    );
  }
}

export async function resolveSpotifyToYoutube(
  videoURL: string,
  cookieArgs: string[] = [],
  onProgress: OnProgressFn = (_s, _p, _m, _d) => {
    /* noop */
  }
): Promise<SpotifyMetadata> {
  if (!isHost(videoURL, 'spotify.com')) {
    return {
      id: videoURL,
      title: 'Direct Link',
      artist: 'External',
      targetUrl: videoURL,
      webpageUrl: videoURL,
      formats: [],
    } as unknown as SpotifyMetadata;
  }

  const cleanUrl = videoURL.split('?')[0];

  if (RESOLUTION_CACHE.has(cleanUrl)) {
    const cached = RESOLUTION_CACHE.get(cleanUrl);
    if (cached && Date.now() - cached.timestamp < RESOLUTION_EXPIRY) {
      return cached.data;
    }
  }

  const cachedBrain = await getFromBrain(cleanUrl);
  const parsedCache = cachedBrain ? parseCachedMapping(cachedBrain) : null;
  if (cachedBrain && parsedCache) {
    const brainData: SpotifyMetadata = {
      ...(cachedBrain as unknown as SpotifyMetadata),
      formats: parsedCache.formats,
      audioFormats: parsedCache.audioFormats,
      fromBrain: true,
    };

    onProgress(
      'initializing',
      95,
      'Synchronizing with Global Registry...',
      JSON.stringify({
        metadata_update: {
          ...brainData,
          cover: brainData.imageUrl,
          thumbnail: brainData.imageUrl,
          duration: (brainData.duration || 0) / 1000,
          isFullData: true,
          isPartial: false,
        },
      })
    );
    await refreshPreviewIfNeeded(cleanUrl, brainData, onProgress);
    return brainData;
  }

  const startTime = Date.now();
  const { metadata, soundchartsPromise } = await fetchInitialMetadata(
    videoURL,
    onProgress,
    startTime
  );
  await refreshPreviewIfNeeded(cleanUrl, metadata, onProgress);

  const bestMatch = await runPriorityRace(
    videoURL,
    {
      ...metadata,
      duration: metadata.duration || 0,
    } as unknown as {
      title: string;
      artist: string;
      duration: number;
      isrc?: string;
      album?: string;
      year?: string | number;
      imageUrl?: string;
    },
    cookieArgs,
    onProgress,
    soundchartsPromise
  );
  if (!bestMatch?.url) throw new Error('No match found.');

  const finalData: SpotifyMetadata = {
    ...metadata,
    targetUrl: bestMatch.url,
    isIsrcMatch: bestMatch.type === 'ISRC' || bestMatch.type === 'Soundcharts',
    previewUrl: metadata.previewUrl,
  };

  RESOLUTION_CACHE.set(cleanUrl, { data: finalData, timestamp: Date.now() });
  return finalData;
}

export { saveToBrain, fetchIsrcFromDeezer };
