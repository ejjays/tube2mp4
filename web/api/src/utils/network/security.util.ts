import path from 'node:path';
import { logger } from '../infra/logger.util.js';
import os from 'node:os';
import { lookup } from 'node:dns/promises';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { fetch as undiciFetch, Agent } from 'undici';
import { createRedisClient } from '../infra/redis.util.js';

const redis = createRedisClient('security');

const PRIVATE_IP_RANGES = [
  /^127\./, // localhost
  /^10\./, // class a
  /^192\.168\./, // class c
  /^172\.(?:1[6-9]|2\d|3[0-1])\./, // class b
  /^169\.254\./, // link-local
  /^0\./, // 0.0.0.0/8
  /^100\.(?:6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // nat prefix
  /^255\.255\.255\.255$/, // broadcast
  /^(?:22[4-9]|23\d)\./, // multicast IPv4
  /^::1$/, // ipv6 local
  /^[fF][cCdD]/, // ipv6 unique
  /^[fF][eE][8-9a-bA-B]/, // ipv6 link-local
  /^::$/, // ipv6 unspecified
  /^[fF][fF]/, // ipv6 multicast
  /^::ffff:(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.|100\.(?:6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.|255\.255\.255\.255|22[4-9]\.|23\d\.)/, // ipv4 private
];

export function isSafeIp(ip: string): boolean {
  if (!isIP(ip)) return false;
  return !PRIVATE_IP_RANGES.some((regex) => regex.test(ip));
}

export async function resolveAndValidateHost(
  hostname: string
): Promise<string> {
  if (isIP(hostname)) {
    if (!isSafeIp(hostname)) {
      throw new Error(
        `SSRF Blocked: Attempted to access private IP (${hostname})`
      );
    }
    return hostname;
  }

  try {
    const { address } = await lookup(hostname, { family: 0 });
    if (!isSafeIp(address)) {
      throw new Error(
        `SSRF Blocked: Hostname ${hostname} resolved to private IP (${address})`
      );
    }
    return address;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SSRF')) throw error;
    throw new Error(`DNS Lookup failed for hostname: ${hostname}`, {
      cause: error,
    });
  }
}

export function ssrfLookup(
  hostname: string,
  options: LookupOptions | number,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number
  ) => void
): void {
  return dnsLookup(hostname, options as LookupOptions, (error, address, family) => {
    if (error) {
      callback(error, address as unknown as string, family);
      return;
    }

    const isArray = Array.isArray(address);
    const addrsToCheck = isArray
      ? (address as LookupAddress[])
      : [{ address: address as unknown as string }];

    for (const addr of addrsToCheck) {
      if (!isSafeIp(addr.address)) {
        callback(
          new Error(
            `[SSRF BLOCK] Resolution to internal IP blocked: ${addr.address}`
          ),
          address as unknown as string,
          family
        );
        return;
      }
    }

    callback(null, address as unknown as string, family);
  });
}

const ssrfSafeAgent = new Agent({
  connect: {
    lookup: (hostname, options, callback) =>
      ssrfLookup(hostname, options, callback),
  },
});

export function assertPublicTarget(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`[secureFetch] blocked scheme: ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') {
    throw new Error(`[secureFetch] blocked host: ${host}`);
  }
  if (isIP(host) && !isSafeIp(host)) {
    throw new Error(`[secureFetch] blocked ip: ${host}`);
  }
}

export async function secureFetch(
  targetUrl: string | URL,
  options: RequestInit = {}
): Promise<globalThis.Response> {
  const parsedUrl =
    typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
  assertPublicTarget(parsedUrl);
  const normalizedHeaders = new Headers(options.headers as HeadersInit);

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    const response = await fetch(parsedUrl.toString(), {
      ...options,
      headers: normalizedHeaders,
      redirect: 'follow',
    });
    return response as globalThis.Response;
  }

  const response = await undiciFetch(parsedUrl.toString(), {
    ...(options as unknown as Record<string, unknown>),
    headers: normalizedHeaders,
    dispatcher: ssrfSafeAgent,
    redirect: 'follow',
  });

  return response as unknown as globalThis.Response;
}

export async function acquireLock(ip: string, limit = 2): Promise<boolean> {
  const key = `lock:concurrency:${ip}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, 1800);
  }

  if (current > limit) {
    await redis.decr(key);
    return false;
  }
  return true;
}

export async function releaseLock(ip: string): Promise<void> {
  const key = `lock:concurrency:${ip}`;
  await redis.decr(key);
  const val = await redis.get(key);
  if (val && parseInt(val, 10) <= 0) {
    await redis.del(key);
  }
}

import { Request, Response, NextFunction } from 'express';
import { sendEvent } from './sse.util.js';

const MEDIA_ACTIVE_KEY = 'media:active';
// stale slots self-heal after this
const MEDIA_SLOT_TTL_MS = Number(process.env.MEDIA_SLOT_TTL_MS) || 1800000;

interface MediaGuardOptions {
  limit?: number;
  key?: string;
}

// cap heavy media jobs across instances
export const globalMediaGuard = (options: number | MediaGuardOptions = {}) => {
  const opts = typeof options === 'number' ? { limit: options } : options;
  // fallback to 4 if cpus undefined
  const limit =
    opts.limit ??
    (Number(process.env.MAX_CONCURRENT_MEDIA) || os.cpus().length || 4);
  const key = opts.key ?? MEDIA_ACTIVE_KEY;
  return async (_req: Request, res: Response, next: NextFunction) => {
    const jobId = randomUUID();
    const now = Date.now();
    try {
      await redis.zremrangebyscore(key, 0, now - MEDIA_SLOT_TTL_MS);
      await redis.zadd(key, now, jobId);
      const active = await redis.zcard(key);
      if (active > limit) {
        await redis.zrem(key, jobId);
        res.status(503).json({ error: 'Server busy, please retry shortly.' });
        return;
      }
    } catch (error: unknown) {
      // redis down; fail open
      logger.warn('[MediaGuard] redis unavailable:', (error as Error).message);
      next();
      return;
    }

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      redis.zrem(key, jobId).catch(() => {});
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
};

export const concurrencyGuard = (limit = 2) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || 'unknown';
    const clientId = (req.query?.id || req.body?.id) as string | undefined;

    const hasLock = await acquireLock(clientIp, limit);
    if (!hasLock) {
      if (clientId) {
        sendEvent(clientId, {
          status: 'error',
          message: 'Too many active operations. Please wait for one to finish.',
        });
      }
      res.status(429).json({ error: 'Concurrency limit reached.' });
      return;
    }

    let released = false;
    const cleanup = () => {
      if (!released) {
        released = true;
        releaseLock(clientIp).catch((error) =>
          logger.error(
            '[Security] Lock release error:',
            (error as Error).message
          )
        );
      }
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
  };
};

// reject path traversal outside base
export function resolveWithin(
  base: string,
  ...segments: string[]
): string | null {
  const root = path.resolve(base);
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}
