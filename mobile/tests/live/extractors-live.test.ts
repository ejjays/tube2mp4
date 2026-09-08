import { describe, it, expect, vi } from 'vitest';
import cases from './live-cases.json';

// authFetch's cookieGet is native (rn fetch drops manual Cookie headers); shim
// to node fetch here since node keeps them — instagram + reddit use authFetch.
vi.mock('../../src/lib/authFetch', () => ({
  cookieGet: async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers });
    return {
      ok: res.ok,
      status: res.status,
      headers: { 'set-cookie': res.headers.getSetCookie().join(', ') },
      text: () => res.text(),
      json: () => res.json(),
    };
  },
}));

import {
  createFacebookExtractor,
  createThreadsExtractor,
  createXExtractor,
  createTikTokExtractor,
  createVimeoExtractor,
  createDailymotionExtractor,
  createBlueskyExtractor,
  createPinterestExtractor,
  createTwitchExtractor,
  createBilibiliExtractor,
  createSnapchatExtractor,
  createRedditExtractor,
} from '@phantom/extractors';
import {
  mobileSharedEnv,
  mobileSharedEnvWithThumbs,
} from '../../src/extractors/shared/env';
import { getBilibiliCookie } from '../../src/lib/settings';
import { getInfo as soundcloudGetInfo } from '../../src/extractors/soundcloud';
import { getInfo as instagramGetInfo } from '../../src/extractors/instagram';

const withSharedEnv =
  (
    create: (
      env: typeof mobileSharedEnv
    ) => { getInfo: (url: string) => Promise<VideoInfo | null> }
  ) =>
  (url: string) =>
    create(mobileSharedEnv).getInfo(url);

const facebookGetInfo = withSharedEnv(createFacebookExtractor);
const threadsGetInfo = withSharedEnv(createThreadsExtractor);
const tiktokGetInfo = withSharedEnv(createTikTokExtractor);
const dailymotionGetInfo = withSharedEnv(createDailymotionExtractor);
const blueskyGetInfo = withSharedEnv(createBlueskyExtractor);
const pinterestGetInfo = withSharedEnv(createPinterestExtractor);
const twitchGetInfo = withSharedEnv(createTwitchExtractor);
const snapchatGetInfo = withSharedEnv(createSnapchatExtractor);
const redditGetInfo = withSharedEnv(createRedditExtractor);
const xGetInfo = (url: string) =>
  createXExtractor(mobileSharedEnv).getInfo(url, { isAudioMuxed: true });
const vimeoGetInfo = (url: string) =>
  createVimeoExtractor(mobileSharedEnvWithThumbs).getInfo(url);
const bilibiliGetInfo = async (url: string) => {
  const cookie = await getBilibiliCookie();
  const env = cookie ? { ...mobileSharedEnv, cookie } : mobileSharedEnv;
  return createBilibiliExtractor(env).getInfo(url);
};
import {
  ExtractorError,
  type VideoInfo,
} from '@phantom/extractors';
import {
  noVideo,
  notFound,
  loginRequired,
  restricted,
  rateLimited,
  serverError,
  networkError,
} from '@phantom/extractors';
import {
  MEDIA_JUNK_RE,
  hlsVideosOf,
  isMediaUrl,
} from '../../src/lib/webviewExtraction/sniffer';

const RESOLVERS = {
  facebook: facebookGetInfo,
  threads: threadsGetInfo,
  x: xGetInfo,
  tiktok: tiktokGetInfo,
  vimeo: vimeoGetInfo,
  dailymotion: dailymotionGetInfo,
  soundcloud: soundcloudGetInfo,
  reddit: redditGetInfo,
  bluesky: blueskyGetInfo,
  instagram: instagramGetInfo,
  pinterest: pinterestGetInfo,
  twitch: twitchGetInfo,
  bilibili: bilibiliGetInfo,
  snapchat: snapchatGetInfo,
} satisfies Record<string, (url: string) => Promise<VideoInfo | null>>;

type LiveCase = {
  name: string;
  extractor: keyof typeof RESOLVERS;
  url: string;
  expect: {
    minFormats: number;
    mediaKind?: 'video' | 'audio';
    rejectUploader?: string;
    wantThumb?: boolean;
    wantResolution?: boolean;
    wantFilesize?: boolean;
    soft?: boolean;
  };
};

const RUN_LIVE = process.env.VITEST_INCLUDE_LIVE === '1';
const RUN_PROBE = process.env.VITEST_INCLUDE_PROBE === '1';

// emptyParse = page loaded but the parser found no media = real regression →
// fail. everything else (transient/blocked/removed) skips.
function classifyLiveFailure(error: unknown): {
  action: 'skip' | 'fail';
  reason: string;
} {
  if (!(error instanceof ExtractorError)) {
    const msg = error instanceof Error ? error.message : String(error);
    return { action: 'fail', reason: `unexpected crash: ${msg}` };
  }
  if (error.emptyParse) {
    return { action: 'fail', reason: `parser found no media: ${error.message}` };
  }
  if (error.retryable) {
    return { action: 'skip', reason: `transient/blocked: ${error.message}` };
  }
  // access/content state, not parser bug. removed = fixture URL rotted →
  // refresh live-cases.json.
  return { action: 'skip', reason: `unavailable: ${error.message}` };
}

