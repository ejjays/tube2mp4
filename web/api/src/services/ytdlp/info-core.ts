import { isHost } from '../../utils/network/host.util.js';
import { spawn } from 'node:child_process';
import { logger } from '../../utils/infra/logger.util.js';
import { remoteYtdlpConfigured, runYtdlpRemote } from './remote-ytdlp.js';
import fs from 'node:fs';
import path from 'node:path';
import { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } from './config.js';
import { ytProxyArgs, ytProxyDispatcher, shouldProxyUrl } from './yt-proxy.js';
import { fetch as undiciFetch } from 'undici';
import { sendEvent } from '../../utils/network/sse.util.js';
import { VideoInfo, SSEEvent } from '../../types/index.js';
import { secureFetch } from '../../utils/network/security.util.js';
import {
  processVideoFormats,
  processAudioFormats,
} from '../../utils/media/format.util.js';
import { createRedisClient } from '../../utils/infra/redis.util.js';
import { recordExtraction } from '../../utils/infra/metrics.util.js';
import { LRUCache } from 'lru-cache';

export type ProgressCallback = (
  status: string,
  progress: number,
  subStatus?: string,
  details?: string
) => void;

// fail-fast redis cache; bounded l1 to avoid unbounded growth
const redis = createRedisClient('MetadataCache', {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  commandTimeout: 3000,
  connectTimeout: 8000,
});
const METADATA_EXPIRY = 7200000; // 2 hours
const metadataCache = new LRUCache<
  string,
  { data: VideoInfo; timestamp: number }
>({ max: 500, ttl: METADATA_EXPIRY });
export const prefetchPromises = new Map<
  string,
  Promise<VideoInfo | undefined>
>();

export function reportProgress(
  clientId: string | null,
  status: string,
  progress: number,
  subStatus?: string,
  details?: string
) {
  if (!clientId) return;

  const event: SSEEvent = {
    status:
      status === 'fetching_info'
        ? 'initializing'
        : (status as SSEEvent['status']),
    progress,
    subStatus: subStatus || 'Analysing...',
    details,
  };

  // early metadata dispatch
  if (details?.includes('early_metadata')) {
    try {
      const parsed = JSON.parse(details);
      if (parsed.early_metadata) {
        event.metadata_update = {
          ...parsed.early_metadata,
          isPartial: true,
        };
        event.subStatus = 'Metadata found!';
        event.details = undefined;
      }
    } catch (error) {
      logger.debug(
        '[SSE] Failed to parse early metadata JSON:',
        (error as Error).message
      );
    }
  }

  sendEvent(clientId, event);
}

