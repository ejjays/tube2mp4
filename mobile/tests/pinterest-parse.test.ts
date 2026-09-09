import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/net', () => ({
  gatedFetch: vi.fn(),
}));

import { gatedFetch } from '../src/lib/net';
import { createPinterestExtractor, parsePinId } from '@phantom/extractors';
import { mobileSharedEnv } from '../src/extractors/shared/env';

const getInfo = (url: string) =>
  createPinterestExtractor(mobileSharedEnv).getInfo(url);

const mockFetch = vi.mocked(gatedFetch);

function jsonRes(body: unknown, ok = true, status?: number): Response {
  return {
    ok,
    status: status ?? (ok ? 200 : 403),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const VIDEO_LIST = {
  V_HLSV4: {
    url: 'https://v1.pinimg.com/videos/iht/hls/v2/9e/9d/3f/abc.m3u8',
    width: 720,
    height: 1280,
    duration: 18167,
    thumbnail: 'https://i.pinimg.com/videos/thumbnails/originals/abc.jpg',
  },
  V_720P: {
    url: 'https://v1.pinimg.com/videos/iht/expMp4/v2/9e/9d/3f/abc_720w.mp4',
    width: 720,
    height: 1280,
    duration: 18167,
    thumbnail: 'https://i.pinimg.com/videos/thumbnails/originals/abc.jpg',
  },
};

const VIDEO_PIN = {
  id: '424605071145308338',
  description: 'Spring baking ideas &#10084;&#65039; try these at home',
  is_video: true,
  pinner: { username: 'pinterest', full_name: 'Pinterest' },
  rich_metadata: { title: 'Ideas de reposter&#237;a' },
  videos: { video_list: VIDEO_LIST },
  story_pin_data: null,
};

const STORY_PIN = {
  id: '99',
  description: 'Idea pin walkthrough',
  is_video: false,
  pinner: { username: null, full_name: 'Creator Person' },
  videos: null,
  story_pin_data: {
    pages: [
      { blocks: [{ type: 'story_pin_text_block' }] },
      {
        blocks: [
          { type: 'story_pin_video_block', video: { video_list: VIDEO_LIST } },
        ],
      },
    ],
  },
};

const IMAGE_PIN = {
  id: '77',
  description: 'Just a pretty picture',
  is_video: false,
  pinner: { username: 'someone', full_name: 'Someone' },
  videos: null,
  story_pin_data: null,
};

function pidgets(pins: unknown[]): unknown {
  return { status: 'success', data: pins };
}

describe('pinterest parsePinId', () => {
  it('parses pin urls across intl domains', () => {
    expect(
      parsePinId('https://www.pinterest.com/pin/424605071145308338/')
    ).toBe('424605071145308338');
    expect(parsePinId('https://br.pinterest.com/pin/123456/')).toBe('123456');
    expect(parsePinId('https://www.pinterest.co.uk/pin/987654/')).toBe(
      '987654'
    );
    expect(
      parsePinId('https://www.pinterest.com/pin/some-seo-slug--123456/')
    ).toBe('123456');
    expect(parsePinId('https://example.com/pin/123/')).toBeNull();
  });
});

describe('pinterest getInfo', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('parses a video pin into mp4 formats with decoded metadata', async () => {
    mockFetch.mockResolvedValue(jsonRes(pidgets([VIDEO_PIN])));

    const info = await getInfo(
      'https://www.pinterest.com/pin/424605071145308338/'
    );
    expect(info?.extractorKey).toBe('pinterest');
    expect(info?.title).toBe('Ideas de repostería');
    expect(info?.uploader).toBe('Pinterest');
    expect(info?.duration).toBe(18);
    expect(info?.thumbnail).toContain('thumbnails');
    expect(info?.formats).toHaveLength(1);

    const top = info?.formats[0];
    expect(top?.formatId).toBe('1280p');
    expect(top?.url).toContain('.mp4');
    expect(top?.isMuxed).toBe(true);
    expect(top?.isHls).toBeUndefined();
    expect(info?.downloadHeaders?.Referer).toBe('https://www.pinterest.com/');
  });

  it('resolves pin.it short links through the redirect', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('pin.it')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          url: 'https://www.pinterest.com/pin/424605071145308338/sent/?invite_code=x',
        } as unknown as Response);
      }
      return Promise.resolve(jsonRes(pidgets([VIDEO_PIN])));
    });

    const info = await getInfo('https://pin.it/abc123XY');
    expect(info?.id).toBe('424605071145308338');
    expect(info?.webpageUrl).toBe(
      'https://www.pinterest.com/pin/424605071145308338/'
    );
  });

  it('digs the video out of an idea (story) pin', async () => {
    mockFetch.mockResolvedValue(jsonRes(pidgets([STORY_PIN])));

    const info = await getInfo('https://www.pinterest.com/pin/99/');
    expect(info?.uploader).toBe('Creator Person');
    expect(info?.formats.length).toBeGreaterThanOrEqual(1);
    expect(info?.formats[0].url).toContain('.mp4');
  });

  it('falls back to the hls master when no mp4 rendition exists', async () => {
    const hlsOnly = {
      ...VIDEO_PIN,
      videos: { video_list: { V_HLSV4: VIDEO_LIST.V_HLSV4 } },
    };
    mockFetch.mockResolvedValue(jsonRes(pidgets([hlsOnly])));

    const info = await getInfo('https://www.pinterest.com/pin/1/');
    expect(info?.formats).toHaveLength(1);
    expect(info?.formats[0].isHls).toBe(true);
    expect(info?.formats[0].hlsKeepAlive).toBe(true);
  });

  it('throws noVideo for an image-only pin', async () => {
    mockFetch.mockResolvedValue(jsonRes(pidgets([IMAGE_PIN])));

    await expect(
      getInfo('https://www.pinterest.com/pin/77/')
    ).rejects.toThrow(/couldn't find a downloadable/iu);
  });

  it('reports deleted/private pins as missing', async () => {
    mockFetch.mockResolvedValue(jsonRes(pidgets([])));

    await expect(
      getInfo('https://www.pinterest.com/pin/000/')
    ).rejects.toThrow(/doesn't exist|removed/iu);
  });

  it('maps http failures through fromStatus', async () => {
    mockFetch.mockResolvedValue(jsonRes({}, false, 429));

    await expect(
      getInfo('https://www.pinterest.com/pin/123/')
    ).rejects.toThrow(/busy right now/iu);
  });

  it('returns null for a non-pinterest url', async () => {
    const info = await getInfo('https://example.com/pin/123/');
    expect(info).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
