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

import { gatedFetch } from '../src/lib/net';
import { createVimeoExtractor } from '@phantom/extractors';
import { mobileSharedEnvWithThumbs } from '../src/extractors/shared/env';

const getInfo = (url: string) =>
  createVimeoExtractor(mobileSharedEnvWithThumbs).getInfo(url);

const mockFetch = vi.mocked(gatedFetch);

function jsonRes(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 403,
    json: () => Promise.resolve(body),
  } as unknown as Response;
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
function textRes(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 403,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const PROGRESSIVE = [
  {
    quality: '360p',
    width: 640,
    height: 360,
    url: 'https://vod.vimeocdn.com/360.mp4?exp=1',
  },
  {
    quality: '720p',
    width: 1280,
    height: 720,
    url: 'https://vod.vimeocdn.com/720.mp4?exp=1',
  },
];
const cfgOf = (progressive: unknown[]) => ({
  video: {
    id: 12345,
    title: 'Open Clip',
    duration: 62,
    owner: { name: 'Owner' },
    thumbs: { '1280': 'https://i.vimeocdn.com/1280.jpg' },
  },
  request: {
    files: {
      progressive,
      hls: {
        default_cdn: 'akfire',
        cdns: {
          akfire: { url: 'https://vod-adaptive.vimeocdn.com/master.m3u8' },
        },
      },
    },
  },
});
const HLS_CFG = {
  video: {
    id: 12345,
    title: 'KARUPY',
    duration: 696,
    owner: { name: 'Kala' },
    thumbs: {},
  },
  request: {
    files: {
      progressive: [],
      hls: {
        default_cdn: 'akfire',
        cdns: {
          akfire: { url: 'https://vod-adaptive.vimeocdn.com/master.m3u8' },
        },
      },
    },
  },
};
const MASTER_M3U8 = [
  '#EXTM3U',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-high",NAME="Original",URI="audio/media.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=4096701,AVERAGE-BANDWIDTH=2719000,RESOLUTION=1620x1080,CODECS="av01.0.08M.08,mp4a.40.2",AUDIO="audio-high"',
  'video/1080/media.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=632969,AVERAGE-BANDWIDTH=441000,RESOLUTION=540x360,CODECS="av01.0.01M.08,mp4a.40.2",AUDIO="audio-high"',
  'video/360/media.m3u8',
].join('\n');
const playerPage = (cfg: unknown) =>
  `<!DOCTYPE html><html><body><script>var a=1; window.playerConfig = ${JSON.stringify(cfg)}; var b={x:2};</script></body></html>`;

describe('vimeo getInfo', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('extracts progressive mp4 from the open config endpoint', async () => {
    mockFetch.mockImplementation((url, init) => {
      if (init?.method === 'HEAD')
        return Promise.resolve(
          headRes(url.includes('720') ? 20000000 : 8000000)
        );
      if (url.includes('/config'))
        return Promise.resolve(jsonRes(cfgOf(PROGRESSIVE)));
      return Promise.resolve(textRes(''));
    });

    const info = await getInfo('https://vimeo.com/12345');
    expect(info?.title).toBe('Open Clip');
    expect(info?.formats).toHaveLength(2);
    expect(info?.formats[0].formatId).toBe('720p');
    expect(info?.formats[0].filesize).toBe(20000000);
  });

  it('parses player-page HLS into per-quality variants with audio + sizes', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('oembed'))
        return Promise.resolve(
          jsonRes({ thumbnail_url: 'https://i.vimeocdn.com/oembed.jpg' })
        );
      if (url.includes('/config')) return Promise.resolve(jsonRes({}, false));
      if (url.includes('.m3u8')) return Promise.resolve(textRes(MASTER_M3U8));
      if (url.includes('player.vimeo.com/video/'))
        return Promise.resolve(textRes(playerPage(HLS_CFG)));
      return Promise.resolve(textRes(''));
    });

    const info = await getInfo('https://vimeo.com/12345/41fef537ea');
    expect(info?.title).toBe('KARUPY');
    expect(info?.thumbnail).toBe('https://i.vimeocdn.com/oembed.jpg');
    expect(info?.formats).toHaveLength(2);

    const top = info?.formats[0];
    expect(top?.formatId).toBe('1080p');
    expect(top?.url).toBe(
      'https://vod-adaptive.vimeocdn.com/video/1080/media.m3u8'
    );
    expect(top?.hlsAudioUrl).toBe(
      'https://vod-adaptive.vimeocdn.com/audio/media.m3u8'
    );
    expect(top?.isHls).toBe(true);
    expect(top?.vcodec).toBe('av1');
    expect(top?.filesize).toBeGreaterThan(200000000);
    expect(info?.formats[1].formatId).toBe('360p');
  });

  it('scrapes the page hash for a bare restricted url', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('oembed'))
        return Promise.resolve(
          jsonRes({ thumbnail_url: 'https://i.vimeocdn.com/oembed.jpg' })
        );
      if (url.includes('/config')) return Promise.resolve(jsonRes({}, false));
      if (url.includes('.m3u8')) return Promise.resolve(textRes(MASTER_M3U8));
      if (url.includes('player.vimeo.com/video/'))
        return Promise.resolve(textRes(playerPage(HLS_CFG)));
      return Promise.resolve(
        textRes(
          '<meta content="https://player.vimeo.com/video/12345?h=secret">'
        )
      );
    });

    const info = await getInfo('https://vimeo.com/12345');
    expect(info?.title).toBe('KARUPY');
    expect(info?.formats[0].formatId).toBe('1080p');
    expect(info?.formats[0].isHls).toBe(true);
  });

  it('returns null for a non-vimeo url', async () => {
    const info = await getInfo('https://example.com/watch?v=1');
    expect(info).toBeNull();
  });
});
