import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { http, HttpResponse } from 'msw';
import { getInfo, getStream } from '../../src/services/extractors/bilibili.js';
import { server } from '../setup.js';

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(() => new PassThrough()),
}));
import { getProxiedStream } from '../../src/utils/network/proxy.util.js';

const TEST_URL = 'https://www.bilibili.tv/en/video/4792306564206592';

const VIDEO_720 = 'https://upos-sz-mirrorcosbstar1.bilivideo.com/v720.m4s';
const VIDEO_480 = 'https://upos-sz-mirrorcosbstar1.bilivideo.com/v480.m4s';
const VIDEO_720_HEVC =
  'https://upos-sz-mirrorcosbstar1.bilivideo.com/v720hev.m4s';
const AUDIO_HIGH = 'https://upos-sz-mirrorcosbstar1.bilivideo.com/a-high.m4s';
const AUDIO_LOW = 'https://upos-sz-mirrorcosbstar1.bilivideo.com/a-low.m4s';

// shaped after the real api.bilibili.tv/intl/gateway/web/playurl response
const playurlJson = {
  code: 0,
  message: '0',
  ttl: 1,
  data: {
    playurl: {
      quality: 16,
      duration: 7474383, // ms
      video: [
        {
          // gated 1080p has no url
          stream_info: { quality: 112, desc_words: '1080P(HD)' },
          video_resource: {
            quality: 112,
            codecs: 'avc1.640032',
            width: 1920,
            height: 1080,
            bandwidth: 555677,
            size: 519185929,
            frame_rate: '30000/1001',
            mime_type: 'video/mp4',
            url: '',
          },
        },
        {
          stream_info: { quality: 64, desc_words: '720P' },
          video_resource: {
            quality: 64,
            codecs: 'avc1.640028',
            width: 1280,
            height: 720,
            bandwidth: 400000,
            size: 255000000,
            frame_rate: '30000/1001',
            mime_type: 'video/mp4',
            url: VIDEO_720,
          },
        },
        {
          stream_info: { quality: 32, desc_words: '480P' },
          video_resource: {
            quality: 32,
            codecs: 'avc1.64001F',
            width: 854,
            height: 480,
            bandwidth: 200000,
            size: 120000000,
            frame_rate: '30000/1001',
            mime_type: 'video/mp4',
            url: VIDEO_480,
          },
        },
        {
          // hevc twin dropped for avc1
          stream_info: { quality: 64, desc_words: '720P' },
          video_resource: {
            quality: 64,
            codecs: 'hev1.1.6.L120.90',
            width: 1280,
            height: 720,
            bandwidth: 300000,
            size: 200000000,
            url: VIDEO_720_HEVC,
          },
        },
      ],
      audio_resource: [
        {
          quality: 30280,
          codecs: 'mp4a.40.2',
          bandwidth: 93602,
          size: 87000000,
          url: AUDIO_HIGH,
        },
        {
          quality: 30216,
          codecs: 'mp4a.40.5',
          bandwidth: 38370,
          size: 36000000,
          url: AUDIO_LOW,
        },
      ],
    },
  },
};

const pageHtml = `<html><head>
<meta property="og:title" content="Dragon Ball Z - Movie (1080p) | bilibili">
<meta property="og:image" content="https://p.bstarstatic.com/ugc/thumb.jpg">
<meta property="og:description" content="An epic battle.">
</head><body></body></html>`;

function mockEndpoints() {
  server.use(
    http.get('https://api.bilibili.tv/intl/gateway/web/playurl', () =>
      HttpResponse.json(playurlJson)
    ),
    http.get(
      TEST_URL,
      () =>
        new HttpResponse(pageHtml, { headers: { 'Content-Type': 'text/html' } })
    )
  );
}

describe('Bilibili (bilibili.tv) extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BILIBILI_COOKIE;
    mockEndpoints();
  });

  it('builds an avc1-only DASH video ladder with paired audio + audioFormats', async () => {
    const info = await getInfo(TEST_URL);
    expect(info, 'extractor returned null').not.toBeNull();
    if (!info) return;

    // gated 1080p and hevc excluded
    expect(info.formats.map((format) => format.height)).toEqual([720, 480]);

    for (const format of info.formats) {
      expect(format.vcodec?.startsWith('avc1')).toBe(true);
      expect(format.isVideo).toBe(true);
      expect(format.isAudio).toBe(false);
      expect(format.acodec).toBe('none'); // video-only (DASH)
      expect(format.extension).toBe('mp4');
      // video paired with best audio
      expect(format.audioUrl).toBe(AUDIO_HIGH);
    }

    // audio ladder normalised to m4a
    expect(info.audioFormats?.length).toBe(2);
    for (const audio of info.audioFormats ?? []) {
      expect(audio.isAudio).toBe(true);
      expect(audio.isVideo).toBe(false);
      expect(audio.extension).toBe('m4a');
    }
    expect(info.audioFormats?.[0].url).toBe(AUDIO_HIGH);

    // metadata
    expect(info.title).toContain('Dragon Ball Z');
    expect(info.title.toLowerCase()).not.toContain('bilibili');
    expect(info.thumbnail).toBe('https://p.bstarstatic.com/ugc/thumb.jpg');
    expect(info.duration).toBe(7474); // 7474383ms -> 7474s
    expect(info.extractorKey).toBe('bilibili');
    expect(info.id).toBe('4792306564206592');
  });

  it('getStream(video) proxies the selected video url with the bilibili referer', async () => {
    const info = await getInfo(TEST_URL);
    if (!info) throw new Error('no info');

    const stream = await getStream(info, {
      formatId: '720p',
      type: 'video',
    } as never);
    expect(getProxiedStream).toHaveBeenCalledWith(
      VIDEO_720,
      expect.objectContaining({ Referer: 'https://www.bilibili.tv/' })
    );
    stream.destroy();
  });

  it('getStream(mp3) proxies the best audio url, not the video', async () => {
    const info = await getInfo(TEST_URL);
    if (!info) throw new Error('no info');

    const stream = await getStream(info, { format: 'mp3' });
    expect(getProxiedStream).toHaveBeenCalledWith(
      AUDIO_HIGH,
      expect.objectContaining({ Referer: 'https://www.bilibili.tv/' })
    );
    stream.destroy();
  });

  it('returns null for non-video URLs (e.g. user space)', async () => {
    expect(
      await getInfo('https://www.bilibili.tv/en/space/1914969271')
    ).toBeNull();
  });

  it('forwards BILIBILI_COOKIE as the Cookie header to the playurl API', async () => {
    process.env.BILIBILI_COOKIE = 'SESSDATA=abc; bili_jct=xyz';
    let seenCookie: string | null = null;
    server.use(
      http.get(
        'https://api.bilibili.tv/intl/gateway/web/playurl',
        ({ request }) => {
          seenCookie = request.headers.get('cookie');
          return HttpResponse.json(playurlJson);
        }
      )
    );

    await getInfo(TEST_URL);
    expect(seenCookie).toBe('SESSDATA=abc; bili_jct=xyz');
  });

  it('omits the Cookie header when BILIBILI_COOKIE is unset', async () => {
    let seenCookie: string | null = 'unset';
    server.use(
      http.get(
        'https://api.bilibili.tv/intl/gateway/web/playurl',
        ({ request }) => {
          seenCookie = request.headers.get('cookie');
          return HttpResponse.json(playurlJson);
        }
      )
    );

    await getInfo(TEST_URL);
    expect(seenCookie).toBeNull();
  });
});
