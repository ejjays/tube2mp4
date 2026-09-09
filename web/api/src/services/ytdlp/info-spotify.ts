import { isHost } from '../../utils/network/host.util.js';
import { sendEvent } from '../../utils/network/sse.util.js';
import { logger } from '../../utils/infra/logger.util.js';
import { VideoInfo, SpotifyMetadata, SSEEvent } from '../../types/index.js';
import {
  setCachedInfo,
  prefetchPromises,
  type ProgressCallback,
} from './info-core.js';

function _parseBrainData(
  cachedBrain: VideoInfo & { youtubeUrl?: string },
  targetUrl: string
) {
  return {
    ...cachedBrain,
    imageUrl: cachedBrain.imageUrl || '/logo.webp',
    formats:
      typeof cachedBrain.formats === 'string'
        ? JSON.parse(cachedBrain.formats)
        : cachedBrain.formats,
    audioFormats:
      typeof cachedBrain.audioFormats === 'string'
        ? JSON.parse(cachedBrain.audioFormats)
        : cachedBrain.audioFormats,
    audioFeatures:
      typeof cachedBrain.audioFeatures === 'string'
        ? JSON.parse(cachedBrain.audioFeatures as string)
        : cachedBrain.audioFeatures,
    targetUrl: cachedBrain.targetUrl || cachedBrain.youtubeUrl || targetUrl,
    fromBrain: true,
  };
}

async function _refreshSpotifyPreview(
  targetUrl: string,
  brainData: VideoInfo & { imageUrl?: string },
  onProgress: ProgressCallback,
  spotifyIdx: {
    refreshPreviewIfNeeded?: (
      url: string,
      data: VideoInfo | SpotifyMetadata,
      onProgress: ProgressCallback
    ) => Promise<void>;
  }
) {
  const preview = brainData.previewUrl;
  const isExpiringCDN =
    !preview ||
    isHost(preview, 'scdn.co') ||
    isHost(preview, 'spotify') ||
    isHost(preview, 'dzcdn.net') ||
    isHost(preview, 'mzstatic.com') ||
    isHost(preview, 'itunes.apple.com');

  if (isExpiringCDN && spotifyIdx.refreshPreviewIfNeeded) {
    await spotifyIdx
      .refreshPreviewIfNeeded(targetUrl, brainData, onProgress)
      .catch((error: Error) => {
        logger.debug('[Spotify] Preview refresh failed:', error.message);
      });
  }
}

function _mapSpotifyToVideoInfo(
  brainData: VideoInfo & { imageUrl?: string },
  targetUrl: string
): VideoInfo {
  return {
    ...brainData,
    uploader: brainData.artist || 'Unknown',
    webpageUrl: targetUrl,
    previewUrl: brainData.previewUrl,
    cover: brainData.imageUrl,
    thumbnail: brainData.imageUrl || '/logo.webp',
    duration: brainData.duration ? brainData.duration / 1000 : 0,
    extractorKey: 'spotify',
    isPartial: false,
  } as VideoInfo;
}

