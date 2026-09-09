import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVimeoExtractor } from '../src/vimeo.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const PROGRESSIVE = [
  { quality: '360p', width: 640, height: 360, url: 'https://vod.vimeocdn.com/360.mp4' },
  { quality: '720p', width: 1280, height: 720, url: 'https://vod.vimeocdn.com/720.mp4' },
];

const HLS_CFG = {
  video: {
    id: 12345,
    title: 'HLS Clip',
    duration: 600,
    owner: { name: 'Owner' },
    thumbs: {},
  },
  request: {
    files: {
      progressive: [],
      hls: {
        default_cdn: 'akfire',
        cdns: { akfire: { url: 'https://vod-adaptive.vimeocdn.com/master.m3u8' } },
      },
    },
  },
};

const MASTER = [
  '#EXTM3U',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/media.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=4096701,RESOLUTION=1620x1080',
  'video/1080/media.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=632969,RESOLUTION=540x360',
  'video/360/media.m3u8',
].join('\n');

const playerPage = (cfg: unknown) =>
  `<!doctype html><html><body><script>window.playerConfig = ${JSON.stringify(cfg)};</script></body></html>`;

function jsonRes(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 403, json: () => Promise.resolve(body) } as unknown as Response;
}
function textRes(body: string, ok = true): Response {
  return { ok, status: ok ? 200 : 403, text: () => Promise.resolve(body) } as unknown as Response;
}

describe('vimeo getInfo', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    env = { fetch: fetchSpy as unknown as typeof fetch };
  });

  it('extracts progressive mp4 from /config endpoint', async () => {
    fetchSpy.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/config')) {
        return Promise.resolve(
          jsonRes({
            video: {
              id: 12345,
              title: 'Open Clip',
              duration: 60,
              owner: { name: 'Owner' },
              thumbs: { '1280': 'https://i.vimeocdn.com/1280.jpg' },
            },
            request: {
              files: {
                progressive: PROGRESSIVE,
                hls: { default_cdn: 'x', cdns: {} },
              },
            },
          })
        );
      }
      return Promise.resolve(textRes(''));
    });

    const { getInfo } = createVimeoExtractor(env);
    const info = await getInfo('https://vimeo.com/12345');
    expect(info?.title).toBe('Open Clip');
    expect(info?.formats).toHaveLength(2);
    expect(info?.formats[0].formatId).toBe('720p');
    expect(info?.thumbnail).toContain('1280.jpg');
  });

  it('falls back to player-page HLS variants when config has no progressive', async () => {
    fetchSpy.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/config')) return Promise.resolve(jsonRes({}, false));
      if (u.includes('.m3u8')) return Promise.resolve(textRes(MASTER));
      if (u.includes('player.vimeo.com/video/'))
        return Promise.resolve(textRes(playerPage(HLS_CFG)));
      return Promise.resolve(textRes(''));
    });

    const { getInfo } = createVimeoExtractor(env);
    const info = await getInfo('https://vimeo.com/12345/secret');
    expect(info?.title).toBe('HLS Clip');
    expect(info?.formats[0].formatId).toBe('1080p');
    expect(info?.formats[0].isHls).toBe(true);
    expect(info?.formats[0].hlsAudioUrl).toContain('audio/media.m3u8');
    expect(info?.formats[0].filesize).toBeGreaterThan(0);
  });

  it('falls back to oembed/og-image thumb when config thumbs empty', async () => {
    fetchSpy.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/config')) return Promise.resolve(jsonRes({}, false));
      if (u.includes('.m3u8')) return Promise.resolve(textRes(MASTER));
      if (u.includes('player.vimeo.com/video/'))
        return Promise.resolve(textRes(playerPage(HLS_CFG)));
      return Promise.resolve(textRes(''));
    });

    const oembedSpy = vi.fn(async () => 'https://i.vimeocdn.com/oembed.jpg');
    env.oembedThumb = oembedSpy;

    const { getInfo } = createVimeoExtractor(env);
    const info = await getInfo('https://vimeo.com/12345/secret');
    expect(info?.thumbnail).toBe('https://i.vimeocdn.com/oembed.jpg');
    expect(oembedSpy).toHaveBeenCalledOnce();
  });

  it('returns null for non-vimeo urls', async () => {
    const { getInfo } = createVimeoExtractor(env);
    expect(await getInfo('https://example.com/12345')).toBeNull();
  });
});