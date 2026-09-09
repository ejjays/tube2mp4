import { Format, VideoInfo, ExtractorOptions } from '../shared/types.js';
import { ExtractorEnv, defaultEnv } from '../shared/env.js';
import { DESKTOP_UA } from '../shared/util.js';
import {
  noVideo,
  fromStatus,
  rateLimited,
  classifyThrown,
} from '../shared/errors.js';
import { envFetch, selectFormat } from '../shared/fetch.js';
import {
  IG_APP_ID,
  LOGGED_OUT_DOC_ID,
  LOGGED_OUT_FRIENDLY,
  POST_DOC_ID,
  MOBILE_HEADERS,
  PAGE_HEADERS,
  REFERER,
} from './constants.js';
import {
  extractShortcode,
  shortcodeToMediaId,
  objFrom,
  parseDashManifest,
  expandDashVariants,
  parseGraphqlMedia,
  parseLoggedOutProduct,
  parseMobileItem,
  parseEmbed,
} from './parser.js';
import { normalizeVideoInfo } from './normalizer.js';
import type { IgParsed } from './types.js';

export {
  extractShortcode,
  shortcodeToMediaId,
  parseDashManifest,
  expandDashVariants,
  parseGraphqlMedia,
  parseLoggedOutProduct,
  parseMobileItem,
  parseEmbed,
};
export { normalizeVideoInfo };
export type { IgParsed };

function withTimeout(): { signal: AbortSignal } | Record<string, never> {
  try {
    return { signal: AbortSignal.timeout(10000) };
  } catch {
    return {};
  }
}

function cookieOf(
  options: ExtractorOptions,
  env: ExtractorEnv
): string | undefined {
  const fromOptions =
    typeof options.cookie === 'string' && options.cookie.length > 0
      ? options.cookie
      : undefined;
  if (fromOptions) return fromOptions;
  const fromEnv =
    typeof env.cookie === 'string' && env.cookie.trim().length > 0
      ? env.cookie.trim()
      : undefined;
  return fromEnv;
}

