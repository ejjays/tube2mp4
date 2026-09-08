import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTikTokExtractor, parseUniversalData } from '../src/tiktok.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const PAGE_URL = 'https://www.tiktok.com/@user/video/123';
const CDN = 'https://v.tiktokcdn.test/media.mp4';

const itemStruct = {
  id: '123',
  desc: 'funny video',
  author: { nickname: 'User', uniqueId: 'user' },
  video: {
    duration: 15,
    width: 720,
    height: 1280,
    cover: 'https://cover.jpg',
    bitrateInfo: [
      {
        Bitrate: 2000000,
        GearName: '720p',
        CodecType: 'h264',
        PlayAddr: { Width: 720, Height: 1280, DataSize: 1000, UrlList: [CDN] },
      },
      {
        Bitrate: 1000000,
        GearName: '480p',
        CodecType: 'h264',
        PlayAddr: {
          Width: 480,
          Height: 854,
          DataSize: 500,
          UrlList: ['https://v.tiktokcdn.test/480.mp4'],
        },
      },
    ],
  },
};

const pageHtml = (item: unknown) =>
  `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: item } } } })}</script></body></html>`;

function pageRes(html: string, setCookie: string | null = null): Response {
  return {
    ok: true,
    status: 200,
    url: PAGE_URL,
    text: () => Promise.resolve(html),
    headers: {
      get: (k: string) => (/set-cookie/iu.test(k) ? setCookie : null),
    },
  } as unknown as Response;
}

describe('tiktok getInfo', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  let extractor: ReturnType<typeof createTikTokExtractor>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    env = {
      fetch: fetchSpy as unknown as typeof fetch,
      streamUrl: vi.fn(
        async (_url: string, headers: Record<string, string>) => {
          if (!headers.Cookie?.includes('ttwid=abc'))
            throw new Error('missing cookie');
          return new ReadableStream();
        }
      ) as unknown as ExtractorEnv['streamUrl'],
    };
    extractor = createTikTokExtractor(env);
  });

  it('builds a height-sorted muxed ladder with download headers', async () => {
    fetchSpy.mockResolvedValueOnce(
      pageRes(pageHtml(itemStruct), 'ttwid=abc; Path=/')
    );
    const { getInfo } = extractor;
    const info = await getInfo(PAGE_URL);
    expect(info?.formats).toHaveLength(2);
    expect(info?.formats[0].formatId).toBe('720p');
    expect(info?.formats[0].isAudio).toBe(false);
    expect(info?.formats[0].isMuxed).toBe(true);
    expect(info?.downloadHeaders?.Cookie).toContain('ttwid=abc');
    expect(info?.downloadHeaders?.Referer).toContain('tiktok.com');
  });

  it('getStream forwards captured cookies to the cdn', async () => {
    fetchSpy.mockResolvedValueOnce(
      pageRes(pageHtml(itemStruct), 'ttwid=abc; Path=/')
    );
    const { getInfo, getStream } = extractor;
    const info = await getInfo(PAGE_URL);
    await expect(
      getStream(info as never, { formatId: '720p' })
    ).resolves.toBeInstanceOf(ReadableStream);
  });

  it('throws a retryable error on a captcha wall', async () => {
    fetchSpy.mockResolvedValueOnce(
      pageRes('<html>verify to continue, robot check</html>')
    );
    const { getInfo } = extractor;
    const err = (await getInfo(PAGE_URL).catch((e) => e)) as Error & {
      retryable?: boolean;
    };
    expect(err.retryable).toBe(true);
  });

  it('parseUniversalData returns null without the marker', () => {
    expect(parseUniversalData('<html></html>')).toBeNull();
  });
});
