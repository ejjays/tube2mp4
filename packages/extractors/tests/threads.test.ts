import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createThreadsExtractor } from '../src/threads/index.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const VIDEO_URL = 'https://video.twimg.com/threads/v1.mp4';
const PAGE_URL = 'https://www.threads.com/@user/post/ABC123';

const PAGE_HTML = `<html><head>
<meta property="og:description" content="funny clip">
<meta property="og:title" content="User (@user)">
<meta property="og:image" content="https://threads.net/thumb.jpg">
<meta property="og:video" content="${VIDEO_URL}">
</head><body></body></html>`;

function pageRes(html: string, url = PAGE_URL): Response {
  return {
    ok: true,
    status: 200,
    url,
    text: () => Promise.resolve(html),
    headers: { get: () => null },
  } as unknown as Response;
}

function headRes(): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => '9999' },
  } as unknown as Response;
}

describe('threads getInfo', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    env = {
      fetch: fetchSpy as unknown as typeof fetch,
      streamUrl: vi.fn(async () => new ReadableStream()) as unknown as ExtractorEnv['streamUrl'],
    };
  });

  it('builds formats from og:video', async () => {
    fetchSpy.mockResolvedValueOnce(pageRes(PAGE_HTML)).mockResolvedValueOnce(headRes());
    const { getInfo } = createThreadsExtractor(env);
    const info = await getInfo(PAGE_URL);
    expect(info).not.toBeNull();
    expect(info?.extractorKey).toBe('threads');
    expect(info?.formats[0].url).toBe(VIDEO_URL);
    expect(info?.formats[0].filesize).toBe(9999);
  });

  it('falls back to /embed when primary page is walled', async () => {
    fetchSpy
      .mockResolvedValueOnce(pageRes('<html><body>login required</body></html>'))
      .mockResolvedValueOnce(pageRes(PAGE_HTML, `${PAGE_URL}/embed`))
      .mockResolvedValueOnce(headRes());
    const { getInfo } = createThreadsExtractor(env);
    const info = await getInfo(PAGE_URL);
    expect(info?.formats[0].url).toBe(VIDEO_URL);
    expect(fetchSpy.mock.calls[1][0]).toContain('/embed');
  });

  it('trims trailing slashes when building the embed fallback', async () => {
    fetchSpy
      .mockResolvedValueOnce(pageRes('<html></html>'))
      .mockResolvedValueOnce(pageRes(PAGE_HTML, `${PAGE_URL}/embed`))
      .mockResolvedValueOnce(headRes());
    const { getInfo } = createThreadsExtractor(env);
    const info = await getInfo(`${PAGE_URL}/?x=1`);
    expect(info?.formats[0].url).toBe(VIDEO_URL);
    const embedCall = fetchSpy.mock.calls.find(([u]) => String(u).includes('/embed'));
    expect(String(embedCall?.[0])).toBe(`${PAGE_URL}/embed`);
  });

  it('throws noVideo when both primary and embed are empty', async () => {
    fetchSpy
      .mockResolvedValueOnce(pageRes('<html></html>'))
      .mockResolvedValueOnce(pageRes('<html></html>'));
    const { getInfo } = createThreadsExtractor(env);
    await expect(getInfo(PAGE_URL)).rejects.toThrow(/threads/iu);
  });
});
