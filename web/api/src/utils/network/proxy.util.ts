import { Response } from 'express';
import { logger } from '../infra/logger.util.js';
import { Pool } from 'undici';
import { URL } from 'node:url';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { USER_AGENT } from '../../services/ytdlp/config.js';
import { LRUCache } from 'lru-cache';
import { resolveAndValidateHost } from './security.util.js';
import { isHost, isHostname } from './host.util.js';

const pools = new LRUCache<string, Pool>({
  max: 100, // max origins
  dispose: (pool: Pool, key: string) => {
    logger.info(`[ProxyStream] Disposing connection pool for: ${key}`);
    pool.close().catch(logger.error);
  },
});

// verify tls unless cdn bypass opted in
export function tlsRejectUnauthorized(
  host: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const isCDN = /ytimg\.com|fbcdn\.net|tiktokv\.com|googlevideo\.com/u.test(
    host
  );
  return !(isCDN && env.PROXY_ALLOW_INSECURE_TLS === 'true');
}

function getPool(url: string, originalHost?: string): Pool {
  const urlObj = new URL(url);
  const origin = urlObj.origin;

  if (!pools.has(origin)) {
    logger.info(`[ProxyStream] Creating new connection pool for: ${origin}`);

    const hostToCheck = originalHost || urlObj.hostname;

    pools.set(
      origin,
      new Pool(origin, {
        connections: 20,
        pipelining: 1,
        keepAliveTimeout: 60000,
        connect: {
          rejectUnauthorized: tlsRejectUnauthorized(hostToCheck),
          servername: originalHost, // fix sni/tls
        },
      })
    );
  }
  const pool = pools.get(origin);
  if (!pool) throw new Error(`Failed to create connection pool for ${origin}`);
  return pool;
}

export function getProxyHeaders(
  url: string,
  incomingHeaders: Record<string, string | undefined> = {}
): Record<string, string> {
  const rest: Record<string, string> = {};
  // don't leak frontend identity to cdn
  const skip = new Set([
    'host',
    'connection',
    'user-agent',
    'accept',
    'referer',
    'origin',
    'cookie',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-fetch-user',
  ]);
  for (const [key, value] of Object.entries(incomingHeaders)) {
    const lowerKey = key.toLowerCase();
    if (!skip.has(lowerKey) && value !== undefined) {
      rest[lowerKey] = value as string;
    }
  }

  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    accept: '*/*',
    connection: 'keep-alive',
    ...rest,
  };

  const range = incomingHeaders.range ?? incomingHeaders.Range ?? 'bytes=0-';
  if (range) headers.range = range;

  const urlObj = new URL(url);
  const hostname = urlObj.hostname;

  if (
    isHostname(hostname, 'googlevideo.com') ||
    isHostname(hostname, 'youtube.com')
  ) {
    headers.referer = 'https://www.youtube.com/';
    headers.origin = 'https://www.youtube.com';
  } else if (
    isHostname(hostname, 'tiktok.com') ||
    hostname.includes('tiktokcdn') ||
    hostname.includes('tiktokv')
  ) {
    headers.referer = 'https://www.tiktok.com/';
    headers.origin = 'https://www.tiktok.com';
  } else if (
    isHostname(hostname, 'instagram.com') ||
    isHostname(hostname, 'cdninstagram.com')
  ) {
    headers.referer = 'https://www.instagram.com/';
  } else if (
    isHostname(hostname, 'facebook.com') ||
    isHostname(hostname, 'fbcdn.net')
  ) {
    headers.referer = 'https://www.facebook.com/';
  } else if (isHostname(hostname, 'twitter.com') || isHostname(hostname, 'x.com')) {
    headers.referer = 'https://twitter.com/';
  } else if (
    isHostname(hostname, 'bilivideo.com') ||
    isHostname(hostname, 'bstarstatic') ||
    (isHostname(hostname, 'akamaized.net') && isHostname(hostname, 'bstar'))
  ) {
    // bilivideo mirrors 403 without referer
    headers.referer = 'https://www.bilibili.tv/';
  }

  return headers;
}

// client seeked or closed mid-stream
export function isBenignDisconnect(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return (
    error.name === 'AbortError' ||
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    error.message === 'Premature close'
  );
}

