import { spawn, ChildProcess } from 'node:child_process';
import { logger } from '../../utils/infra/logger.util.js';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import { COMMON_ARGS, USER_AGENT } from './config.js';
import { ytProxyArgs } from './yt-proxy.js';
import { Format } from '../../types/index.js';
import { getTraceId } from '../../utils/infra/trace.util.js';
import type { StreamOptions, StreamerProcess } from './streamer.js';

export function destroyStream(stream: unknown) {
  if (
    stream &&
    typeof (stream as { destroy?: () => void }).destroy === 'function'
  ) {
    (stream as { destroy: () => void }).destroy();
  }
}

export function gracefulKill(childProcess: ChildProcess | null) {
  if (
    !childProcess ||
    !childProcess.pid ||
    childProcess.killed ||
    childProcess.exitCode !== null
  )
    return;

  const tid = getTraceId() || 'global';
  const pid = childProcess.pid;
  logger.info(
    `[Streamer] [${tid}] Attempting graceful shutdown of PGID ${pid}...`
  );

  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
      childProcess.kill('SIGTERM');
  }

  const killTimeout = setTimeout(() => {
    if (
      childProcess &&
      !childProcess.killed &&
      childProcess.exitCode === null
    ) {
      logger.warn(
        `[Streamer] [${tid}] PGID ${pid} still alive after SIGTERM, escalating to SIGKILL.`
      );
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
          childProcess.kill('SIGKILL');
      }
    }
  }, 2000);

  childProcess.on('exit', () => clearTimeout(killTimeout));
}

function _resolveFString(
  options: StreamOptions,
  selectedFormat: Format
): string {
  const { format, formatId, audioLang } = options;
  const isYtAudioOnly = ['mp3', 'm4a', 'audio'].includes(format || '');
  const effectiveAudioOnly =
    isYtAudioOnly || (format === 'mp4' && String(formatId).includes('audio'));

  if (
    !['mp3', 'm4a'].includes(format || '') &&
    formatId &&
    formatId !== 'best'
  ) {
    const cleanFid = String(formatId).split('-')[0];
    if (selectedFormat?.isMuxed) return cleanFid;
    // force rotation if muxed unavailable
    const targetHeight = selectedFormat?.height;
    const heightFilter = targetHeight
      ? `bv*[height<=${targetHeight}]+ba`
      : 'bv*+ba';
    const base = audioLang
      ? audioLang.split('-')[0].replace(/[^a-z]/giu, '')
      : '';
    if (base) {
      return `${cleanFid}+ba[language^=${base}]/${cleanFid}+bestaudio/${heightFilter}`;
    }
    return `${cleanFid}+bestaudio/${heightFilter}`;
  }

  if (effectiveAudioOnly) {
    const base = audioLang
      ? audioLang.split('-')[0].replace(/[^a-z]/giu, '')
      : '';
    return base ? `ba[language^=${base}]/ba/ba*/b/best` : 'ba/ba*/b/best';
  }
  return 'bv*+ba/b';
}

function _isCopyCompatible(selectedFormat: Format): boolean {
  const vcodec = selectedFormat?.vcodec || '';
  // stream-copy codecs: mp4 video; aac/opus/none audio
  const isMp4CompatibleVideo =
    vcodec.startsWith('avc1') ||
    vcodec.startsWith('h264') ||
    vcodec.startsWith('av01') ||
    vcodec.startsWith('vp09') ||
    vcodec.startsWith('vp9') ||
    vcodec.startsWith('hev1') ||
    vcodec.startsWith('hvc1');
  const acodec = selectedFormat?.acodec || '';
  const isCopyableAudio =
    acodec === 'none' ||
    acodec === '' ||
    acodec.startsWith('mp4a') ||
    acodec.includes('aac') ||
    acodec.startsWith('opus');
  return Boolean(isMp4CompatibleVideo && isCopyableAudio);
}

