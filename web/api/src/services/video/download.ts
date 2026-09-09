import { Request, Response } from 'express';
import { logger } from '../../utils/infra/logger.util.js';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import { pipeline } from 'node:stream/promises';
import {
  getCookieArgs,
  resolveConvertTarget,
  resolveTargetFormat,
} from '../../utils/api/controller.util.js';
import { setupConvertResponse } from '../../utils/api/response.util.js';
import { streamDownload } from '../ytdlp.service.js';
import { setupStreamListeners } from '../../utils/media/stream.util.js';
import { recordFailure } from '../../utils/infra/metrics.util.js';
import { sendEvent } from '../../utils/network/sse.util.js';
import { detectService } from '../../utils/media/video.util.js';

const SERVER_MUX_MAX_BYTES = 400 * 1024 * 1024;

export async function executeDownload(
  res: Response,
  clientId: string | undefined,
  videoURL: string,
  data: Record<string, unknown>,
  timestamp: string,
  filename: string,
  format: string,
  formatId: string | undefined,
  isSpotifyRequest: boolean
) {
  try {
    const cookieArgs = await getCookieArgs(videoURL, clientId, 'initializing');
    const resolvedTargetURL = await resolveConvertTarget(
      videoURL,
      data.targetUrl as string | undefined,
      cookieArgs
    );

    logger.info(
      `[${timestamp}] [Turbo] Resolved target for download: ${resolvedTargetURL}`
    );

    const { info, targetFormat } = await resolveTargetFormat(
      format,
      resolvedTargetURL,
      resolvedTargetURL,
      cookieArgs,
      formatId,
      clientId,
      videoURL
    );

    if (!info) {
      throw new Error('Failed to fetch media information.');
    }

    // refuse oversized mux on the small box
    const muxBytes = Number(targetFormat?.filesize) || 0;
    if (muxBytes > SERVER_MUX_MAX_BYTES) {
      throw new Error(
        `Refusing server mux: ${Math.round(muxBytes / 1048576)}MB over limit`
      );
    }

    const streamerUrl = info.targetUrl || resolvedTargetURL;

    if (isSpotifyRequest) {
      info.title = (data.title as string) || info.title;
      info.uploader = (data.artist as string) || info.uploader || 'Unknown';
    }

    const totalBytesSent = { value: 0 };
    setupConvertResponse(res, filename, format);

    logger.info(
      `[${timestamp}] [Turbo] Spawning stream download for: ${filename}`
    );
    const videoProcess = streamDownload(
      streamerUrl,
      {
        format,
        formatId: (targetFormat?.formatId || formatId || 'best') as string,
        audioLang: (data.audioLang as string) || undefined,
      },
      cookieArgs,
      info
    );

    // trigger browser download popup immediately
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    setupStreamListeners(videoProcess, res, clientId, totalBytesSent);

    const hardTimeoutId = setTimeout(
      () => {
        if (typeof videoProcess.kill === 'function') {
          logger.error(
            `[${timestamp}] [Turbo] Hard timeout reached (30m) for stream: ${clientId}. Forcing SIGKILL.`
          );
          videoProcess.kill('SIGKILL');
        }
      },
      1000 * 60 * 30
    );

    return { videoProcess, hardTimeoutId };
  } catch (error: unknown) {
    const err = error as Error;
    recordFailure('convert');
    logger.error('[ConvertVideo] Error:', err.message);
    Sentry.captureException(error);
    if (clientId)
      sendEvent(clientId, {
        status: 'error',
        message: err.message || 'Internal server error',
      });
    if (!res.headersSent)
      res.status(500).json({ error: err.message || 'Internal server error' });
    return null;
  }
}

