import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTwitchExtractor } from '../src/twitch.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const CLIP_URL = 'https://www.twitch.tv/streamer/clip/FunnyMoment-abc123';
const VOD_URL = 'https://www.twitch.tv/videos/123456789';

const CLIP_GQL = JSON.stringify([
  {
    data: {
      clip: {
        id: 'abc123',
        title: 'Funny moment',
        durationSeconds: 30,
        thumbnailURL: 'https://thumb.jpg',
        playbackAccessToken: { signature: 'sig', value: 'tok' },
        assets: [
          {
            aspectRatio: 1.78,
            thumbnailURL: 'https://thumb.jpg',
            videoQualities: [
              { quality: '720', frameRate: 60, sourceURL: 'https://cdn/720.mp4' },
              { quality: '480', frameRate: 30, sourceURL: 'https://cdn/480.mp4' },
            ],
          },
        ],
        broadcaster: { displayName: 'Streamer' },
        curator: { displayName: 'Clipper' },
      },
    },
  },
]);

const VOD_META = JSON.stringify([
  { data: { video: { id: '123456789', title: 'Full stream', lengthSeconds: 3600, previewThumbnailURL: 'https://vthumb.jpg', owner: { displayName: 'Streamer' } } } },
]);

const VOD_TOKEN = JSON.stringify([
  { data: { videoPlaybackAccessToken: { value: 'v', signature: 's' } } },
]);

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=8000000,AVERAGE-BANDWIDTH=7000000,RESOLUTION=1920x1080,FRAME-RATE=60.0,CODECS="avc1.640028,mp4a.40.2"
chunked/index-dvr.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,FRAME-RATE=30.0,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8`;

function gqlRes(body: string): Response {
  return { ok: true, status: 200, text: () => Promise.resolve(body), headers: { get: () => null } } as unknown as Response;
}
function textRes(body: string): Response {
  return { ok: true, status: 200, text: () => Promise.resolve(body), headers: { get: () => null } } as unknown as Response;
}
function headRes(): Response {
  return { ok: true, status: 200, headers: { get: () => '1000' } } as unknown as Response;
}

describe('twitch getInfo', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    env = {
      fetch: fetchSpy as unknown as typeof fetch,
      streamUrl: vi.fn(async () => new ReadableStream()) as unknown as ExtractorEnv['streamUrl'],
      remuxHls: vi.fn(async () => new ReadableStream()),
    };
  });

  it('extracts signed progressive clip formats', async () => {
    fetchSpy.mockResolvedValueOnce(gqlRes(CLIP_GQL)).mockResolvedValue(headRes()).mockResolvedValue(headRes());
    const { getInfo } = createTwitchExtractor(env);
    const info = await getInfo(CLIP_URL);
    expect(info?.extractorKey).toBe('twitch');
    expect(info?.uploader).toBe('Clipper');
    expect(info?.formats).toHaveLength(2);
    expect(info?.formats[0].url).toContain('sig=sig');
    expect(info?.formats[0].formatId).toBe('720');
    expect(info?.formats[0].filesize).toBe(1000);
  });

  it('parses clip.twitch.tv embed urls with extra query params', async () => {
    fetchSpy.mockResolvedValueOnce(gqlRes(CLIP_GQL)).mockResolvedValue(headRes()).mockResolvedValue(headRes());
    const { getInfo } = createTwitchExtractor(env);
    const info = await getInfo('https://clip.twitch.tv/embed?autoplay=true&clip=AbC123');
    expect(info?.formats).toHaveLength(2);
    expect(info?.formats[0].url).toContain('sig=sig');
  });

  it('parses schemeless clip links without regex backtracking', async () => {
    fetchSpy.mockResolvedValueOnce(gqlRes(CLIP_GQL)).mockResolvedValue(headRes()).mockResolvedValue(headRes());
    const { getInfo } = createTwitchExtractor(env);
    const info = await getInfo('clip.twitch.tv/embed?clip=AbC123&autoplay=true');
    expect(info?.formats).toHaveLength(2);
  });

  it('throws notFound when clip GQL returns null with HTTP 200', async () => {
    fetchSpy.mockResolvedValueOnce(gqlRes(JSON.stringify([{ data: { clip: null } }])));
    const { getInfo } = createTwitchExtractor(env);
    await expect(getInfo(CLIP_URL)).rejects.toThrow(/exist|removed/iu);
  });

  it('extracts VOD HLS formats via usher', async () => {
    fetchSpy
      .mockResolvedValueOnce(gqlRes(VOD_META))
      .mockResolvedValueOnce(gqlRes(VOD_TOKEN))
      .mockResolvedValueOnce(textRes(MASTER));
    const { getInfo } = createTwitchExtractor(env);
    const info = await getInfo(VOD_URL);
    expect(info?.title).toBe('Full stream');
    expect(info?.duration).toBe(3600);
    expect(info?.formats).toHaveLength(2);
    expect(info?.formats[0].isHls).toBe(true);
    expect(new URL(info?.formats[0].url ?? '').hostname).toBe('usher.ttvnw.net');
    const masterCall = fetchSpy.mock.calls.find(([u]) => {
      try {
        return new URL(String(u)).hostname === 'usher.ttvnw.net';
      } catch {
        return false;
      }
    });
    expect(String(masterCall?.[0])).toContain('sig=s');
  });

  it('emits onPartial for VOD before the token round-trip', async () => {
    const partials: unknown[] = [];
    fetchSpy
      .mockResolvedValueOnce(gqlRes(VOD_META))
      .mockResolvedValueOnce(gqlRes(VOD_TOKEN))
      .mockResolvedValueOnce(textRes(MASTER));
    const { getInfo } = createTwitchExtractor(env);
    await getInfo(VOD_URL, { onPartial: (p) => partials.push(p) });
    expect(partials).toHaveLength(1);
    expect((partials[0] as { isPartial: boolean }).isPartial).toBe(true);
  });
});
