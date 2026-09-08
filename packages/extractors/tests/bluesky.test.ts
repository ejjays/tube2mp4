import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBlueskyExtractor } from '../src/bluesky.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const PLAYLIST = 'https://video.bsky.app/watch/did/cid/playlist.m3u8';

const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=3440800,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=720x1280
720p/video.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=655600,CODECS="avc1.64001e,mp4a.40.2",RESOLUTION=360x640
360p/video.m3u8`;

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

const threadWithVideo = (playlist: string, text = 'hello') => ({
  thread: {
    post: {
      record: { text },
      embed: {
        $type: 'app.bsky.embed.video#view',
        playlist,
        thumbnail: 'https://video.bsky.app/thumb.jpg',
        aspectRatio: { width: 720, height: 1280 },
      },
      author: { displayName: 'Test', handle: 't.bsky.social' },
    },
  },
});

describe('bluesky getInfo', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    env = { fetch: fetchSpy as unknown as typeof fetch };
  });

  it('builds multi-quality HLS formats with estimated filesize', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonRes({ did: 'did:plc:abc' }))
      .mockResolvedValueOnce(jsonRes(threadWithVideo(PLAYLIST)))
      .mockResolvedValueOnce(textRes(MASTER))
      // fetchDuration -> smallest variant playlist
      .mockResolvedValueOnce(
        textRes('#EXTINF:6.000,\nv0.ts\n#EXTINF:4.000,\nv1.ts')
      );

    const { getInfo } = createBlueskyExtractor(env);
    const info = await getInfo('https://bsky.app/profile/u.bsky.social/post/rkey');
    expect(info).not.toBeNull();
    expect(info?.extractorKey).toBe('bluesky');
    expect(info?.uploader).toBe('Test');
    expect(info?.duration).toBe(10);
    expect(info?.formats[0].formatId).toBe('720p');
    expect(info?.formats[0].isHls).toBe(true);
    expect(info?.formats[0].filesize).toBe(Math.round((3440800 / 8) * 10));
    expect(info?.downloadHeaders?.['User-Agent']).toBeDefined();
  });

  it('follows a quoted post to its video', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonRes({ did: 'did:plc:outer' }))
      .mockResolvedValueOnce(
        jsonRes({
          thread: {
            post: {
              record: {
                text: 'reply',
                embed: {
                  record: { uri: 'at://did:plc:q/app.bsky.feed.post/q1' },
                },
              },
              embed: { $type: 'app.bsky.embed.record#view' },
              author: { displayName: 'Outer' },
            },
          },
        })
      )
      .mockResolvedValueOnce(jsonRes(threadWithVideo(PLAYLIST, 'orig')))
      .mockResolvedValueOnce(textRes(MASTER))
      .mockResolvedValueOnce(textRes('#EXTINF:5.000,\na.ts'));

    const { getInfo } = createBlueskyExtractor(env);
    const info = await getInfo('https://bsky.app/profile/outer/post/x');
    expect(info?.title).toBe('reply');
    expect(info?.formats[0].formatId).toBe('720p');
  });

  it('throws noVideo when handle cannot resolve', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonRes({}))
      .mockResolvedValueOnce(jsonRes({ thread: {} }));
    const { getInfo } = createBlueskyExtractor(env);
    await expect(
      getInfo('https://bsky.app/profile/x/post/y')
    ).rejects.toThrow(/downloadable video/iu);
  });

  it('skipDurationFetch=true skips the duration round-trip', async () => {
    env.skipDurationFetch = true;
    fetchSpy
      .mockResolvedValueOnce(jsonRes({ did: 'did:plc:a' }))
      .mockResolvedValueOnce(jsonRes(threadWithVideo(PLAYLIST)))
      .mockResolvedValueOnce(textRes(MASTER));

    const { getInfo } = createBlueskyExtractor(env);
    const info = await getInfo('https://bsky.app/profile/x/post/y');
    expect(info?.duration).toBeUndefined();
    expect(info?.formats[0].filesize).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});