export async function streamDubbedAudio(
  req: Request,
  res: Response,
  targetUrl: string,
  audioLang: string
): Promise<void> {
  const { spawn: spawnChild } = await import('child_process');
  const { COMMON_ARGS } = await import('../ytdlp/config.js');
  const { ytProxyArgs } = await import('../ytdlp/yt-proxy.js');

  const cookieIdx = COMMON_ARGS.indexOf('--cookies');
  // dubbed audio is gated without cookies
  if (cookieIdx < 0) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'dubbed audio requires cookies' });
    }
    return;
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'audio/mp4');

  const base = audioLang.split('-')[0];
  const potBase = process.env.YT_POT_BASE_URL || 'http://127.0.0.1:4416';
  const args = [
    '--ignore-config',
    '--no-playlist',
    '--no-warnings',
    '--force-ipv4',
    '--no-colors',
    '--cookies',
    COMMON_ARGS[cookieIdx + 1],
    '--extractor-args',
    'youtube:player_client=mweb,tv,default',
    '--extractor-args',
    `youtubepot-bgutilhttp:base_url=${potBase}`,
    '-f',
    `ba[language^=${base}][ext=m4a]/ba[language^=${base}]`,
    ...ytProxyArgs(targetUrl),
    '-o',
    '-',
    targetUrl,
  ];

  logger.info(`[DubAudio] streaming ${audioLang} via yt-dlp`);
  const ytProcess = spawnChild('yt-dlp', args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  req.on('close', () => {
    try {
      if (ytProcess.pid) process.kill(-ytProcess.pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        logger.error('[DubAudio] kill error', error);
      }
    }
  });
  ytProcess.stderr?.resume();
  ytProcess.stdout?.pipe(res);
  ytProcess.on('error', (error: Error) => {
    logger.error('[DubAudio] spawn error', error.message);
    if (!res.headersSent) res.status(502).end();
  });
  ytProcess.on('close', () => {
    if (!res.writableEnded) res.end();
  });
}

export async function streamViaYtdlp(
  req: Request,
  res: Response,
  targetUrl: string,
  formatId: string,
  filename: string | undefined
): Promise<void> {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
  logger.info(`[${timestamp}] [EME] Proxying stream via yt-dlp...`);
  const { spawn: spawnChild } = await import('child_process');
  const { USER_AGENT: userAgent } = await import('../ytdlp/config.js');
  const { downloadCookies } =
    await import('../../utils/network/cookie.util.js');

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  const cleanFormatId = formatId.split(/[-+]/u)[0];
  const isWebm =
    req.query.ext === 'webm' ||
    ['249', '250', '251', '271', '313'].includes(cleanFormatId);

  let mimeType = isWebm ? 'video/webm' : 'video/mp4';
  if (['249', '250', '251', '140'].includes(cleanFormatId)) {
    mimeType = isWebm ? 'audio/webm' : 'audio/mp4';
  }
  res.setHeader('Content-Type', mimeType);

  if (filename) {
    const safeName = encodeURIComponent(filename);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${safeName}`
    );
  }

  const cookieType = detectService(targetUrl).toLowerCase();
  const cookiesPath = await downloadCookies(
    cookieType === 'facebook' || cookieType === 'instagram'
      ? 'facebook'
      : 'youtube'
  );
  const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

  const args = [
    ...cookieArgs,
    '--user-agent',
    userAgent,
    '--no-warnings',
    '--ignore-config',
    '-f',
    cleanFormatId,
    '-o',
    '-',
    targetUrl,
  ];

  const ytProcess = spawnChild('yt-dlp', args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const abortController = new AbortController();
  req.on('close', () => {
    abortController.abort();
    try {
      if (ytProcess.pid) {
        process.kill(-ytProcess.pid, 'SIGKILL');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
        logger.error('yt-dlp kill error', error);
    }
  });

  try {
    if (!ytProcess.stdout) throw new Error('yt-dlp stdout unavailable');
    await pipeline(ytProcess.stdout, res, { signal: abortController.signal });
  } catch (error: unknown) {
    const typedError = error as Error;
    if (typedError.name !== 'AbortError') {
      logger.error('[Proxy] yt-dlp Pipe Error:', typedError.message);
      Sentry.captureException(typedError);
    }
  }
  if (!res.writableEnded) res.end();
}
