import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { http, HttpResponse } from 'msw';
import { getInfo, getStream } from '../../src/services/extractors/x.js';
import { server } from '../setup.js';

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(() => new PassThrough()),
}));
import { getProxiedStream } from '../../src/utils/network/proxy.util.js';

const tweetJson = {
  text: 'lol check this https://t.co/abc123',
  user: { name: 'Test User', screen_name: 'testuser' },
  mediaDetails: [
    {
      type: 'video',
      media_url_https: 'https://pbs.twimg.com/thumb.jpg',
      video_info: {
        variants: [
          {
            content_type: 'application/x-mpegURL',
            url: 'https://video.twimg.com/x.m3u8',
          },
          {
            content_type: 'video/mp4',
            bitrate: 632000,
            url: 'https://video.twimg.com/ext/720x1280/v.mp4',
          },
          {
            content_type: 'video/mp4',
            bitrate: 256000,
            url: 'https://video.twimg.com/ext/320x568/v.mp4',
          },
        ],
      },
    },
  ],
};

const TWEET_URL = 'https://x.com/testuser/status/123456?s=20';

describe('X (Twitter) extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.use(
      http.get('https://cdn.syndication.twimg.com/tweet-result', () =>
        HttpResponse.json(tweetJson)
      ),
      http.head(
        /video\.twimg\.com/u,
        () =>
          new HttpResponse(null, { headers: { 'content-length': '5000000' } })
      )
    );
  });

  it('builds a muxed mp4 ladder (HLS filtered) with caption + author', async () => {
    const info = await getInfo(TWEET_URL);
    expect(info).not.toBeNull();
    if (!info) return;
    expect(info.formats).toHaveLength(2); // m3u8 dropped
    for (const format of info.formats) {
      expect(format.extension).toBe('mp4');
      expect(format.isMuxed).toBe(true);
      expect(format.isAudio).toBe(false);
    }
    expect(info.formats.map((format) => format.quality)).toEqual([
      '720p',
      '320p',
    ]);
    expect(info.formats[0].filesize).toBe(5000000);
    expect(info.title).toBe('lol check this'); // t.co stripped
    expect(info.uploader).toBe('Test User');
  });

  it('getStream selects the requested formatId with x referer', async () => {
    const info = await getInfo(TWEET_URL);
    expect(info).not.toBeNull();
    if (!info) return;
    const stream = await getStream(info, { formatId: '320p' });
    expect(getProxiedStream).toHaveBeenCalledWith(
      'https://video.twimg.com/ext/320x568/v.mp4',
      expect.objectContaining({ Referer: 'https://x.com/' })
    );
    stream.destroy();
  });

  it('returns null for a non-status URL', async () => {
    expect(await getInfo('https://x.com/testuser')).toBeNull();
  });
});