// client mix: tv most reliable for DASH+cookies & POT bypass
export const YT_CLIENTS = ['tv', 'android_vr', 'mweb', 'web_embedded'] as const;

// formats not on android_vr — use mweb
const HIGH_RES_FORMATS = new Set([
  '401',
  '571',
  '337', // av1/vp9 4k+
  '315',
  '272',
  '308', // vp9 4k
  '313',
  '266', // vp9 4k/8k
]);

export function pickBestClient(selectedFormat: Format | undefined): number {
  if (!selectedFormat) return 0;
  const fid = String(selectedFormat.formatId || '');
  const height = selectedFormat.height || 0;
  const vcodec = String(selectedFormat.vcodec || '');
  // android_vr no av1; 4k+ needs tv (mweb needs POT)
  if (vcodec.startsWith('av01')) {
    return YT_CLIENTS.indexOf('mweb');
  }
  if (HIGH_RES_FORMATS.has(fid) || height >= 2160) {
    return YT_CLIENTS.indexOf('tv');
  }
  return 0;
}

export function buildYtdlpArgs(
  options: StreamOptions,
  selectedFormat: Format,
  cookieArgs: string[],
  clientIndex = 0,
  formats: Format[] = [],
  outputTarget = '-'
): string[] {
  const { format } = options;
  const isYtAudioOnly = ['mp3', 'm4a', 'audio'].includes(format || '');

  const fString = _resolveFString(options, selectedFormat);
  const effectiveCookieArgs = COMMON_ARGS.includes('--cookies')
    ? []
    : cookieArgs;
  const args = [
    ...effectiveCookieArgs,
    '--user-agent',
    USER_AGENT,
    ...COMMON_ARGS,
    ...ytProxyArgs(),
    '--no-playlist',
    '--flat-playlist',
    '--no-check-formats',
    '--no-check-certificate',
    '--extractor-args',
    `youtube:player-client=${YT_CLIENTS[clientIndex % YT_CLIENTS.length]}`,
    '-f',
    fString,
    '--newline',
    '--progress',
    '-o',
    outputTarget,
  ];

  const isMerging = fString.includes('+');

  if (!isYtAudioOnly && isMerging) {
    args.push('--merge-output-format', 'mp4');
  }

  // copy unknown-codec merges; detect paired audio for bsf
  const shouldCopy = selectedFormat?.vcodec
    ? _isCopyCompatible(selectedFormat)
    : isMerging;

  if (isMerging) {
    const bestAudio = formats.find(
      (fmt) => fmt.acodec && fmt.acodec !== 'none' && fmt.vcodec === 'none'
    );
    const pairedAcodec = bestAudio?.acodec || selectedFormat?.acodec || '';
    const audioIsAAC =
      pairedAcodec.startsWith('mp4a') || pairedAcodec.includes('aac');

    if (!isYtAudioOnly) {
      if (shouldCopy) {
        // native dl 50x faster (bsf only for aac); transcode needs ffmpeg
        const bsfArg = audioIsAAC ? ['-bsf:a', 'aac_adtstoasc'] : [];
        args.push(
          '--postprocessor-args',
          `ffmpeg:-c:v copy -c:a copy ${bsfArg.join(' ')} -movflags +faststart`.trim()
        );
      } else {
        const height = selectedFormat?.height || 0;
        const preset = height >= 1080 ? 'superfast' : 'ultrafast';
        args.push(
          '--downloader',
          'ffmpeg',
          '--downloader-args',
          `ffmpeg:-c:v libx264 -preset ${preset} -threads 0 -crf 23 -c:a aac -b:a 128k -bsf:a aac_adtstoasc -f mp4 -movflags +faststart -ignore_unknown`
        );
      }
    }
  }

  return args;
}

/**
 * streams yt-dlp output to the client. kills on 60s stall, caps stderr,
 * sweeps partial .fXXX files via watchdog, cleans up on client-gone.
 * abort from child is expected (no log).
 */