// handle spotify
export async function handleSpotifyInfo(
  targetUrl: string,
  cacheKey: string,
  clientId: string | null,
  onProgress: ProgressCallback
): Promise<VideoInfo> {
  const { fetchInitialMetadata } = await import('../spotify/metadata.js');
  const spotifyIdx = (await import('../spotify/index.js')) as {
    refreshPreviewIfNeeded?: (
      url: string,
      data: VideoInfo | SpotifyMetadata,
      onProgress: ProgressCallback
    ) => Promise<void>;
  };
  const { getFromBrain } = await import('../spotify/brain.js');

  const cachedBrain = (await getFromBrain(targetUrl)) as
    | (VideoInfo & { youtubeUrl?: string })
    | null;
  if (cachedBrain?.formats) {
    try {
      const brainData = _parseBrainData(cachedBrain, targetUrl);
      if (brainData.formats.length > 0 && brainData.targetUrl) {
        if (clientId)
          sendEvent(clientId, { text: 'registry hit', status: 'success' });

        await _refreshSpotifyPreview(
          targetUrl,
          brainData,
          onProgress,
          spotifyIdx
        );
        return _mapSpotifyToVideoInfo(brainData, targetUrl);
      }
    } catch (error: unknown) {
      const err = error as Error;
      logger.warn('[Info] [Speed] Failed to parse brain data:', err.message);
    }
  }

  const { metadata } = (await fetchInitialMetadata(
    targetUrl,
    onProgress,
    Date.now()
  )) as { metadata: SpotifyMetadata };

  if (spotifyIdx.refreshPreviewIfNeeded) {
    await spotifyIdx
      .refreshPreviewIfNeeded(targetUrl, metadata, onProgress)
      .catch((error: Error) => {
        logger.debug(
          '[Spotify] Initial preview refresh failed:',
          error.message
        );
      });
  }

  const resolutionPromise = (async () => {
    try {
      const { runPriorityRace } = await import('../spotify/resolver.js');
      const bestMatch = (await runPriorityRace(
        targetUrl,
        {
          ...metadata,
          duration: metadata.duration || 0,
        },
        [],
        onProgress
      )) as { url: string; type?: string };

      if (bestMatch?.url) {
        const matchType = bestMatch.type || 'UNKNOWN';
        const { getInfo } = await import('../extractors/index.js');
        let ytInfo = await getInfo(bestMatch.url);
        if (!ytInfo?.formats?.length) {
          // js gave no formats; use yt-dlp
          const { runYtdlpInfo, ensureNormalizedFormats } =
            await import('./info-core.js');
          try {
            const viaYtdlp = await runYtdlpInfo(bestMatch.url, []);
            ensureNormalizedFormats(viaYtdlp);
            if (viaYtdlp?.formats?.length) ytInfo = viaYtdlp;
          } catch (fallbackErr) {
            logger.debug(
              '[Spotify] yt-dlp format fallback failed:',
              (fallbackErr as Error).message
            );
          }
        }
        if (!ytInfo) throw new Error('Failed to fetch match information.');

        const { prepareFinalResponse } =
          await import('../../utils/api/response.util.js');
        const finalData = (await prepareFinalResponse(
          ytInfo,
          true,
          metadata,
          targetUrl
        )) as VideoInfo;
        finalData.targetUrl = bestMatch.url;

        finalData.isJsInfo = true;
        finalData.imageUrl = metadata.imageUrl;
        finalData.isIsrcMatch = Boolean(
          matchType === 'ISRC' || matchType === 'Soundcharts'
        );
        finalData.isrc = metadata.isrc;
        finalData.webpageUrl = targetUrl;

        const ssePayload: SSEEvent = {
          status: 'success',
          text: 'Resolution complete.',
          metadata_update: {
            ...finalData,
            isFullData: true,
            isPartial: false,
          },
        };

        await new Promise((resolve) => setTimeout(resolve, 500));
        await setCachedInfo(cacheKey, finalData);
        if (clientId) sendEvent(clientId, ssePayload);

        const { saveToBrain: saveMapping } =
          await import('../spotify.service.js');
        saveMapping(targetUrl, finalData as unknown as SpotifyMetadata);

        return finalData;
      }
      return null;
    } catch (error: unknown) {
      const err = error as Error;
      logger.warn('[Info] [Speed] Background resolution failed:', err.message);
      return null;
    } finally {
      prefetchPromises.delete(cacheKey);
    }
  })();

  prefetchPromises.set(
    cacheKey,
    resolutionPromise as Promise<VideoInfo | undefined>
  );

  return {
    ...metadata,
    type: 'video',
    id: targetUrl,
    title: metadata.title || 'Unknown',
    uploader: metadata.artist || 'Unknown',
    webpageUrl: targetUrl,
    cover: metadata.imageUrl,
    thumbnail: metadata.imageUrl,
    extractorKey: 'spotify',
    formats: [],
    isPartial: true,
    fromBrain: false,
    isIsrcMatch: false,
    isJsInfo: true,
    isFullData: false,
  } as VideoInfo;
}
