import { describe, it, expect, vi } from 'vitest';
import { getExtractor } from '../src/shared/resolve.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const env: ExtractorEnv = {
  fetch: vi.fn() as unknown as typeof fetch,
  streamUrl: vi.fn(async () => new ReadableStream()) as unknown as ExtractorEnv['streamUrl'],
};

describe('getExtractor routing', () => {
  it.each([
    'https://x.com/user/status/1',
    'https://twitter.com/user/status/1',
    'https://bsky.app/profile/u/post/1',
    'https://vimeo.com/123',
    'https://www.dailymotion.com/video/x1',
    'https://www.pinterest.com/pin/1',
    'https://www.reddit.com/r/x/comments/abc/t/',
    'https://www.snapchat.com/spotlight/1',
    'https://www.twitch.tv/videos/1',
    'https://soundcloud.com/a/t',
    'https://www.bilibili.tv/en/video/1',
    'https://www.facebook.com/reel/1',
    'https://m.facebook.com/watch/?v=1',
    'https://fb.watch/abc',
    'https://www.threads.com/@u/post/1',
    'https://www.tiktok.com/@u/video/1',
  ])('routes %s to an extractor', (url) => {
    expect(getExtractor(url, env)).not.toBeNull();
  });

  it('returns null for unknown hosts', () => {
    expect(getExtractor('https://example.com/video/1', env)).toBeNull();
    expect(getExtractor('not a url', env)).toBeNull();
  });

  it('matches subdomains', () => {
    expect(getExtractor('https://m.tiktok.com/@u/video/1', env)).not.toBeNull();
    expect(getExtractor('https://old.reddit.com/comments/abc/', env)).not.toBeNull();
  });

  // routing must accept every host the pinterest extractor itself accepts,
  // otherwise ccTLD links silently fall through to the webview sniffer
  it('routes all pinterest ccTLDs, not just .com', () => {
    for (const url of [
      'https://www.pinterest.de/pin/1',
      'https://pinterest.com.au/pin/1',
      'https://www.pinterest.co.uk/pin/1',
      'https://pin.it/abc',
    ]) {
      expect(getExtractor(url, env), url).not.toBeNull();
    }
  });

  it('returns a fresh extractor per platform', () => {
    const fb = getExtractor('https://www.facebook.com/reel/1', env);
    const th = getExtractor('https://www.threads.com/@u/post/1', env);
    expect(fb).not.toBeNull();
    expect(th).not.toBeNull();
    expect(fb).not.toBe(th);
  });
});