export function handleYtdlpOutput(
  childProcess: ChildProcess | null | undefined,
  format: string,
  combinedStdout: StreamerProcess,
  wasUsingCache: boolean,
  retryCallback: () => void,
  tempFile: string | null = null,
  metaArgs: string[] = []
) {
  if (!childProcess) {
    logger.warn('[Streamer] yt-dlp process failed to start; ending stream');
    if (!combinedStdout.writableEnded) combinedStdout.end();
    return;
  }
  if (tempFile) {
    // file mode: native dl, pipe after; cleanup temp+partials once
    let capturedStderr = '';
    let lastProgressLog = 0;

    const tmpPath = tempFile;
    let cleaned = false;
    let activeFileStream: import('node:fs').ReadStream | null = null;
    const cleanupTemp = async () => {
      if (cleaned) return;
      cleaned = true;
      try {
        const { unlink, readdir } = await import('node:fs/promises');
        const pathMod = await import('node:path');
        const dir = pathMod.dirname(tmpPath);
        const base = pathMod.basename(tmpPath, pathMod.extname(tmpPath));
        const files = await readdir(dir).catch(() => [] as string[]);
        await Promise.all(
          files
            .filter((name) => name.startsWith(base))
            .map((name) => unlink(pathMod.join(dir, name)).catch(() => {}))
        );
      } catch {
        // ignore cleanup failure
      }
    };
    const onDownstreamGone = () => {
      if (activeFileStream && !activeFileStream.closed)
        activeFileStream.destroy();
      if (childProcess.exitCode === null && !childProcess.killed)
        gracefulKill(childProcess);
      cleanupTemp();
    };
    combinedStdout.on('close', onDownstreamGone);
    combinedStdout.on('error', onDownstreamGone);

    let stallTimer = setTimeout(() => {
      logger.info('[Streamer] Stall detected (60s silence), killing...');
      gracefulKill(childProcess);
    }, 60000);
    const bumpStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        logger.info('[Streamer] Stall detected (60s silence), killing...');
        gracefulKill(childProcess);
      }, 60000);
    };
    childProcess.on('close', () => clearTimeout(stallTimer));

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (chunk) => {
        bumpStall();
        const msg = chunk.toString();
        if (capturedStderr.length < 65536) capturedStderr += msg;
        for (const line of msg.split('\n')) {
          if (!line.trim()) continue;
          const isProgress = /\[download\]\s+\d+\.\d+%/u.test(line);
          if (isProgress) {
            const now = Date.now();
            if (now - lastProgressLog > 3000) {
              logger.info(`[ytdlp] ${line.trim()}`);
              lastProgressLog = now;
            }
          } else {
            logger.info(`[ytdlp] ${line.trim()}`);
          }
        }
        const match = msg.match(/\[download\]\s+(\d+\.\d+)%/u);
        if (match) combinedStdout.emit('progress', parseFloat(match[1]));
      });
    }

    let lastWatchdogBytes = 0;
    const watchdog = setInterval(async () => {
      try {
        const { statSync, readdirSync } = await import('node:fs');
        const path = await import('node:path');
        const dir = path.dirname(tempFile);
        const base = path.basename(tempFile, path.extname(tempFile));
        const siblings = readdirSync(dir).filter((name) =>
          name.startsWith(base)
        );
        let totalBytes = 0;
        const summary: string[] = [];
        for (const name of siblings) {
          try {
            const stats = statSync(path.join(dir, name));
            totalBytes += stats.size;
            summary.push(`${name}=${(stats.size / 1024 / 1024).toFixed(1)}MB`);
          } catch {
            // file disappeared between readdir and stat
          }
        }
        if (siblings.length === 0) {
          logger.info('[Streamer-Watchdog] no temp files yet');
        } else {
          if (totalBytes > lastWatchdogBytes) bumpStall();
          lastWatchdogBytes = totalBytes;
          logger.info(
            `[Streamer-Watchdog] total=${(totalBytes / 1024 / 1024).toFixed(1)}MB | ${summary.join(', ')}`
          );
        }
      } catch {
        logger.info('[Streamer-Watchdog] dir unreadable');
      }
    }, 10000);
    childProcess.on('close', () => clearInterval(watchdog));
    childProcess.on('close', async (code) => {
      if (code !== 0) {
        logger.error(
          `[Streamer] yt-dlp exited with code ${code}. Stderr: ${capturedStderr}`
        );
        const isRetryable =
          capturedStderr.includes('403') ||
          capturedStderr.includes('Forbidden') ||
          capturedStderr.includes('503') ||
          capturedStderr.includes('Service Unavailable') ||
          capturedStderr.includes('Server returned 5XX') ||
          capturedStderr.includes('Requested format is not available') ||
          capturedStderr.includes('Sign in to confirm');
        if (isRetryable) {
          logger.info(
            '[Streamer] retryable error detected, rotating client...'
          );
          retryCallback();
          return;
        }
        await cleanupTemp();
        if (!combinedStdout.writableEnded) combinedStdout.end();
        return;
      }
      try {
        const { createReadStream } = await import('node:fs');

        const fileStream = createReadStream(tempFile);
        activeFileStream = fileStream;
        fileStream.pipe(combinedStdout);
        fileStream.on('end', async () => {
          combinedStdout.emit('progress', 100);
          await cleanupTemp();
        });
        fileStream.on('error', async (error) => {
          logger.error('[Streamer] file stream error:', error.message);
          await cleanupTemp();
          if (!combinedStdout.writableEnded) combinedStdout.end();
        });
      } catch (error: unknown) {
        logger.error(
          '[Streamer] failed to read temp file:',
          (error as Error).message
        );
        if (!combinedStdout.writableEnded) combinedStdout.end();
      }
    });
    return;
  }

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
        ...metaArgs,
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

    const originalKill = combinedStdout.kill;
    combinedStdout.kill = () => {
      gracefulKill(childProcess);
      controller.abort();
      gracefulKill(ffmpeg);
      if (originalKill) originalKill();
    };

    if (ffmpeg.stdio[0] && ffmpeg.stdio[1] && childProcess.stdout) {
      import('node:stream/promises').then(({ pipeline }) => {
        Promise.all([
          pipeline(
            childProcess.stdout as import('stream').Readable,
            ffmpeg.stdio[0] as import('stream').Writable,
            { signal: controller.signal }
          ),
          pipeline(
            ffmpeg.stdio[1] as import('stream').Readable,
            combinedStdout,
            { signal: controller.signal }
          ),
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
      });
    }
  } else {
    if (childProcess.stdout)
      childProcess.stdout.pipe(combinedStdout, { end: false });
  }

  let capturedStderr = '';
  if (childProcess.stderr) {
    childProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString();
      capturedStderr += msg;
      const match = msg.match(/\[download\]\s+(\d+\.\d+)%/u);
      if (match) combinedStdout.emit('progress', parseFloat(match[1]));
    });
  }

  childProcess.on('close', (code) => {
    if (code !== 0) {
      logger.error(
        `[Streamer] yt-dlp exited with code ${code}. Stderr: ${capturedStderr}`
      );
      const isRetryable =
        capturedStderr.includes('403') ||
        capturedStderr.includes('Forbidden') ||
        capturedStderr.includes('503') ||
        capturedStderr.includes('Service Unavailable') ||
        capturedStderr.includes('Server returned 5XX') ||
        capturedStderr.includes('Requested format is not available') ||
        capturedStderr.includes('Sign in to confirm');
      if (isRetryable) {
        logger.info('[Streamer] retryable error detected, rotating client...');
        retryCallback();
        return;
      }
    }
    if (!combinedStdout.writableEnded) combinedStdout.end();
  });
}
