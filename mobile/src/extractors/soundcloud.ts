import {
  createSoundCloudExtractor,
  ExtractorError,
  classifyThrown,
  type VideoInfo,
  type SoundCloudDrmMeta,
} from '@phantom/extractors';
import { mobileSharedEnv } from './shared/env';
import {
  resolveViaYoutube,
  buildFromYoutube,
  partialFromMeta,
  type IsrcMatchMeta,
} from './youtube/isrcMatch';
import { error as logError, log } from '../lib/log';

const SC_DEBUG = false;
function dbg(...parts: unknown[]): void {
  if (SC_DEBUG) log('soundcloud', '[JS-SoundCloud]', ...parts);
}

const scExtractor = createSoundCloudExtractor(mobileSharedEnv);

export function prewarmClientId(): void {
  scExtractor.prewarm();
}

function drmProtected(): ExtractorError {
  return new ExtractorError(
    'This SoundCloud track is DRM-protected by its label and can\u2019t be downloaded.',
    false,
    true
  );
}

/**
 * label-locked track → audio file itself is FairPlay/Widevine DRM and
 * can't be decrypted, but labels register an isrc. reuse the same
 * youtube isrc-match pipeline the spotify extractor uses to fetch the
 * identical recording from youtube. returns null when there's nothing
 * to search with, or no match → caller falls back to honest DRM error.
 */
async function drmFallback(
  meta: SoundCloudDrmMeta,
  webpageUrl: string,
  onPartial?: (info: VideoInfo) => void
): Promise<VideoInfo | null> {
  const isrcMeta: IsrcMatchMeta = {
    id: meta.id,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    cover: meta.cover,
    durationMs: meta.durationMs,
    isrc: meta.isrc,
  };
  onPartial?.(partialFromMeta(isrcMeta, webpageUrl, 'soundcloud'));

  const videoUrl = await resolveViaYoutube(isrcMeta);
  if (!videoUrl) return null;
  dbg('DRM → youtube match', videoUrl, `isrc=${isrcMeta.isrc || 'none'}`);
  return buildFromYoutube(isrcMeta, webpageUrl, videoUrl, 'soundcloud');
}

export async function getInfo(
  url: string,
  onPartial?: (info: VideoInfo) => void
): Promise<VideoInfo | null> {
  try {
    return (await scExtractor.getInfo(
      url,
      onPartial ? { onPartial } : {}
    )) as VideoInfo | null;
  } catch (error: unknown) {
    if (error instanceof ExtractorError && /DRM-protected/iu.test(error.message)) {
      const meta = (error as unknown as { trackMeta?: SoundCloudDrmMeta }).trackMeta;
      if (meta) {
        try {
          const viaIsrc = await drmFallback(meta, url, onPartial);
          if (viaIsrc) return viaIsrc;
        } catch (fallbackError: unknown) {
          const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          logError('soundcloud', `[JS-SoundCloud] ISRC fallback failed for ${url}: ${message}`);
        }
      }
      throw drmProtected();
    }
    const message = error instanceof Error ? error.message : String(error);
    logError('soundcloud', `[JS-SoundCloud] Error extracting ${url}: ${message}`);
    throw classifyThrown(error, 'SoundCloud', 'track');
  }
}
