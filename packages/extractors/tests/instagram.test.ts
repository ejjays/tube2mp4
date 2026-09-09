import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInstagramExtractor,
  extractShortcode,
  shortcodeToMediaId,
  parseDashManifest,
  parseEmbed,
  parseLoggedOutProduct,
} from '../src/instagram/index.js';
import type { ExtractorEnv } from '../src/shared/env.js';

const SHORTCODE = 'DBc-X0Xv9lv';
const PAGE_URL = `https://www.instagram.com/p/${SHORTCODE}/`;
const CDN = 'https://cdn.test/video.mp4';

const mobileItem = {
  code: SHORTCODE,
  pk: '123',
  caption: { text: 'hello world' },
  user: { full_name: 'Jane', username: 'jane' },
  image_versions2: { candidates: [{ url: 'https://cdn.test/thumb.jpg' }] },
  video_versions: [{ url: CDN, width: 720, height: 1280 }],
};

function jsonRes(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: { get: () => null, getSetCookie: () => [] },
  } as unknown as Response;
}

function htmlRes(html: string): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(html),
    headers: { get: () => null, getSetCookie: () => [] },
  } as unknown as Response;
}

describe('instagram pure helpers', () => {
  it.each([
    ['https://www.instagram.com/p/ABC123/', 'ABC123'],
    ['https://www.instagram.com/reel/XYZ-9_/', 'XYZ-9_'],
    ['https://www.instagram.com/tv/Hello1/', 'Hello1'],
    ['https://www.instagram.com/explore/', null],
  ])('extractShortcode(%s) -> %s', (url, expected) => {
    expect(extractShortcode(url)).toBe(expected);
  });

  it('shortcodeToMediaId decodes the classic shortcode', () => {
    expect(shortcodeToMediaId('B')).toBe('1');
    expect(shortcodeToMediaId('')).toBe('');
    expect(shortcodeToMediaId('!!!')).toBe('');
  });

  it('parseDashManifest splits best audio + deduped videos', () => {
    const manifest = [
      '<Representation bandwidth="100" width="640" height="640"><BaseURL>https://cdn.test/a.mp4</BaseURL></Representation>',
      '<Representation bandwidth="200" width="640" height="640"><BaseURL>https://cdn.test/a-dup.mp4</BaseURL></Representation>',
      '<Representation bandwidth="96000" mimeType="audio/mp4"><BaseURL>https://cdn.test/audio.mp4</BaseURL></Representation>',
    ].join('');
    const parsed = parseDashManifest(manifest);
    expect(parsed.videos).toHaveLength(1);
    expect(parsed.audioUrl).toBe('https://cdn.test/audio.mp4');
  });

  it('parseEmbed falls back to video_url regex', () => {
    const html = '<html><head><meta property="og:title" content="My Reel" /></head><body>{"video_url":"https://cdn.test/e.mp4"}</body></html>';
    const parsed = parseEmbed(html);
    expect(parsed?.media[0].url).toBe('https://cdn.test/e.mp4');
    expect(parseEmbed('<html></html>')).toBeNull();
  });

  it('parseEmbed reads the init contextJSON without regex backtracking', () => {
    const node = {
      shortcode: 'CTX123',
      video_url: 'https://cdn.test/ctx.mp4',
      display_url: 'https://cdn.test/ctx.jpg',
      dimensions: { width: 640, height: 640 },
      edge_media_to_caption: { edges: [{ node: { text: 'ctx caption [brackets]' } }] },
      owner: { username: 'ctx_user' },
    };
    const html = `<html><body>"init",[],[{"contextJSON":${JSON.stringify(JSON.stringify({ gql_data: { shortcode_media: node } }))}}]],</body></html>`;
    const parsed = parseEmbed(html);
    expect(parsed?.id).toBe('CTX123');
    expect(parsed?.title).toBe('ctx caption [brackets]');
    expect(parsed?.media[0].url).toBe('https://cdn.test/ctx.mp4');
  });

  it('parseLoggedOutProduct maps product to parsed media', () => {
    const parsed = parseLoggedOutProduct(mobileItem);
    expect(parsed?.id).toBe(SHORTCODE);
    expect(parsed?.media[0].url).toBe(CDN);
    expect(parseLoggedOutProduct(null)).toBeNull();
  });
});

describe('instagram getInfo', () => {
  let env: ExtractorEnv;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    env = {
      fetch: fetchSpy as unknown as typeof fetch,
      streamUrl: vi.fn(async () => new ReadableStream()) as unknown as ExtractorEnv['streamUrl'],
    };
  });

  it('resolves via mobile api when a cookie is supplied', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonRes({ media_id: '123' }))
      .mockResolvedValueOnce(jsonRes({ items: [mobileItem] }))
      .mockResolvedValue(
        new Response(null, { status: 404 }) as unknown as Response
      );
    const { getInfo } = createInstagramExtractor(env);
    const info = await getInfo(PAGE_URL, { cookie: 'sessionid=abc' });
    expect(info?.formats[0].url).toBe(CDN);
    expect(info?.extractorKey).toBe('instagram');
    expect(fetchSpy.mock.calls[0][0]).toContain('/oembed/');
    expect(fetchSpy.mock.calls[1][0]).toContain('/api/v1/media/');
  });

  it('falls back to embed when shortcode paths miss', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/graphql')) return jsonRes({ data: {} });
      if (String(url).includes('/graphql/query')) return jsonRes({ data: {} });
      if (String(url).includes('/embed/captioned/')) {
        return htmlRes('{"video_url":"https://cdn.test/e.mp4"}');
      }
      return htmlRes('<html>["LSD",[],{"token":"x"},1]</html>');
    });
    const { getInfo } = createInstagramExtractor(env);
    const info = await getInfo(PAGE_URL);
    expect(info?.formats[0].url).toBe('https://cdn.test/e.mp4');
  });

  it('getStream forwards the chosen format to env.streamUrl', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonRes({ media_id: '123' }))
      .mockResolvedValueOnce(jsonRes({ items: [mobileItem] }))
      .mockResolvedValue(
        new Response(null, { status: 404 }) as unknown as Response
      );
    const { getInfo, getStream } = createInstagramExtractor(env);
    const info = await getInfo(PAGE_URL, { cookie: 'sessionid=abc' });
    await expect(
      getStream(info as never, { formatId: info?.formats[0].formatId })
    ).resolves.toBeInstanceOf(ReadableStream);
  });
});
