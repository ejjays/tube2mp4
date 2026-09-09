import {
  VideoInfo,
  ExtractorError,
  noVideo,
  temporaryError,
  buildVideoInfo,
} from '@phantom/extractors';
import {
  mergeSpotifyMeta,
  metaFromEmbed as sharedMetaFromEmbed,
  metaFromOdesli as sharedMetaFromOdesli,
  type SpotifyMeta,
} from '@phantom/extractors/spotify';
import { resolveViaYoutube, buildFromYoutube } from '../youtube/isrcMatch';

// reexported for callers/tests that predate the shared isrcMatch module
export { pickBest, isTopicChannel } from '../youtube/isrcMatch';
import {
  parseTrackId,
  fetchSpotifyTrack,
  fetchOdesli,
  fetchSpotifyEmbed,
  type SpotifyTrack,
  type SpotifyEmbed,
  type OdesliResult,
} from './api';
import { lookupSpotifyMapping } from '../../lib/social/registry';
import { log } from '../../lib/log';

type Meta = SpotifyMeta;

function partial(meta: Meta, url: string): VideoInfo {
  return buildVideoInfo({
    id: meta.id,
    title: meta.title,
    uploader: meta.artist,
    webpageUrl: url,
    thumbnail: meta.cover,
    duration: meta.durationMs ? Math.round(meta.durationMs / 1000) : undefined,
    extractorKey: 'spotify',
    isIsrcMatch: Boolean(meta.isrc),
    isPartial: true,
    previewUrl: meta.previewUrl,
  });
}

function metaFromSpotify(id: string, track: SpotifyTrack): Meta {
  return {
    id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    cover: track.cover,
    durationMs: track.durationMs,
    isrc: track.isrc,
    previewUrl: track.previewUrl,
  };
}

const metaFromEmbed = sharedMetaFromEmbed;
const metaFromOdesli = sharedMetaFromOdesli;

// earliest source with title+artist, for a fast first paint
async function firstPaintMeta(
  id: string,
  embedP: Promise<SpotifyEmbed | null>,
  spotifyP: Promise<SpotifyTrack | null>,
  odesliP: Promise<OdesliResult | null>
): Promise<Meta | null> {
  const need = <T>(
    source: Promise<T | null>,
    toMeta: (value: T) => Meta | null
  ): Promise<Meta> =>
    source.then((value) => {
      const meta = value ? toMeta(value) : null;
      if (!meta) throw new Error('incomplete');
      return meta;
    });
  try {
    return await Promise.any([
      need(embedP, (embed) => metaFromEmbed(id, embed)),
      need(spotifyP, (track) => metaFromSpotify(id, track)),
      need(odesliP, (odesli) => metaFromOdesli(id, odesli)),
    ]);
  } catch {
    return null;
  }
}

// prefer api > embed > odesli for the authoritative meta
function mergeMeta(
  id: string,
  embed: SpotifyEmbed | null,
  spotify: SpotifyTrack | null,
  odesli: OdesliResult | null
): Meta | null {
  return mergeSpotifyMeta(id, embed, spotify, odesli);
}

// null = no cached hit, fall through to fresh resolve
async function resolveFromRegistry(
  trackId: string,
  url: string,
  cleanUrl: string,
  onPartial?: (info: VideoInfo) => void
): Promise<VideoInfo | null> {
  const cached = await lookupSpotifyMapping(cleanUrl);
  if (!cached) return null;
  const meta: Meta = {
    id: trackId,
    title: cached.title,
    artist: cached.artist,
    cover: cached.cover,
    durationMs: cached.durationMs,
    isrc: cached.isrc,
  };
  onPartial?.(partial(meta, url));
  try {
    return await buildFromYoutube(
      meta,
      url,
      cached.youtubeUrl,
      'spotify',
      true
    );
  } catch {
    return null;
  }
}

export async function getInfo(
  url: string,
  onPartial?: (info: VideoInfo) => void
): Promise<VideoInfo | null> {
  const trackId = parseTrackId(url);
  if (!trackId) return null;
  const cleanUrl = url.split('?')[0];

  try {
    const fromRegistry = await resolveFromRegistry(
      trackId,
      url,
      cleanUrl,
      onPartial
    );
    if (fromRegistry) return fromRegistry;

    const embedP = fetchSpotifyEmbed(trackId);
    const spotifyP = fetchSpotifyTrack(trackId);
    const odesliP = fetchOdesli(trackId);

    let painted = false;
    if (onPartial) {
      void firstPaintMeta(trackId, embedP, spotifyP, odesliP).then((early) => {
        if (early && !painted) onPartial(partial(early, url));
      });
    }

    const [embed, spotify, odesli] = await Promise.all([
      embedP.catch(() => null),
      spotifyP.catch(() => null),
      odesliP.catch(() => null),
    ]);

    const meta = mergeMeta(trackId, embed, spotify, odesli);
    if (!meta) throw temporaryError('Spotify', 'track');

    painted = true;
    onPartial?.(partial(meta, url));

    const videoUrl = await resolveViaYoutube(meta, odesli?.youtubeUrl);
    if (!videoUrl) throw noVideo('Spotify', 'track');

    log(
      'index',
      `[Spotify] resolved -> ${videoUrl} (isrc=${meta.isrc || 'none'})`
    );
    const result = await buildFromYoutube(
      meta,
      url,
      videoUrl,
      'spotify',
      false
    );
    if (!result) throw noVideo('Spotify', 'track');
    return result;
  } catch (error) {
    // resolution may bubble a youtube error; keep it spotify-framed
    const retryable = !(error instanceof ExtractorError) || error.retryable;
    throw retryable
      ? temporaryError('Spotify', 'track')
      : noVideo('Spotify', 'track');
  }
}
