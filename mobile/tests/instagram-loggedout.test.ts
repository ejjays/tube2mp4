import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/net', () => ({
  gatedFetch: vi.fn(),
  mapLimit: <T>(
    items: T[],
    _limit: number,
    task: (item: T) => Promise<unknown>
  ) => Promise.all(items.map(task)),
}));
vi.mock('../src/lib/authFetch', () => ({ cookieGet: vi.fn() }));

import { gatedFetch } from '../src/lib/net';
import { cookieGet } from '../src/lib/authFetch';
import { getInfo } from '../src/extractors/instagram';

const mockFetch = vi.mocked(gatedFetch);
const mockCookieGet = vi.mocked(cookieGet);

interface ResOpts {
  ok?: boolean;
  status?: number;
  text?: string;
  json?: unknown;
  headers?: Record<string, string>;
}
function res(opts: ResOpts): Response {
  const { ok = true, status = 200, text, json, headers = {} } = opts;
  return {
    ok,
    status,
    text: () => Promise.resolve(text ?? ''),
    json: () => Promise.resolve(json ?? {}),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

const PAGE =
  '<html><body><script>["LSD",[],{"token":"testlsd"},258];["InstagramSecurityConfig",[],{"csrf_token":"testcsrf"},259];</script></body></html>';

// video-only reps + separate audio rep (needs on-device mux)
const MANIFEST = `<MPD>
<Representation mimeType="video/mp4" width="720" height="1280"><BaseURL>https://scontent.cdninstagram.com/v/720.mp4</BaseURL></Representation>
<Representation mimeType="video/mp4" width="1080" height="1920"><BaseURL>https://scontent.cdninstagram.com/v/1080.mp4</BaseURL></Representation>
<Representation mimeType="audio/mp4" bandwidth="128000"><BaseURL>https://scontent.cdninstagram.com/a/audio.mp4</BaseURL></Representation>
</MPD>`;

function productRes(product: unknown): Response {
  return res({
    text: JSON.stringify({
      data: { xig_polaris_media: { if_not_gated_logged_out: product } },
    }),
  });
}

// routes mobile cascade: page -> /api/graphql, size probes, graphql fallback
function route(apiGraphql: Response) {
  return (url: string, init?: RequestInit): Promise<Response> => {
    const headers = init?.headers as Record<string, string> | undefined;
    if (headers?.Range) {
      return Promise.resolve(
        res({ headers: { 'content-range': 'bytes 0-0/1048576' } })
      );
    }
    if (url?.includes('/api/graphql')) return Promise.resolve(apiGraphql);
    if (url?.includes('/graphql/query')) {
      return Promise.resolve(res({ json: { data: {} } }));
    }
    if (url?.includes('/p/')) {
      return Promise.resolve(
        res({
          text: PAGE,
          headers: {
            'set-cookie': 'csrftoken=testcsrf; Path=/, mid=testmid; Path=/',
          },
        })
      );
    }
    return Promise.resolve(res({ json: {} }));
  };
}

describe('instagram getInfo (logged-out /api/graphql)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockCookieGet.mockReset();
    delete process.env.EXPO_PUBLIC_IG_COOKIE;
  });

  it('resolves a reel via the no-cookie path with a dash quality ladder', async () => {
    mockFetch.mockImplementation(
      route(
        productRes({
          code: 'DKcBidTSIRo',
          pk: '123',
          caption: { text: 'Just a random video' },
          user: { username: 'princemeyson', full_name: 'Prince Meyson' },
          image_versions2: {
            candidates: [
              {
                url: 'https://scontent.cdninstagram.com/thumb.jpg',
                width: 640,
                height: 1137,
              },
            ],
          },
          video_versions: [
            {
              url: 'https://scontent.cdninstagram.com/v/prog.mp4',
              width: 640,
              height: 1137,
            },
          ],
          video_dash_manifest: MANIFEST,
        })
      )
    );

    const info = await getInfo('https://www.instagram.com/reel/DKcBidTSIRo/');

    expect(info).not.toBeNull();
    expect(info?.extractorKey).toBe('instagram');
    expect(info?.title).toBe('Just a random video');
    expect(info?.uploader).toBe('Prince Meyson');

    const top = info?.formats?.[0];
    expect(top?.quality).toBe('1080p');
    expect(top?.url).toContain('1080.mp4');

    expect(top?.muxAudioUrl).toContain('audio.mp4');
    expect(top?.isMuxed).toBe(false);
    expect(
      info?.formats.some((f) => f.quality === '720p' && Boolean(f.muxAudioUrl))
    ).toBe(true);

    expect(info?.formats.some((f) => f.isMuxed === true)).toBe(true);
  });

  it('exposes each carousel child as its own format', async () => {
    mockFetch.mockImplementation(
      route(
        productRes({
          code: 'CAR1',
          caption: { text: 'Carousel' },
          user: { username: 'test_user' },
          carousel_media: [
            {
              video_versions: [
                {
                  url: 'https://scontent.cdninstagram.com/v/c1.mp4',
                  width: 1080,
                  height: 1080,
                },
              ],
            },
            {
              image_versions2: {
                candidates: [
                  {
                    url: 'https://scontent.cdninstagram.com/c2.jpg',
                    width: 1080,
                    height: 1080,
                  },
                ],
              },
            },
          ],
        })
      )
    );

    const info = await getInfo('https://www.instagram.com/p/CAR1/');
    expect(info?.formats).toHaveLength(2);
    expect(info?.formats[0].isVideo).toBe(true);
    expect(info?.formats[1].extension).toBe('jpg');
    expect(info?.formats[1].isVideo).toBe(false);
  });

  it('throws when IG serves the gated html shell and no path yields media', async () => {
    mockFetch.mockImplementation(
      route(res({ text: '<!DOCTYPE html><html></html>' }))
    );

    await expect(
      getInfo('https://www.instagram.com/reel/GATED123/')
    ).rejects.toThrow(/downloadable video/iu);
  });

  it('does not fall back to legacy graphql when IG rate-limits (429)', async () => {
    const calls: string[] = [];
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      calls.push(url);
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.Range) {
        return Promise.resolve(
          res({ headers: { 'content-range': 'bytes 0-0/1' } })
        );
      }
      if (url?.includes('/api/graphql')) {
        return Promise.resolve(res({ ok: false, status: 429 }));
      }
      if (url?.includes('/p/')) {
        return Promise.resolve(
          res({ text: PAGE, headers: { 'set-cookie': 'csrftoken=testcsrf' } })
        );
      }
      return Promise.resolve(res({ json: {} }));
    });

    await expect(
      getInfo('https://www.instagram.com/reel/RL429AAAAAA/')
    ).rejects.toThrow(/busy|try again/iu);
    // must NOT hammer legacy graphql endpoint on rate-limit
    expect(calls.some((href) => href?.includes('/graphql/query'))).toBe(false);
  });

  it('uses the authenticated media API first when a cookie is set', async () => {
    process.env.EXPO_PUBLIC_IG_COOKIE = 'sessionid=testcookie';
    mockCookieGet.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      json: () =>
        Promise.resolve({
          items: [
            {
              code: 'AUTH123',
              caption: { text: 'Auth Reel' },
              user: { username: 'auth_user' },
              video_versions: [
                {
                  url: 'https://scontent.cdninstagram.com/v/auth.mp4',
                  width: 1080,
                  height: 1920,
                },
              ],
            },
          ],
        }),
    });
    const calls: string[] = [];
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      calls.push(url);
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.Range) {
        return Promise.resolve(
          res({ headers: { 'content-range': 'bytes 0-0/1' } })
        );
      }
      return Promise.resolve(res({ json: {} }));
    });

    const info = await getInfo('https://www.instagram.com/reel/AUTH123/');

    expect(info?.title).toBe('Auth Reel');
    expect(info?.formats[0].url).toContain('auth.mp4');
    // authenticated path uses cookieGet (blob-util), skipping throttled
    // logged-out endpoint & page fetch entirely (oembed media-id lookup
    // carries /p/ inside its query param, so match page fetches by prefix)
    expect(mockCookieGet).toHaveBeenCalled();
    expect(calls.some((href) => href?.includes('/api/graphql'))).toBe(false);
    expect(
      calls.some((href) =>
        href?.startsWith('https://www.instagram.com/p/')
      )
    ).toBe(false);
  });
});
