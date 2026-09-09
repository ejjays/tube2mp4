import { VideoInfo, buildVideoInfo } from '@phantom/extractors';
import { getInfo as youtubeGetInfo } from './index';
import { searchViaWebView, type YtSearchResult } from './bridge';

export interface IsrcMatchMeta {
  id: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  durationMs: number;
  isrc?: string;
  previewUrl?: string;
}

export function isTopicChannel(author?: string): boolean {
  return (author ?? '').toLowerCase().trim().endsWith('- topic');
}

export function pickBest(
  candidates: YtSearchResult[],
  targetMs: number,
  artist: string
): YtSearchResult | null {
  const artistLc = artist.toLowerCase();
  const targetSec = targetMs > 0 ? Math.round(targetMs / 1000) : 0;

  const ranked = candidates
    .map((candidate) => {
      const durDiff =
        targetSec > 0 && typeof candidate.durationSec === 'number'
          ? Math.abs(candidate.durationSec - targetSec)
          : Number.POSITIVE_INFINITY;
      const artistMatch = (candidate.author ?? '')
        .toLowerCase()
        .includes(artistLc);
      return {
        candidate,
        durDiff,
        artistMatch,
        topic: isTopicChannel(candidate.author),
      };
    })
    .sort((lhs, rhs) => {
      if (lhs.topic !== rhs.topic) return lhs.topic ? 1 : -1;
      if (lhs.artistMatch !== rhs.artistMatch) return lhs.artistMatch ? -1 : 1;
      return lhs.durDiff - rhs.durDiff;
    });

  return ranked[0]?.candidate ?? candidates[0] ?? null;
}

/**
 * Find the matching youtube video for a track. `preferUrl` short-circuits
 * with a known-good mapping (e.g. odesli). otherwise search by
 * "artist title", & only reach for the isrc when the title search turned
 * up no regular (non-topic) upload — isrc nails the exact recording but is
 * usually a "- topic" art track whose audio 403s on some networks.
 */
export async function resolveViaYoutube(
  meta: IsrcMatchMeta,
  preferUrl?: string
): Promise<string | null> {
  if (preferUrl) return preferUrl;

  const candidates: YtSearchResult[] = [];
  const byTitle = await searchViaWebView(`${meta.artist} ${meta.title}`);
  if (byTitle) candidates.push(...byTitle);

  if (meta.isrc && !candidates.some((cand) => !isTopicChannel(cand.author))) {
    const byIsrc = await searchViaWebView(`"${meta.isrc}"`);
    if (byIsrc) candidates.push(...byIsrc);
  }

  if (candidates.length === 0) return null;
  const best = pickBest(candidates, meta.durationMs, meta.artist);
  return best ? `https://www.youtube.com/watch?v=${best.id}` : null;
}

export function partialFromMeta(
  meta: IsrcMatchMeta,
  webpageUrl: string,
  extractorKey: string
): VideoInfo {
  return buildVideoInfo({
    id: meta.id,
    title: meta.title,
    uploader: meta.artist,
    webpageUrl,
    thumbnail: meta.cover,
    duration: meta.durationMs ? Math.round(meta.durationMs / 1000) : undefined,
    extractorKey,
    isIsrcMatch: Boolean(meta.isrc),
    isPartial: true,
  });
}

/**
 * extract the matched youtube video on-device and overlay the source
 * metadata, keeping only audio formats. cached stream urls are ip-bound so
 * callers re-extract, reusing only the mapping (`fromBrain`).
 */
export async function buildFromYoutube(
  meta: IsrcMatchMeta,
  webpageUrl: string,
  videoUrl: string,
  extractorKey: string,
  fromBrain = false
): Promise<VideoInfo | null> {
  const yt = await youtubeGetInfo(videoUrl);
  if (!yt) return null;

  const audioOnly = yt.formats.filter(
    (format) => format.isAudio && !format.isVideo
  );

  return {
    ...yt,
    formats: audioOnly,
    id: meta.id,
    title: meta.title,
    uploader: meta.artist,
    album: meta.album,
    webpageUrl,
    thumbnail: meta.cover || yt.thumbnail,
    duration: meta.durationMs
      ? Math.round(meta.durationMs / 1000)
      : yt.duration,
    extractorKey,
    fromBrain,
    isIsrcMatch: Boolean(meta.isrc),
    previewUrl: meta.previewUrl,
  };
}
