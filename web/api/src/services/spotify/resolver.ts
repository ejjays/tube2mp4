import { VideoInfo } from '../../types/index.js';
import { logger } from '../../utils/infra/logger.util.js';

interface SearchResult {
  url: string;
  info: VideoInfo;
  diff: number;
}

interface MatchResult extends SearchResult {
  type: string;
  priority: number;
}

type ProgressFn = (
  stage: string,
  progress: number,
  message?: string,
  details?: string
) => void;

interface ResolveMetadata {
  title: string;
  artist: string;
  duration: number;
  isrc?: string;
  album?: string;
  year?: string | number;
  imageUrl?: string;
}

interface RaceCandidate {
  type: string;
  priority: number;
  promise: Promise<SearchResult | null>;
  isFinished?: boolean;
}

// common context for search candidates
interface RaceContext {
  videoURL: string;
  metadata: ResolveMetadata;
  cookieArgs: string[];
  signal: AbortSignal;
  onProgress: ProgressFn;
  soundchartsPromise: Promise<{ isrc?: string } | null> | null;
  isStopped: () => boolean;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getYtdlpService(): Promise<typeof import('../ytdlp.service.js')> {
  return import('../ytdlp.service.js');
}

import { refineSearchWithAI } from './ai.js';
import {
  fetchFromOdesli,
  fetchIsrcFromDeezer,
  fetchIsrcFromItunes,
} from './external.js';
import { resolveSideTasks } from './metadata.js';

interface YtSearchVideo {
  id: string;
  title?: { toString: () => string };
  author?: { name?: string };
  thumbnails?: Array<{ url: string }>;
  duration?: { seconds?: number };
}

interface SoundCloudTrack {
  permalink_url: string;
}

const _cleanYoutubeQuery = (query: string) => {
  return query
    .replace(/on Spotify/gu, '')
    .replace(/-/gu, ' ')
    .trim();
};

const _buildYoutubeVideoInfo = (video: YtSearchVideo): VideoInfo => {
  const durationSeconds = video.duration?.seconds || 0;
  const webpageUrl = `https://www.youtube.com/watch?v=${video.id}`;
  const authorName = video.author?.name || '';

  return {
    type: 'video',
    id: video.id,
    title: video.title?.toString() || '',
    uploader: authorName,
    author: authorName,
    thumbnail: video.thumbnails?.[0]?.url || '',
    webpageUrl,
    duration: durationSeconds,
    formats: [],
    extractorKey: 'youtube',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };
};

async function searchOnYoutube(
  query: string,
  cookieArgs: string[],
  targetMetadata: { duration?: number },
  _onEarlyDispatch: (() => void) | null = null,
  _skipPlayerOptimization = false,
  signal: AbortSignal | null = null,
  retryCount = 0
): Promise<SearchResult | null> {
  const cleanQuery = _cleanYoutubeQuery(query);
  const targetDurationMs = targetMetadata?.duration || 0;

  try {
    const { getYoutubeClient } =
      await import('../extractors/youtube/client.js');

    const youtubeClient = await getYoutubeClient();
    const searchResults = await youtubeClient.search(cleanQuery, {
      type: 'video',
    });

    if (!searchResults?.videos?.length) {
      throw new Error('No videos found');
    }

    const firstVideo = searchResults.videos[0] as unknown as YtSearchVideo;
    const info = _buildYoutubeVideoInfo(firstVideo);
    const durationMs = (info.duration || 0) * 1000;
    const drift =
      targetDurationMs > 0 && durationMs > 0
        ? Math.abs(durationMs - targetDurationMs)
        : 0;

    const ytdlp = await getYtdlpService();
    ytdlp.cacheVideoInfo(info.webpageUrl as string, info, cookieArgs);

    return { url: info.webpageUrl as string, info, diff: drift };
  } catch (error: unknown) {
    if (retryCount < 1 && !signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return searchOnYoutube(
        query,
        cookieArgs,
        targetMetadata,
        _onEarlyDispatch,
        _skipPlayerOptimization,
        signal,
        retryCount + 1
      );
    }
    logger.debug(`[YouTubeSearch] Error: ${(error as Error).message}`);
    return null;
  }
}

function _evaluateCandidate(
  result: SearchResult,
  candidate: { type: string; priority: number },
  targetDuration: number,
  currentBest: MatchResult | null
): MatchResult | null {
  const driftLimit = candidate.priority <= 1 ? 120000 : 25000;
  if (targetDuration > 0 && result.diff > driftLimit) return currentBest;

  if (candidate.priority === 0)
    return { ...result, type: candidate.type, priority: candidate.priority };

  if (result.diff < 2000) {
    if (!currentBest || candidate.priority < currentBest.priority) {
      return { ...result, type: candidate.type, priority: candidate.priority };
    }
  }

  if (
    !currentBest ||
    candidate.priority < currentBest.priority ||
    (candidate.priority === currentBest.priority &&
      result.diff < currentBest.diff)
  ) {
    return { ...result, type: candidate.type, priority: candidate.priority };
  }

  return currentBest;
}

function priorityRace(
  candidates: RaceCandidate[],
  metadata: { duration: number },
  settleCallback?: (reason: string) => void
): Promise<MatchResult | null> {
  return new Promise<MatchResult | null>((resolve) => {
    let bestMatch: MatchResult | null = null;
    let finishedCount = 0;
    let isSettled = false;

    const settle = (match: MatchResult | null, reason = '') => {
      if (!isSettled) {
        isSettled = true;
        if (settleCallback) settleCallback(reason);
        resolve(match);
      }
    };

    for (const candidate of candidates) {
      candidate.isFinished = false;
      candidate.promise
        .then((result: SearchResult | null) => {
          candidate.isFinished = true;
          if (isSettled) return;
          finishedCount++;

          if (result) {
            bestMatch = _evaluateCandidate(
              result,
              candidate,
              metadata.duration,
              bestMatch
            );
            if (
              candidate.priority === 0 &&
              bestMatch?.type === candidate.type
            ) {
              settle(bestMatch, `${candidate.type} verified`);
              return;
            }
          }

          if (finishedCount >= candidates.length) {
            setTimeout(() => settle(bestMatch, 'all candidates finished'), 500);
          }
        })
        .catch(() => {
          candidate.isFinished = true;
          if (isSettled) return;
          finishedCount++;
          if (finishedCount >= candidates.length)
            settle(bestMatch, 'all candidates finished');
        });
    }
  });
}

async function searchOnSoundCloud(
  query: string,
  targetMetadata?: { duration: number }
): Promise<SearchResult | null> {
  try {
    const soundCloudModule = await import('../extractors/soundcloud.js');
    const searchResults = (await soundCloudModule.search(
      query
    )) as SoundCloudTrack[];
    if (!searchResults?.length) return null;

    const info = await soundCloudModule.getInfo(searchResults[0].permalink_url);
    if (!info) return null;
    const targetDurationMs = targetMetadata?.duration ?? 0;
    const drift =
      targetDurationMs > 0
        ? Math.abs((info.duration || 0) * 1000 - targetDurationMs)
        : 0;

    return { url: searchResults[0].permalink_url, info, diff: drift };
  } catch (error: unknown) {
    logger.error(
      `[Race] SoundCloud search failed: ${(error as Error).message}`
    );
    return null;
  }
}

// resolve authoritative ISRC for exact match
async function buildIsrcCandidate(
  ctx: RaceContext
): Promise<SearchResult | null> {
  const { metadata, cookieArgs, signal, onProgress, soundchartsPromise } = ctx;
  if (ctx.isStopped()) return null;

  let isrc: string | null | undefined =
    metadata.isrc ??
    (soundchartsPromise ? (await soundchartsPromise)?.isrc : null);

  if (!isrc) {
    const results = await Promise.race([
      Promise.all([
        fetchIsrcFromDeezer(
          metadata.title,
          metadata.artist,
          null,
          metadata.duration
        ).catch(() => null),
        fetchIsrcFromItunes(
          metadata.title,
          metadata.artist,
          null,
          metadata.duration
        ).catch(() => null),
      ]),
      new Promise<null[]>((resolve) =>
        setTimeout(() => resolve([null, null]), 3000)
      ),
    ]);
    isrc = results?.[0]?.isrc ?? results?.[1]?.isrc;
  }

  if (!isrc || ctx.isStopped()) return null;
  onProgress('initializing', 35, 'Matching by ISRC...');
  return searchOnYoutube(`"${isrc}"`, cookieArgs, metadata, null, true, signal);
}

async function buildSoundCloudCandidate(
  ctx: RaceContext
): Promise<SearchResult | null> {
  const { metadata, onProgress } = ctx;
  await delay(200);
  if (ctx.isStopped()) return null;
  onProgress('initializing', 40, 'Searching SoundCloud...');
  return searchOnSoundCloud(`${metadata.title} ${metadata.artist}`, metadata);
}

async function buildOdesliCandidate(
  ctx: RaceContext
): Promise<SearchResult | null> {
  const { videoURL, metadata, cookieArgs, signal, onProgress } = ctx;
  if (!videoURL || ctx.isStopped()) return null;
  onProgress('initializing', 45, 'Querying Odesli...');

  const response = await fetchFromOdesli(videoURL).catch(() => null);
  if (!response?.targetUrl || ctx.isStopped()) return null;

  const ytdlp = await getYtdlpService();
  const info = await ytdlp
    .getVideoInfo(response.targetUrl, cookieArgs, false, signal)
    .catch(() => null);
  if (!info) return null;

  return {
    url: response.targetUrl,
    info,
    diff: Math.abs((info.duration || 0) * 1000 - metadata.duration),
  };
}

async function buildAiCandidate(
  ctx: RaceContext
): Promise<SearchResult | null> {
  const { metadata, cookieArgs, signal, onProgress } = ctx;
  await delay(1000);
  if (ctx.isStopped()) return null;
  onProgress('initializing', 55, 'Refining search with AI...');

  const aiResult = await refineSearchWithAI({
    ...metadata,
    album: metadata.album || 'Unknown',
    year: metadata.year as string | number,
  }).catch(() => null);
  if (!aiResult?.query || ctx.isStopped()) return null;

  return searchOnYoutube(
    aiResult.query,
    cookieArgs,
    metadata,
    null,
    false,
    signal
  );
}

async function buildCleanArtistCandidate(
  ctx: RaceContext,
  cleanArtist: string
): Promise<SearchResult | null> {
  const { metadata, cookieArgs, signal, onProgress } = ctx;
  await delay(500);
  if (ctx.isStopped()) return null;
  onProgress('initializing', 65, 'Searching by cleaned artist name...');
  return searchOnYoutube(
    `${metadata.title} ${cleanArtist}`,
    cookieArgs,
    metadata,
    null,
    false,
    signal
  );
}

// clean names to improve search hits
const ARTIST_SUFFIX_REGEX = /\s{1,20}(?:Music|Band|Official|Topic|TV)$/iu;
const RACE_TIMEOUT_MS = 45000;

export async function runPriorityRace(
  videoURL: string,
  metadata: ResolveMetadata,
  cookieArgs: string[],
  onProgress: ProgressFn,
  soundchartsPromise: Promise<{ isrc?: string } | null> | null = null
): Promise<MatchResult | null> {
  const raceController = new AbortController();
  const { signal } = raceController;
  let raceSettled = false;

  const ctx: RaceContext = {
    videoURL,
    metadata,
    cookieArgs,
    signal,
    onProgress,
    soundchartsPromise,
    isStopped: () => raceSettled,
  };

  onProgress('initializing', 25, 'Searching multiple sources...');

  // ensure ISRC match persists after race
  const isrcPromise = buildIsrcCandidate(ctx);
  const candidates: RaceCandidate[] = [
    { type: 'ISRC', priority: 0, promise: isrcPromise },
    { type: 'SoundCloud', priority: 1, promise: buildSoundCloudCandidate(ctx) },
    { type: 'Odesli', priority: 1, promise: buildOdesliCandidate(ctx) },
    { type: 'AI', priority: 2, promise: buildAiCandidate(ctx) },
  ];

  const cleanArtist = metadata.artist.replace(ARTIST_SUFFIX_REGEX, '').trim();
  if (cleanArtist) {
    candidates.push({
      type: 'Clean',
      priority: 2,
      promise: buildCleanArtistCandidate(ctx, cleanArtist),
    });
  }

  const raceTimeoutId = setTimeout(() => {
    if (!raceSettled) raceController.abort();
  }, RACE_TIMEOUT_MS);

  try {
    const bestMatch = await priorityRace(candidates, metadata, () => {
      raceSettled = true;
      raceController.abort();
      clearTimeout(raceTimeoutId);
      onProgress('initializing', 80, 'Match resolved.');
    });

    const [isrcResult] = await Promise.all([
      isrcPromise.catch(() => null),
      resolveSideTasks(videoURL, metadata).catch(() => null),
    ]);

    if (
      isrcResult &&
      (!bestMatch || (bestMatch.type !== 'ISRC' && isrcResult.diff <= 2000))
    ) {
      return { ...isrcResult, type: 'ISRC', priority: 0 };
    }

    if (!bestMatch) throw new Error('No high-quality YouTube matches found.');
    return bestMatch;
  } catch (error) {
    raceSettled = true;
    raceController.abort();
    clearTimeout(raceTimeoutId);
    throw error;
  }
}
