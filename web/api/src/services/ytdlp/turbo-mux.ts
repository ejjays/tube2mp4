import { spawn } from 'node:child_process';
import { logger } from '../../utils/infra/logger.util.js';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import { Readable, Transform } from 'node:stream';
import { COMMON_ARGS, USER_AGENT } from './config.js';
import { ytProxyArgs, ytProxyDispatcher } from './yt-proxy.js';
import { buildPhoneMediaUrl, phoneMediaReady } from './phone-media.js';
import { getVideoInfo } from './info.js';
import { VideoInfo, Format } from '../../types/index.js';
import { getTraceId } from '../../utils/infra/trace.util.js';
import { destroyStream, gracefulKill } from './ytdlp-process.js';
import { pickAudioLanguagePool } from '../../utils/media/stream.util.js';
import type { StreamOptions, StreamerProcess, Extractor } from './streamer.js';
import { isHost } from '../../utils/network/host.util.js';

export async function handleTurboMux(
  url: string,
  info: VideoInfo,
  options: StreamOptions,
  extractor: Extractor,
  selectedFormat: Format,
  combinedStdout: StreamerProcess,
  extractorKey: string
) {
  const { formatId, format } = options;
  const tid = getTraceId() || 'global';
  logger.info(
    `[Streamer] [${tid}] Turbo-Muxing enabled for: ${selectedFormat.formatId}`
  );

  const videoStream = await extractor.getStream(info, {
    formatId,
    format,
    type: 'video',
  });
  let audioStream;

  if (extractorKey === 'youtube') {
    audioStream = await extractor.getStream(info, {
      formatId: 'bestaudio',
      format: 'audio',
      type: 'audio',
    });
  } else {
    const { getProxiedStream } =
      await import('../../utils/network/proxy.util.js');
    const audioUrl = selectedFormat.audioUrl || '';
    if (!audioUrl) throw new Error('Turbo-mux requires audioUrl');

    const getReferer = (targetUrl: string) => {
      if (isHost(targetUrl, 'facebook.com'))
        return 'https://www.facebook.com/';
      if (isHost(targetUrl, 'instagram.com'))
        return 'https://www.instagram.com/';
      try {
        return `${new URL(targetUrl).origin}/`;
      } catch (error) {
        logger.debug(
          '[Streamer] Referer resolution failed:',
          (error as Error).message
        );
        return '';
      }
    };

    audioStream = getProxiedStream(audioUrl, {
      'User-Agent': USER_AGENT,
      Referer: getReferer(url),
    });
  }

  const isNativeAAC =
    selectedFormat?.acodec?.startsWith('mp4a') ||
    selectedFormat?.acodec?.includes('aac');
  const audioCodecArg = isNativeAAC ? 'copy' : 'aac';

  const controller = new AbortController();
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-i',
      'pipe:0',
      '-i',
      'pipe:3',
      '-c:v',
      'copy',
      '-c:a',
      audioCodecArg,
      '-b:a',
      '128k',
      '-map',
      '0:v?',
      '-map',
      '1:a?',
      '-shortest',
      '-f',
      'mp4',
      '-movflags',
      '+frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration',
      '1000000',
      'pipe:1',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      signal: controller.signal,
      detached: true,
    }
  );

  if (ffmpeg.stdio[2])
    (ffmpeg.stdio[2] as import('node:stream').Readable).resume();
  // swallow AbortError from child process
  ffmpeg.on('error', (err: Error) => {
    if (err.name !== 'AbortError')
      logger.error('[Streamer] Turbo-Mux ffmpeg error:', err.message);
  });

  const handleError = (error: Error, type: string) => {
    logger.error(`[Streamer] Turbo-Mux ${type} Error:`, error.message);
    combinedStdout.emit('error', error);
  };

  videoStream.on('error', (error) => handleError(error, 'Video'));
  audioStream.on('error', (error) => handleError(error, 'Audio'));

  combinedStdout.kill = () => {
    destroyStream(videoStream);
    destroyStream(audioStream);
    controller.abort();
    gracefulKill(ffmpeg);
  };

  const pipe3 = ffmpeg.stdio[3] as import('stream').Writable;
  if (!pipe3) {
    destroyStream(audioStream);
    throw new Error('ffmpeg pipe:3 unavailable');
  }

  const { pipeline } = await import('node:stream/promises');

  // progress via video bytes; flush when size unknown
  const videoTotal = Number(selectedFormat?.filesize) || 0;
  let videoBytes = 0;
  const videoProgress = new Transform({
    transform(chunk, _enc, cb) {
      videoBytes += (chunk as Buffer).length;
      if (videoTotal > 0) {
        const pct = Math.min(90, Math.round((videoBytes / videoTotal) * 90));
        combinedStdout.emit('progress', pct);
      }
      cb(null, chunk as Buffer);
    },
    flush(cb) {
      combinedStdout.emit('progress', 90);
      cb();
    },
  });

  Promise.all([
    pipeline(
      videoStream,
      videoProgress,
      ffmpeg.stdio[0] as import('stream').Writable,
      { signal: controller.signal }
    ),
    pipeline(audioStream, pipe3, { signal: controller.signal }),
    pipeline(ffmpeg.stdio[1] as import('stream').Readable, combinedStdout, {
      signal: controller.signal,
    }),
  ])
    .catch((error) => {
      if (
        error.name !== 'AbortError' &&
        error.code !== 'ERR_STREAM_PREMATURE_CLOSE'
      ) {
        logger.error('[Streamer] Pipeline failure:', error);
        Sentry.captureException(error);
        combinedStdout.emit('error', error);
      }
    })
    .finally(() => {
      if (combinedStdout.kill) combinedStdout.kill();
    });
}

