import { VideoInfo, SpotifyMetadata } from '../types/index.js';
import { logger } from '../utils/infra/logger.util.js';
import { cacheVideoInfo } from './ytdlp.service.js';
import { sendEvent } from '../utils/network/sse.util.js';
import { prepareFinalResponse } from '../utils/api/response.util.js';

export interface SeedTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album?: { name: string; images: Array<{ url: string }> };
  duration_ms: number;
}

export async function resolveAndSaveTrack(
  track: SeedTrack,
  clientId: string
): Promise<VideoInfo | null> {
  const { runPriorityRace } = await import('./spotify/resolver.js');
  const metadata: SpotifyMetadata = {
    type: 'spotify',
    id: track.id,
    title: track.name,
    artist: track.artists[0]?.name || 'Unknown Artist',
    album: track.album?.name || '',
    imageUrl: track.album?.images[0]?.url || '',
    duration: track.duration_ms || 0,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isJsInfo: true,
  };

  try {
    const bestMatch = await runPriorityRace(
      `https://open.spotify.com/track/${track.id}`,
      // @ts-expect-error required duration
      metadata,
      [],
      (stage, progress, message) => {
        logger.info(
          `[Seeder] [${track.id}] ${stage}: ${progress}% ${message || ''}`
        );
        if (clientId) {
          sendEvent(clientId, {
            status: 'initializing',
            progress: 50,
            text: `Resolving: ${track.name}`,
          });
        }
      }
    );

    if (bestMatch?.url) {
      const { getInfo } = await import('./extractors/index.js');
      const ytInfo = await getInfo(bestMatch.url);
      if (!ytInfo) return null;

      const finalData = (await prepareFinalResponse(
        ytInfo,
        true,
        metadata,
        `https://open.spotify.com/track/${track.id}`
      )) as VideoInfo;
      finalData.targetUrl = bestMatch.url;

      await cacheVideoInfo(
        `https://open.spotify.com/track/${track.id}`,
        finalData,
        []
      );
      return finalData;
    }
  } catch (error) {
    logger.error(
      `[Seeder] [${track.id}] Resolution failed:`,
      (error as Error).message
    );
  }
  return null;
}

export async function processBackgroundTracks(
  tracks: SeedTrack[],
  _clientId: string
) {
  logger.info(
    `[Seeder] Starting background processing for ${tracks.length} tracks...`
  );

  let successCount = 0;
  for (const track of tracks) {
    const result = await resolveAndSaveTrack(track, _clientId);
    if (result) {
      successCount++;
      sendEvent(_clientId, {
        status: 'seeding_update',
        progress: Math.round((successCount / tracks.length) * 100),
        text: `Resolved: ${track.name}`,
      });
    }
    // throttle
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  sendEvent(_clientId, {
    status: 'seeding_complete',
    progress: 100,
    text: `Seeding finished. Resolved ${successCount}/${tracks.length} tracks.`,
  });
}

export async function resolveSeedTracks(url: string): Promise<unknown[]> {
  const { getTracks, getData } = await import('./spotify/metadata.js');
  let tracks: unknown[] = [];
  try {
    tracks = await getTracks(url);
  } catch (error: unknown) {
    logger.debug(
      '[VideoController] Track fetch error:',
      (error as Error).message
    );
  }

  if (!tracks || tracks.length === 0) {
    const data: unknown = await getData(url);
    if (typeof data === 'object' && data !== null && 'tracks' in data) {
      const tracksData = (data as { tracks: unknown }).tracks;
      if (Array.isArray(tracksData)) {
        tracks = tracksData;
      } else if (
        typeof tracksData === 'object' &&
        tracksData !== null &&
        'items' in tracksData &&
        Array.isArray(
          (tracksData as Record<string, unknown> & { items: unknown[] }).items
        )
      ) {
        tracks = (tracksData as Record<string, unknown> & { items: unknown[] })
          .items;
      }
    }
  }
  return tracks;
}
