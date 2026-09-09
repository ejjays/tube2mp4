import { Request, Response, NextFunction } from 'express';
import { logger } from '../infra/logger.util.js';
import { timingSafeEqual } from 'node:crypto';

function isLocalRequest(req: Request): boolean {
  // proxied/spoofed requests are not local
  if (req.headers['x-forwarded-for']) return false;
  const ip = req.socket.remoteAddress?.replace(/^::ffff:/u, '');
  return ip === '127.0.0.1' || ip === '::1';
}

export type AuthMode = 'open' | 'apikey' | 'deny';

export function resolveAuthMode(
  env: NodeJS.ProcessEnv = process.env
): AuthMode {
  const explicit = (env.AUTH_MODE ?? '').toLowerCase().trim();
  if (explicit === 'open') return 'open';
  if (explicit === 'apikey') return 'apikey';
  // a configured key implies apikey mode
  if (env.API_KEY) return 'apikey';
  // prod fails closed; dev stays open
  if (env.NODE_ENV === 'production') return 'deny';
  return 'open';
}

// fail fast on unsafe prod config
export function assertProdConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  if (!env.PROXY_SIGNING_SECRET) {
    throw new Error(
      'PROXY_SIGNING_SECRET is required when NODE_ENV=production'
    );
  }
  const mode = resolveAuthMode(env);
  if (mode === 'deny') {
    logger.warn(
      '[auth] DENY MODE — no API_KEY and no AUTH_MODE set. ' +
        'Non-localhost requests are blocked. ' +
        'Set API_KEY to require a key, or AUTH_MODE=open for an open public instance.'
    );
  } else if (mode === 'open') {
    logger.warn(
      '[auth] OPEN MODE — all requests allowed without authentication.'
    );
  }
}

function extractKey(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string') return headerKey;
  return undefined;
}

function keysMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const mode = resolveAuthMode();
  if (mode === 'open') {
    next();
    return;
  }
  // local self-host stays frictionless
  if (isLocalRequest(req)) {
    next();
    return;
  }
  if (mode === 'deny') {
    res.status(403).json({ error: 'Public access is not configured' });
    return;
  }
  const expected = process.env.API_KEY;
  const provided = extractKey(req);
  if (expected && provided && keysMatch(provided, expected)) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// metrics gate: localhost or valid key
export function requireLocalOrApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isLocalRequest(req)) {
    next();
    return;
  }
  const expected = process.env.API_KEY;
  const provided = extractKey(req);
  if (expected && provided && keysMatch(provided, expected)) {
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden' });
}
