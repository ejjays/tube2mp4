import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/net', () => ({
  gatedFetch: vi.fn(),
}));

import { gatedFetch } from '../src/lib/net';
import { createBlueskyExtractor } from '@phantom/extractors';
import { mobileSharedEnv } from '../src/extractors/shared/env';

const getInfo = (url: string) =>
  createBlueskyExtractor(mobileSharedEnv).getInfo(url);

const mockFetch = vi.mocked(gatedFetch);

function jsonRes(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}
function textRes(body: string): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const PLAYLIST =
  'https://video.bsky.app/watch/did%3Aplc%3Ax/cid123/playlist.m3u8';
const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=655600,CODECS="avc1.64001e,mp4a.40.2",RESOLUTION=360x640
360p/video.m3u8?session_id=s
#EXT-X-STREAM-INF:BANDWIDTH=3440800,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=720x1280
720p/video.m3u8?session_id=s`;

describe('bluesky getInfo (hls)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('builds multi-quality HLS formats from the cdn playlist', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes({ did: 'did:plc:x' }))
      .mockResolvedValueOnce(
        jsonRes({
          thread: {
            post: {
              record: { text: 'a clip' },
              embed: {
                $type: 'app.bsky.embed.video#view',
                playlist: PLAYLIST,
                thumbnail: 'https://video.bsky.app/watch/x/thumbnail.jpg',
                aspectRatio: { width: 720, height: 1280 },
              },
              author: { displayName: 'Jon' },
            },
          },
        })
      )
      .mockResolvedValueOnce(textRes(MASTER))
      .mockResolvedValueOnce(
        textRes('#EXTINF:6.000,\nvideo0.ts\n#EXTINF:4.000,\nvideo1.ts')
      );

    const info = await getInfo(
      'https://bsky.app/profile/jon.bsky.social/post/abc'
    );

    expect(info).not.toBeNull();
    expect(info?.extractorKey).toBe('bluesky');
    expect(info?.uploader).toBe('Jon');
    expect(info?.thumbnail).toContain('thumbnail.jpg');
    expect(info?.duration).toBe(10);
    expect(info?.formats).toHaveLength(2);
    const top = info?.formats[0];
    expect(top?.formatId).toBe('720p');
    expect(top?.isHls).toBe(true);
    expect(top?.resolution).toBe('720x1280');
    // estimated from peak bandwidth * duration
    expect(top?.filesize).toBe(Math.round((3440800 / 8) * 10));
    expect(top?.url).toBe(
      'https://video.bsky.app/watch/did%3Aplc%3Ax/cid123/720p/video.m3u8?session_id=s'
    );
  });

  it('follows a quoted post to its video view', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes({ did: 'did:plc:outer' }))
      .mockResolvedValueOnce(
        jsonRes({
          thread: {
            post: {
              record: {
                text: 'quote',
                embed: {
                  record: { uri: 'at://did:plc:q/app.bsky.feed.post/q1' },
                },
              },
              embed: { $type: 'app.bsky.embed.record#view' },
              author: { displayName: 'Quoter' },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonRes({
          thread: {
            post: {
              record: { text: 'orig' },
              embed: {
                $type: 'app.bsky.embed.video#view',
                playlist: PLAYLIST,
                aspectRatio: { width: 720, height: 1280 },
              },
            },
          },
        })
      )
      .mockResolvedValueOnce(textRes(MASTER));

    const info = await getInfo('https://bsky.app/profile/quoter/post/outer');
    expect(info).not.toBeNull();
    expect(info?.formats[0].formatId).toBe('720p');
    expect(info?.formats[0].isHls).toBe(true);
  });

  it('throws when the post has no video view', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes({ did: 'did:plc:x' }))
      .mockResolvedValueOnce(
        jsonRes({
          thread: {
            post: {
              record: { text: 'text only' },
              embed: { $type: 'app.bsky.embed.images#view' },
            },
          },
        })
      );

    await expect(getInfo('https://bsky.app/profile/x/post/t')).rejects.toThrow(
      /downloadable video/iu
    );
  });
});
