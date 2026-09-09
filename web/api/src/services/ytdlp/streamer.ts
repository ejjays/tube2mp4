import { isHost } from '../../utils/network/host.util.js';
import { spawn, ChildProcess } from 'node:child_process';
import { logger } from '../../utils/infra/logger.util.js';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import { PassThrough, Readable } from 'node:stream';
import { COMMON_ARGS, USER_AGENT, CACHE_DIR } from './config.js';
import { ytProxyArgs, ytProxyDispatcher } from './yt-proxy.js';
import { getVideoInfo } from './info.js';
import { VideoInfo, Format, SpotifyMetadata } from '../../types/index.js';
import path from 'node:path';
import { getTraceId } from '../../utils/infra/trace.util.js';
import {
  destroyStream,
  gracefulKill,
  buildYtdlpArgs,
  pickBestClient,
  handleYtdlpOutput,
  YT_CLIENTS,
} from './ytdlp-process.js';
import { handleTurboMux, attemptTurboMux } from './turbo-mux.js';
import { audioMetadataArgs } from './processor.js';

export interface StreamOptions {
  format: string;
  formatId: string;
  audioLang?: string;
  tempFilePath?: string;
  _retried?: boolean;
}

export interface StreamerProcess extends PassThrough {
  kill?: (signal?: string) => void;
}

export interface Extractor {
  getStream: (
    info: VideoInfo,
    options?: Record<string, unknown>
  ) => Promise<Readable>;
}

async function handlePureJSStream(
  url: string,
  info: VideoInfo,
  options: StreamOptions,
  extractor: Extractor,
  selectedFormat: Format,
  combinedStdout: StreamerProcess,
  platform: string,
  extractorKey: string
) {
  const { formatId, format } = options;
  const tid = getTraceId() || 'global';
  logger.info(
    `[Download] [${tid}] Engine: Pure-JS | Platform: ${platform} | URL: ${url}`
  );

  const hasAudioUrl = selectedFormat?.audioUrl;
  const hasAudio = Boolean(
    hasAudioUrl ||
    selectedFormat?.isAudio ||
    (selectedFormat?.acodec && selectedFormat.acodec !== 'none')
  );
  logger.info(
    `[Streamer] Selected Format: ${selectedFormat?.formatId} | Resolution: ${selectedFormat?.resolution} | Has Audio: ${hasAudio}`
  );

  if (
    (hasAudioUrl || extractorKey === 'youtube') &&
    format !== 'mp3' &&
    !selectedFormat?.isMuxed
  ) {
    await handleTurboMux(
      url,
      info,
      options,
      extractor,
      selectedFormat,
      combinedStdout,
      extractorKey
    );
    return;
  }

  const rawStream = await extractor.getStream(info, { formatId, format });
  combinedStdout.emit('progress', 50);

  if (format === 'mp3') {
    const controller = new AbortController();
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-i',
        'pipe:0',
        '-vn',
        '-ab',
        '192k',
        ...audioMetadataArgs(info),
        '-f',
        'mp3',
        'pipe:1',
      ],
      {
        signal: controller.signal,
        detached: true,
      }
    );

    if (ffmpeg.stderr) ffmpeg.stderr.resume();
    ffmpeg.on('error', (err: Error) => {
      if (err.name !== 'AbortError')
        logger.error('[Streamer] mp3 ffmpeg error:', err.message);
    });

    combinedStdout.kill = () => {
      destroyStream(rawStream);
      controller.abort();
      gracefulKill(ffmpeg);
    };

    const { pipeline } = await import('node:stream/promises');

    Promise.all([
      pipeline(rawStream, ffmpeg.stdio[0] as import('stream').Writable, {
        signal: controller.signal,
      }),
      pipeline(ffmpeg.stdio[1] as import('stream').Readable, combinedStdout, {
        signal: controller.signal,
      }),
    ])
      .catch((error) => {
        if (
          error.name !== 'AbortError' &&
          error.code !== 'ERR_STREAM_PREMATURE_CLOSE'
        ) {
          logger.error('[Streamer] FFmpeg Transcode Error:', error);
          Sentry.captureException(error);
          combinedStdout.emit('error', error);
        }
      })
      .finally(() => {
        if (combinedStdout.kill) combinedStdout.kill();
      });
  } else {
    rawStream.pipe(combinedStdout);
    combinedStdout.kill = () => {
      destroyStream(rawStream);
    };
  }

  rawStream.on('end', () => {
    combinedStdout.emit('progress', 100);
  });
}

