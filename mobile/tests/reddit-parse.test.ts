import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/net', () => ({
  gatedFetch: vi.fn(),
  timeoutSignal: (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  },
  mapLimit: <T>(
    items: T[],
    _limit: number,
    task: (item: T) => Promise<unknown>
  ) => Promise.all(items.map(task)),
}));

vi.mock('../src/lib/authFetch', () => ({
  cookieGet: vi.fn(),
}));

import { gatedFetch } from '../src/lib/net';
import { cookieGet } from '../src/lib/authFetch';
import { createRedditExtractor } from '@phantom/extractors';
import { mobileSharedEnv } from '../src/extractors/shared/env';

const mockFetch = vi.mocked(gatedFetch);
const mockSession = vi.mocked(cookieGet);

interface SessionResponse {
  ok: boolean;
  status: number;
  headers?: Record<string, string>;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}

function sessionRes(
  body: unknown,
  opts: { status?: number; setCookie?: string } = {}
): SessionResponse {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: opts.setCookie ? { 'set-cookie': opts.setCookie } : undefined,
    text: () =>
      Promise.resolve(
        typeof body === 'string' ? body : JSON.stringify(body)
      ),
    json: () => Promise.resolve(body),
  };
}

function headRes(size: number): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (k: string) => (/content-length/iu.test(k) ? String(size) : null),
    },
  } as unknown as Response;
}

function jsonFetchRes(body: unknown, status = 200): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    url: '',
    text: () => Promise.resolve(text),
    headers: { get: () => null },
  } as unknown as Response;
}

// mirrors real .json payload shape (array of listings, trimmed)
const POST = [
  {
    data: {
      children: [
        {
          kind: 't3',
          data: {
            title: '3 guys attacked random jeep passengers',
            author: 'WashHappy5391',
            is_video: true,
            secure_media: {
              reddit_video: {
                fallback_url:
                  'https://v.redd.it/yzxzty7ymd9h1/CMAF_720.mp4?source=fallback',
              },
            },
            preview: {
              images: [
                {
                  source: {
                    url: 'https://external-preview.redd.it/abc.png?width=640&amp;s=sig',
                  },
                },
              ],
            },
          },
        },
      ],
    },
  },
];

// mirrors real reddit mpd (CMAF names, audio rep quirk)
const MPD = `<?xml version="1.0"?>
<MPD mediaPresentationDuration="PT1M30.071625S">
<Period>
<AdaptationSet contentType="video">
<Representation bandwidth="259050" height="392" id="5" mimeType="video/mp4" width="220"><BaseURL>CMAF_220.mp4</BaseURL></Representation>
<Representation bandwidth="465242" height="480" id="6" mimeType="video/mp4" width="270"><BaseURL>CMAF_270.mp4</BaseURL></Representation>
<Representation bandwidth="2418190" height="1280" id="9" mimeType="video/mp4" width="720"><BaseURL>CMAF_720.mp4</BaseURL></Representation>
</AdaptationSet>
<AdaptationSet contentType="audio">
<Representation audioSamplingRate="48000" bandwidth="68438" id="10" mimeType="audio/mp4"><AudioChannelConfiguration value="2" /><BaseURL>CMAF_AUDIO_64.mp4</BaseURL></Representation>
<Representation audioSamplingRate="48000" bandwidth="132577" id="11" mimeType="audio/mp4"><AudioChannelConfiguration value="2" /><BaseURL>CMAF_AUDIO_128.mp4</BaseURL></Representation>
</AdaptationSet>
</Period>
</MPD>`;

const SESSION_COOKIE =
  'loid=00000000test-token.Z0FBQUFBQnFJ; Path=/; Domain=.reddit.com; Secure, ' +
  'session_tracker=graqpmpdfkjpqnodql.0.1780640577676.Z0FBQUFBQnFJY2Zv; Path=/; Secure, ' +
  'csrf_token=eb8b04de3234ae706008da91f032903d; Path=/; Secure, ' +
  'token_v2=eyJhbGciOiJSUzI1NiJ9.test.payload; Path=/; Secure';

const HTML = `<html><head>
<meta property="og:title" content="3 guys attacked random jeep passengers" />
<meta property="og:image" content="https://external-preview.redd.it/abc.png?width=640&amp;s=sig" />
</head><body>
<div class="thing" data-author="WashHappy5391" data-url="https://v.redd.it/yzxzty7ymd9h1" data-permalink="/r/pinoy/comments/1uf2nx8/x/"></div>
</body></html>`;

