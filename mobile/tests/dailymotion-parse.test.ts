import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/net', () => ({
  gatedFetch: vi.fn(),
}));

import { gatedFetch } from '../src/lib/net';
import { createDailymotionExtractor } from '@phantom/extractors';
import { mobileSharedEnv } from '../src/extractors/shared/env';

const getInfo = (url: string) =>
  createDailymotionExtractor(mobileSharedEnv).getInfo(url);

const mockFetch = vi.mocked(gatedFetch);

function jsonRes(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 403,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}
function textRes(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 403,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const DM_META = {
  id: 'xaj923u',
  title: 'Cape Verde dream',
  duration: 28,
  owner: { screenname: 'beIN SPORTS', username: 'beinsports-ph' },
  thumbnails: {
    '60': 'https://s.dmcdn.net/60.jpg',
    '480': 'https://s.dmcdn.net/480.jpg',
  },
  qualities: {
    auto: [
      {
        type: 'application/x-mpegURL',
        url: 'https://cdndirector.dailymotion.com/cdn/manifest/video/xaj923u.m3u8?se=abc',
      },
    ],
  },
};

// dailymotion variants are muxed (each carries mp4a) -> no separate audio
const MASTER_M3U8 = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=400000,RESOLUTION=426x240,CODECS="avc1.42c015,mp4a.40.2"',
  'https://proxy-01.dailymotion.com/sec/240.m3u8',
  '#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1200000,RESOLUTION=854x480,CODECS="avc1.42c01e,mp4a.40.2"',
  'https://proxy-01.dailymotion.com/sec/480.m3u8',
  '#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
  'https://proxy-01.dailymotion.com/sec/720.m3u8',
].join('\n');

describe('dailymotion getInfo', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('parses metadata + hls master into per-quality muxed variants', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/player/metadata/video/')) {
        return Promise.resolve(jsonRes(DM_META));
      }
      if (url.includes('.m3u8')) return Promise.resolve(textRes(MASTER_M3U8));
      return Promise.resolve(textRes(''));
    });

    const info = await getInfo('https://www.dailymotion.com/video/xaj923u');
    expect(info?.title).toBe('Cape Verde dream');
    expect(info?.uploader).toBe('beIN SPORTS');
    expect(info?.duration).toBe(28);
    expect(info?.thumbnail).toBe('https://s.dmcdn.net/480.jpg');
    expect(info?.extractorKey).toBe('dailymotion');
    expect(info?.formats).toHaveLength(3);

    const top = info?.formats[0];
    expect(top?.formatId).toBe('720p');
    expect(top?.url).toBe('https://proxy-01.dailymotion.com/sec/720.m3u8');
    expect(top?.isHls).toBe(true);
    expect(top?.hlsAudioUrl).toBeUndefined();
    expect(info?.formats[2].formatId).toBe('240p');
  });

  it('resolves dai.ly + embed url forms', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/player/metadata/video/xaj923u')) {
        return Promise.resolve(jsonRes(DM_META));
      }
      if (url.includes('.m3u8')) return Promise.resolve(textRes(MASTER_M3U8));
      return Promise.resolve(textRes(''));
    });

    const short = await getInfo('https://dai.ly/xaj923u');
    expect(short?.formats[0].formatId).toBe('720p');
    const embed = await getInfo(
      'https://www.dailymotion.com/embed/video/xaj923u'
    );
    expect(embed?.formats[0].formatId).toBe('720p');
  });

  it('falls back to a single Auto format when the master is unreadable', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/player/metadata/video/')) {
        return Promise.resolve(jsonRes(DM_META));
      }
      if (url.includes('.m3u8')) return Promise.resolve(textRes('', false));
      return Promise.resolve(textRes(''));
    });

    const info = await getInfo('https://www.dailymotion.com/video/xaj923u');
    expect(info?.formats).toHaveLength(1);
    expect(info?.formats[0].formatId).toBe('auto');
    expect(info?.formats[0].isHls).toBe(true);
    expect(info?.formats[0].url).toContain('manifest/video/xaj923u.m3u8');
  });

  it('throws a clear message for publisher-restricted videos', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/player/metadata/video/')) {
        return Promise.resolve(
          jsonRes({
            title: 'Caesar Salad',
            error: { code: 'DM016', title: 'Content not Available' },
          })
        );
      }
      return Promise.resolve(textRes(''));
    });

    await expect(
      getInfo('https://www.dailymotion.com/video/xackctw')
    ).rejects.toThrow(/restricted/iu);
  });

  it('reports a missing video, not a restriction, for invalid ids', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/player/metadata/video/')) {
        return Promise.resolve(jsonRes({ error: { code: 404 } }));
      }
      return Promise.resolve(textRes(''));
    });

    await expect(
      getInfo('https://www.dailymotion.com/video/xinvalidzzz')
    ).rejects.toThrow(/doesn't exist|removed/iu);
  });

  it('returns null for a non-dailymotion url', async () => {
    const info = await getInfo('https://example.com/video/123');
    expect(info).toBeNull();
  });
});
