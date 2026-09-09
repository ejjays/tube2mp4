import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';

interface CapturedOpts {
  urlProvider: () => Promise<{ url: string; headers?: Record<string, string> }>;
  transplant?: () => Promise<void>;
  controller?: AbortController;
  service?: string;
}

let capturedOpts: CapturedOpts | null = null;

function getCaptured(): CapturedOpts {
  if (!capturedOpts) throw new Error('fetchChunked was not invoked');
  return capturedOpts;
}

vi.mock('../../src/services/ytdlp/chunked-fetcher.js', () => ({
  fetchChunked: vi.fn((opts) => {
    capturedOpts = opts;
    const stream = new PassThrough();
    setImmediate(() => stream.end());
    return Promise.resolve({ stream, size: 1000n, contentType: 'video/mp4' });
  }),
}));

vi.mock('../../src/services/ytdlp/info.js', () => ({
  getVideoInfo: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock('../../src/services/extractors/index.js', () => ({
  getExtractor: vi.fn(() => null),
  shouldJSStream: vi.fn(() => false),
}));

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(),
}));

import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import { getVideoInfo } from '../../src/services/ytdlp/info.js';
import { fetchChunked } from '../../src/services/ytdlp/chunked-fetcher.js';

const mockedGetVideoInfo = vi.mocked(getVideoInfo);
const mockedFetchChunked = vi.mocked(fetchChunked);

const STALE_URL = 'https://rr1.googlevideo.com/stale?expire=1';
const FRESH_URL = 'https://rr1.googlevideo.com/fresh?expire=2';

const mkInfo = (formatUrl: string) => ({
  id: 'abc123',
  title: 'integration test',
  targetUrl: 'https://www.youtube.com/watch?v=abc123',
  webpageUrl: 'https://www.youtube.com/watch?v=abc123',
  extractorKey: 'youtube',
  formats: [
    {
      formatId: '140',
      url: formatUrl,
      vcodec: 'none',
      acodec: 'mp4a.40.2',
      ext: 'm4a',
      isMuxed: false,
      isAudio: true,
    },
  ],
});

beforeEach(() => {
  vi.resetAllMocks();
  capturedOpts = null;
  mockedFetchChunked.mockImplementation((opts) => {
    capturedOpts = opts;
    const stream = new PassThrough();
    setImmediate(() => stream.end());
    return Promise.resolve({ stream, size: 1000n, contentType: 'video/mp4' });
  });
});

describe('streamer.tryChunkedFetch integration', () => {
  it('passes initial URL via urlProvider closure', async () => {
    mockedGetVideoInfo.mockResolvedValue(
      mkInfo(STALE_URL) as ReturnType<typeof mkInfo>
    );

    streamDownload('https://www.youtube.com/watch?v=abc123', {
      format: 'm4a',
      formatId: '140',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const opts = getCaptured();
    const initial = await opts.urlProvider();
    expect(initial.url).toBe(STALE_URL);
    expect(initial.headers?.['user-agent']).toBeDefined();
  });

  it('transplant() refreshes URL via getVideoInfo re-extraction', async () => {
    mockedGetVideoInfo
      .mockResolvedValueOnce(mkInfo(STALE_URL) as ReturnType<typeof mkInfo>)
      .mockResolvedValueOnce(mkInfo(FRESH_URL) as ReturnType<typeof mkInfo>);

    streamDownload('https://www.youtube.com/watch?v=abc123', {
      format: 'm4a',
      formatId: '140',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    const opts = getCaptured();

    const before = await opts.urlProvider();
    expect(before.url).toBe(STALE_URL);

    await opts.transplant?.();

    const after = await opts.urlProvider();
    expect(after.url).toBe(FRESH_URL);

    expect(mockedGetVideoInfo).toHaveBeenCalledTimes(2);
  });

  it('transplant rejects when format vanishes from fresh info', async () => {
    mockedGetVideoInfo
      .mockResolvedValueOnce(mkInfo(STALE_URL) as ReturnType<typeof mkInfo>)
      .mockResolvedValueOnce({
        ...mkInfo(FRESH_URL),
        formats: [],
      } as unknown as ReturnType<typeof mkInfo>);

    streamDownload('https://www.youtube.com/watch?v=abc123', {
      format: 'm4a',
      formatId: '140',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    const opts = getCaptured();

    await expect(opts.transplant?.()).rejects.toThrow(
      /transplant: re-extraction returned no formats|missing in fresh info/u
    );
  });

  it('transplant refreshes an audio format that lives in audioFormats', async () => {
    const audioInfo = (formatUrl: string) => ({
      id: 'abc123',
      title: 'audio only',
      targetUrl: 'https://www.youtube.com/watch?v=abc123',
      webpageUrl: 'https://www.youtube.com/watch?v=abc123',
      extractorKey: 'youtube',
      formats: [],
      audioFormats: [
        {
          formatId: '140',
          url: formatUrl,
          vcodec: 'none',
          acodec: 'mp4a.40.2',
          ext: 'm4a',
          isMuxed: false,
          isAudio: true,
        },
      ],
    });

    mockedGetVideoInfo
      .mockResolvedValueOnce(
        audioInfo(STALE_URL) as unknown as ReturnType<typeof mkInfo>
      )
      .mockResolvedValueOnce(
        audioInfo(FRESH_URL) as unknown as ReturnType<typeof mkInfo>
      );

    streamDownload('https://www.youtube.com/watch?v=abc123', {
      format: 'm4a',
      formatId: '140',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    const opts = getCaptured();

    await opts.transplant?.();
    const after = await opts.urlProvider();
    expect(after.url).toBe(FRESH_URL);
  });

  it('skips chunked path entirely for non-youtube services', async () => {
    mockedGetVideoInfo.mockResolvedValue({
      ...mkInfo(STALE_URL),
      extractorKey: 'tiktok',
    } as unknown as ReturnType<typeof mkInfo>);

    streamDownload('https://www.tiktok.com/@user/video/123', {
      format: 'mp4',
      formatId: '140',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mockedFetchChunked).not.toHaveBeenCalled();
  });

  it('uses youtube service tag for header injection', async () => {
    mockedGetVideoInfo.mockResolvedValue(
      mkInfo(STALE_URL) as ReturnType<typeof mkInfo>
    );

    streamDownload('https://www.youtube.com/watch?v=abc123', {
      format: 'm4a',
      formatId: '140',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(getCaptured().service).toBe('youtube');
  });
});