export async function getCachedInfo(
  cacheKey: string,
  forceRefresh: boolean,
  clientId: string | null
): Promise<VideoInfo | null> {
  // cache bypass toggles (temp flag / peek without it)
  const cacheFlag = process.env.DISABLE_INFO_CACHE;
  if (cacheFlag && cacheFlag !== '0' && cacheFlag !== 'false') return null;

  const cachedL1 = metadataCache.get(cacheKey);
  if (cachedL1 && !forceRefresh && Date.now() - cachedL1.timestamp < 300_000) {
    return cachedL1.data;
  }

  if (!forceRefresh) {
    try {
      const redisGet = redis.get(`meta:${cacheKey}`);
      const cachedRedis = await Promise.race([
        redisGet,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (cachedRedis) {
        const data = JSON.parse(cachedRedis) as VideoInfo;
        metadataCache.set(cacheKey, { data, timestamp: Date.now() });
        reportProgress(
          clientId,
          'initializing',
          28,
          'Cache Hit!',
          'REGISTRY: RETRIEVING_PERSISTENT_METADATA'
        );
        return data;
      }
    } catch (error) {
      logger.warn(
        '[Info] Redis cache fetch failed:',
        (error as Error).message
      );
    }
  }
  return null;
}

export function peekCachedInfo(cacheKey: string): VideoInfo | null {
  const entry = metadataCache.get(cacheKey);
  if (entry && Date.now() - entry.timestamp < 300_000) return entry.data;
  return null;
}

export async function setCachedInfo(cacheKey: string, data: VideoInfo) {
  // skip partial/empty; never cache raw yt-dlp shape
  if (data?.isPartial === true || !data?.formats?.length) {
    return;
  }
  ensureNormalizedFormats(data);
  metadataCache.set(cacheKey, { data, timestamp: Date.now() });
  try {
    await redis.set(
      `meta:${cacheKey}`,
      JSON.stringify(data),
      'PX',
      METADATA_EXPIRY
    );
  } catch (error) {
    logger.warn('[Info] Redis cache save failed:', (error as Error).message);
  }
}

// persist + normalize for streamer consistency
async function persistInfoJsonToDisk(
  info: VideoInfo,
  rawJson: string
): Promise<void> {
  if (!info.id || !rawJson) return;
  try {
    const dir = path.join(CACHE_DIR, 'metadata');
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${info.id}.json`);
    await fs.promises.writeFile(filePath, rawJson, 'utf8');
  } catch (error) {
    // non-critical optimization fallback
    logger.debug(
      '[Info] Disk JSON cache write failed:',
      (error as Error).message
    );
  }
}

export function ensureNormalizedFormats(info: VideoInfo): void {
  if (!info || !Array.isArray(info.formats)) return;
  const first = info.formats[0] as unknown as
    | { format_id?: unknown; formatId?: unknown }
    | undefined;
  const looksRaw =
    Boolean(first) &&
    first?.formatId === undefined &&
    first?.format_id !== undefined;
  if (!looksRaw) return;

  const rawList = info.formats as Parameters<
    typeof processVideoFormats
  >[0]['formats'];
  info.formats = processVideoFormats({
    duration: info.duration,
    formats: rawList,
  });
  info.audioFormats = processAudioFormats({ formats: rawList });
}

// follow redirects via proxy for blocked hosts
async function _expandFetch(
  url: string,
  method: 'HEAD' | 'GET'
): Promise<string> {
  const headers = { 'User-Agent': USER_AGENT };
  const signal = AbortSignal.timeout(12000);
  if (shouldProxyUrl(url)) {
    const dispatcher = ytProxyDispatcher();
    if (dispatcher) {
      const res = await undiciFetch(url, {
        method,
        headers,
        redirect: 'follow',
        dispatcher,
        signal,
      });
      return res.url || url;
    }
  }
  const res = await secureFetch(url, {
    method,
    headers,
    redirect: 'follow',
    signal,
  });
  return res.url || url;
}

const expandCache = new LRUCache<string, string>({ max: 500, ttl: 600_000 });

export async function expandShortUrl(url: string): Promise<string> {
  if (url.includes('youtu.be/')) {
    const id = url.split('youtu.be/')[1]?.split(/[?#]/u)[0];
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }

  const cached = expandCache.get(url);
  if (cached) return cached;

  let expanded = url;
  try {
    expanded = await _expandFetch(url, 'HEAD');
  } catch (error) {
    logger.debug('[Info] HEAD expansion failed:', (error as Error).message);
  }

  // bili.im 405s HEAD without redirect
  if (expanded === url) {
    try {
      expanded = await _expandFetch(url, 'GET');
    } catch (getError) {
      logger.debug(
        '[Info] GET expansion failed:',
        (getError as Error).message
      );
      return url;
    }
  }

  expandCache.set(url, expanded);
  return expanded;
}

export function runYtdlpLocal(
  args: string[],
  signal: AbortSignal | null
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn('yt-dlp', args, { detached: true });

    if (signal) {
      const abortHandler = () => {
        if (childProcess.pid && childProcess.exitCode === null) {
          try {
            process.kill(-childProcess.pid, 'SIGKILL');
          } catch (error) {
            logger.debug(
              '[Process] Abort signal kill failed:',
              (error as Error).message
            );
          }
        }
        reject(new Error('Process Aborted'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      childProcess.on('close', () =>
        signal.removeEventListener('abort', abortHandler)
      );
    }

    let stdout = '',
      stderr = '';
    childProcess.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    childProcess.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    childProcess.on('error', (error) => reject(error));
    childProcess.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

// prefer mobile bandwidth when available
async function execYtdlp(
  args: string[],
  signal: AbortSignal | null
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  if (remoteYtdlpConfigured()) {
    try {
      const remote = await runYtdlpRemote(args, signal);
      if (remote) return remote;
    } catch (error) {
      logger.warn(
        '[YtdlpRemote] delegate failed; using local yt-dlp:',
        (error as Error).message
      );
    }
  }
  return runYtdlpLocal(args, signal);
}

export async function runYtdlpInfo(
  targetUrl: string,
  cookieArgs: string[],
  signal: AbortSignal | null = null,
  isRetry = false
): Promise<VideoInfo> {
  const ytdlpStart = Date.now();
  const refererResult = Object.entries(REFERER_MAP).find(([domain]) =>
    targetUrl.includes(domain)
  );
  const referer = refererResult ? refererResult[1] : '';
  const effectiveCookieArgs = COMMON_ARGS.includes('--cookies')
    ? []
    : cookieArgs;
  let args = [
    ...effectiveCookieArgs,
    '--dump-json',
    '--user-agent',
    USER_AGENT,
    ...COMMON_ARGS,
    ...ytProxyArgs(targetUrl),
    '--extractor-args',
    'youtube:player-client=tv,android_vr,mweb,web_embedded',
    '--cache-dir',
    CACHE_DIR,
  ];
  if (referer) args.push('--referer', referer);

  if (isRetry) {
    const cleanArgs: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--cookies') {
        i++; // skip the path
      } else if (args[i] === '--geo-bypass') {
        // skip geo-bypass arg
      } else {
        cleanArgs.push(args[i]);
      }
    }
    cleanArgs.push('--no-cookies', '--no-geo-bypass');
    args = cleanArgs;
  }

  args.push(targetUrl);

  const { stdout, stderr, code } = await execYtdlp(args, signal);

  let parsedData: VideoInfo | null = null;
  if (stdout.trim()) {
    try {
      parsedData = JSON.parse(stdout) as VideoInfo;
    } catch (error: unknown) {
      const err = error as Error;
      logger.debug('[YtdlpInfo] JSON parse error:', err.message);
    }
  }

  if (code !== 0 && code !== null) {
    const errorMsg = stderr.trim();
    logger.error(
      `[yt-dlp-error] Code ${code}: ${errorMsg} | Command: yt-dlp ${args.join(' ')}`
    );

    if (
      !isRetry &&
      (errorMsg.includes('Requested format is not available') ||
        errorMsg.includes('Sign in to confirm you’re not a bot'))
    ) {
      logger.info('[YtdlpInfo] Retrying WITHOUT cookies/geo-bypass...');
      return runYtdlpInfo(targetUrl, cookieArgs, signal, true);
    }

    if (!parsedData || !parsedData.title) {
      throw new Error(errorMsg || 'yt-dlp failed');
    }
  }

  if (!parsedData) {
    throw new Error('yt-dlp returned no valid JSON');
  }

  if (parsedData.title?.includes('Welcome back to Instagram')) {
    throw new Error('Instagram Login Wall detected in yt-dlp');
  }

  void persistInfoJsonToDisk(parsedData, stdout);

  const ytdlpLabel = isHost(targetUrl, 'tiktok.com')
    ? 'tiktok:ytdlp'
    : isHost(targetUrl, 'youtube.com') || isHost(targetUrl, 'youtu.be')
      ? 'youtube:ytdlp'
      : 'other:ytdlp';
  recordExtraction(ytdlpLabel, true, Date.now() - ytdlpStart);

  return parsedData;
}
