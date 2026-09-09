import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSoundCloudExtractor } from '../src/soundcloud.js';
import type { ExtractorEnv } from '../src/shared/env.js';
import type { SoundCloudDrmMeta } from '../src/soundcloud.js';

const TRACK_URL = 'https://soundcloud.com/artist/track';

const trackBody = (overrides = {}) => ({
  id: 123,
  title: 'Hit Song',
  duration: 200000,
  full_duration: 200000,
  user: { username: 'Artist', avatar_url: 'https://art-large.jpg' },
  artwork_url: 'https://artwork-large.jpg',
  publisher_metadata: {
    isrc: 'USABC1234567',
    artist: 'Artist',
    release_title: 'Hit Song',
    album_title: 'Album',
  },
  media: {
    transcodings: [
      {
        url: 'https://api/transcode/progressive',
        format: { protocol: 'progressive', mime_type: 'audio/mpeg' },
      },
    ],
  },
  ...overrides,
});

function htmlRes(html: string): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(html),
    headers: { get: () => null },
  } as unknown as Response;
}
function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('soundcloud getInfo', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  let extractor: ReturnType<typeof createSoundCloudExtractor>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    env = {
      fetch: fetchSpy as unknown as typeof fetch,
      streamUrl: vi.fn(
        async () => new ReadableStream()
      ) as unknown as ExtractorEnv['streamUrl'],
    };
    extractor = createSoundCloudExtractor(env);
  });

  it('resolves a progressive track to mp3', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        htmlRes(
          '<script src="https://a1.sndcdn.com/assets/app-abc.js"></script>'
        )
      )
      .mockResolvedValueOnce(
        htmlRes('client_id:"0123456789abcdef0123456789abcdef"')
      )
      .mockResolvedValueOnce(jsonRes(trackBody()))
      .mockResolvedValueOnce(jsonRes({ url: 'https://cf-hls/audio.mp3' }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => '424242' },
      } as unknown as Response);
    const { getInfo } = extractor;
    const info = await getInfo(TRACK_URL);
    expect(info?.formats[0].extension).toBe('mp3');
    expect(info?.formats[0].filesize).toBe(424242);
    expect(info?.thumbnail).toContain('-t500x500');
  });

  it('attaches trackMeta to the DRM error for the mobile ISRC fallback', async () => {
    const drmTrack = trackBody({
      media: {
        transcodings: [
          {
            url: 'https://api/t',
            format: { protocol: 'encrypted', mime_type: 'audio/mpeg' },
          },
        ],
      },
    });
    fetchSpy
      .mockResolvedValueOnce(
        htmlRes(
          '<script src="https://a1.sndcdn.com/assets/app-abc.js"></script>'
        )
      )
      .mockResolvedValueOnce(
        htmlRes('client_id:"0123456789abcdef0123456789abcdef"')
      )
      .mockResolvedValueOnce(jsonRes(drmTrack));
    const { getInfo } = extractor;
    const err = (await getInfo(TRACK_URL).catch((e) => e)) as Error & {
      trackMeta?: SoundCloudDrmMeta;
    };
    expect(err.message).toMatch(/DRM-protected/iu);
    expect(err.trackMeta?.isrc).toBe('USABC1234567');
    expect(err.trackMeta?.artist).toBe('Artist');
  });

  it('throws a preview-only error for snippet tracks', async () => {
    const snippet = trackBody({
      policy: 'SNIPPET',
      duration: 30000,
      full_duration: 200000,
    });
    fetchSpy
      .mockResolvedValueOnce(
        htmlRes(
          '<script src="https://a1.sndcdn.com/assets/app-abc.js"></script>'
        )
      )
      .mockResolvedValueOnce(
        htmlRes('client_id:"0123456789abcdef0123456789abcdef"')
      )
      .mockResolvedValueOnce(jsonRes(snippet));
    const { getInfo } = extractor;
    await expect(getInfo(TRACK_URL)).rejects.toThrow(/preview only/iu);
  });
});
