import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/net', () => ({
  gatedFetch: vi.fn(),
}));

import { gatedFetch } from '../src/lib/net';
import { createTikTokExtractor } from '@phantom/extractors';
import { mobileSharedEnv } from '../src/extractors/shared/env';

const getInfo = (url: string) =>
  createTikTokExtractor(mobileSharedEnv).getInfo(url);

const mockFetch = vi.mocked(gatedFetch);

type FakeResponseInit = {
  setCookie?: string | null;
  text?: string;
  url?: string;
};

function fakeResponse(init: FakeResponseInit): Response {
  const { setCookie = null, text = '', url = 'https://www.tiktok.com/' } = init;
  const response = {
    ok: true,
    status: 200,
    url,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'set-cookie' ? setCookie : null,
    },
    text: () => Promise.resolve(text),
  };
  return response as unknown as Response;
}

const itemStruct = {
  id: '7123',
  desc: 'a tiktok video',
  author: { uniqueId: 'creator', nickname: 'Creator' },
  video: {
    duration: 12,
    width: 720,
    height: 1280,
    cover: 'https://p16.tiktokcdn.com/cover.jpg',
    bitrateInfo: [
      {
        Bitrate: 1200000,
        GearName: 'normal_720_0',
        CodecType: 'h264',
        PlayAddr: {
          Width: 720,
          Height: 1280,
          DataSize: 4500000,
          UrlList: ['https://v16-webapp.tiktok.com/video.mp4'],
        },
      },
    ],
  },
};

const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
  { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct } } } }
)}</script>`;

describe('tiktok getInfo downloadHeaders', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('signs the cdn download with UA, referer and cookie', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeResponse({
        setCookie: 'ttwid=page123; Path=/',
        text: html,
        url: 'https://www.tiktok.com/@creator/video/7123',
      })
    );

    const info = await getInfo('https://vt.tiktok.com/ZSC2N49FD/');

    expect(info).not.toBeNull();
    const headers: Record<string, string> = info?.downloadHeaders ?? {};
    expect(headers['User-Agent']).toContain('Mozilla/5.0');
    expect(headers.Referer).toBe('https://www.tiktok.com/');
    expect(headers.Cookie).toContain('ttwid=page123');
  });
});