function getStreamMeta(info: VideoInfo | SpotifyMetadata, url: string) {
  // ensure correct extractor mapping
  const inferredKey = isHost(url, 'spotify.com')
    ? 'spotify'
    : isHost(url, 'youtube.com') || isHost(url, 'youtu.be')
      ? 'youtube'
      : isHost(url, 'tiktok.com')
        ? 'tiktok'
        : isHost(url, 'facebook.com') || isHost(url, 'fb.watch')
          ? 'facebook'
          : isHost(url, 'instagram.com')
            ? 'instagram'
            : isHost(url, 'soundcloud.com')
              ? 'soundcloud'
              : 'youtube';

  const extractorKey =
    ('extractorKey' in info ? info.extractorKey : inferredKey) || inferredKey;
  const isSpotify =
    isHost(url, 'spotify.com') ||
    info.type === 'spotify' ||
    extractorKey.toLowerCase() === 'spotify';
  const platform = isSpotify
    ? 'Spotify'
    : extractorKey.charAt(0).toUpperCase() + extractorKey.slice(1);
  return { extractorKey, isSpotify, platform };
}

function checkJSStream(extractorKey: string) {
  return [
    'facebook',
    'instagram',
    'soundcloud',
    'tiktok',
    'x',
    'bluesky',
    'bilibili',
  ].includes(extractorKey);
}

async function tryChunkedFetch(
  url: string,
  selectedFormat: Format,
  options: StreamOptions,
  cookieArgs: string[],
  combinedStdout: StreamerProcess,
  platform: string
): Promise<boolean> {
  const tid = getTraceId() || 'global';
  // transplant mutates this without re-creating provider
  let currentUrl = selectedFormat.url || '';
  if (!currentUrl) return false;

  const httpHeaders =
    (selectedFormat as unknown as { http_headers?: Record<string, string> })
      .http_headers || {};

  const controller = new AbortController();

  const urlProvider = () =>
    Promise.resolve({
      url: currentUrl,
      headers: { 'user-agent': USER_AGENT, ...httpHeaders },
    });

  const transplant = async () => {
    const { getVideoInfo } = await import('./info.js');
    const fresh = await getVideoInfo(url, cookieArgs);
    if (!fresh || !Array.isArray(fresh.formats)) {
      throw new Error('transplant: re-extraction returned no formats');
    }
    const match = [...fresh.formats, ...(fresh.audioFormats ?? [])].find(
      (fmt: Format) => String(fmt.formatId) === String(options.formatId)
    );
    if (!match?.url) {
      throw new Error(
        `transplant: format ${options.formatId} missing in fresh info`
      );
    }
    logger.info(
      `[Streamer] [${tid}] Transplant successful, URL refreshed for format ${options.formatId}`
    );
    currentUrl = match.url;
  };

  try {
    const { fetchChunked } = await import('./chunked-fetcher.js');
    logger.info(
      `[Streamer] [${tid}] Engine: Chunked-Fetch | Platform: ${platform} | URL: ${currentUrl.substring(0, 60)}...`
    );
    const { stream, size } = await fetchChunked({
      urlProvider,
      transplant,
      controller,
      service: 'youtube',
      dispatcher: ytProxyDispatcher(),
    });
    logger.info(
      `[Streamer] [${tid}] Chunked pre-flight OK; size=${(Number(size) / 1024 / 1024).toFixed(1)}MB`
    );

    stream.on('error', (error: Error) => {
      logger.error('[Streamer] Chunked stream error:', error.message);
      combinedStdout.emit('error', error);
    });
    stream.on('end', () => combinedStdout.emit('progress', 100));
    stream.pipe(combinedStdout);

    combinedStdout.kill = () => {
      controller.abort();
      destroyStream(stream);
    };
    return true;
  } catch (error: unknown) {
    logger.info(
      `[Streamer] [${tid}] Chunked fetch failed, falling back: ${(error as Error).message}`
    );
    return false;
  }
}

