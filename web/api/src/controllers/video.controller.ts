import { isHost } from '../utils/network/host.util.js';
import { Request, Response } from 'express';
import { logger } from '../utils/infra/logger.util.js';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import {
  addClient,
  removeClient,
  sendEvent,
} from '../utils/network/sse.util.js';
import {
  isSupportedUrl,
  isValidSpotifyUrl,
  decodeUrlIfNeeded,
} from '../utils/network/validation.util.js';
import { pipeWebStream } from '../utils/network/proxy.util.js';
import { verifyProxyParams } from '../utils/network/secrets.util.js';
import { recordFailure } from '../utils/infra/metrics.util.js';
import {
  detectService,
  getSanitizedFilename,
} from '../utils/media/video.util.js';
import { prepareFinalResponse } from '../utils/api/response.util.js';
import {
  getCookieArgs,
  initializeSession,
} from '../utils/api/controller.util.js';
import {
  processBackgroundTracks,
  resolveSeedTracks,
  type SeedTrack,
} from '../services/seeder.service.js';
import {
  fetchMediaInfo,
  handleSpotifyRegistry,
} from '../services/video/info.js';
import {
  parseRequestParams,
  resolveManifests,
  buildStreamResponse,
} from '../services/video/stream-resolver.js';
import {
  executeDownload,
  streamViaYtdlp,
  streamDubbedAudio,
} from '../services/video/download.js';
import { SpotifyMetadata } from '../types/index.js';

export const streamEvents = async (
  req: Request,
  res: Response
): Promise<void> => {
  const id = (req.query.id as string) || undefined;
  logger.info(`[SSE] Client connecting: ${id}`);
  if (!id) {
    res.status(400).end();
    return;
  }
  await addClient(id, res);
};

export const getVideoInformation = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  const rawUrl = req.query.url;
  let videoURL = decodeUrlIfNeeded(typeof rawUrl === 'string' ? rawUrl : '');
  const clientId = (req.query.id as string) || undefined;

  if (videoURL) {
    videoURL = videoURL.split('&id=')[0].split('?id=')[0];
  }

  if (!videoURL || !isSupportedUrl(videoURL)) {
    res.status(400).json({ error: 'No valid URL provided' });
    return;
  }

  const serviceName = detectService(videoURL);
  await initializeSession(clientId);

  try {
    const cookieArgs = await getCookieArgs(videoURL, clientId);
    const isSpotify = isHost(videoURL, 'spotify.com');

    // fail-fast cap so blocked platforms don't hang
    const info = await Promise.race([
      fetchMediaInfo(videoURL, clientId, serviceName, cookieArgs),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('RESOLVE_TIMEOUT')),
          Number(process.env.RESOLVE_TIMEOUT_MS) || 30000
        ).unref();
      }),
    ]);

    // fast partial hit
    if (!info || (!info.formats?.length && !info.isPartial)) {
      res.json({
        title: info?.title || 'Unknown',
        thumbnail: info?.thumbnail || '',
        formats: [],
        audioFormats: [],
      });
      return;
    }

    const spotifyData = isSpotify
      ? ({ ...info, type: 'spotify' } as unknown as SpotifyMetadata)
      : null;
    const targetURL = isSpotify ? info.targetUrl || videoURL : videoURL;

    const finalResponse = await prepareFinalResponse(
      info,
      isSpotify,
      spotifyData,
      videoURL
    );
    if (isSpotify) {
      handleSpotifyRegistry(info, finalResponse, videoURL, targetURL);
    }

    res.json(finalResponse);
  } catch (error: unknown) {
    const isTimeout = (error as Error).message === 'RESOLVE_TIMEOUT';
    recordFailure('info');
    logger.error('[VideoInfo] Error:', (error as Error).message);
    if (!isTimeout) Sentry.captureException(error);
    if (clientId) removeClient(clientId);
    if (!res.headersSent)
      res.status(isTimeout ? 504 : 500).json({
        error: isTimeout
          ? 'Resolution timed out — platform may be blocked or unavailable.'
          : 'Failed to fetch video info',
      });
  }
};

