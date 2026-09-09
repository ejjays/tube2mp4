import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRedditExtractor } from '../src/reddit.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const POST_ID = 'abc123';
const PAGE_URL = `https://www.reddit.com/r/test/comments/${POST_ID}/title/`;

const POST_JSON = JSON.stringify([
  {
    data: {
      children: [
        {
          data: {
            title: 'Test video',
            author: 'tester',
            thumbnail: 'https://thumb.jpg',
            is_video: true,
            secure_media: {
              reddit_video: {
                fallback_url: 'https://v.redd.it/vid123/DASH_720.mp4',
              },
            },
            preview: { images: [{ source: { url: 'https://preview.jpg' } }] },
          },
        },
      ],
    },
  },
]);

const MPD = `<MPD mediaPresentationDuration="PT1M10S"><Period><AdaptationSet>
<Representation bandwidth="1000000" width="1280" height="720"><BaseURL>DASH_720.mp4</BaseURL></Representation>
<Representation bandwidth="128000"><BaseURL>DASH_audio.mp4</BaseURL></Representation>
</AdaptationSet></Period></MPD>`;

function jsonRes(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: PAGE_URL,
    text: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}
function textRes(body: string): Response {
  return {
    ok: true,
    status: 200,
    url: PAGE_URL,
    text: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}
function sessionRes(): Response {
  return {
    ok: true,
    status: 200,
    url: PAGE_URL,
    text: () => Promise.resolve('<html></html>'),
    headers: {
      get: (k: string) =>
        k === 'set-cookie'
          ? 'loid=abc123; Path=/, session_tracker=xyz; Path=/'
          : null,
    },
  } as unknown as Response;
}

describe('reddit session handling', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  let extractor: ReturnType<typeof createRedditExtractor>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    env = {
      fetch: fetchSpy as unknown as typeof fetch,
      streamUrl: vi.fn(
        async () => new ReadableStream()
      ) as unknown as ExtractorEnv['streamUrl'],
    };
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as never);
    extractor = createRedditExtractor(env);
  });

  it('harvests a session jar and sends it as Cookie on json fetch', async () => {
    fetchSpy
      .mockResolvedValueOnce(sessionRes())
      .mockResolvedValueOnce(jsonRes(POST_JSON))
      .mockResolvedValueOnce(textRes(MPD));
    const { getInfo } = extractor;
    const info = await getInfo(PAGE_URL);
    expect(info).not.toBeNull();
    expect(info?.formats.length).toBeGreaterThan(0);
    const jsonCall = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes('.json')
    );
    expect(jsonCall?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Cookie: expect.stringContaining('loid=abc123'),
      }),
    });
  });

  it('retries with a fresh session after a 403 challenge', async () => {
    fetchSpy
      .mockResolvedValueOnce(sessionRes())
      .mockResolvedValueOnce(jsonRes('blocked', 403))
      .mockResolvedValueOnce(sessionRes())
      .mockResolvedValueOnce(jsonRes(POST_JSON))
      .mockResolvedValueOnce(textRes(MPD));
    const { getInfo } = extractor;
    const info = await getInfo(PAGE_URL);
    expect(info?.id).toBe(POST_ID);
  });

  it('returns null for a true non-video post without retry storm', async () => {
    const imagePost = JSON.stringify([
      {
        data: {
          children: [{ data: { title: 'pic', author: 'u', is_video: false } }],
        },
      },
    ]);
    fetchSpy
      .mockResolvedValueOnce(sessionRes())
      .mockResolvedValueOnce(jsonRes(imagePost));
    const { getInfo } = extractor;
    await expect(getInfo(PAGE_URL)).rejects.toThrow(/reddit/iu);
    expect(
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes('.json')).length
    ).toBe(1);
  });
});
