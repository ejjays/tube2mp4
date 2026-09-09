import {
  createInstagramExtractor,
  classifyThrown,
  type VideoInfo,
} from '@phantom/extractors';
import { mobileSharedEnv } from '../shared/env';
import { gatedFetch } from '../../lib/net';
import { getInstagramCookie } from '../../lib/settings';
import { cookieGet } from '../../lib/authFetch';
import { webviewFetch } from './bridge';
import { error as logError } from '../../lib/log';

export {
  extractShortcode,
  shortcodeToMediaId,
  parseDashManifest,
  expandDashVariants,
  parseGraphqlMedia,
  parseLoggedOutProduct,
  parseMobileItem,
  parseEmbed,
  normalizeVideoInfo,
} from '@phantom/extractors/instagram/index';
export type { IgParsed, IgMedia } from '@phantom/extractors';

function isInstagramHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'instagram.com' || hostname.endsWith('.instagram.com');
  } catch {
    return false;
  }
}

const igFetch = (url: string, init?: RequestInit) => {
  if (isInstagramHost(url) && !process.env.VITEST) {
    return webviewFetch(url, init);
  }
  return gatedFetch(url, init);
};

async function authedFetch(
  url: string,
  headers: Record<string, string>
): Promise<Response> {
  const res = await cookieGet(url, headers);
  const bag = res.headers ?? {};
  const get = (name: string): string | null => {
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(bag)) {
      if (key.toLowerCase() === lower) return value;
    }
    return null;
  };
  return {
    ok: res.ok,
    status: res.status,
    text: res.text,
    json: res.json as () => Promise<unknown>,
    headers: { get },
  } as unknown as Response;
}

const { getInfo: sharedGetInfo } = createInstagramExtractor({
  ...mobileSharedEnv,
  fetch: igFetch as unknown as typeof fetch,
  authedFetch,
});

export async function getInfo(url: string): Promise<VideoInfo | null> {
  try {
    const cookie = getInstagramCookie().trim() || undefined;
    return (await sharedGetInfo(
      url,
      cookie ? { cookie } : {}
    )) as VideoInfo | null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError('instagram', `[JS-IG] Error extracting ${url}: ${message}`);
    throw classifyThrown(error, 'Instagram');
  }
}
