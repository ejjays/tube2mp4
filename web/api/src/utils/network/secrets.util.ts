import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { logger } from '../infra/logger.util.js';

// per-boot secret unless pinned for restarts
const ENV_SECRET = process.env.PROXY_SIGNING_SECRET;
if (!ENV_SECRET && process.env.NODE_ENV !== 'test') {
  // random secret invalidates signed urls on restart
  logger.warn(
    '[Secrets] PROXY_SIGNING_SECRET unset; signed URLs will break on restart.'
  );
}
const SECRET = ENV_SECRET || randomBytes(32).toString('hex');

// cdn links die ~6h; match that
const TTL_MS = (Number(process.env.PROXY_URL_TTL_SECONDS) || 21600) * 1000;

interface ProxyParams {
  targetUrl?: string;
  rawUrl?: string;
  formatId?: string;
}

function canonical(params: ProxyParams, exp: number): string {
  return [
    params.targetUrl || '',
    params.rawUrl || '',
    params.formatId || '',
    exp,
  ].join('\n');
}

export function signProxyParams(params: ProxyParams): {
  exp: number;
  sig: string;
} {
  const exp = Date.now() + TTL_MS;
  const sig = createHmac('sha256', SECRET)
    .update(canonical(params, exp))
    .digest('base64url');
  return { exp, sig };
}

export function verifyProxyParams(
  params: ProxyParams & { exp: number; sig: string | undefined }
): boolean {
  if (!params.sig || !Number.isFinite(params.exp)) return false;
  // reject stale links
  if (Date.now() > params.exp) return false;

  const expected = createHmac('sha256', SECRET)
    .update(canonical(params, params.exp))
    .digest('base64url');
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(params.sig);
  // length guard before timing-safe compare
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