async function tryYouTubeTurboMux(
  url: string,
  selectedFormat: Format,
  formats: Format[],
  options: StreamOptions,
  cookieArgs: string[],
  combinedStdout: StreamerProcess
): Promise<boolean> {
  const tid = getTraceId() || 'global';
  const videoUrl = selectedFormat?.url;
  if (!videoUrl) return false;

  const audioFormat = formats.find(
    (fmt) =>
      fmt.acodec && fmt.acodec !== 'none' && fmt.vcodec === 'none' && fmt.url
  );
  if (!audioFormat?.url) return false;

  const httpHeaders =
    (selectedFormat as unknown as { http_headers?: Record<string, string> })
      .http_headers || {};

  let currentVideoUrl = videoUrl;
  let currentAudioUrl = audioFormat.url;

  const videoController = new AbortController();
  const audioController = new AbortController();

  // prefer phone relay; residential proxy rotates ips
  const usePhone = phoneMediaReady();
  const muxDispatcher = usePhone ? undefined : ytProxyDispatcher();
  if (usePhone) logger.info(`[TurboMux] [${tid}] sourcing via phone relay`);
  const makeProvider = (getUrl: () => string) => () => {
    const raw = getUrl();
    return Promise.resolve({
      url: usePhone ? (buildPhoneMediaUrl(raw) ?? raw) : raw,
      headers: { 'user-agent': USER_AGENT, ...httpHeaders },
    });
  };

  const transplant = async () => {
    const fresh = await getVideoInfo(url, cookieArgs);
    if (!fresh?.formats) throw new Error('transplant failed');
    const vMatch = fresh.formats.find(
      (fmt: Format) => String(fmt.formatId) === String(options.formatId)
    );
    const aMatch = fresh.formats.find(
      (fmt: Format) => String(fmt.formatId) === String(audioFormat.formatId)
    );
    if (vMatch?.url) currentVideoUrl = vMatch.url;
    if (aMatch?.url) currentAudioUrl = aMatch.url;
    logger.info(`[TurboMux] [${tid}] Transplant OK`);
  };

  try {
    const { fetchChunked } = await import('./chunked-fetcher.js');

    logger.info(
      `[TurboMux] [${tid}] Starting real-time mux: video=${selectedFormat.formatId} audio=${audioFormat.formatId}`
    );

    const [videoResult, audioResult] = await Promise.all([
      fetchChunked({
        urlProvider: makeProvider(() => currentVideoUrl),
        transplant,
        controller: videoController,
        service: 'youtube',
        dispatcher: muxDispatcher,
      }),
      fetchChunked({
        urlProvider: makeProvider(() => currentAudioUrl),
        transplant,
        controller: audioController,
        service: 'youtube',
        dispatcher: muxDispatcher,
      }),
    ]);

    const isAAC =
      audioFormat.acodec?.startsWith('mp4a') ||
      audioFormat.acodec?.includes('aac');
    const audioCodec = isAAC ? 'copy' : 'aac';

    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-i',
        'pipe:0',
        '-i',
        'pipe:3',
        '-c:v',
        'copy',
        '-c:a',
        audioCodec,
        '-map',
        '0:v?',
        '-map',
        '1:a?',
        '-shortest',
        '-f',
        'mp4',
        '-movflags',
        '+frag_keyframe+empty_moov+default_base_moof',
        '-frag_duration',
        '1000000',
        'pipe:1',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        detached: true,
      }
    );

    if (ffmpeg.stdio[2]) (ffmpeg.stdio[2] as Readable).resume();

    const pipe3 = ffmpeg.stdio[3] as import('stream').Writable;
    if (!pipe3) throw new Error('ffmpeg pipe:3 unavailable');

    combinedStdout.kill = () => {
      videoController.abort();
      audioController.abort();
      gracefulKill(ffmpeg);
    };

    const { pipeline } = await import('node:stream/promises');

    Promise.all([
      pipeline(
        videoResult.stream,
        ffmpeg.stdio[0] as import('stream').Writable
      ),
      pipeline(audioResult.stream, pipe3),
      pipeline(ffmpeg.stdio[1] as Readable, combinedStdout),
    ])
      .catch((error) => {
        if (
          error.name !== 'AbortError' &&
          error.code !== 'ERR_STREAM_PREMATURE_CLOSE'
        ) {
          logger.error('[TurboMux] Pipeline error:', error.message);
          combinedStdout.emit('error', error);
        }
      })
      .finally(() => {
        gracefulKill(ffmpeg);
      });

    logger.info(
      `[TurboMux] [${tid}] Piping started — video=${(Number(videoResult.size) / 1024 / 1024).toFixed(1)}MB audio=${(Number(audioResult.size) / 1024 / 1024).toFixed(1)}MB`
    );
    return true;
  } catch (error: unknown) {
    logger.info(
      `[TurboMux] [${tid}] Failed, falling back: ${(error as Error).message}`
    );
    videoController.abort();
    audioController.abort();
    return false;
  }
}

