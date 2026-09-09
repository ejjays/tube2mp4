import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamDownload } from '../../src/services/ytdlp/streamer';
import { COMMON_ARGS } from '../../src/services/ytdlp/config';
import { spawn } from 'node:child_process';
import { createMockChildProcess } from '../utils/mocks.js';

// throttle bypass regression guard

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
    execFile: vi.fn(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb?: (...args: unknown[]) => void
      ) => {
        if (cb) cb(new Error('mock'), '', '');
        return { stdout: '', stderr: '' };
      }
    ),
  };
});

vi.mock('../../src/services/ytdlp/info.js', () => ({
  getVideoInfo: vi.fn(() => Promise.resolve({ formats: [] })),
}));

vi.mock('../../src/services/extractors/index.js', () => ({
  getExtractor: vi.fn(() => null),
  shouldJSStream: vi.fn(() => false),
}));

describe('yt-dlp throttle-bypass arguments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses tv as default client (rotates on failure)', async () => {
    const mockSpawn = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockSpawn);

    streamDownload('http://test.com', { format: 'mp4', formatId: '137' }, [], {
      id: 'throttleArgsTest',
      extractorKey: 'youtube',
      formats: [
        {
          formatId: '137',
          vcodec: 'avc1.640028',
          acodec: 'mp4a.40.2',
          ext: 'mp4',
        },
      ],
      targetUrl: 'http://test.com',
    } as unknown as Parameters<typeof streamDownload>[3]);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const ytdlpCall = vi
      .mocked(spawn)
      .mock.calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();

    const args = ytdlpCall?.[1] as string[];
    const clientArg = args.find((arg) => arg.includes('player-client='));
    expect(clientArg).toBe('youtube:player-client=tv');
  });

  it('uses 10M http-chunk-size and 1M buffer-size for fewer round-trips', () => {
    const chunkIdx = COMMON_ARGS.indexOf('--http-chunk-size');
    expect(chunkIdx).toBeGreaterThan(-1);
    expect(COMMON_ARGS[chunkIdx + 1]).toBe('10M');

    const bufIdx = COMMON_ARGS.indexOf('--buffer-size');
    expect(bufIdx).toBeGreaterThan(-1);
    expect(COMMON_ARGS[bufIdx + 1]).toBe('1M');
  });

  it('uses --throttled-rate to retry when youtube cdn caps below 100K', () => {
    const tIdx = COMMON_ARGS.indexOf('--throttled-rate');
    expect(tIdx).toBeGreaterThan(-1);
    expect(COMMON_ARGS[tIdx + 1]).toBe('100K');
  });
});