async function tryDirectFetch(
  url: string,
  selectedFormat: Format,
  combinedStdout: StreamerProcess,
  platform: string
): Promise<boolean> {
  if (!selectedFormat?.url) return false;
  logger.info(
    `[Streamer] Engine: Node-Fetch (Direct) | Platform: ${platform} | URL: ${url}`
  );
  try {
    const { getProxiedStream } =
      await import('../../utils/network/proxy.util.js');
    const directStream = getProxiedStream(selectedFormat.url, {
      'User-Agent': USER_AGENT,
      ...((
        selectedFormat as unknown as {
          http_headers?: Record<string, string>;
        }
      ).http_headers || {}),
    });
    directStream.on('error', (error: NodeJS.ErrnoException) => {
      combinedStdout.emit('error', error);
    });
    directStream.pipe(combinedStdout);
    directStream.on('end', () => combinedStdout.emit('progress', 100));
    combinedStdout.kill = () => {
      destroyStream(directStream);
    };
    return true;
  } catch (error: unknown) {
    logger.info(
      '[Streamer] Direct fetch failed, falling back to yt-dlp process:',
      (error as Error).message
    );
    return false;
  }
}

function isDirectFetchable(
  selectedFormat: Format,
  isMerging: boolean,
  format: string
): boolean {
  if (isMerging || !selectedFormat?.url) return false;
  // skip video formats on audio requests
  if (
    ['mp3', 'm4a', 'audio'].includes(format) &&
    selectedFormat.vcodec &&
    selectedFormat.vcodec !== 'none'
  )
    return false;
  return (
    !selectedFormat.url.includes('.m3u8') &&
    !selectedFormat.url.includes('manifest')
  );
}

async function tryNetworkFetchPath(
  url: string,
  selectedFormat: Format,
  options: StreamOptions,
  cookieArgs: string[],
  combinedStdout: StreamerProcess,
  platform: string,
  extractorKey: string
): Promise<boolean> {
  if (extractorKey === 'youtube') {
    const chunkedOk = await tryChunkedFetch(
      url,
      selectedFormat,
      options,
      cookieArgs,
      combinedStdout,
      platform
    );
    if (chunkedOk) return true;
  }
  return tryDirectFetch(url, selectedFormat, combinedStdout, platform);
}

function isDubRequest(audioFormats: Format[], audioLang?: string): boolean {
  const wanted = (audioLang || '').toLowerCase();
  if (!wanted) return false;
  const base = wanted.split('-')[0];
  // non-original track = dub; gated dubs need yt-dlp+cookies
  return audioFormats.some(
    (fmt) =>
      !fmt.isOriginal &&
      (fmt.language || '').toLowerCase().split('-')[0] === base
  );
}

async function streamYoutubeDub(
  url: string,
  videoFormatId: string,
  audioLang: string,
  format: string,
  cookieArgs: string[],
  combinedStdout: StreamerProcess,
  metaArgs: string[]
): Promise<boolean> {
  const tid = getTraceId() || 'global';
  const cookies = cookieArgs.includes('--cookies')
    ? cookieArgs
    : COMMON_ARGS.includes('--cookies')
      ? ['--cookies', COMMON_ARGS[COMMON_ARGS.indexOf('--cookies') + 1]]
      : [];
  if (cookies.length === 0) {
    logger.info(`[Dub] [${tid}] no cookies; cannot fetch dubbed audio`);
    return false;
  }

  const base = audioLang.split('-')[0];
  const container = format === 'webm' ? 'webm' : 'mp4';
  const videoSel =
    videoFormatId &&
    !['bestaudio', 'mp3', 'm4a', 'audio'].includes(videoFormatId)
      ? `${videoFormatId}+ba[language^=${base}]/bv*+ba[language^=${base}]`
      : `bv*+ba[language^=${base}]`;
  const potBase = process.env.YT_POT_BASE_URL || 'http://127.0.0.1:4416';

  const fsSync = await import('node:fs');
  const tmpDir = path.join(CACHE_DIR, 'tmp');
  try {
    fsSync.mkdirSync(tmpDir, { recursive: true });
  } catch {
    // ignore mkdir failure
  }
  const tempPath = path.join(
    tmpDir,
    `dub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${container}`
  );

  const args = [
    '--ignore-config',
    '--no-playlist',
    '--no-warnings',
    '--force-ipv4',
    '--no-colors',
    ...cookies,
    '--extractor-args',
    'youtube:player_client=mweb,tv,default',
    '--extractor-args',
    `youtubepot-bgutilhttp:base_url=${potBase}`,
    '-f',
    videoSel,
    '--merge-output-format',
    container,
    ...ytProxyArgs(url),
    '--cache-dir',
    CACHE_DIR,
    '--newline',
    '--progress',
    '-o',
    tempPath,
    url,
  ];

  logger.info(`[Dub] [${tid}] fetching ${audioLang} via yt-dlp (cookies+pot)`);
  const child = spawn('yt-dlp', args, { detached: true });
  combinedStdout.kill = () => gracefulKill(child);
  handleYtdlpOutput(
    child,
    format,
    combinedStdout,
    false,
    () => {
      if (!combinedStdout.writableEnded) combinedStdout.end();
    },
    tempPath,
    metaArgs
  );
  return true;
}