// session harvest goes through cookieGet (blob-util, no jar);
// json/html/mpd/size go through gatedFetch
function mockSessionLeg(): void {
  mockSession.mockImplementation(() =>
    Promise.resolve(sessionRes('', { setCookie: SESSION_COOKIE }))
  );
}

// mpd parse + HEAD sizing happen after metadata resolves
function mockMediaLeg(jsonBody: unknown = POST): void {
  mockFetch.mockImplementation((url, init) => {
    if (init?.method === 'HEAD') {
      const size = /AUDIO/u.test(url)
        ? 1467810
        : /CMAF_720/u.test(url)
          ? 20714387
          : /CMAF_270/u.test(url)
            ? 5000000
            : 3000000;
      return Promise.resolve(headRes(size));
    }
    if (/\.json/u.test(url)) return Promise.resolve(jsonFetchRes(jsonBody));
    if (/DASHPlaylist\.mpd/u.test(url)) return Promise.resolve(textRes(MPD));
    if (/old\.reddit\.com|www\.reddit\.com\/comments/u.test(url)) {
      return Promise.resolve(
        htmlFetchRes(typeof jsonBody === 'string' ? jsonBody : HTML, url)
      );
    }
    return Promise.resolve(textRes(MPD));
  });
}

// session jar lives on the extractor instance, so a fresh extractor per test
// is already an isolated session
function loadGetInfo() {
  return (url: string) => createRedditExtractor(mobileSharedEnv).getInfo(url);
}