export async function pipeWebStream(
  url: string,
  localResponse: Response,
  filename: string | undefined,
  incomingHeaders: Record<string, string | undefined> = {},
  redirectCount = 0,
  signal?: AbortSignal
): Promise<boolean> {
  if (redirectCount > 5) throw new Error('Too many redirects');
  if (typeof url !== 'string' || !url) return false;

  const urlObj = new URL(url);

  // ssrf guard: anti-rebinding IP
  const resolvedIp = await resolveAndValidateHost(urlObj.hostname);

  const safeIp = resolvedIp.includes(':') ? `[${resolvedIp}]` : resolvedIp;
  const port = urlObj.port ? `:${urlObj.port}` : '';
  const poolUrl = `${urlObj.protocol}//${safeIp}${port}`;
  const client = getPool(poolUrl, urlObj.hostname);

  const requestHeaders = getProxyHeaders(url, incomingHeaders);
  requestHeaders.host = urlObj.host;

  try {
    const { statusCode, headers, body } = await client.request({
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: requestHeaders,
      signal,
    });

    if (
      [301, 302, 307, 308].includes(statusCode) &&
      typeof headers.location === 'string'
    ) {
      const redirectUrl = new URL(headers.location, url).toString();
      logger.info(
        `[ProxyStream] Redirecting ${statusCode} -> ${redirectUrl.substring(0, 50)}...`
      );
      body.on('data', () => {
        /* ignore */
      });
      return pipeWebStream(
        redirectUrl,
        localResponse,
        filename,
        incomingHeaders,
        redirectCount + 1,
        signal
      );
    }

    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    const size = headers['content-length']
      ? `${(Number(headers['content-length']) / 1024 / 1024).toFixed(1)}MB`
      : 'unknown';
    logger.info(
      `[${timestamp}] [ProxyStream] ${statusCode} OK (${size}) -> ${url.substring(0, 40)}...`
    );

    if (!localResponse.headersSent) {
      localResponse.status(statusCode);
      const passThrough = [
        'content-type',
        'content-length',
        'accept-ranges',
        'content-range',
        'cache-control',
      ];
      passThrough.forEach((headerKey) => {
        if (headers[headerKey])
          localResponse.setHeader(
            headerKey,
            headers[headerKey] as string | string[]
          );
      });

      if (
        isHost(url, 'googlevideo.com') &&
        !localResponse.getHeader('content-type')
      ) {
        localResponse.setHeader(
          'Content-Type',
          url.includes('mime=audio') ? 'audio/mp4' : 'video/mp4'
        );
      }

      localResponse.setHeader('Access-Control-Allow-Origin', '*');
      localResponse.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      if (filename) {
        localResponse.setHeader(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
      }
    }

    await pipeline(body, localResponse, { signal });
    return true;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (isBenignDisconnect(error)) {
      logger.warn(
        '[ProxyStream] Client disconnected; media stream aborted gracefully.'
      );
      return false;
    }
    logger.error('[ProxyStream] Stream Error:', error.message);
    if (!localResponse.headersSent) localResponse.status(500).end();
    throw error;
  }
}

export function getProxiedStream(
  url: string,
  customHeaders: Record<string, string> = {}
): PassThrough {
  const stream = new PassThrough();
  // guard error emit on orphan stream
  const failStream = (err: Error) => {
    if (stream.destroyed) return;
    if (stream.listenerCount('error') > 0) stream.emit('error', err);
    else stream.destroy();
  };
  const urlObj = new URL(url);

  resolveAndValidateHost(urlObj.hostname)
    .then((resolvedIp) => {
      const safeIp = resolvedIp.includes(':') ? `[${resolvedIp}]` : resolvedIp;
      const port = urlObj.port ? `:${urlObj.port}` : '';
      const poolUrl = `${urlObj.protocol}//${safeIp}${port}`;
      const client = getPool(poolUrl, urlObj.hostname);

      const requestHeaders = getProxyHeaders(url, customHeaders);
      requestHeaders['host'] = urlObj.host;

      client.stream(
        {
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: requestHeaders,
        },
        ({ statusCode }) => {
          if (statusCode >= 400) {
            failStream(new Error(`HTTP ${statusCode}`));
          }
          return stream;
        },
        (err) => {
          if (err) {
            if (err.message !== 'Premature close') {
              logger.error('[ProxyStream] Helper Error:', err.message);
            }
            failStream(err);
          }
        }
      );
    })
    .catch((err) => {
      logger.error('[ProxyStream] SSRF/DNS Block:', err.message);
      failStream(err);
    });

  return stream;
}