// instagram authFetch needs a logged-in cookie to see media URLs
const IG_COOKIE_GUARD = (testCase: LiveCase) =>
  testCase.extractor === 'instagram' && !process.env.EXPO_PUBLIC_IG_COOKIE;

describe.skipIf(!RUN_LIVE)('live extractor health', () => {
  for (const testCase of cases as LiveCase[]) {
    it(testCase.name, { timeout: 45000, retry: 2 }, async (ctx) => {
      if (IG_COOKIE_GUARD(testCase)) {
        ctx.skip('EXPO_PUBLIC_IG_COOKIE not set');
        return;
      }
      const resolve = RESOLVERS[testCase.extractor];
      let info: VideoInfo | null;
      try {
        info = await resolve(testCase.url);
      } catch (error) {
        if (testCase.expect.soft) {
          // region-locked platform on datacenter IPs (bilibili.tv): clean
          // ExtractorError is expected — an unexpected crash is the regression.
          if (error instanceof ExtractorError) {
            ctx.skip(`clean ExtractorError: ${error.message}`);
            return;
          }
          throw error;
        }
        const verdict = classifyLiveFailure(error);
        if (verdict.action === 'skip') {
          ctx.skip(verdict.reason);
          return;
        }
        throw new Error(
          `[${testCase.extractor}] ${testCase.url} — ${verdict.reason}`
        );
      }

      expect(
        info,
        'resolver returned null for a supported host'
      ).not.toBeNull();
      const video = info as VideoInfo;
      // reject logged-out fallback (e.g. fb's generic "Facebook User")
      if (testCase.expect.rejectUploader) {
        expect(video.uploader).not.toBe(testCase.expect.rejectUploader);
      }
      expect(video.title.trim().length).toBeGreaterThan(0);
      expect(
        video.uploader.trim().length,
        `${video.extractorKey}: empty uploader`
      ).toBeGreaterThan(0);
      if (testCase.expect.wantThumb ?? true) {
        expect(
          video.thumbnail,
          `${video.extractorKey}: missing thumbnail`
        ).toMatch(/^https?:\/\//u);
      }
      expect(video.formats.length).toBeGreaterThanOrEqual(
        testCase.expect.minFormats
      );
      // real media stream, not a thumbnail/photo fallback
      const wantAudio = testCase.expect.mediaKind === 'audio';
      expect(
        video.formats.some((format) =>
          wantAudio ? format.isAudio : format.isVideo
        )
      ).toBe(true);
      for (const format of video.formats) {
        expect(format.url).toMatch(/^https?:\/\//u);
        expect(
          format.extension.trim().length,
          `${video.extractorKey}: format ${format.formatId} missing extension`
        ).toBeGreaterThan(0);
      }
      // whatever the picker shows in the quality dropdown must be present
      if (testCase.expect.wantResolution) {
        for (const format of video.formats.filter((f) => f.isVideo)) {
          expect(
            format.resolution ||
              format.quality ||
              (format.width && format.height),
            `${video.extractorKey}: video format ${format.formatId} has no resolution label`
          ).toBeTruthy();
        }
      }
      if (testCase.expect.wantFilesize) {
        expect(
          video.formats.filter(
            (f) => typeof f.filesize === 'number' && f.filesize > 0
          ).length,
          `${video.extractorKey}: no format reports filesize`
        ).toBeGreaterThan(0);
      }
    });
  }
});

// the sniffer's DOM/resource-timing legs need a live WebView, but its
// embedded-url harvest + hls parse are pure: smoke them against real pages so
// generic-path regressions still bite headlessly. best-effort → soft skips.
describe.skipIf(!RUN_LIVE)('live generic sniffer (headless legs)', () => {
  // same regex the in-page collect() uses on outerHTML, capped at 250KB there
  const EMBEDDED_MEDIA_RE =
    /https?:\/\/[^"'<>\s]+?\.(?:mp4|webm|m3u8|mov)(?:[?#][^"'<>\s]*)?/gi;

  it(
    'harvests embedded media urls from a real page',
    { timeout: 30000, retry: 1 },
    async (ctx) => {
      const page =
        'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video';
      let html: string;
      try {
        const res = await fetch(page);
        html = await res.text();
      } catch (error) {
        ctx.skip(`fetch failed: ${(error as Error).message}`);
        return;
      }
      const embedded = html.match(EMBEDDED_MEDIA_RE) ?? [];
      const candidates = [...new Set(embedded)].filter(
        (url) => !MEDIA_JUNK_RE.test(url) && isMediaUrl(url)
      );
      if (candidates.length === 0) {
        ctx.skip('no embedded media urls on page (page changed?)');
        return;
      }
      expect(candidates[0]).toMatch(/^https:\/\//u);
    }
  );

  // ok.ru-class unlock — the XHR-fetched variant parse must survive real HLS
  it(
    'parses a live hls master playlist into variants',
    { timeout: 30000, retry: 1 },
    async (ctx) => {
      const manifest = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
      let text: string;
      try {
        const res = await fetch(manifest);
        text = await res.text();
      } catch (error) {
        ctx.skip(`fetch failed: ${(error as Error).message}`);
        return;
      }
      if (!/^#EXTM3U/iu.test(text)) {
        ctx.skip('manifest url returned non-m3u8 content');
        return;
      }
      const variants = hlsVideosOf(text, manifest);
      if (variants.length === 0) {
        ctx.skip('no variants parsed (manifest format changed?)');
        return;
      }
      expect(variants.some((v) => v.url.startsWith('https://'))).toBe(true);
      expect(variants.some((v) => v.width && v.height)).toBe(true);
    }
  );
});

// first-chunk probe: media URL must serve real bytes, not a 403 or an HTML
// error page. gated — CI runners hit datacenter IPs, so transient stuff skips.
describe.skipIf(!RUN_PROBE)('live media probe (range GET)', () => {
  for (const testCase of cases as LiveCase[]) {
    it(testCase.name, { timeout: 60000, retry: 1 }, async (ctx) => {
      if (IG_COOKIE_GUARD(testCase)) {
        ctx.skip('EXPO_PUBLIC_IG_COOKIE not set');
        return;
      }
      const resolve = RESOLVERS[testCase.extractor];
      let info: VideoInfo | null;
      try {
        info = await resolve(testCase.url);
      } catch (error) {
        if (testCase.expect.soft && error instanceof ExtractorError) {
          ctx.skip(`clean ExtractorError: ${error.message}`);
          return;
        }
        const verdict = classifyLiveFailure(error);
        if (verdict.action === 'skip') {
          ctx.skip(verdict.reason);
          return;
        }
        throw new Error(
          `[${testCase.extractor}] ${testCase.url} — ${verdict.reason}`
        );
      }
      if (!info) throw new Error('resolver returned null for a supported host');

      const wantAudio = testCase.expect.mediaKind === 'audio';
      const target =
        info.formats.find((f) => (wantAudio ? f.isAudio : f.isVideo)) ??
        info.formats[0];
      if (!target) {
        ctx.skip('no formats to probe');
        return;
      }

      // read first chunk only, then cancel — a server ignoring Range must not
      // make us download the whole file
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(target.url, {
          // extractor headers first: theirs may carry their own Range/Referer
          headers: { ...(info.downloadHeaders ?? {}), Range: 'bytes=0-4095' },
          signal: ctrl.signal,
        });
        const type = res.headers.get('content-type') ?? '';
        // 403 = ambiguous (IP-blocked CDNs 403 everyone from runner IPs);
        // 404/410 + html-pages + empty bodies are unambiguous → fail
        if (res.status === 403) {
          ctx.skip(`media URL blocked: HTTP 403 (${type})`);
          return;
        }
        if (res.status === 404 || res.status === 410) {
          throw new Error(`media URL dead: HTTP ${res.status} (${type})`);
        }
        if (res.status === 429 || res.status >= 500) {
          ctx.skip(`probe HTTP ${res.status}`);
          return;
        }
        if (/text\/html/iu.test(type)) {
          throw new Error(`media URL served HTML error page (${type})`);
        }
        const body = res.body?.getReader();
        if (!body) {
          ctx.skip('no response body');
          return;
        }
        const { value } = await body.read();
        await body.cancel();
        expect(
          value?.byteLength,
          `${info.extractorKey}: media URL returned no bytes (${type})`
        ).toBeGreaterThan(0);
      } catch (error: unknown) {
        if (
          error instanceof DOMException ||
          (error as Error)?.name === 'AbortError'
        ) {
          ctx.skip('probe timeout — CDN ignored Range');
          return;
        }
        if (error instanceof TypeError) {
          ctx.skip(`network error: ${(error as Error).message}`);
          return;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    });
  }
});

// youtube + spotify only resolve via on-device WebView (BotGuard+cipher) — never headless.
describe('live (webview-only extractors)', () => {
  it.todo('youtube — WebView-only, not headless-testable');
  it.todo('spotify — WebView-only (audio via youtube), not headless-testable');
});

// no network — runs in normal suite/CI, unlike gated live cases above.
describe('live failure classifier', () => {
  it.each([
    ['noVideo — parser found nothing', noVideo('Test'), 'fail'],
    ['raw non-ExtractorError crash', new Error('boom'), 'fail'],
    ['notFound — dead fixture URL', notFound('Test'), 'skip'],
    ['loginRequired — bot-wall', loginRequired('Test'), 'skip'],
    ['restricted', restricted('Test'), 'skip'],
    ['rateLimited — 429', rateLimited('Test'), 'skip'],
    ['serverError — 5xx', serverError('Test'), 'skip'],
    ['networkError — transient', networkError('Test'), 'skip'],
  ] as const)('%s -> %s', (_name, error, expected) => {
    expect(classifyLiveFailure(error).action).toBe(expected);
  });
});
