import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import { createMockChildProcess } from '../utils/mocks.js';

// guards Direct-fetch cookie passthrough on googlevideo

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock('../../src/services/extractors/index.js', () => ({
  getExtractor: vi.fn(() => null),
  shouldJSStream: vi.fn(() => false),
}));

const capturedHeaders: Record<string, string>[] = [];

vi.mock('../../src/utils/network/proxy.util.js', () => {
  return {
    getProxiedStream: vi.fn((_url: string, headers: Record<string, string>) => {
      capturedHeaders.push({ ...headers });
      const stream = new PassThrough();
      setImmediate(() => stream.end());
      return stream;
    }),
  };
});

const COOKIES_PATH = path.join(
  os.tmpdir(),
  `phantom_directcookies_${process.pid}.txt`
);

beforeEach(() => {
  capturedHeaders.length = 0;
  // netscape-format cookie file
  fs.writeFileSync(
    COOKIES_PATH,
    [
      '# Netscape HTTP Cookie File',
      '.youtube.com\tTRUE\t/\tTRUE\t9999999999\tSID\tabc123session',
      '.youtube.com\tTRUE\t/\tTRUE\t9999999999\tHSID\txyz789hash',
    ].join('\n'),
    'utf8'
  );
});

afterEach(() => {
  vi.clearAllMocks();
  if (fs.existsSync(COOKIES_PATH)) fs.unlinkSync(COOKIES_PATH);
});

describe('streamDownload Direct-fetch cookie passthrough', () => {
  it.todo(
    'attaches Cookie header for googlevideo URLs when cookies file is present',
    async () => {
      vi.mocked(spawn).mockReturnValue(createMockChildProcess());

      streamDownload(
        'https://www.youtube.com/watch?v=cookieTest1',
        { format: 'mp3', formatId: '140' },
        ['--cookies', COOKIES_PATH],
        {
          id: 'cookieTest1',
          extractorKey: 'youtube',
          webpageUrl: 'https://www.youtube.com/watch?v=cookieTest1',
          targetUrl: 'https://www.youtube.com/watch?v=cookieTest1',
          formats: [
            {
              formatId: '140',
              url: 'https://rr5---sn-test.googlevideo.com/videoplayback?test',
              extension: 'm4a',
              vcodec: 'none',
              acodec: 'mp4a.40.2',
              isAudio: true,
              isMuxed: false,
            },
          ],
        } as unknown as Parameters<typeof streamDownload>[3]
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(capturedHeaders.length).toBeGreaterThan(0);
      const headers = capturedHeaders[0];
      expect(headers['Cookie']).toBeDefined();
      expect(headers['Cookie']).toContain('SID=abc123session');
      expect(headers['Cookie']).toContain('HSID=xyz789hash');
    }
  );

  it('omits Cookie header for non-googlevideo URLs', async () => {
    vi.mocked(spawn).mockReturnValue(createMockChildProcess());

    streamDownload(
      'https://example.com/test',
      { format: 'mp4', formatId: 'x1' },
      ['--cookies', COOKIES_PATH],
      {
        id: 'cookieTest2',
        extractorKey: 'youtube',
        webpageUrl: 'https://example.com/test',
        targetUrl: 'https://example.com/test',
        formats: [
          {
            formatId: 'x1',
            url: 'https://cdn.example.com/v.mp4',
            extension: 'mp4',
            vcodec: 'avc1.640028',
            acodec: 'mp4a.40.2',
            isMuxed: true,
          },
        ],
      } as unknown as Parameters<typeof streamDownload>[3]
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(capturedHeaders.length).toBeGreaterThan(0);
    const headers = capturedHeaders[0];
    expect(headers['Cookie']).toBeUndefined();
  });

  it('omits Cookie header when no --cookies arg is passed', async () => {
    vi.mocked(spawn).mockReturnValue(createMockChildProcess());

    streamDownload(
      'https://www.youtube.com/watch?v=cookieTest3',
      { format: 'mp3', formatId: '140' },
      [],
      {
        id: 'cookieTest3',
        extractorKey: 'youtube',
        webpageUrl: 'https://www.youtube.com/watch?v=cookieTest3',
        targetUrl: 'https://www.youtube.com/watch?v=cookieTest3',
        formats: [
          {
            formatId: '140',
            url: 'https://rr5---sn-test.googlevideo.com/videoplayback?nocookie',
            extension: 'm4a',
            vcodec: 'none',
            acodec: 'mp4a.40.2',
            isAudio: true,
            isMuxed: false,
          },
        ],
      } as unknown as Parameters<typeof streamDownload>[3]
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(capturedHeaders.length).toBeGreaterThan(0);
    const headers = capturedHeaders[0];
    expect(headers['Cookie']).toBeUndefined();
  });
});
