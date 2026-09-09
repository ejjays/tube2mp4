import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFacebookExtractor } from '../src/facebook/index.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const VIDEO_URL = 'https://video.fbcdn.net/v123.mp4';
const PAGE_URL = 'https://www.facebook.com/reel/abc123';

const PAGE_HTML = `<html><head>
<meta property="og:title" content="cool clip | Jane Doe">
<meta property="og:image" content="https://fbcdn.net/thumb.jpg">
</head><body>
<script type="application/json">{"browser_native_hd_url":"${VIDEO_URL}","message":{"text":"cool clip"},"owner":{"name":"Jane"}}</script>
</body></html>`;

function pageRes(html: string, url = PAGE_URL): Response {
  return {
    ok: true,
    status: 200,
    url,
    text: () => Promise.resolve(html),
    headers: { get: () => null },
  } as unknown as Response;
}

function headRes(len: string | null = '12345'): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k === 'content-length' ? len : null) },
  } as unknown as Response;
}

describe('facebook getInfo', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    env = {
      fetch: fetchSpy as unknown as typeof fetch,
      streamUrl: vi.fn(async () => new ReadableStream()) as unknown as ExtractorEnv['streamUrl'],
    };
  });

  it('builds formats from embedded json + probes filesize', async () => {
    fetchSpy.mockResolvedValueOnce(pageRes(PAGE_HTML)).mockResolvedValueOnce(headRes());
    const { getInfo } = createFacebookExtractor(env);
    const info = await getInfo(PAGE_URL);
    expect(info).not.toBeNull();
    expect(info?.extractorKey).toBe('facebook');
    expect(info?.formats[0].url).toBe(VIDEO_URL);
    expect(info?.formats[0].filesize).toBe(12345);
  });

  it('throws noVideo when page has no playable media', async () => {
    fetchSpy.mockResolvedValueOnce(pageRes('<html><body>no video here</body></html>'));
    const { getInfo } = createFacebookExtractor(env);
    await expect(getInfo(PAGE_URL)).rejects.toThrow(/facebook/iu);
  });

  it('getStream picks format by id via env.streamUrl', async () => {
    const { getStream } = createFacebookExtractor(env);
    await getStream(
      { formats: [{ formatId: 'hd', url: VIDEO_URL, extension: 'mp4', isMuxed: true, isVideo: true, isAudio: false }] } as never,
      { formatId: 'hd' }
    );
    expect(env.streamUrl).toHaveBeenCalledWith(VIDEO_URL, expect.objectContaining({ Referer: expect.stringContaining('facebook.com') }));
  });
});
