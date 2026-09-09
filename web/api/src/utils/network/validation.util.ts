import { URL } from 'node:url';
import { getRouteName } from '@phantom/extractors';
import { logger } from '../infra/logger.util.js';

// platforms resolved locally in web/api rather than by the shared package.
// youtube needs youtubei.js + PO-token, spotify needs the brain registry —
// neither can live in the dependency-free package.
const LOCAL_PLATFORMS: Record<string, string[]> = {
  youtube: ['youtube.com', 'youtu.be'],
  spotify: ['spotify.com', 'open.spotify.com'],
};

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalPlatform(hostname: string): boolean {
  return Object.values(LOCAL_PLATFORMS).some((domains) =>
    domains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    )
  );
}

/**
 * Gate for /info and the download routes. Sources the platform list from the
 * shared package registry so it can't drift: adding a platform to
 * packages/extractors ROUTES makes it reachable over HTTP with no change
 * here. A hand-maintained domain list previously omitted dailymotion,
 * pinterest, snapchat and twitch — the extractors worked, but the API
 * rejected them with "No valid URL provided".
 */
export function isSupportedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const hostname = hostnameOf(url);
  // malformed url — getRouteName() would also fail, but bail before parsing twice
  if (hostname === null) return false;
  return getRouteName(url) !== null || isLocalPlatform(hostname);
}

export function isValidSpotifyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'open.spotify.com' ||
      parsed.hostname === 'spotify.com'
    );
  } catch {
    return false;
  }
}

export function extractTrackId(url: string | null | undefined): string | null {
  if (!url || !isValidSpotifyUrl(url)) return null;
  const match = url.match(/\/track\/([a-zA-Z0-9]{22})/);
  return match ? match[1] : null;
}

const PROXY_ALLOWED_DOMAINS: string[] = [
  'googlevideo.com',
  'youtube.com',
  'youtu.be',
  'spotifycdn.com',
  'soundcharts.com',
  'i.scdn.co',
  'fbcdn.net',
  'cdninstagram.com',
  'facebook.com',
  'fb.watch',
  'instagram.com',
  'akamaihd.net',
  'bilibili.tv',
  'biliintl.com',
  'bili.im',
  'bilivideo.com',
  'bstarstatic.com',
];

export function isValidProxyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return PROXY_ALLOWED_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export function decodeUrlIfNeeded(url: string): string {
  if (typeof url !== 'string' || !url.includes('%')) return url;
  try {
    const decoded = decodeURIComponent(url);
    if (decoded.startsWith('http')) return decoded;
  } catch (error: unknown) {
    logger.debug(
      '[VideoController] URL decode error:',
      (error as Error).message
    );
  }
  return url;
}
