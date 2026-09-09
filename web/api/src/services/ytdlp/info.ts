import { isHost } from '../../utils/network/host.util.js';
import { isSupportedUrl } from '../../utils/network/validation.util.js';
import { logger } from '../../utils/infra/logger.util.js';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import { normalizeUrl } from '../../utils/media/video.util.js';
import { VideoInfo } from '../../types/index.js';
import { getTraceId } from '../../utils/infra/trace.util.js';
import {
  reportProgress,
  getCachedInfo,
  setCachedInfo,
  ensureNormalizedFormats,
  expandShortUrl,
  runYtdlpInfo,
  prefetchPromises,
  peekCachedInfo,
} from './info-core.js';
import { handleSpotifyInfo } from './info-spotify.js';
import { handleYoutubeTiktokInfo, handleSocialJSInfo } from './info-youtube.js';
import { secureFetch } from '../../utils/network/security.util.js';
import { queryConfigWithMeta } from '../../utils/infra/db.util.js';

// keep public API stable; native extractors avoid yt-dlp
export { expandShortUrl, runYtdlpInfo } from './info-core.js';
export function nativePlatform(url: string): string | null {
  if (isHost(url, 'youtube.com') || isHost(url, 'youtu.be')) return 'YouTube';
  if (isHost(url, 'tiktok.com')) return 'TikTok';
  if (isHost(url, 'facebook.com') || isHost(url, 'fb.watch'))
    return 'Facebook';
  if (isHost(url, 'instagram.com')) return 'Instagram';
  if (isHost(url, 'soundcloud.com')) return 'SoundCloud';
  if (
    isHost(url, 'bilibili.tv') ||
    isHost(url, 'biliintl.com') ||
    isHost(url, 'bili.im')
  )
    return 'Bilibili';
  return null;
}

