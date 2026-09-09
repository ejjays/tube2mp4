import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getInfo,
  getStream,
} from '../../src/services/extractors/instagram/index.js';
import { IG_APP_ID } from '@phantom/extractors/instagram/constants';
import { server } from '../setup.js';
import { http, HttpResponse } from 'msw';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { CaseSchema } from '../utils/schema.js';
import { assertOutcome } from '../utils/assert.js';
import rawCases from '../fixtures/extractors/instagram.json';

const testCases = z.array(CaseSchema).parse(rawCases);
const REEL = 'https://www.instagram.com/reel/DFQe23tOWKz/';
const MEDIA_INFO = 'https://i.instagram.com/api/v1/media/:mediaId/info/';

describe('Instagram JS Extractor (Data-Driven)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(testCases)('should extract metadata for $name', async (testCase) => {
    const info = await getInfo(testCase.url);
    assertOutcome(info, testCase.expected);

    if (
      testCase.expected.status === 'ok' &&
      testCase.expected.type === 'video'
    ) {
      expect(info?.formats?.length).toBeGreaterThan(0);
      expect(info?.formats[0].url).toContain('test.mp4');
    }
  });

  it('should be able to initiate a stream (Pure JS Stream)', async () => {
    const testCase = testCases[0];
    const info = await getInfo(testCase.url);
    expect(info).not.toBeNull();
    if (!info) return;

    const formatId = info.formats[0].formatId;
    const stream = await getStream(info, { formatId });

    expect(stream).toBeInstanceOf(Readable);
    stream.destroy();
  });
});

describe('Instagram Gold Standard (2026)', () => {
  it('sends the mandatory X-IG-App-ID header', async () => {
    let sentAppId: string | null = null;
    server.use(
      http.get('https://i.instagram.com/api/v1/oembed/', ({ request }) => {
        sentAppId = request.headers.get('x-ig-app-id');
        return HttpResponse.json({ media_id: '123456_789' });
      })
    );

    await getInfo(REEL);
    expect(sentAppId).toBe(IG_APP_ID);
    expect(sentAppId).toBe('936619743392459');
  });

  it('selects the highest-quality video version', async () => {
    const info = await getInfo(REEL);
    // mock serves sd 480x854 + hd 1080x1920
    expect(info?.formats[0].resolution).toBe('1080x1920');
    expect(info?.formats[0].url).toContain('test.mp4');
    expect(info?.formats[0].url).not.toContain('test_sd');
  });

  it('exposes each carousel child as a format', async () => {
    server.use(
      http.get(MEDIA_INFO, () =>
        HttpResponse.json({
          items: [
            {
              code: 'CAROUSEL1',
              caption: { text: 'Carousel Post' },
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
            },
          ],
        })
      )
    );

    const info = await getInfo(REEL);
    expect(info?.formats).toHaveLength(2);
    expect(info?.formats[0].formatId).toBe('item1_hd');
    expect(info?.formats[1].formatId).toBe('item2_photo');
    expect(info?.formats[1].extension).toBe('jpg');
  });

  it('handles image-only posts as photo formats', async () => {
    server.use(
      http.get(MEDIA_INFO, () =>
        HttpResponse.json({
          items: [
            {
              code: 'PHOTO1',
              caption: { text: 'Photo Post' },
              user: { username: 'test_user' },
              image_versions2: {
                candidates: [
                  {
                    url: 'https://scontent.cdninstagram.com/photo.jpg',
                    width: 1080,
                    height: 1350,
                  },
                ],
              },
            },
          ],
        })
      )
    );

    const info = await getInfo(REEL);
    expect(info?.formats[0].extension).toBe('jpg');
    expect(info?.formats[0].vcodec).toBe('none');
    expect(info?.formats[0].isVideo).toBe(false);
  });

  it('falls back to logged-out graphql when the mobile api fails', async () => {
    server.use(
      http.get(
        'https://i.instagram.com/api/v1/oembed/',
        () => new HttpResponse(null, { status: 404 })
      ),
      http.get(MEDIA_INFO, () => new HttpResponse(null, { status: 404 }))
    );

    const info = await getInfo(REEL);
    expect(info).not.toBeNull();
    expect(info?.formats?.length).toBeGreaterThan(0);
    expect(info?.formats[0].url).toContain('test.mp4');
  });

  it('exposes dash 1080p/720p with a separate audio track', async () => {
    const manifest =
      '<MPD><Period><AdaptationSet contentType="video"><Representation width="720" height="1280" bandwidth="161449" mimeType="video/mp4"><BaseURL>https://scontent.cdninstagram.com/v/720.mp4</BaseURL></Representation><Representation width="1080" height="1920" bandwidth="672123" mimeType="video/mp4"><BaseURL>https://scontent.cdninstagram.com/v/1080.mp4</BaseURL></Representation></AdaptationSet><AdaptationSet contentType="audio"><Representation bandwidth="48000" mimeType="audio/mp4"><BaseURL>https://scontent.cdninstagram.com/a/audio.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>';
    server.use(
      http.get(
        'https://i.instagram.com/api/v1/oembed/',
        () => new HttpResponse(null, { status: 404 })
      ),
      http.get(MEDIA_INFO, () => new HttpResponse(null, { status: 404 })),
      http.post('https://www.instagram.com/api/graphql', () =>
        HttpResponse.json({
          data: {
            xig_polaris_media: {
              if_not_gated_logged_out: {
                code: 'DZJwcDtMsdw',
                user: { username: 'test_user' },
                caption: { text: 'Dash Reel' },
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
                    id: 'prog',
                    url: 'https://scontent.cdninstagram.com/v/progressive.mp4',
                    width: 640,
                    height: 1137,
                  },
                ],
                video_dash_manifest: manifest,
              },
            },
          },
        })
      )
    );

    const info = await getInfo(REEL);
    const top = info?.formats?.[0];
    expect(top?.quality).toBe('1080p');
    expect(top?.url).toContain('1080.mp4');
    expect(top?.audioUrl).toContain('audio.mp4');
    expect(top?.isMuxed).toBe(false);
    expect(
      info?.formats.some(
        (fmt) => fmt.quality === '720p' && Boolean(fmt.audioUrl)
      )
    ).toBe(true);
    // progressive stays a muxed fallback
    expect(info?.formats.some((fmt) => fmt.isMuxed === true)).toBe(true);
  });

  it('does not hit the embed fallback when IG rate-limits (429)', async () => {
    let embedCalled = false;
    server.use(
      http.get(
        'https://i.instagram.com/api/v1/oembed/',
        () => new HttpResponse(null, { status: 404 })
      ),
      http.get(MEDIA_INFO, () => new HttpResponse(null, { status: 404 })),
      http.post(
        'https://www.instagram.com/api/graphql',
        () => new HttpResponse(null, { status: 429 })
      ),
      http.get(
        'https://www.instagram.com/reel/DFQe23tOWKz/embed/captioned/',
        () => {
          embedCalled = true;
          return new HttpResponse('<html></html>', {
            headers: { 'Content-Type': 'text/html' },
          });
        }
      )
    );

    const info = await getInfo(REEL);
    expect(info).toBeNull();
    // fail-fast: must not fall through to embed path on rate-limit
    expect(embedCalled).toBe(false);
  });
});
