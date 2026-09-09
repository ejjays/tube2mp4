import { isValidSpotifyUrl } from '../../utils/network/validation.util.js';
import { logger } from '../../utils/infra/logger.util.js';
import { secureFetch } from '../../utils/network/security.util.js';
import { recordFailure } from '../../utils/infra/metrics.util.js';

interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  preview: string;
  isrc?: string;
  artist: {
    name: string;
  };
}

interface DeezerSearchResponse {
  data: DeezerTrack[];
  total: number;
}

interface ExternalLookupResult {
  isrc: string | null;
  preview: string | null;
}

async function searchDeezer(query: string): Promise<DeezerSearchResponse> {
  const response = await secureFetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}`
  );
  return response.json();
}

export async function fetchIsrcFromDeezer(
  title: string,
  artist: string,
  isrc: string | null = null,
  targetDurationMs = 0
): Promise<ExternalLookupResult | null> {
  try {
    if (isrc) {
      const response = await secureFetch(
        `https://api.deezer.com/track/isrc:${isrc}`
      );
      const data: unknown = await response.json();
      if (typeof data === 'object' && data !== null) {
        const track = data as {
          error?: unknown;
          preview?: string;
          isrc?: string;
        };
        if (!track.error && track.preview) {
          return { isrc: track.isrc || isrc, preview: track.preview };
        }
      }
    }
    let searchData = await searchDeezer(`artist:"${artist}" track:"${title}"`);
    if (!searchData.data?.length)
      searchData = await searchDeezer(`${title} ${artist}`);
    const cleanTitle = (() => {
      let out = '',
        depth = 0;
      for (const ch of title) {
        if (ch === '(' || ch === '[') depth++;
        if (depth === 0) out += ch;
        if (ch === ')' || ch === ']') depth--;
      }
      out = out.trim();
      while (out.includes('  ')) out = out.replace('  ', ' ');
      return out;
    })();

    if (!searchData.data?.length && cleanTitle !== title)
      searchData = await searchDeezer(`${cleanTitle} ${artist}`);

    if (searchData.data?.length) {
      const best =
        searchData.data.find((track) => {
          const artistMatch =
            track.artist.name.toLowerCase().includes(artist.toLowerCase()) ||
            artist.toLowerCase().includes(track.artist.name.toLowerCase());
          const isTargetValid = targetDurationMs > 30000;
          const durationMatch = isTargetValid
            ? Math.abs(track.duration * 1000 - targetDurationMs) < 10000
            : true;
          return artistMatch && durationMatch;
        }) || searchData.data[0];

      if (
        targetDurationMs > 30000 &&
        Math.abs(best.duration * 1000 - targetDurationMs) > 20000
      )
        return null;

      const detailRes = await secureFetch(
        `https://api.deezer.com/track/${best.id}`
      );
      const detailData: unknown = await detailRes.json();
      if (typeof detailData === 'object' && detailData !== null) {
        const detail = detailData as { isrc?: string };
        return { isrc: detail.isrc || null, preview: best.preview || null };
      }
    }
  } catch (error: unknown) {
    recordFailure('resolve:deezer');
    logger.debug('[SpotifyExternal] Deezer error:', (error as Error).message);
  }
  return null;
}

interface ItunesResult {
  trackTimeMillis: number;
  isrc?: string;
  previewUrl?: string;
}

interface ItunesResponse {
  results: ItunesResult[];
}

export async function fetchIsrcFromItunes(
  title: string,
  artist: string,
  isrc: string | null = null,
  targetDurationMs = 0
): Promise<ExternalLookupResult | null> {
  try {
    const query = isrc || `${title} ${artist}`;
    const response = await secureFetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=5&entity=song`
    );
    const data: ItunesResponse = await response.json();
    if (data.results?.length) {
      const isTargetValid = targetDurationMs > 30000;
      const best = isTargetValid
        ? data.results.sort(
            (first, second) =>
              Math.abs(first.trackTimeMillis - targetDurationMs) -
              Math.abs(second.trackTimeMillis - targetDurationMs)
          )[0]
        : data.results[0];

      if (
        isTargetValid &&
        Math.abs(best.trackTimeMillis - targetDurationMs) > 20000
      )
        return null;
      return { isrc: best.isrc || null, preview: best.previewUrl || null };
    }
  } catch (error: unknown) {
    recordFailure('resolve:itunes');
    logger.debug('[SpotifyExternal] iTunes error:', (error as Error).message);
  }
  return null;
}

interface OdesliEntity {
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  isrc?: string;
  platforms?: string[];
}

interface OdesliResponse {
  entitiesByUniqueId: Record<string, OdesliEntity>;
  linksByPlatform: Record<string, { url: string; entityUniqueId: string }>;
  entityUniqueId: string;
}

export interface OdesliResult {
  id?: string;
  targetUrl: string | null;
  title: string;
  artist: string;
  thumbnailUrl: string;
  duration: number;
  isrc: string | null;
  source: string;
}

export async function fetchFromOdesli(
  spotifyUrl: string,
  signal?: AbortSignal
): Promise<OdesliResult | null> {
  if (!isValidSpotifyUrl(spotifyUrl)) return null;
  try {
    const parsed = new URL(spotifyUrl);
    const target = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`;
    const response = await secureFetch(
      `https://api.odesli.co/v1-alpha.1/links?url=${encodeURIComponent(target)}`,
      { signal }
    );
    if (!response.ok) return null;
    const data: OdesliResponse = await response.json();
    return processOdesliData(data);
  } catch (error) {
    recordFailure('resolve:odesli');
    logger.debug('Ignored:', (error as Error).message);
    return null;
  }
}

function _getSpotifyEntity(data: OdesliResponse) {
  return Object.values(data.entitiesByUniqueId).find((ent) =>
    ent.platforms?.includes('spotify')
  );
}

function _getYoutubeLink(data: OdesliResponse) {
  return (
    data.linksByPlatform?.youtube?.url ||
    data.linksByPlatform?.youtubeMusic?.url
  );
}

function _getTargetEntity(data: OdesliResponse) {
  const targetId =
    data.linksByPlatform?.youtube?.entityUniqueId ||
    data.linksByPlatform?.youtubeMusic?.entityUniqueId ||
    data.entityUniqueId;
  return data.entitiesByUniqueId[targetId];
}

// process odesli data
function processOdesliData(data: OdesliResponse): OdesliResult | null {
  const spotifyEntity = _getSpotifyEntity(data);
  const youtubeLink = _getYoutubeLink(data);

  if (!youtubeLink && !spotifyEntity) return null;

  const entity = _getTargetEntity(data);

  return {
    targetUrl: youtubeLink || null,
    title: entity?.title || spotifyEntity?.title || 'Unknown Title',
    artist: entity?.artistName || spotifyEntity?.artistName || 'Unknown Artist',
    thumbnailUrl: entity?.thumbnailUrl || spotifyEntity?.thumbnailUrl || '',
    duration: (spotifyEntity?.durationSeconds || 0) * 1000,
    isrc: spotifyEntity?.isrc || null,
    source: 'odesli',
  };
}
