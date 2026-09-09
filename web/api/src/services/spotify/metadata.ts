import _spotifyUrlInfo from 'spotify-url-info';
import { logger } from '../../utils/infra/logger.util.js';
import { secureFetch } from '../../utils/network/security.util.js';
import { recordFailure } from '../../utils/infra/metrics.util.js';
import { load } from 'cheerio';
import { extractTrackId } from '../../utils/network/validation.util.js';
import { getSpotifyAccessToken } from '../../utils/media/spotify.util.js';
import { fetchFromOdesli } from './external.js';
import { SpotifyMetadata, AudioFeatures } from '../../types/index.js';

// spotify info factory
type SpotifyUrlInfoFactory = (fetchImpl: typeof fetch) => {
  getData: (url: string) => Promise<unknown>;
  getDetails: (url: string) => Promise<unknown>;
  getTracks: (url: string) => Promise<unknown[]>;
};

const spotifyUrlInfoFactory = ((
  _spotifyUrlInfo as { default?: SpotifyUrlInfoFactory }
).default || _spotifyUrlInfo) as SpotifyUrlInfoFactory;
export const { getData, getDetails, getTracks } = spotifyUrlInfoFactory(fetch);

const SOUNDCHARTS_APP_ID = process.env.SOUNDCHARTS_APP_ID;
const SOUNDCHARTS_API_KEY = process.env.SOUNDCHARTS_API_KEY;

async function fetchFromSpotifyAPI(
  spotifyUrl: string
): Promise<SpotifyMetadata | null> {
  try {
    const trackId = extractTrackId(spotifyUrl);
    if (!trackId) return null;

    const token = await getSpotifyAccessToken();
    const response = await secureFetch(
      `https://api.spotify.com/v1/tracks/${trackId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) return null;
    const track = (await response.json()) as {
      name: string;
      artists: Array<{ name: string }>;
      album: {
        name: string;
        images: Array<{ url: string }>;
        release_date: string;
      };
      duration_ms: number;
      external_ids: { isrc: string };
      preview_url: string;
    };

    let audioFeatures: AudioFeatures | undefined;
    try {
      const afRes = await secureFetch(
        `https://api.spotify.com/v1/audio-features/${trackId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (afRes.ok) {
        audioFeatures = (await afRes.json()) as AudioFeatures;
      }
    } catch (error: unknown) {
      logger.debug(
        '[SpotifyMetadata] Audio features error:',
        (error as Error).message
      );
    }

    return {
      type: 'spotify',
      id: trackId,
      title: track.name,
      artist: track.artists?.[0]?.name || 'Unknown Artist',
      album: track.album?.name || '',
      imageUrl: track.album?.images?.[0]?.url || '',
      duration: track.duration_ms || 0,
      isrc: track.external_ids?.isrc || '',
      audioFeatures,
      year: track.album?.release_date
        ? track.album.release_date.split('-')[0]
        : 'Unknown',
      previewUrl: track.preview_url || undefined,
      source: 'spotify_api',
      fromBrain: false,
      isPartial: false,
      isIsrcMatch: false,
      isJsInfo: true,
    };
  } catch (error: unknown) {
    recordFailure('resolve:spotify_api');
    logger.error(`[Spotify-API] Error: ${(error as Error).message}`);
    return null;
  }
}