function setCookiesOf(res: Response): string[] {
  const getter = (res.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie;
  if (typeof getter === 'function') {
    try {
      return getter.call(res.headers) ?? [];
    } catch {
      return [];
    }
  }
  const single = res.headers.get('set-cookie');
  if (!single) return [];
  return single.split(/,(?=[^;]+=)/u);
}

interface IgSession {
  lsd: string;
  csrf?: string;
  cookie: string;
  expiry: number;
}

export function createInstagramExtractor(env: ExtractorEnv = defaultEnv) {
  let sessionCache: IgSession | null = null;
  const SESSION_TTL_MS = 10 * 60 * 1000;

  function randomToken(): string {
    try {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(36)).join('');
    } catch {
      return (
        Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2)
      );
    }
  }

  async function fetchMediaIdViaOembed(
    shortcode: string,
    cookie?: string
  ): Promise<string | null> {
    try {
      const res = await envFetch(
        env,
        `https://i.instagram.com/api/v1/oembed/?url=https://www.instagram.com/p/${shortcode}/`,
        {
          headers: {
            ...MOBILE_HEADERS,
            ...(cookie ? { Cookie: cookie } : {}),
          },
          ...withTimeout(),
        } as RequestInit
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { media_id?: string };
      return data?.media_id ?? null;
    } catch {
      return null;
    }
  }

  async function fetchMobileItem(
    shortcode: string,
    cookie?: string
  ): Promise<unknown> {
    const mediaId =
      (await fetchMediaIdViaOembed(shortcode, cookie)) ||
      shortcodeToMediaId(shortcode);
    if (!mediaId) return null;
    const headers: Record<string, string> = {
      ...MOBILE_HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
    };
    const res =
      cookie && env.authedFetch
        ? await env.authedFetch(
            `https://i.instagram.com/api/v1/media/${mediaId}/info/`,
            headers
          )
        : await envFetch(
            env,
            `https://i.instagram.com/api/v1/media/${mediaId}/info/`,
            { headers, ...withTimeout() } as RequestInit
          );
    if (res.status === 429 || res.status === 503)
      throw rateLimited('Instagram');
    if (!res.ok) throw fromStatus(res.status, 'Instagram');
    const data = (await res.json()) as { items?: unknown[] };
    return data?.items?.[0] ?? null;
  }

  async function getSession(
    shortcode: string,
    cookie?: string
  ): Promise<IgSession> {
    if (!cookie && sessionCache && sessionCache.expiry > Date.now()) {
      return sessionCache;
    }
    const pageRes = await envFetch(
      env,
      `https://www.instagram.com/p/${shortcode}/`,
      {
        headers: {
          ...PAGE_HEADERS,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...withTimeout(),
      } as RequestInit
    );
    if (pageRes.status === 429 || pageRes.status === 503) {
      throw rateLimited('Instagram');
    }
    if (!pageRes.ok) throw fromStatus(pageRes.status, 'Instagram');
    const html = await pageRes.text();
    const jar: Record<string, string> = {};
    for (const entry of setCookiesOf(pageRes)) {
      const [pair] = entry.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
    const lsd =
      (objFrom('LSD', html)?.token as string | undefined) || randomToken();
    const csrf =
      jar.csrftoken ??
      (objFrom('InstagramSecurityConfig', html)?.csrf_token as
        string | undefined);
    const anon = Object.entries(jar)
      .map(([key, val]) => `${key}=${val}`)
      .join('; ');
    const merged = [cookie, anon].filter(Boolean).join('; ');
    const session: IgSession = {
      lsd,
      csrf,
      cookie: merged,
      expiry: Date.now() + SESSION_TTL_MS,
    };
    if (!cookie) sessionCache = session;
    return session;
  }

  async function fetchLoggedOutMedia(
    shortcode: string,
    cookie?: string
  ): Promise<unknown> {
    const mediaId = shortcodeToMediaId(shortcode);
    if (!mediaId) return null;
    const {
      lsd,
      csrf,
      cookie: sessionCookie,
    } = await getSession(shortcode, cookie);
    const body = new URLSearchParams({
      av: '0',
      __d: 'www',
      __user: '0',
      dpr: '1',
      lsd,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: LOGGED_OUT_FRIENDLY,
      server_timestamps: 'true',
      variables: JSON.stringify({ media_id: mediaId }),
      doc_id: LOGGED_OUT_DOC_ID,
    });
    const headers: Record<string, string> = {
      'User-Agent': DESKTOP_UA,
      'X-IG-App-ID': IG_APP_ID,
      'X-ASBD-ID': '359341',
      'X-IG-WWW-Claim': '0',
      'X-FB-Friendly-Name': LOGGED_OUT_FRIENDLY,
      'X-FB-LSD': lsd,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://www.instagram.com',
      Referer: `https://www.instagram.com/p/${shortcode}/`,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
    };
    if (csrf) headers['X-CSRFToken'] = csrf;
    if (sessionCookie) headers.Cookie = sessionCookie;
    const res = await envFetch(env, 'https://www.instagram.com/api/graphql', {
      method: 'POST',
      headers,
      body: body.toString(),
      ...withTimeout(),
    } as RequestInit);
    if (res.status === 429 || res.status === 503) {
      throw rateLimited('Instagram');
    }
    if (!res.ok) return null;
    const text = (await res.text()).replace(/^for\s*\(;;\);/u, '');
    if (text.startsWith('<')) {
      sessionCache = null;
      return null;
    }
    try {
      const json = JSON.parse(text) as {
        data?: { xig_polaris_media?: { if_not_gated_logged_out?: unknown } };
      };
      return json?.data?.xig_polaris_media?.if_not_gated_logged_out ?? null;
    } catch {
      return null;
    }
  }

  async function fetchGraphqlMedia(
    shortcode: string,
    cookie?: string
  ): Promise<unknown> {
    const pageRes = await envFetch(
      env,
      `https://www.instagram.com/p/${shortcode}/`,
      {
        headers: {
          ...PAGE_HEADERS,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...withTimeout(),
      } as RequestInit
    );
    if (pageRes.status === 429 || pageRes.status === 503) {
      throw rateLimited('Instagram');
    }
    if (!pageRes.ok) throw fromStatus(pageRes.status, 'Instagram');
    const html = await pageRes.text();
    const lsd =
      (objFrom('LSD', html)?.token as string | undefined) || randomToken();
    const csrf = objFrom('InstagramSecurityConfig', html)?.csrf_token as
      string | undefined;
    const webConfig = objFrom('DGWWebConfig', html) ?? {};
    const siteData = objFrom('SiteData', html) ?? {};
    const numQ = (name: string): string | null => {
      const match = html.match(new RegExp(`${name}=(\\d+)`, 'u'));
      return match ? match[1] : null;
    };
    const body = new URLSearchParams({
      __d: 'www',
      __a: '1',
      __req: 'b',
      __hs:
        (siteData.haste_session as string) ||
        '20126.HYP:instagram_web_pkg.2.1...0',
      __ccg: 'EXCELLENT',
      __rev: '1019933358',
      dpr: '2',
      __comet_req: numQ('__comet_req') || '7',
      lsd,
      jazoest: numQ('jazoest') || '2',
      __spin_r: '1019933358',
      __spin_b: 'trunk',
      __spin_t: '1',
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'PolarisPostActionLoadPostQueryQuery',
      variables: JSON.stringify({
        shortcode,
        fetch_tagged_user_count: null,
        hoisted_comment_id: null,
        hoisted_reply_id: null,
      }),
      server_timestamps: 'true',
      doc_id: POST_DOC_ID,
    });
    const headers: Record<string, string> = {
      'User-Agent': DESKTOP_UA,
      'x-ig-app-id': (webConfig.appId as string) || IG_APP_ID,
      'X-FB-LSD': lsd,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
    };
    if (csrf) headers['X-CSRFToken'] = csrf;
    if (cookie) headers.Cookie = cookie;
    const res = await envFetch(env, 'https://www.instagram.com/graphql/query', {
      method: 'POST',
      headers,
      body: body.toString(),
      ...withTimeout(),
    } as RequestInit);
    if (res.status === 429 || res.status === 503) {
      throw rateLimited('Instagram');
    }
    if (!res.ok) throw fromStatus(res.status, 'Instagram');
    const json = (await res.json()) as {
      data?: { xdt_shortcode_media?: unknown; shortcode_media?: unknown };
    };
    return (
      json?.data?.xdt_shortcode_media ?? json?.data?.shortcode_media ?? null
    );
  }

  async function fetchEmbedHtml(
    url: string,
    cookie?: string
  ): Promise<string | null> {
    try {
      const base = url.split('?')[0].replace(/\/?$/u, '/');
      const res = await envFetch(env, `${base}embed/captioned/`, {
        headers: {
          ...PAGE_HEADERS,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...withTimeout(),
      } as RequestInit);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  // 1-byte range GET: CDNs that refuse HEAD still report total size here
  async function fetchSize(url: string): Promise<number | undefined> {
    try {
      const res = await envFetch(env, url, {
        headers: {
          'User-Agent': DESKTOP_UA,
          Referer: REFERER,
          Range: 'bytes=0-0',
        },
        ...withTimeout(),
      } as RequestInit);
      const range = res.headers.get('content-range');
      const match = range ? /\/(\d+)\s*$/u.exec(range) : null;
      if (match) return parseInt(match[1], 10);
      const len = res.headers.get('content-length');
      return len ? parseInt(len, 10) : undefined;
    } catch {
      return undefined;
    }
  }

  async function resolveParsed(
    url: string,
    cookie?: string
  ): Promise<IgParsed | null> {
    const shortcode = extractShortcode(url);
    const resolvers: Array<() => Promise<IgParsed | null>> = [];
    if (shortcode) {
      resolvers.push(async () =>
        parseMobileItem(
          (await fetchMobileItem(shortcode, cookie)) as Parameters<
            typeof parseMobileItem
          >[0]
        )
      );
      resolvers.push(async () =>
        parseLoggedOutProduct(
          (await fetchLoggedOutMedia(shortcode, cookie)) as Parameters<
            typeof parseLoggedOutProduct
          >[0]
        )
      );
      resolvers.push(async () =>
        parseGraphqlMedia(
          (await fetchGraphqlMedia(shortcode, cookie)) as Parameters<
            typeof parseGraphqlMedia
          >[0]
        )
      );
    }
    resolvers.push(async () => {
      const html = await fetchEmbedHtml(url, cookie);
      return html ? parseEmbed(html) : null;
    });
    let lastError: unknown = null;
    for (const resolve of resolvers) {
      try {
        const parsed = await resolve();
        if (parsed && parsed.media.length > 0) return parsed;
      } catch (error: unknown) {
        lastError = error;
        if (
          error instanceof Error &&
          (error as { retryable?: boolean }).retryable
        ) {
          throw error;
        }
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  async function getInfo(
    url: string,
    options: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    try {
      const cookie = cookieOf(options, env);
      const parsed = await resolveParsed(url, cookie);
      if (!parsed) throw noVideo('Instagram');
      const videoInfo = normalizeVideoInfo(url, parsed);
      if (!videoInfo) throw noVideo('Instagram');
      for (let index = 0; index < videoInfo.formats.length; index += 3) {
        const batch = videoInfo.formats.slice(index, index + 3);
        await Promise.all(
          batch.map(async (format: Format) => {
            if (!format.url || format.filesize) return;
            const size = await fetchSize(format.url);
            if (size) format.filesize = size;
          })
        );
      }
      return videoInfo;
    } catch (error: unknown) {
      throw classifyThrown(error, 'Instagram');
    }
  }

  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const target = selectFormat(videoInfo, options);
    if (!target?.url) throw noVideo('Instagram');
    return env.streamUrl(target.url, {
      'User-Agent': DESKTOP_UA,
      Referer: REFERER,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Range: 'bytes=0-',
    });
  }

  function __resetSessionForTests(): void {
    sessionCache = null;
  }

  return { getInfo, getStream, __resetSessionForTests };
}
