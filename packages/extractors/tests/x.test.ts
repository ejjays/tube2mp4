import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createXExtractor, tweetToken } from '../src/x.js';
import type { ExtractorEnv } from '../src/shared/env.js';

function jsonRes(body: unknown, ok = true, status = ok ? 200 : 404): Response {
  return {
    ok,
    status,
    headers: {
      get: () => null,
    },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function headRes(len: number): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (k: string) => (/content-length/iu.test(k) ? String(len) : null),
    },
  } as unknown as Response;
}

function makeEnv(fetchFn: typeof fetch): {
  env: ExtractorEnv;
  fetch: ReturnType<typeof vi.fn>;
} {
  const fetchSpy = vi.fn(fetchFn);
  return {
    env: { fetch: fetchSpy as unknown as typeof fetch },
    fetch: fetchSpy,
  };
}

describe('tweetToken', () => {
  it('is deterministic, dot-free, input-sensitive', () => {
    const a = tweetToken('1599337745803882496');
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toContain('.');
    expect(tweetToken('1599337745803882496')).toBe(a);
    expect(tweetToken('20')).not.toBe(a);
  });
});

describe('x getInfo', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const m = makeEnv(async () => jsonRes({}));
    env = m.env;
    fetchSpy = m.fetch;
  });

  it('returns null for non-status urls', async () => {
    const { getInfo } = createXExtractor(env);
    expect(await getInfo('https://example.com')).toBeNull();
  });

  it('builds progressive formats and drops trailing t.co', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonRes({
          text: 'great clip https://t.co/abc',
          user: { name: 'Alice' },
          mediaDetails: [
            {
              type: 'video',
              media_url_https: 'https://pbs.twimg.com/thumb.jpg',
              video_info: {
                variants: [
                  {
                    content_type: 'video/mp4',
                    bitrate: 632000,
                    url: 'https://video.twimg.com/640x360/abc.mp4',
                  },
                  {
                    content_type: 'video/mp4',
                    bitrate: 2176000,
                    url: 'https://video.twimg.com/1280x720/abc.mp4',
                  },
                  { content_type: 'application/x-mpegurl' },
                ],
              },
            },
          ],
        })
      )
      // HEADs; sizes keyed by URL so the test is order-independent
      .mockImplementation((input: unknown, init?: RequestInit) => {
        if (init?.method !== 'HEAD') return jsonRes({});
        const u = String(input);
        return Promise.resolve(
          headRes(u.includes('1280x720') ? 20000000 : 8000000)
        );
      });

    const { getInfo } = createXExtractor(env);
    const info = await getInfo('https://x.com/u/status/12345');
    expect(info).not.toBeNull();
    expect(info?.title).toBe('great clip');
    expect(info?.uploader).toBe('Alice');
    expect(info?.thumbnail).toContain('thumb.jpg');
    expect(info?.formats).toHaveLength(2);
    const by720 = info?.formats.find((f) => f.quality === '720p');
    const by360 = info?.formats.find((f) => f.quality === '360p');
    expect(by720?.isMuxed).toBe(true);
    expect(by720?.filesize).toBe(20000000);
    expect(by360?.filesize).toBe(8000000);
  });

  it('falls back to quoted_tweet media when primary has none', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonRes({
          text: 'reply with no media',
          user: { name: 'Bob' },
          mediaDetails: [],
          quoted_tweet: {
            mediaDetails: [
              {
                type: 'video',
                media_url_https: 'https://pbs.twimg.com/q.jpg',
                video_info: {
                  variants: [
                    {
                      content_type: 'video/mp4',
                      bitrate: 1000,
                      url: 'https://video.twimg.com/q.mp4',
                    },
                  ],
                },
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(headRes(1234));

    const { getInfo } = createXExtractor(env);
    const info = await getInfo('https://x.com/u/status/99999');
    expect(info?.formats).toHaveLength(1);
    expect(info?.thumbnail).toContain('q.jpg');
  });

  it.each([
    [404, true, false],
    [503, true, true],
    [429, true, true],
    [403, true, false],
  ])(
    'throws a typed ExtractorError on HTTP %i',
    async (status, expected, retryable) => {
      fetchSpy.mockResolvedValueOnce(jsonRes({}, false, status));
      const { getInfo } = createXExtractor(env);
      const err = (await getInfo('https://x.com/u/status/1').catch(
        (e) => e
      )) as Error & {
        retryable?: boolean;
        expected?: boolean;
      };
      expect(err.name).toBe('ExtractorError');
      expect(err.expected).toBe(expected);
      expect(err.retryable).toBe(retryable);
    }
  );

  it('isAudioMuxed=true marks formats as isAudio for mobile downloader path', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonRes({
          text: 'clip',
          user: { name: 'C' },
          mediaDetails: [
            {
              type: 'video',
              video_info: {
                variants: [
                  {
                    content_type: 'video/mp4',
                    bitrate: 1000,
                    url: 'https://video.twimg.com/c.mp4',
                  },
                ],
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(headRes(1));

    const { getInfo } = createXExtractor(env);
    const info = await getInfo('https://x.com/u/status/2', {
      isAudioMuxed: true,
    });
    expect(info?.formats[0].isAudio).toBe(true);
  });
});
