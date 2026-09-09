import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getInfo, getStream } from '../../src/services/extractors/tiktok.js';
import { z } from 'zod';
import { CaseSchema } from '../utils/schema.js';
import { assertOutcome } from '../utils/assert.js';
import { server } from '../setup.js';
import rawCases from '../fixtures/extractors/tiktok.json';
import realScope from '../fixtures/extractors/tiktok-video.json';

const testCases = z.array(CaseSchema).parse(rawCases);

const REAL_URL =
  'https://www.tiktok.com/@realdonaldtrump/video/7646865974712470815';
const realHtml = `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(realScope)}</script></body></html>`;

describe('TikTok JS Extractor (Data-Driven)', () => {
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
      expect(info?.formats?.[0].url).toContain('http');
    }
  });

  it('should correctly expand short URLs to full tiktok.com URLs', async () => {
    const testCase = testCases[0];
    const info = await getInfo(testCase.url);
    expect(info?.webpageUrl).toContain('tiktok.com/@');
    expect(info?.webpageUrl).toContain('/video/');
  });
});

describe('TikTok JS Extractor — universal-data ladder (real fixture)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.use(
      http.get(
        REAL_URL,
        () =>
          new HttpResponse(realHtml, {
            headers: { 'Content-Type': 'text/html' },
          })
      )
    );
  });

  it('builds a deduped muxed video ladder sorted by height', async () => {
    const info = await getInfo(REAL_URL);
    expect(info).not.toBeNull();
    if (!info) return;
    expect(info.formats.length).toBeGreaterThanOrEqual(2);

    for (const format of info.formats) {
      expect(format.isMuxed).toBe(true);
      expect(format.isVideo).toBe(true);
      expect(format.isAudio).toBe(false); // the old isAudio:true bug
      expect(format.extension).toBe('mp4');
      expect(typeof format.height).toBe('number');
      expect(format.url).toContain('http');
    }

    const heights = info.formats.map((format) => format.height ?? 0);
    expect([...heights].sort((lhs, rhs) => rhs - lhs)).toEqual(heights);
  });

  it('getStream sends captured page cookies to authorize the cdn', async () => {
    const page = 'https://www.tiktok.com/@gate/video/999';
    const cdn = 'https://v.tiktokcdn.test/media.mp4';
    const universal = {
      __DEFAULT_SCOPE__: {
        'webapp.video-detail': {
          itemInfo: {
            itemStruct: {
              id: '999',
              desc: 'Gate',
              author: { nickname: 'A' },
              video: {
                duration: 5,
                bitrateInfo: [
                  {
                    Bitrate: 1,
                    GearName: 'g',
                    CodecType: 'h264',
                    PlayAddr: { Width: 720, Height: 1280, UrlList: [cdn] },
                  },
                ],
              },
            },
          },
        },
      },
    };
    server.use(
      http.get(
        page,
        () =>
          new HttpResponse(
            `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(universal)}</script>`,
            {
              headers: {
                'Content-Type': 'text/html',
                'Set-Cookie': 'ttwid=abc; Path=/',
              },
            }
          )
      ),
      http.get(cdn, ({ request }) =>
        request.headers.get('cookie')?.includes('ttwid=abc')
          ? new HttpResponse('VIDEOBYTES', { status: 200 })
          : new HttpResponse('forbidden', { status: 403 })
      )
    );

    const info = await getInfo(page);
    expect(info).not.toBeNull();
    if (!info) return;

    const stream = await getStream(info, { formatId: 'g' });
    let bytes = 0;
    for await (const chunk of stream) bytes += chunk.length;
    expect(bytes).toBeGreaterThan(0); // 403 without cookie would throw
  });
});
