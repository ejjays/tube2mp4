import { describe, it, expect } from 'vitest';
import {
  createXExtractor,
  createBlueskyExtractor,
  createVimeoExtractor,
  createDailymotionExtractor,
  createPinterestExtractor,
  createRedditExtractor,
  createSnapchatExtractor,
  createTwitchExtractor,
  createSoundCloudExtractor,
  createBilibiliExtractor,
  createFacebookExtractor,
  createThreadsExtractor,
  createTikTokExtractor,
  createInstagramExtractor,
  getExtractor,
} from '../src/index.js';
import { parsePinId, isPinterestHost } from '../src/pinterest.js';
import { hostOf, matchesDomain } from '../src/shared/host.js';
import { buildVideoInfo } from '../src/shared/fetch.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const PLATFORMS: Array<
  [string, (env: ExtractorEnv) => { getInfo: (u: string) => unknown }, string]
> = [
  ['x', createXExtractor, 'https://x.com/u/status/1'],
  ['bluesky', createBlueskyExtractor, 'https://bsky.app/profile/a/post/b'],
  ['vimeo', createVimeoExtractor, 'https://vimeo.com/123'],
  [
    'dailymotion',
    createDailymotionExtractor,
    'https://dailymotion.com/video/x1',
  ],
  [
    'pinterest',
    createPinterestExtractor,
    'https://www.pinterest.com/pin/123456789012/',
  ],
  ['reddit', createRedditExtractor, 'https://reddit.com/r/x/comments/abc/t/'],
  ['snapchat', createSnapchatExtractor, 'https://snapchat.com/spotlight/x'],
  ['twitch', createTwitchExtractor, 'https://twitch.tv/videos/1'],
  ['soundcloud', createSoundCloudExtractor, 'https://soundcloud.com/a/b'],
  ['bilibili', createBilibiliExtractor, 'https://bilibili.tv/en/video/1'],
  ['facebook', createFacebookExtractor, 'https://facebook.com/reel/1'],
  ['threads', createThreadsExtractor, 'https://threads.com/@u/post/1'],
  ['tiktok', createTikTokExtractor, 'https://tiktok.com/@u/video/1'],
  ['instagram', createInstagramExtractor, 'https://instagram.com/p/ABC/'],
];

// every fetch fails at the DNS/socket level
// node attaches .code; fetch wraps the socket error in .cause
const dnsFailure = (): never => {
  const err = new Error('fetch failed') as Error & {
    code?: string;
    cause?: unknown;
  };
  err.code = 'ENOTFOUND';
  err.cause = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND nope.test' };
  throw err;
};

const offline: ExtractorEnv = {
  fetch: async () => {
    dnsFailure();
  },
  streamUrl: async () => {
    throw new Error('offline');
  },
};

describe('error contract (all platforms)', () => {
  // null means "nothing here", and callers fall back on it — a network
  // failure must not be mistaken for that.
  it.each(PLATFORMS)(
    '%s throws a typed ExtractorError when the network dies',
    async (_name, create, url) => {
      await expect(create(offline).getInfo(url)).rejects.toMatchObject({
        name: 'ExtractorError',
        retryable: true,
        expected: true,
      });
    }
  );

  it.each(PLATFORMS)(
    '%s never resolves to null on a network failure',
    async (_name, create, url) => {
      const result = await create(offline)
        .getInfo(url)
        .catch(() => 'threw');
      expect(result).toBe('threw');
    }
  );
});

describe('router/extractor agreement', () => {
  // router yes + ID parser no = silent null
  it.each([
    'https://pinterest.com/pin/123456789/',
    'https://www.pinterest.com/pin/123456789/',
    'https://pinterest.de/pin/123456789/',
    'https://pinterest.com.au/pin/123456789/',
    'https://www.pinterest.co.uk/pin/123456789/',
    'https://www.pinterest.com/pin/some-slug--123456789/',
  ])('pinterest: %s routes AND parses', (url) => {
    expect(isPinterestHost(url), 'host matcher').toBe(true);
    expect(getExtractor(url, offline), 'router').not.toBeNull();
    expect(parsePinId(url), 'id parser').toBe('123456789');
  });

  it('every routed host is recognised by its own extractor', () => {
    for (const [name, , url] of PLATFORMS) {
      expect(getExtractor(url, offline), name).not.toBeNull();
    }
  });
});

describe('shared host helpers', () => {
  it('hostOf strips scheme, path, query, and case', () => {
    expect(hostOf('https://WWW.Example.COM/a/b?x=1#f')).toBe('www.example.com');
    expect(hostOf('not a url')).toBe('not a url');
  });

  it('matchesDomain is exact-or-subdomain, not substring', () => {
    expect(matchesDomain('x.com', 'x.com')).toBe(true);
    expect(matchesDomain('m.x.com', 'x.com')).toBe(true);
    expect(matchesDomain('notx.com', 'x.com')).toBe(false);
    expect(matchesDomain('evilx.com', 'x.com')).toBe(false);
  });
});

describe('buildVideoInfo invariants', () => {
  const base = {
    id: '1',
    title: 't',
    uploader: 'u',
    webpageUrl: 'https://x/1',
    extractorKey: 'test',
  };

  it('defaults the flag block', () => {
    const info = buildVideoInfo(base);
    expect(info).toMatchObject({
      type: 'video',
      formats: [],
      isJsInfo: true,
      fromBrain: false,
      isIsrcMatch: false,
      isPartial: false,
      isFullData: true,
    });
  });

  it('isPartial forces isFullData=false', () => {
    expect(
      buildVideoInfo({ ...base, isPartial: true, isFullData: true }).isFullData
    ).toBe(false);
  });

  it('leaves isFullData alone when not partial', () => {
    expect(buildVideoInfo({ ...base, isFullData: false }).isFullData).toBe(
      false
    );
  });
});