describe('reddit getInfo', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    mockSession.mockReset();
  });

  it('parses all qualities + audio from a v.redd.it post', async () => {
    const getInfo = await loadGetInfo();
    mockSessionLeg();
    mockMediaLeg();

    const info = await getInfo(
      'https://www.reddit.com/r/pinoy/comments/1uf2nx8/x/'
    );

    expect(info).not.toBeNull();
    expect(info?.extractorKey).toBe('reddit');
    expect(info?.title).toBe('3 guys attacked random jeep passengers');
    expect(info?.uploader).toBe('WashHappy5391');
    expect(info?.thumbnail).toBe(
      'https://external-preview.redd.it/abc.png?width=640&s=sig'
    );
    expect(info?.duration).toBe(90);

    expect(info?.formats).toHaveLength(3);
    const top = info?.formats[0];
    expect(top?.formatId).toBe('720p');
    expect(top?.url).toBe('https://v.redd.it/yzxzty7ymd9h1/CMAF_720.mp4');
    expect(top?.resolution).toBe('720x1280');
    // highest-bitrate audio chosen, muxed on-device
    expect(top?.muxAudioUrl).toBe(
      'https://v.redd.it/yzxzty7ymd9h1/CMAF_AUDIO_128.mp4'
    );
    expect(top?.isMuxed).toBe(false);
    expect(top?.filesize).toBe(20714387 + 1467810);
  });

  it('sends the harvested loid cookie to the json api', async () => {
    const getInfo = await loadGetInfo();
    mockSessionLeg();
    mockMediaLeg();

    await getInfo('https://www.reddit.com/r/pinoy/comments/1uf2nx8/x/');
    const jsonCall = mockFetch.mock.calls.find(([called]) =>
      /\.json/u.test(String(called))
    );
    expect(jsonCall?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Cookie: expect.stringContaining('loid=00000000test-token'),
      }),
    });
    expect(mockSession).toHaveBeenCalledTimes(1);
  });

  it('reharvests loid once when the json api 403s', async () => {
    const getInfo = await loadGetInfo();
    let sessionCalls = 0;
    let jsonCalls = 0;
    mockSession.mockImplementation(() => {
      sessionCalls += 1;
      return Promise.resolve(sessionRes('', { setCookie: SESSION_COOKIE }));
    });
    mockFetch.mockImplementation((url, init) => {
      if (init?.method === 'HEAD') return Promise.resolve(headRes(100));
      if (/DASHPlaylist\.mpd/u.test(url)) return Promise.resolve(textRes(MPD));
      if (/\.json/u.test(url)) {
        jsonCalls += 1;
        if (jsonCalls === 1) return Promise.resolve(jsonFetchRes('', 403));
        return Promise.resolve(jsonFetchRes(POST));
      }
      return Promise.resolve(textRes(MPD));
    });

    const info = await getInfo(
      'https://www.reddit.com/r/pinoy/comments/1uf2nx8/x/'
    );
    expect(info).not.toBeNull();
    expect(sessionCalls).toBe(2);
    expect(jsonCalls).toBe(2);
  });

  it('retries with a fresh session through html challenge pages', async () => {
    const getInfo = await loadGetInfo();
    let sessionCalls = 0;
    let jsonCalls = 0;
    mockSession.mockImplementation(() => {
      sessionCalls += 1;
      return Promise.resolve(sessionRes('', { setCookie: SESSION_COOKIE }));
    });
    mockFetch.mockImplementation((url, init) => {
      if (init?.method === 'HEAD') return Promise.resolve(headRes(100));
      if (/DASHPlaylist\.mpd/u.test(url)) return Promise.resolve(textRes(MPD));
      if (/\.json/u.test(url)) {
        jsonCalls += 1;
        if (jsonCalls === 1)
          return Promise.resolve(jsonFetchRes('<html>blocked</html>'));
        return Promise.resolve(jsonFetchRes(POST));
      }
      return Promise.resolve(textRes(MPD));
    });

    const info = await getInfo(
      'https://www.reddit.com/r/pinoy/comments/1uf2nx8/x/'
    );
    expect(info).not.toBeNull();
    expect(info?.formats.length).toBeGreaterThan(0);
    expect(sessionCalls).toBe(2);
    expect(jsonCalls).toBe(2);
  });

  it('falls back to html scrape when json comes back media-stripped', async () => {
    const getInfo = await loadGetInfo();
    const degraded = [
      {
        data: {
          children: [
            {
              data: {
                title: '3 guys attacked random jeep passengers',
                author: 'WashHappy5391',
                is_video: true,
              },
            },
          ],
        },
      },
    ];
    mockSessionLeg();
    mockFetch.mockImplementation((url, init) => {
      if (init?.method === 'HEAD') return Promise.resolve(headRes(100));
      if (/DASHPlaylist\.mpd/u.test(url)) return Promise.resolve(textRes(MPD));
      if (/\.json/u.test(url)) return Promise.resolve(jsonFetchRes(degraded));
      if (/old\.reddit\.com\/comments\/1uf2nx8/u.test(url)) {
        return Promise.resolve(htmlFetchRes(HTML, url));
      }
      return Promise.resolve(htmlFetchRes('<html></html>', url));
    });

    const info = await getInfo(
      'https://www.reddit.com/r/pinoy/comments/1uf2nx8/x/'
    );
    expect(info).not.toBeNull();
    expect(info?.title).toBe('3 guys attacked random jeep passengers');
    expect(info?.uploader).toBe('WashHappy5391');
    expect(info?.formats[0]?.url).toContain('v.redd.it/yzxzty7ymd9h1');
  });

  it('returns a silent video when the mpd has no audio track', async () => {
    const getInfo = await loadGetInfo();
    mockSessionLeg();
    const noAudio = MPD.replace(
      /<AdaptationSet contentType="audio">[\s\S]*?<\/AdaptationSet>/u,
      ''
    );
    mockFetch.mockImplementation((url, init) => {
      if (init?.method === 'HEAD') return Promise.resolve(headRes(100));
      if (/\.json/u.test(url)) return Promise.resolve(jsonFetchRes(POST));
      return Promise.resolve(textRes(noAudio));
    });

    const info = await getInfo(
      'https://www.reddit.com/r/x/comments/1uf2nx8/y/'
    );
    expect(info?.formats[0].muxAudioUrl).toBeUndefined();
    expect(info?.formats[0].isMuxed).toBe(true);
  });

  it('throws when the post has no v.redd.it video', async () => {
    const getInfo = await loadGetInfo();
    mockSessionLeg();
    mockFetch.mockImplementation((url, init) => {
      if (init?.method === 'HEAD') return Promise.resolve(headRes(100));
      if (/\.json/u.test(url)) {
        return Promise.resolve(
          jsonFetchRes([
            {
              data: {
                children: [
                  {
                    data: {
                      title: 'a gallery',
                      author: 'someone',
                      is_gallery: true,
                    },
                  },
                ],
              },
            },
          ])
        );
      }
      return Promise.resolve(htmlFetchRes('<html></html>', url));
    });

    await expect(
      getInfo('https://www.reddit.com/r/x/comments/abc/img/')
    ).rejects.toThrow(/downloadable video/iu);
  });
});

function textRes(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 403,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function htmlFetchRes(html: string, url: string): Response {
  return {
    ok: true,
    status: 200,
    url,
    text: () => Promise.resolve(html),
    headers: { get: () => 'text/html' },
  } as unknown as Response;
}