// delegate blocked hosts to a clean-ip peer
const PEER_RESOLVER_URL = process.env.PEER_RESOLVER_URL?.trim() || '';
const PEER_HOSTS = (process.env.PEER_RESOLVE_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

// ignore tunnel rows older than this
const PEER_PHONE_MAX_AGE_S = 86400;
const PEER_BASE_TTL = 600_000;
const PEER_PHONE_TIMEOUT = 12_000;
const PEER_FALLBACK_TIMEOUT = 35_000;
let peerBaseCache: { base: string; at: number } | null = null;

function shouldPeerResolve(url: string): boolean {
  if (PEER_HOSTS.length === 0) return false;
  const lower = url.toLowerCase();
  return PEER_HOSTS.some((host) => lower.includes(host));
}

async function peerHealthy(base: string): Promise<boolean> {
  try {
    let cleaned = base;
    while (cleaned.endsWith('/')) cleaned = cleaned.slice(0, -1);
    const res = await secureFetch(`${cleaned}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// pick live phone tunnel else fallback
async function resolvePeerBase(): Promise<string> {
  if (peerBaseCache && Date.now() - peerBaseCache.at < PEER_BASE_TTL) {
    return peerBaseCache.base;
  }
  let base = PEER_RESOLVER_URL;
  const phone = await queryConfigWithMeta('BACKEND_URL');
  if (phone?.value) {
    const ageS = Date.now() / 1000 - phone.updatedAt;
    if (ageS < PEER_PHONE_MAX_AGE_S && (await peerHealthy(phone.value))) {
      base = phone.value;
      logger.info('[Peer] live phone tunnel selected');
    }
  }
  peerBaseCache = { base, at: Date.now() };
  return base;
}

// fetch one peer; null on failure, reject empty
async function peerFetch(
  base: string,
  url: string,
  clientId: string | null,
  timeoutMs: number
): Promise<VideoInfo | null> {
  const endpoint = `${base}/info?url=${encodeURIComponent(url)}&id=${clientId || 'peer'}`;
  try {
    const res = await secureFetch(endpoint, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      logger.warn(`[Peer] resolve failed: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as VideoInfo;
    if (data?.formats?.length || data?.title) return data;
    return null;
  } catch (error) {
    logger.warn(`[Peer] resolve error: ${(error as Error).message}`);
    return null;
  }
}

async function tryPeerResolve(
  url: string,
  clientId: string | null
): Promise<VideoInfo | null> {
  const stripSlash = (str: string): string => {
    let res = str;
    while (res.endsWith('/')) {
      res = res.slice(0, -1);
    }
    return res;
  };

  if (!shouldPeerResolve(url)) return null;
  const primary = stripSlash(await resolvePeerBase());
  if (!primary) return null;
  const koyeb = stripSlash(PEER_RESOLVER_URL);
  const isPhone = primary !== koyeb;
  const hit = await peerFetch(
    primary,
    url,
    clientId,
    isPhone ? PEER_PHONE_TIMEOUT : PEER_FALLBACK_TIMEOUT
  );
  if (hit) return hit;
  // phone failed, fall back to koyeb
  if (isPhone && koyeb) {
    peerBaseCache = null;
    logger.warn('[Peer] primary failed, falling back');
    return peerFetch(koyeb, url, clientId, PEER_FALLBACK_TIMEOUT);
  }
  return null;
}

// keep peer warm to avoid cold-start
export function startPeerKeepWarm(): void {
  if (!PEER_RESOLVER_URL || process.env.NODE_ENV === 'test') return;
  let base = PEER_RESOLVER_URL;
  while (base.endsWith('/')) base = base.slice(0, -1);
  const ping = (): void => {
    secureFetch(`${base}/health`, {
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined);
  };
  ping();
  setInterval(ping, 4 * 60 * 1000).unref();
  logger.info(`[Peer] keep-warm enabled for ${base}`);
}

const _handleUrlDecoding = (url: string) => {
  let decodedUrl = normalizeUrl(url);
  if (decodedUrl.includes('http') && decodedUrl.lastIndexOf('http') > 0) {
    decodedUrl = decodedUrl.substring(decodedUrl.lastIndexOf('http'));
    logger.info(`[Info] Fixed double-pasted URL: ${decodedUrl}`);
  }
  return decodedUrl;
};

async function _expandIfShortLink(url: string, clientId: string | null) {
  const needsExpansion =
    isHost(url, 'bili.im') ||
    isHost(url, 'fb.watch') ||
    url.includes('fb.gg') ||
    isHost(url, 'youtu.be') ||
    url.includes('share/') ||
    isHost(url, 'vt.tiktok.com') ||
    isHost(url, 'on.soundcloud.com');

  if (needsExpansion) {
    logger.info('[Info] Expanding URL:', url);
    reportProgress(
      clientId,
      'initializing',
      12,
      'Expanding short-links...',
      'NETWORK: RESOLVING_REDIRECTS'
    );
    return await expandShortUrl(url);
  }
  return _handleUrlDecoding(url);
}

async function _syncPrefetch(cacheKey: string, clientId: string | null) {
  if (prefetchPromises.has(cacheKey)) {
    reportProgress(
      clientId,
      'initializing',
      15,
      'Syncing with uplink...',
      'CACHE: AWAITING_PREFETCH_COMPLETION'
    );
    const prefetchResult = await prefetchPromises.get(cacheKey);
    if (prefetchResult) return prefetchResult;
  }
  return null;
}

export async function getVideoInfo(
  url: string,
  cookieArgs: string[] = [],
  forceRefresh = false,
  signal: AbortSignal | null = null,
  clientId: string | null = null,
  reuseLive = false
): Promise<VideoInfo> {
  const tid = getTraceId() || 'global';
  const t0 = Date.now();
  logger.info(`[Info] [${tid}] Starting getVideoInfo for:`, url);
  if (typeof url !== 'string' || !isSupportedUrl(url)) {
    throw new Error('Unsupported or malicious URL');
  }

  const onProgress = (
    status: string,
    progress: number,
    subStatus?: string,
    details?: string
  ) => {
    logger.info('[Info] Progress:', status, subStatus);
    reportProgress(clientId, status, progress, subStatus, details);
  };

  if (!forceRefresh && shouldPeerResolve(url)) {
    const peerKey = `${url}_${cookieArgs.join('_')}`;
    const peerCached = await getCachedInfo(peerKey, false, clientId);
    if (peerCached) {
      logger.info(`[Timing] /info via peer cache in ${Date.now() - t0}ms`);
      return peerCached;
    }
    const peerInfo = await tryPeerResolve(url, clientId);
    if (peerInfo) {
      await setCachedInfo(peerKey, peerInfo);
      logger.info(`[Timing] /info via peer in ${Date.now() - t0}ms`);
      return peerInfo;
    }
  }

  const targetUrl = await _expandIfShortLink(url, clientId);
  logger.info(`[Info] Resolved URL: ${targetUrl} (T+${Date.now() - t0}ms)`);

  const cacheKey = `${targetUrl}_${cookieArgs.join('_')}`;

  if (reuseLive) {
    const live = peekCachedInfo(cacheKey);
    if (live) {
      logger.info(
        `[Timing] /info reused live resolution in ${Date.now() - t0}ms`
      );
      return live;
    }
  }

  const prefetchResult = await _syncPrefetch(cacheKey, clientId);
  if (prefetchResult) {
    logger.info(`[Timing] /info served from prefetch in ${Date.now() - t0}ms`);
    return prefetchResult;
  }

  const cached = await getCachedInfo(cacheKey, forceRefresh, clientId);
  if (cached) {
    logger.info(`[Timing] /info served from cache in ${Date.now() - t0}ms`);
    return cached;
  }

  if (isHost(targetUrl, 'spotify.com') && !forceRefresh) {
    return handleSpotifyInfo(targetUrl, cacheKey, clientId, onProgress);
  }

  const isYouTube =
    isHost(targetUrl, 'youtube.com') || isHost(targetUrl, 'youtu.be');

  if ((isYouTube || isHost(targetUrl, 'tiktok.com')) && !forceRefresh) {
    const jsInfo = await handleYoutubeTiktokInfo(
      targetUrl,
      cacheKey,
      cookieArgs,
      clientId,
      onProgress,
      t0
    );
    if (jsInfo) {
      logger.info(
        `[Timing] /info handleYoutubeTiktokInfo returned in ${Date.now() - t0}ms (isPartial=${jsInfo.isPartial})`
      );
      return jsInfo;
    }
  }

  if (!isYouTube) {
    const socialInfo = await handleSocialJSInfo(
      targetUrl,
      cacheKey,
      cookieArgs,
      onProgress
    );
    if (socialInfo) {
      logger.info(
        `[Timing] /info handleSocialJSInfo returned in ${Date.now() - t0}ms`
      );
      return socialInfo;
    }
  }

  const isFbStory = targetUrl.includes('/stories/');
  if (isFbStory) throw new Error('Could not extract Facebook Story media.');

  logger.info('[Info] Falling back to slow-path (yt-dlp)...');

  // native extractor yielded nothing (drift)
  const degraded = nativePlatform(targetUrl);
  if (degraded) {
    Sentry.captureMessage(
      `[Degradation] ${degraded} pure-JS yielded no formats; using yt-dlp fallback`,
      { level: 'warning', tags: { platform: degraded } }
    );
  }
  reportProgress(
    clientId,
    'fetching_info',
    15,
    'Falling back to deep-scan...',
    'PROCESS: SPAWNING_YTDLP_FALLBACK'
  );

  const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);

  info.isPartial = false;
  info.isFullData = true;
  if (!info.extractorKey) info.extractorKey = 'youtube';

  ensureNormalizedFormats(info);

  await setCachedInfo(cacheKey, info);
  logger.info(
    `[Timing] /info served from yt-dlp slow-path in ${Date.now() - t0}ms`
  );
  return info;
}

const _getEmeStatusFromSubStatus = (subStatus?: string) => {
  let statusStr = 'EME_PROCESSING';
  if (subStatus?.includes('Booting')) statusStr = 'EME_BOOTING';
  if (subStatus?.includes('Negotiating')) statusStr = 'EME_HANDSHAKE';
  if (subStatus?.includes('Video Buffer')) statusStr = 'EME_FETCH_VIDEO';
  if (subStatus?.includes('Audio Buffer')) statusStr = 'EME_FETCH_AUDIO';
  if (subStatus?.includes('Interleaving')) statusStr = 'EME_STITCHING';
  if (subStatus?.includes('Success')) statusStr = 'EME_COMPLETED';
  return statusStr;
};

export const getEmeStatus = (status: string, subStatus?: string) => {
  if (status !== 'eme_downloading') return status;
  return _getEmeStatusFromSubStatus(subStatus);
};

export async function cacheVideoInfo(
  url: string,
  data: VideoInfo,
  cookieArgs: string[] = []
): Promise<void> {
  const targetUrl = normalizeUrl(url);
  await setCachedInfo(`${targetUrl}_${cookieArgs.join('_')}`, data);
}
