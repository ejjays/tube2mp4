/**
 * phone-side media routing.
 *
 * relays googlevideo through the residential ip
 * to save bandwidth and dodge proxy bans.
 * falls back to backend if phone is offline.
 */
import { createHmac } from 'node:crypto';
import { logger } from '../../utils/infra/logger.util.js';
import { secureFetch } from '../../utils/network/security.util.js';
import { resolvePhoneTunnelUrl } from './remote-ytdlp.js';

const SECRET = process.env.YTDLP_REMOTE_SECRET?.trim() || '';
const ENABLED = process.env.PHONE_MEDIA_ENABLED === '1';
const MEDIA_TTL_MS =
  (Number(process.env.PROXY_URL_TTL_SECONDS) || 21600) * 1000;
const HEALTH_INTERVAL_MS = 25_000;

let healthy = false;
let tunnelUrl = '';
let pingerStarted = false;

async function pingHealth(): Promise<void> {
  const was = healthy;
  const url = await resolvePhoneTunnelUrl();
  if (!url) {
    healthy = false;
  } else {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      let stripped = url;
      while (stripped.endsWith('/')) stripped = stripped.slice(0, -1);
      const res = await secureFetch(`${stripped}/health`, {
        signal: controller.signal,
      });
      healthy = res.ok;
      if (res.ok) tunnelUrl = url;
      await res.text().catch(() => {});
    } catch {
      healthy = false;
    } finally {
      clearTimeout(timeout);
    }
  }
  if (was !== healthy) {
    logger.info(
      healthy
        ? `[PhoneMedia] relay ONLINE (${tunnelUrl})`
        : '[PhoneMedia] relay OFFLINE; downloads use server proxy'
    );
  }
}

function startPinger(): void {
  if (pingerStarted || !ENABLED || !SECRET) return;
  pingerStarted = true;
  void pingHealth();
  const timer = setInterval(() => void pingHealth(), HEALTH_INTERVAL_MS);
  timer.unref?.();
}

function isGooglevideo(rawUrl: string): boolean {
  try {
    return /(^|\.)googlevideo\.com$/iu.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

export function phoneMediaReady(): boolean {
  return ENABLED && SECRET.length > 0 && healthy && tunnelUrl.length > 0;
}

function dubLangFromUrl(rawUrl: string): string | null {
  try {
    const xtags = new URL(rawUrl).searchParams.get('xtags') || '';
    if (!/acont=dubbed/iu.test(xtags)) return null;
    return /lang=([\w-]+)/iu.exec(xtags)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function buildPhoneMediaUrl(
  rawUrl: string | undefined,
  ytUrl?: string
): string | null {
  if (!rawUrl || !isGooglevideo(rawUrl) || !phoneMediaReady()) return null;
  const exp = Date.now() + MEDIA_TTL_MS;
  // dubbed audio needs the watch url
  const isDub = Boolean(ytUrl) && dubLangFromUrl(rawUrl) !== null;
  const payload = isDub ? `${rawUrl}\n${exp}\n${ytUrl}` : `${rawUrl}\n${exp}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  let base = tunnelUrl;
  while (base.endsWith('/')) base = base.slice(0, -1);
  const url = `${base}/media?u=${encodeURIComponent(rawUrl)}&e=${exp}&s=${sig}`;
  return isDub ? `${url}&yt=${encodeURIComponent(ytUrl as string)}` : url;
}

startPinger();