async function deliverYoutubeMerge(
  url: string,
  selectedFormat: Format,
  formats: Format[],
  audioFormats: Format[],
  options: StreamOptions,
  cookieArgs: string[],
  combinedStdout: StreamerProcess,
  metaArgs: string[]
): Promise<boolean> {
  const tid = getTraceId() || 'global';
  // dubs bypass turbo-mux; their direct urls 403
  if (isDubRequest(audioFormats, options.audioLang)) {
    const dubOk = await streamYoutubeDub(
      url,
      options.formatId,
      options.audioLang ?? '',
      options.format,
      cookieArgs,
      combinedStdout,
      metaArgs
    );
    if (dubOk) {
      logger.info(`[Streamer] [${tid}] YouTube delivery: DUB via yt-dlp`);
      return true;
    }
  }
  const turboOk = await attemptTurboMux(
    url,
    selectedFormat,
    formats,
    audioFormats,
    options,
    cookieArgs,
    combinedStdout,
    options.formatId
  );
  if (turboOk) {
    logger.info(
      `[Streamer] [${tid}] YouTube delivery: REAL-TIME mux (no temp file)`
    );
    return true;
  }
  return false;
}

export function streamDownload(
  url: string,
  options: StreamOptions,
  cookieArgs: string[] = [],
  preFetchedInfo: VideoInfo | null = null
): StreamerProcess {
  const { format, formatId } = options;
  const combinedStdout: StreamerProcess = new PassThrough();
  let activeChildProcess: ChildProcess | null = null;

  // skipcq: JS-R1005 -- downloader iife, complexity inherent, covered by e2e
  (async () => {
    try {
      const info: VideoInfo =
        preFetchedInfo ||
        (await getVideoInfo(url, cookieArgs)) ||
        ({} as VideoInfo);
      const { extractorKey, platform } = getStreamMeta(info, url);
      const metaArgs = audioMetadataArgs(info);
      const { getExtractor } = await import('../extractors/index.js');

      const extractor = extractorKey
        ? ((await getExtractor(url)) as Extractor)
        : null;
      const formats = Array.isArray(info.formats) ? info.formats : [];
      const audioFormats = Array.isArray(info.audioFormats)
        ? info.audioFormats
        : [];
      const selectedFormat =
        [...formats, ...audioFormats].find(
          (formatItem: Format) =>
            String(formatItem.formatId) === String(formatId)
        ) ||
        formats[0] ||
        audioFormats[0];

      if (extractor && checkJSStream(extractorKey)) {
        try {
          await handlePureJSStream(
            url,
            info,
            options,
            extractor,
            selectedFormat,
            combinedStdout,
            platform,
            extractorKey
          );
          return;
        } catch (error: unknown) {
          logger.warn(
            '[Streamer] JS Direct-Pipe failed, falling back to yt-dlp:',
            (error as Error).message
          );
        }
      }

      const probeArgs = buildYtdlpArgs(
        options,
        selectedFormat,
        cookieArgs,
        0,
        formats
      );
      const isMerging = probeArgs.includes('--merge-output-format');

      if (isDirectFetchable(selectedFormat, isMerging, format)) {
        const handled = await tryNetworkFetchPath(
          url,
          selectedFormat,
          options,
          cookieArgs,
          combinedStdout,
          platform,
          extractorKey
        );
        if (handled) return;
      }

      const tid = getTraceId() || 'global';

      // real-time mux for yt merges; temp file 50x faster
      if (isMerging && extractorKey === 'youtube') {
        const delivered = await deliverYoutubeMerge(
          url,
          selectedFormat,
          formats,
          audioFormats,
          options,
          cookieArgs,
          combinedStdout,
          metaArgs
        );
        if (delivered) return;
        logger.info(
          `[Streamer] [${tid}] YouTube delivery: BUFFERED temp file (turbo-mux unavailable)`
        );
      }

      logger.info(
        `[Download] [${tid}] Engine: yt-dlp | Platform: ${platform} | URL: ${url}`
      );
      const fallbackUrl = info.targetUrl || url;
      const youtubeId =
        (info.targetUrl || info.webpageUrl || '').match(
          /(?:v=|\/v\/)([0-9A-Za-z_-]{11})/
        )?.[1] || info.id;
      const cachedJsonPath = path.join(
        CACHE_DIR,
        'metadata',
        `${youtubeId}.json`
      );
      // stale nsig = throttled; skip cache
      const useCache = false;
      const fsSync = await import('node:fs');
      const useTempFile = isMerging;
      let tempPath = '-';
      if (useTempFile) {
        const tmpDir = path.join(CACHE_DIR, 'tmp');
        try {
          fsSync.mkdirSync(tmpDir, { recursive: true });
        } catch {
          // ignore mkdir failure
        }
        const idPart = String(youtubeId || Date.now()).replace(/[^a-zA-Z0-9_-]/gu, '_');
        tempPath = path.join(
          tmpDir,
          `${idPart}_${Math.random().toString(36).slice(2, 8)}.${options.format === 'webm' ? 'webm' : 'mp4'}`
        );
      }

      const spawnYtdlp = (withCache = false, clientIndex = 0) => {
        const currentArgs = [
          ...buildYtdlpArgs(
            options,
            selectedFormat,
            cookieArgs,
            clientIndex,
            formats,
            tempPath
          ),
        ];
        if (withCache) currentArgs.push('--load-info-json', cachedJsonPath);
        else currentArgs.push(fallbackUrl);
        return spawn('yt-dlp', currentArgs, { detached: true });
      };

      const startClient = pickBestClient(selectedFormat);
      const tried = new Set<number>([startClient]);

      const retryWithClient = (clientIndex: number) => {
        // skip already-tried clients
        while (clientIndex < YT_CLIENTS.length && tried.has(clientIndex)) {
          clientIndex++;
        }
        if (clientIndex >= YT_CLIENTS.length) {
          if (!combinedStdout.writableEnded) combinedStdout.end();
          return;
        }
        tried.add(clientIndex);
        logger.info(
          `[Streamer] Rotating to client: ${YT_CLIENTS[clientIndex]}`
        );
        if (useTempFile && fsSync.existsSync(tempPath)) {
          try {
            fsSync.unlinkSync(tempPath);
          } catch {
            /* ignore */
          }
        }
        activeChildProcess = spawnYtdlp(false, clientIndex);
        handleYtdlpOutput(
          activeChildProcess,
          format,
          combinedStdout,
          false,
          () => retryWithClient(clientIndex + 1),
          useTempFile ? tempPath : null,
          metaArgs
        );
      };

      logger.info(
        `[Streamer] Starting with client: ${YT_CLIENTS[startClient]} (formatId=${selectedFormat?.formatId})${useTempFile ? ' [temp file mode]' : ''}`
      );
      activeChildProcess = spawnYtdlp(useCache, startClient);
      handleYtdlpOutput(
        activeChildProcess,
        format,
        combinedStdout,
        useCache,
        () => retryWithClient(0),
        useTempFile ? tempPath : null,
        metaArgs
      );
    } catch (error: unknown) {
      logger.error('[Streamer] fatal:', (error as Error).message);
      Sentry.captureException(error);
      combinedStdout.emit('error', error);
    }
  })();

  combinedStdout.kill =
    combinedStdout.kill ||
    (() => {
      if (activeChildProcess) gracefulKill(activeChildProcess);
    });
  return combinedStdout;
}