export const getStreamUrls = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { videoURL, clientId, formatId } = parseRequestParams(req);
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  if (!videoURL || !isSupportedUrl(videoURL)) {
    res.status(400).json({ error: 'No valid URL provided' });
    return;
  }

  logger.info(`[${timestamp}] [EME] Resolving manifests for Edge Muxing...`);

  try {
    const {
      info,
      videoTunnel,
      audioTunnel,
      isAudioOnly,
      filename,
      totalSize,
      outputMeta,
      directUrl,
    } = await resolveManifests(req, videoURL, clientId, formatId);
    res.json(
      buildStreamResponse(
        info,
        videoTunnel,
        audioTunnel,
        isAudioOnly,
        filename,
        totalSize,
        outputMeta as Record<string, unknown>,
        directUrl
      )
    );
  } catch (error: unknown) {
    recordFailure('stream_urls');
    logger.error('[StreamUrls] Error:', (error as Error).message);
    Sentry.captureException(error);
    if (!res.headersSent)
      res.status(500).json({ error: 'Failed to resolve stream URLs' });
  }
};

const handleEmeChunkedStream = async (
  req: Request,
  res: Response,
  urlToFetch: string,
  targetUrl: string | undefined,
  formatId: string | undefined,
  abortController: AbortController
): Promise<boolean> => {
  const clenMatch = /[?&]clen=(\d+)/.exec(urlToFetch);
  const streamBytes = clenMatch ? Number(clenMatch[1]) : 0;

  if (
    req.query.via !== 'eme' ||
    streamBytes <= 16 * 1024 * 1024 ||
    !/googlevideo\.com/i.test(urlToFetch)
  ) {
    return false;
  }

  try {
    const { fetchChunked, resolveFinalUrl } =
      await import('../services/ytdlp/chunked-fetcher.js');
    const { ytProxyDispatcher } = await import('../services/ytdlp/yt-proxy.js');
    const dispatcher = ytProxyDispatcher();
    let currentUrl = await resolveFinalUrl(
      urlToFetch,
      dispatcher,
      abortController.signal
    );

    const transplant =
      targetUrl && formatId
        ? async () => {
            const { getCookieArgs } =
              await import('../utils/api/controller.util.js');
            const { getVideoInfo } =
              await import('../services/ytdlp.service.js');
            const cookieArgs = await getCookieArgs(
              targetUrl,
              req.query.id as string | undefined
            );
            const fresh = await getVideoInfo(targetUrl, cookieArgs);
            const match = [
              ...(fresh?.formats ?? []),
              ...(fresh?.audioFormats ?? []),
            ].find((fmt) => String(fmt.formatId) === String(formatId));
            if (!match?.url) throw new Error('eme transplant: format missing');
            currentUrl = await resolveFinalUrl(
              match.url,
              dispatcher,
              abortController.signal
            );
          }
        : undefined;

    const rangeHeader = (req.headers.range as string) || '';
    const rangeMatch = /^bytes=(\d+)-/u.exec(rangeHeader);
    const startByte = rangeMatch ? BigInt(rangeMatch[1]) : 0n;

    const { stream, size, contentType } = await fetchChunked({
      urlProvider: () => Promise.resolve({ url: currentUrl }),
      transplant,
      controller: abortController,
      service: 'youtube',
      dispatcher,
      start: startByte,
    });

    res.setHeader(
      'Content-Type',
      contentType ||
        (urlToFetch.includes('mime=audio') ? 'audio/mp4' : 'video/mp4')
    );
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const isResume = startByte > 0n && startByte < size;
    if (isResume) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${startByte}-${size - 1n}/${size}`);
      res.setHeader('Content-Length', (size - startByte).toString());
    } else {
      res.status(200);
      res.setHeader('Content-Length', size.toString());
    }

    let sentBytes = 0;
    const progressMsg = isResume ? `resume@${startByte} ` : '';
    logger.info(
      `[EME] chunked begin: ${progressMsg}expecting ${size - startByte} of ${size} bytes`
    );

    stream.on('data', (chunk: Buffer) => {
      sentBytes += chunk.length;
    });
    stream.on('end', () => {
      logger.info(`[EME] chunked end: sent ${sentBytes} / ${size}`);
    });
    stream.on('error', (err: Error) => {
      logger.error(
        `[Proxy] EME chunked error after ${sentBytes}/${size}:`,
        err.message
      );
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
    return true;
  } catch (chunkErr: unknown) {
    logger.warn(
      `[Proxy] EME chunked unavailable, piping instead: ${(chunkErr as Error).message}`
    );
    return false;
  }
};

function dubLangFromUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  try {
    const xtags = new URL(rawUrl).searchParams.get('xtags') || '';
    if (!/acont=dubbed/iu.test(xtags)) return null;
    return /lang=([\w-]+)/iu.exec(xtags)?.[1] ?? null;
  } catch {
    return null;
  }
}

export const proxyStream = async (
  req: Request,
  res: Response
): Promise<void> => {
  const queryData = req.query as Record<string, string | string[] | undefined>;
  let { targetUrl, formatId, filename } = queryData;
  if (Array.isArray(targetUrl)) targetUrl = targetUrl[0];
  if (Array.isArray(formatId)) formatId = formatId[0];
  if (Array.isArray(filename)) filename = filename[0];

  let rawUrl = queryData.rawUrl;
  if (Array.isArray(rawUrl)) rawUrl = rawUrl[0];

  // reject unsigned url= (legacy open-relay vector)
  if (queryData.url !== undefined) {
    res.status(403).json({ error: 'Unsigned target not allowed' });
    return;
  }

  // refuse forged or expired signed links
  if (
    !verifyProxyParams({
      targetUrl: targetUrl as string | undefined,
      rawUrl: rawUrl as string | undefined,
      formatId: formatId as string | undefined,
      exp: Number(req.query.exp),
      sig: req.query.sig as string | undefined,
    })
  ) {
    res.status(403).json({ error: 'Invalid or expired proxy signature' });
    return;
  }

  // fetch only the signature-bound url
  const urlToFetch = typeof rawUrl === 'string' ? rawUrl : '';

  // trace which client path fetched this
  logger.info(
    `[Proxy] via=${(req.query.via as string) || 'direct'} fmt=${req.query.formatId ?? '?'}`
  );

  if (urlToFetch) {
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    // dubbed audio is gated; serve via yt-dlp
    const dubLang = dubLangFromUrl(urlToFetch);
    if (dubLang && targetUrl) {
      await streamDubbedAudio(req, res, targetUrl as string, dubLang);
      return;
    }

    if (
      await handleEmeChunkedStream(
        req,
        res,
        urlToFetch,
        targetUrl as string | undefined,
        formatId as string | undefined,
        abortController
      )
    ) {
      return;
    }

    try {
      await pipeWebStream(
        urlToFetch,
        res,
        filename as string,
        req.headers as unknown as Record<string, string | undefined>,
        0,
        abortController.signal
      );
      return;
    } catch (error: unknown) {
      recordFailure('proxy');
      logger.error('[Proxy] Raw Pipe Error:', (error as Error).message);
      Sentry.captureException(error);
      if (!res.headersSent)
        res.status(500).json({ error: 'Proxy fetch failed' });
      res.end();
      return;
    }
  }

  if (targetUrl && formatId) {
    await streamViaYtdlp(req, res, targetUrl, formatId, filename);
    return;
  }

  res.status(400).end();
};

export const reportTelemetry = (req: Request, res: Response): void => {
  const { event } = req.body;
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
  const safeEvent = String(event || 'unknown').replaceAll(/[^\w]/gu, '_');
  logger.info(`[${timestamp}] [EME] Client-Side Handshake: ${safeEvent}`);
  res.status(204).end();
};

export const convertVideo = (req: Request, res: Response): void => {
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );

  const requestData = { ...req.query, ...req.body } as {
    url?: string;
    id?: string;
    format?: string;
    formatId?: string;
    audioLang?: string;
    token?: string;
    title?: string;
    artist?: string;
    targetUrl?: string;
  };

  const {
    url: videoURL,
    id: clientIdStr,
    format = 'mp4',
    formatId,
  } = requestData;
  const clientId = clientIdStr || undefined;

  logger.info(`[Convert] Request received for: ${videoURL} (ID: ${clientId})`);

  if (!videoURL || !isSupportedUrl(videoURL)) {
    logger.warn(`[Convert] Invalid URL: ${videoURL}`);
    res.status(400).json({ error: 'No valid URL provided' });
    return;
  }

  const token = requestData.token || clientId;
  // cookie value must be injection-safe; clients send uuid fragments/base36
  if (token && /^[A-Za-z0-9_-]{1,64}$/u.test(token)) {
    res.setHeader('Set-Cookie', `download_token=${token}; Path=/; Max-Age=60`);
  }

  const isSpotifyRequest = isHost(videoURL, 'spotify.com');
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  let finalFormat = format;
  if (formatId?.startsWith('photo')) finalFormat = 'jpg';

  const filename = getSanitizedFilename(
    requestData.title || 'video',
    requestData.artist,
    finalFormat,
    isSpotifyRequest
  );

  logger.info(
    `[${timestamp}] [Turbo] Starting Server-Side muxing for: ${filename}`
  );

  if (clientId) {
    sendEvent(clientId, {
      status: 'initializing',
      progress: 5,
      subStatus: 'syncing core...',
      text: 'initiating jump',
    });
  }

  (async () => {
    const result = await executeDownload(
      res,
      clientId,
      videoURL as string,
      requestData,
      timestamp,
      filename,
      format,
      formatId,
      isSpotifyRequest
    );
    if (result) {
      const { videoProcess, hardTimeoutId } = result;
      req.on('close', () => {
        clearTimeout(hardTimeoutId);
        if (typeof videoProcess.kill === 'function') {
          logger.info(
            `[${timestamp}] [Turbo] Client disconnected. Cleaning up stream for: ${clientId}`
          );
          videoProcess.kill();
        }
        if (!res.writableEnded) res.end();
      });
    }
  })().catch((error) => {
    logger.error(
      `[${timestamp}] [ConvertVideo] Unhandled exception in download workflow:`,
      error
    );
    Sentry.captureException(error);
    if (!res.headersSent)
      res
        .status(500)
        .json({ error: 'Internal server error during processing' });
    if (!res.writableEnded) res.end();
  });
};

export const seedIntelligence = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { url, id: clientIdStr } = req.query as { url: string; id: string };
  const clientId = clientIdStr || 'admin-seeder';
  if (!url || !isValidSpotifyUrl(url)) {
    res
      .status(400)
      .json({ error: 'Invalid Spotify Artist/Album URL provided' });
    return;
  }

  try {
    const tracks = await resolveSeedTracks(url);

    if (!tracks || tracks.length === 0) throw new Error('No tracks found.');

    res.json({
      message: 'Intelligence Gathering Started in Background',
      trackCount: tracks.length,
      target: url,
    });
    processBackgroundTracks(tracks as SeedTrack[], clientId).catch(
      (error: Error) => {
        logger.error('[Seeder] Background Process Crashed:', error.message);
        Sentry.captureException(error);
      }
    );
  } catch (error: unknown) {
    if (!res.headersSent) {
      Sentry.captureException(error);
      res.status(500).json({
        error: (error as Error).message || 'An unknown error occurred',
      });
    }
  }
};