export async function fetchFromSoundcharts(
  spotifyUrl: string,
  signal?: AbortSignal
): Promise<SpotifyMetadata | null> {
  try {
    const trackId = extractTrackId(spotifyUrl);
    if (!trackId) return null;

    const safeId = trackId.replace(/[^a-zA-Z0-9]/gu, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const effectiveSignal = signal
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;

    const response = await secureFetch(
      `https://customer.api.soundcharts.com/api/v2.25/song/by-platform/spotify/${safeId}`,
      {
        headers: {
          'x-app-id': SOUNDCHARTS_APP_ID as string,
          'x-api-key': SOUNDCHARTS_API_KEY as string,
        },
        signal: effectiveSignal,
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = (await response.json()) as {
      object?: {
        name: string;
        artists: Array<{ name: string }>;
        labels: Array<{ name: string }>;
        imageUrl: string;
        duration: number;
        isrc: { value: string };
        audio?: AudioFeatures;
        releaseDate: string;
        previewUrl: string;
        audioPreviewUrl: string;
        spotify: { previewUrl: string };
        preview_url: string;
      };
    };
    if (!data?.object) return null;

    const obj = data.object;
    return {
      type: 'spotify',
      id: trackId,
      title: obj.name,
      artist: obj.artists?.[0]?.name || 'Unknown Artist',
      album: obj.labels?.[0]?.name || '',
      imageUrl: obj.imageUrl,
      duration: (obj.duration || 0) * 1000,
      isrc: obj.isrc?.value || '',
      audioFeatures: obj.audio,
      year: obj.releaseDate ? obj.releaseDate.split('-')[0] : 'Unknown',
      previewUrl:
        obj.previewUrl ||
        obj.audioPreviewUrl ||
        obj.spotify?.previewUrl ||
        obj.preview_url ||
        undefined,
      source: 'soundcharts',
      fromBrain: false,
      isPartial: false,
      isIsrcMatch: false,
      isJsInfo: true,
    };
  } catch (error) {
    recordFailure('resolve:soundcharts');
    logger.debug('[Soundcharts] Request failed:', (error as Error).message);
    return null;
  }
}

interface ScraperDetails {
  name?: string;
  preview?: {
    title?: string;
    artist?: string;
    album?: string;
    image?: string;
    duration_ms?: number;
    isrc?: string;
    audioUrl?: string;
  };
  title?: string;
  artists?: Array<{ name: string }>;
  artist?: string;
  album?: string | { name: string };
  visualIdentity?: {
    image?: Array<{ url: string }>;
  };
  coverArt?: {
    sources?: Array<{ url: string }>;
  };
  image?: string;
  thumbnail_url?: string;
  duration_ms?: number;
  duration?: number;
  releaseDate?: string;
  release_date?: string;
  external_ids?: { isrc?: string };
  isrc?: string;
  preview_url?: string;
  audio_preview_url?: string;
  tracks?: Array<{ preview_url?: string }>;
}

async function getScraperDetails(
  safeUrl: string
): Promise<ScraperDetails | null> {
  let details: ScraperDetails | null = null;
  try {
    details = await (getData(safeUrl) as Promise<ScraperDetails>);
  } catch (error: unknown) {
    logger.debug(
      '[SpotifyMetadata] Scraper getData error:',
      (error as Error).message
    );
  }
  if (!details) {
    try {
      details = await (getDetails(safeUrl) as Promise<ScraperDetails>);
    } catch (error: unknown) {
      logger.debug(
        '[SpotifyMetadata] Scraper getDetails error:',
        (error as Error).message
      );
    }
  }
  if (!details) {
    try {
      const oembedRes = await secureFetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(safeUrl)}`
      );
      const oembedData = (await oembedRes.json()) as { title?: string };
      if (oembedData) {
        details = {
          name: oembedData.title,
          artists: [{ name: 'Unknown Artist' }],
        };
      }
    } catch (error: unknown) {
      logger.debug(
        '[SpotifyMetadata] Scraper oembed fetch error:',
        (error as Error).message
      );
    }
  }
  return details;
}

function _extractMetadataImage(details: ScraperDetails): string {
  const visualId = details.visualIdentity?.image;
  if (visualId?.length) return visualId[visualId.length - 1].url;

  const coverArt = details.coverArt?.sources;
  if (coverArt?.length) return coverArt[coverArt.length - 1].url;

  return details.preview?.image || details.image || details.thumbnail_url || '';
}

function _extractMetadataDuration(details: ScraperDetails): number {
  return (
    details.duration_ms || details.duration || details.preview?.duration_ms || 0
  );
}

function _extractMetadataYear(details: ScraperDetails): string {
  const date = details.releaseDate || details.release_date;
  if (typeof date === 'string') return date.split('-')[0];
  return 'Unknown';
}

const _getScraperTitle = (details: ScraperDetails) =>
  details.name || details.preview?.title || details.title || 'Unknown Title';

const _getScraperArtist = (details: ScraperDetails) =>
  details.artists?.[0]?.name ||
  details.preview?.artist ||
  details.artist ||
  'Unknown Artist';

const _getScraperPreview = (details: ScraperDetails) =>
  details.preview_url ||
  details.audio_preview_url ||
  details.preview?.audioUrl ||
  details.tracks?.[0]?.preview_url ||
  undefined;

function mapScraperToMetadata(
  trackId: string,
  details: ScraperDetails
): SpotifyMetadata {
  const albumName =
    typeof details.album === 'string'
      ? details.album
      : details.album?.name || '';

  return {
    type: 'spotify',
    id: trackId,
    title: _getScraperTitle(details),
    artist: _getScraperArtist(details),
    album: albumName || details.preview?.album || '',
    imageUrl: _extractMetadataImage(details),
    duration: _extractMetadataDuration(details),
    year: _extractMetadataYear(details),
    isrc:
      details.external_ids?.isrc || details.isrc || details.preview?.isrc || '',
    previewUrl: _getScraperPreview(details),
    source: 'scrapers',
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isJsInfo: true,
  };
}

export async function fetchFromScrapers(
  videoURL: string
): Promise<SpotifyMetadata | null> {
  const trackId = extractTrackId(videoURL);
  if (!trackId) return null;
  const safeUrl = `https://open.spotify.com/track/${trackId}`;

  const details = await getScraperDetails(safeUrl);
  if (!details) return null;

  return mapScraperToMetadata(trackId, details);
}

function finalizeMetadata(
  metadata: SpotifyMetadata,
  onProgress: (
    stage: string,
    progress: number,
    message?: string,
    details?: string
  ) => void,
  soundchartsPromise: Promise<SpotifyMetadata | null> | null = null
) {
  metadata.cover = metadata.imageUrl;
  metadata.thumbnail = metadata.imageUrl || '';

  onProgress(
    'initializing',
    20,
    'Metadata locked.',
    JSON.stringify({
      metadata_update: {
        title: metadata.title,
        artist: metadata.artist,
        cover: metadata.imageUrl,
        thumbnail: metadata.imageUrl,
        duration: (metadata.duration || 0) / 1000,
        previewUrl: metadata.previewUrl,
        isrc: metadata.isrc,
        audioFeatures: metadata.audioFeatures,
        isPartial: true,
      },
    })
  );
  return {
    metadata,
    soundchartsPromise: soundchartsPromise || Promise.resolve(metadata),
  };
}

export async function fetchInitialMetadata(
  videoURL: string,
  onProgress: (
    stage: string,
    progress: number,
    message?: string,
    details?: string
  ) => void,
  _startTime: number
): Promise<{
  metadata: SpotifyMetadata;
  soundchartsPromise: Promise<SpotifyMetadata | null>;
}> {
  onProgress('initializing', 10, 'Querying Spotify...');

  const officialMetadata = await fetchFromSpotifyAPI(videoURL).catch(
    () => null
  );

  if (officialMetadata) {
    return finalizeMetadata(officialMetadata, onProgress);
  }

  onProgress('initializing', 12, 'Falling back to multi-source search...');

  const abortController = new AbortController();
  const { signal } = abortController;

  const soundchartsPromise = fetchFromSoundcharts(videoURL, signal).catch(
    () => null
  );
  const scrapersPromise = fetchFromScrapers(videoURL).catch(() => null);
  const odesliPromise = fetchFromOdesli(videoURL, signal).catch(() => null);

  const firstMetadata = await (
    Promise.any([
      soundchartsPromise.then(
        (response) => response || Promise.reject(new Error('No Soundcharts'))
      ),
      scrapersPromise.then(
        (response) => response || Promise.reject(new Error('No Scrapers'))
      ),
      odesliPromise.then(
        (response) => response || Promise.reject(new Error('No Odesli'))
      ),
    ]) as Promise<SpotifyMetadata>
  ).catch(() => null);

  abortController.abort();

  if (!firstMetadata) {
    throw new Error('Metadata fetch failed: All providers returned null');
  }

  // odesli fallback ID
  if (!firstMetadata.id) {
    firstMetadata.id = extractTrackId(videoURL) || 'unknown';
  }

  return finalizeMetadata(firstMetadata, onProgress, soundchartsPromise);
}

export async function fetchSpotifyPageData(
  videoURL: string
): Promise<{ cover: string | undefined } | null> {
  const trackId = extractTrackId(videoURL);
  if (!trackId) return null;
  try {
    const response = await secureFetch(
      `https://open.spotify.com/track/${trackId}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );
    const data = await response.text();
    const cheerioDoc = load(data);
    return { cover: cheerioDoc('meta[property="og:image"]').attr('content') };
  } catch (error) {
    logger.debug('[SpotifyPage] Fetch failed:', (error as Error).message);
    return null;
  }
}

export async function resolveSideTasks(
  videoURL: string,
  metadata: { imageUrl?: string }
): Promise<void> {
  try {
    const response = await fetchSpotifyPageData(videoURL);
    if (response?.cover) {
      metadata.imageUrl = response.cover;
    }
  } catch (error: unknown) {
    logger.debug(
      '[SpotifyMetadata] Side tasks error:',
      (error as Error).message
    );
  }
}

export async function fetchPreviewUrlManually(
  videoURL: string
): Promise<string | null> {
  try {
    const trackId = extractTrackId(videoURL);
    if (!trackId) return null;
    const response = await secureFetch(
      `https://open.spotify.com/embed/track/${trackId.replace(/[^a-zA-Z0-9]/gu, '')}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );
    const data = await response.text();
    const cheerioDoc = load(data);
    const scriptContent = cheerioDoc('script[id="resource"]').html();
    if (scriptContent) {
      const json = JSON.parse(decodeURIComponent(scriptContent)) as {
        preview_url?: string;
      };
      if (json.preview_url) return json.preview_url;
    }
    const match = data.match(/"preview_url":"(https:[^"]+)"/u);
    return match?.[1]?.replace(/\\/gu, '/') || null;
  } catch (error) {
    logger.debug(
      '[SpotifyPreview] Manual fetch failed:',
      (error as Error).message
    );
    return null;
  }
}