export function spawnDownload(
  url: string,
  options: StreamOptions & { tempFilePath: string },
  cookieArgs: string[] = []
): ChildProcess {
  const { format, formatId, tempFilePath } = options;
  const baseArgs = [
    ...cookieArgs,
    '--user-agent',
    USER_AGENT,
    ...COMMON_ARGS,
    ...ytProxyArgs(url),
    '--cache-dir',
    CACHE_DIR,
    '--newline',
    '--progress',
    '-o',
    tempFilePath,
  ];
  let args: string[];
  if (['mp3', 'm4a', 'webm', 'audio'].includes(format)) {
    const fId =
      formatId && formatId !== 'mp3' && formatId !== 'm4a'
        ? `${formatId}/ba/b`
        : 'ba/b';
    args =
      format !== 'mp3'
        ? ['-f', fId, ...baseArgs, url]
        : [
            '-f',
            fId,
            '--extract-audio',
            '--audio-format',
            'mp3',
            ...baseArgs,
            url,
          ];
  } else {
    args = [
      '-f',
      formatId ? `${formatId}+ba/ba/b` : 'bv*[vcodec^=avc1]+ba/b',
      '-S',
      'res,vcodec:h264',
      '--merge-output-format',
      'mp4',
      ...baseArgs,
      url,
    ];
  }
  return spawn('yt-dlp', args, { detached: true });
}
