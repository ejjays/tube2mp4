import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  YT_PROXY,
  isYouTubeUrl,
  ytProxyArgs,
  ytProxyDispatcher,
} from '../../src/services/ytdlp/yt-proxy.js';

describe('yt-proxy — no-op when YT_PROXY unset', () => {
  it('exposes empty YT_PROXY in the test env', () => {
    expect(YT_PROXY).toBe('');
  });

  it('returns no --proxy args and no dispatcher', () => {
    expect(ytProxyArgs('https://www.youtube.com/watch?v=x')).toEqual([]);
    expect(ytProxyArgs()).toEqual([]);
    expect(ytProxyDispatcher()).toBeUndefined();
  });

  it('detects youtube urls', () => {
    expect(isYouTubeUrl('https://youtu.be/abc')).toBe(true);
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=x')).toBe(true);
    expect(isYouTubeUrl('https://www.facebook.com/share/v/x')).toBe(false);
    expect(isYouTubeUrl()).toBe(false);
  });
});

describe('yt-proxy — gated when YT_PROXY set', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('adds --proxy for youtube only, and an http dispatcher', async () => {
    vi.resetModules();
    vi.stubEnv('YT_PROXY', 'http://127.0.0.1:8081');
    const fresh = await import('../../src/services/ytdlp/yt-proxy.js');

    expect(fresh.ytProxyArgs('https://www.youtube.com/watch?v=x')).toEqual([
      '--proxy',
      'http://127.0.0.1:8081',
    ]);
    expect(fresh.ytProxyArgs('https://www.facebook.com/x')).toEqual([]);
    // no-url context (turbo-mux/buildYtdlpArgs) is youtube-only
    expect(fresh.ytProxyArgs()).toEqual(['--proxy', 'http://127.0.0.1:8081']);
    expect(fresh.ytProxyDispatcher()).toBeDefined();
  });
});
