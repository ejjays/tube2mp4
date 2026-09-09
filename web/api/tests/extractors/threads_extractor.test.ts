import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getInfo,
  getStream,
} from '../../src/services/extractors/threads/index.js';
import { Readable } from 'node:stream';
import { VideoInfo } from '../../src/types/index.js';

const POST_URL = 'https://www.threads.com/@tester/post/ABC123';

const videoHtml = `<html><body><script type="application/json" data-sjs>${JSON.stringify(
  {
    code: 'ABC123',
    caption: { text: 'a threads video' },
    user: { full_name: 'Tester', username: 'tester' },
    image_versions2: {
      candidates: [
        { width: 720, url: 'https://scontent.cdninstagram.com/t.jpg' },
      ],
    },
    video_versions: [
      {
        width: 720,
        height: 1280,
        url: 'https://scontent.cdninstagram.com/v.mp4',
      },
    ],
  }
)}</script></body></html>`;

// login-walled shell: no media, no og
const walledHtml =
  '<html><head><title>Threads</title></head><body>log in to continue</body></html>';

const htmlResponse = (html: string, url: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(html),
    headers: { get: () => 'text/html' },
    url,
  } as unknown as Response);

const sizeResponse = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name === 'content-length' ? '2048000' : null),
    },
  } as unknown as Response);

describe('Threads JS Extractor getInfo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts video media from the primary post page', async () => {
    global.fetch = vi
      .fn()
      .mockImplementation((reqUrl: string, init?: RequestInit) => {
        if (init?.method === 'HEAD') return sizeResponse();
        return htmlResponse(videoHtml, reqUrl);
      });

    const info = (await getInfo(POST_URL, {
      cookie: 'sessionid=x',
    })) as VideoInfo;
    expect(info).not.toBeNull();
    expect(info.extractorKey).toBe('threads');
    expect(info.uploader).toBe('Tester');
    expect(info.thumbnail).toContain('t.jpg');
    expect(info.formats.some((format) => format.formatId === 'hd')).toBe(true);
    expect(info.formats[0].url).toContain('v.mp4');
    expect(info.formats[0].filesize).toBe(2048000);
  });

  it('falls back to the /embed endpoint when the main page is walled', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((reqUrl: string, init?: RequestInit) => {
        if (init?.method === 'HEAD') return sizeResponse();
        if (reqUrl.includes('/embed')) return htmlResponse(videoHtml, reqUrl);
        return htmlResponse(walledHtml, reqUrl);
      });
    global.fetch = fetchMock;

    const info = (await getInfo(POST_URL)) as VideoInfo;
    expect(info).not.toBeNull();
    expect(info.formats.some((format) => format.formatId === 'hd')).toBe(true);
    // proves the embed path was taken
    const hitEmbed = fetchMock.mock.calls.some(([called]) =>
      String(called).includes('/embed')
    );
    expect(hitEmbed).toBe(true);
  });

  it('returns null when both the page and embed are walled', async () => {
    global.fetch = vi
      .fn()
      .mockImplementation((reqUrl: string, init?: RequestInit) => {
        if (init?.method === 'HEAD') return sizeResponse();
        return htmlResponse(walledHtml, reqUrl);
      });

    const info = await getInfo(POST_URL);
    expect(info).toBeNull();
  });

  it('initiates a pure-JS stream for a resolved format', async () => {
    global.fetch = vi
      .fn()
      .mockImplementation((reqUrl: string, init?: RequestInit) => {
        if (init?.method === 'HEAD') return sizeResponse();
        return htmlResponse(videoHtml, reqUrl);
      });

    const info = (await getInfo(POST_URL)) as VideoInfo;
    const stream = await getStream(info, {
      formatId: info.formats[0].formatId,
    });
    expect(stream).toBeInstanceOf(Readable);
    stream.destroy();
  });
});