export async function attemptTurboMux(
  url: string,
  selectedFormat: Format,
  formats: Format[],
  audioFormats: Format[],
  options: StreamOptions,
  cookieArgs: string[],
  combinedStdout: StreamerProcess,
  formatId: string
): Promise<boolean> {
  const client = 'tv';
  const tid = getTraceId() || 'global';

  const tryInfoUrls = (): Promise<boolean> => {
    const videoUrl = selectedFormat?.url;
    const audioCandidates = pickAudioLanguagePool(
      [...audioFormats, ...formats].filter(
        (fmt) =>
          fmt.acodec &&
          fmt.acodec !== 'none' &&
          fmt.vcodec === 'none' &&
          fmt.url
      ),
      options.audioLang
    );
    // prefer AAC to avoid transcoding
    const audioPick =
      audioCandidates.find(
        (fmt) => fmt.acodec?.startsWith('mp4a') || fmt.acodec?.includes('aac')
      ) || audioCandidates[0];
    if (!videoUrl || !audioPick?.url) return Promise.resolve(false);
    const muxVideo: Format = { ...selectedFormat, formatId, url: videoUrl };
    const muxAudio: Format = {
      formatId: audioPick.formatId || 'bestaudio',
      url: audioPick.url,
      vcodec: 'none',
      acodec: audioPick.acodec || 'opus',
    } as Format;
    logger.info(`[TurboMux] [${tid}] Fast-path: muxing pre-resolved urls`);
    return tryYouTubeTurboMux(
      url,
      muxVideo,
      [muxVideo, muxAudio, ...formats],
      options,
      cookieArgs,
      combinedStdout
    );
  };

  // prefer extracted urls; yt-dlp resolves misses
  if (await tryInfoUrls()) return true;

  try {
    // cache (4h) keyed by audio language; stream-copy safe codec
    const videoId =
      url.match(/(?:v=|\/v\/|youtu\.be\/)([0-9A-Za-z_-]{11})/)?.[1] || url;
    const audioLangKey = options.audioLang || 'orig';
    const cacheKey = `turbomux:${videoId}:${formatId}:${audioLangKey}`;
    const createRedisClient = (await import('../../utils/infra/redis.util.js'))
      .default;
    const redis = createRedisClient('MetadataCache', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 3000,
      connectTimeout: 8000,
    });

    const audioLangPool = pickAudioLanguagePool(
      [...audioFormats, ...formats].filter(
        (fmt) => fmt.vcodec === 'none' && !!fmt.acodec && fmt.acodec !== 'none'
      ),
      options.audioLang
    );
    const aacAudio =
      audioLangPool.find(
        (fmt) =>
          !!fmt.acodec &&
          (fmt.acodec.startsWith('mp4a') || fmt.acodec.includes('aac'))
      ) || audioLangPool[0];
    const audioSelector = aacAudio?.formatId || 'bestaudio';

    let videoUrl: string | undefined;
    let audioUrl: string | undefined;
    let audioAcodec: string | undefined;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        videoUrl = parsed.video;
        audioUrl = parsed.audio;
        audioAcodec = parsed.acodec;
        logger.info(`[TurboMux] [${tid}] Cache HIT`);
      }
    } catch {
      /* cache miss or parse error */
    }

    if (!videoUrl || !audioUrl) {
      logger.info(`[TurboMux] [${tid}] Refreshing URLs via ${client}...`);
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      const effectiveCookieArgs = COMMON_ARGS.includes('--cookies')
        ? ['--cookies', COMMON_ARGS[COMMON_ARGS.indexOf('--cookies') + 1]]
        : cookieArgs;
      const { stdout } = await exec(
        'yt-dlp',
        [
          '-f',
          `${formatId}+${audioSelector}`,
          '--get-url',
          '--no-playlist',
          '--no-warnings',
          '--no-check-formats',
          '--extractor-args',
          `youtube:player-client=${client}`,
          ...ytProxyArgs(url),
          ...effectiveCookieArgs,
          url,
        ],
        { timeout: 15000 }
      );
      const urls = stdout.trim().split('\n').filter(Boolean);
      if (urls.length < 2) {
        logger.info(`[TurboMux] [${tid}] Got ${urls.length} URLs, need 2`);
        return tryInfoUrls();
      }
      [videoUrl, audioUrl] = urls;
      audioAcodec = aacAudio?.acodec || 'opus';
      redis
        .set(
          cacheKey,
          JSON.stringify({
            video: videoUrl,
            audio: audioUrl,
            acodec: audioAcodec,
          }),
          'EX',
          14400
        )
        .catch(() => {});
    }

    const muxSelected: Format = { ...selectedFormat, formatId, url: videoUrl };
    const syntheticAudio: Format = {
      formatId: audioSelector,
      url: audioUrl,
      vcodec: 'none',
      acodec: audioAcodec || 'opus',
    } as Format;
    const ok = await tryYouTubeTurboMux(
      url,
      muxSelected,
      [muxSelected, syntheticAudio, ...formats],
      options,
      cookieArgs,
      combinedStdout
    );
    return ok;
  } catch (err: unknown) {
    logger.info(`[TurboMux] [${tid}] Failed: ${(err as Error).message}`);
    return false;
  }
}

// hls playlist -> fragmented mp4 remux; lives here (only this layer spawns ffmpeg)
export function hlsRemuxStream(
  url: string,
  userAgent: string
): Readable {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-http_persistent',
      '0',
      '-user_agent',
      userAgent,
      '-i',
      url,
      '-c',
      'copy',
      '-bsf:a',
      'aac_adtstoasc',
      '-f',
      'mp4',
      '-movflags',
      '+frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration',
      '1000000',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true }
  );
  (ffmpeg.stdio[2] as Readable | null)?.resume();
  ffmpeg.on('error', (err: Error) =>
    logger.error(`[HLS-Remux] ffmpeg error: ${err.message}`)
  );
  return ffmpeg.stdout as Readable;
}
