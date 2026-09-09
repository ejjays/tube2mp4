import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { http, HttpResponse } from 'msw';
import { getInfo, getStream } from '../../src/services/extractors/bluesky.js';
import { server } from '../setup.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const stdout = new PassThrough();
    return { stdout, stdio: [null, stdout, new PassThrough()], on: vi.fn() };
  }),
}));
import { spawn } from 'node:child_process';

const POST_URL = 'https://bsky.app/profile/test.bsky.social/post/3mtest';
// colon-free path; msw reads ':' in a path as a route param
const PLAYLIST = 'https://video.bsky.app/hls/test123/bafytest/playlist.m3u8';
const MASTER = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=720x1280',
  '720p/video.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=360x640',
  '360p/video.m3u8',
].join('\n');

const thread = {
  thread: {
    post: {
      record: { text: 'hello bsky' },
      embed: {
        $type: 'app.bsky.embed.video#view',
        playlist: PLAYLIST,
        thumbnail: 'https://video.bsky.app/thumb.jpg',
        aspectRatio: { width: 720, height: 1280 },
      },
      author: { displayName: 'Test Author', handle: 'test.bsky.social' },
    },
  },
};

describe('Bluesky extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.use(
      http.get(
        'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle',
        () => HttpResponse.json({ did: 'did:plc:test123' })
      ),
      http.get(
        'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread',
        () => HttpResponse.json(thread)
      ),
      http.get(
        PLAYLIST,
        () =>
          new HttpResponse(MASTER, {
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
          })
      )
    );
  });

  it('resolves cdn hls into multi-quality variants', async () => {
    const info = await getInfo(POST_URL);
    expect(info).not.toBeNull();
    if (!info) return;
    expect(info.formats).toHaveLength(2);

    const top = info.formats[0];
    expect(top.formatId).toBe('720p');
    expect(top.resolution).toBe('720x1280');
    expect(top.url).toBe(
      'https://video.bsky.app/hls/test123/bafytest/720p/video.m3u8'
    );
    expect(top.isMuxed).toBe(true);
    expect(top.note).toBe('hls m3u8');
    expect(info.formats[1].formatId).toBe('360p');
    expect(info.uploader).toBe('Test Author');
  });

  it('getStream remuxes the selected hls variant via ffmpeg', async () => {
    const info = await getInfo(POST_URL);
    expect(info).not.toBeNull();
    if (!info) return;
    const stream = await getStream(info, { formatId: '720p' });
    expect(spawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining([
        'https://video.bsky.app/hls/test123/bafytest/720p/video.m3u8',
      ]),
      expect.anything()
    );
    stream.destroy();
  });

  it('returns null for a non-post URL', async () => {
    expect(
      await getInfo('https://bsky.app/profile/test.bsky.social')
    ).toBeNull();
  });
});
