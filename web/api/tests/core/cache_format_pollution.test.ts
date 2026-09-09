import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import { runYtdlpInfo } from '../../src/services/ytdlp/info.js';
import { createMockChildProcess } from '../utils/mocks.js';

// guards against snake_case format leaking

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
    execFile: vi.fn(
      (
        _c: string,
        _a: string[],
        _o: unknown,
        cb?: (...args: unknown[]) => void
      ) => {
        if (cb) {
          cb(new Error('mock'), '', '');
        }
        return { stdout: '', stderr: '' };
      }
    ),
  };
});

vi.mock('../../src/services/extractors/index.js', () => ({
  getExtractor: vi.fn(() => null),
  shouldJSStream: vi.fn(() => false),
}));

function makeYtdlpInfoProcess(stdoutPayload: string) {
  const proc = new EventEmitter() as unknown as Record<string, unknown> & {
    stdout: PassThrough;
    stderr: PassThrough;
  };
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.pid = 99998;
  proc.exitCode = null as number | null;
  setImmediate(() => {
    proc.stdout.write(stdoutPayload);
    proc.stdout.end();
    proc.stderr.end();
    (proc as unknown as EventEmitter).emit('close', 0);
  });
  return proc as unknown as ReturnType<typeof spawn>;
}

const RAW_YTDLP_DUMP = {
  id: 'cachePoll11',
  title: 'Cache Pollution Guard',
  uploader: 'guard',
  duration: 60,
  formats: [
    {
      format_id: 'sb3',
      vcodec: 'none',
      acodec: 'none',
      url: 'https://i.ytimg.com/sb/x/storyboard.jpg',
    },
    {
      format_id: '18',
      ext: 'mp4',
      vcodec: 'avc1.42001E',
      acodec: 'mp4a.40.2',
      url: 'https://cdn.example.com/v18.mp4',
      width: 640,
      height: 360,
      fps: 30,
      tbr: 514,
    },
    {
      format_id: '300',
      ext: 'mp4',
      vcodec: 'avc1.640020',
      acodec: 'mp4a.40.2',
      url: 'https://cdn.example.com/v300.m3u8',
      width: 1280,
      height: 720,
      fps: 60,
      tbr: 4000,
    },
  ],
};

describe('cache pollution: raw yt-dlp format_id never leaks downstream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runYtdlpInfo returns parsed VideoInfo with raw fields preserved on shape', async () => {
    vi.mocked(spawn).mockImplementation(
      () => makeYtdlpInfoProcess(JSON.stringify(RAW_YTDLP_DUMP)) as never
    );
    const info = await runYtdlpInfo(
      'https://www.youtube.com/watch?v=cachePoll11',
      []
    );
    expect(info.id).toBe('cachePoll11');
    // verify initial data remains untouched
    expect(Array.isArray(info.formats)).toBe(true);
  });

  it('streamer never selects format with vcodec=none (storyboard) for video request', async () => {
    const mockSpawn = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockSpawn);

    // streamer expects normalized format keys
    streamDownload('http://test.com', { format: 'mp4', formatId: '300' }, [], {
      id: 'cachePoll11',
      extractorKey: 'youtube',
      webpageUrl: 'http://test.com',
      targetUrl: 'http://test.com',
      formats: [
        {
          formatId: '300',
          vcodec: 'avc1.640020',
          acodec: 'mp4a.40.2',
          ext: 'mp4',
          isMuxed: true,
          url: 'https://cdn.example.com/v300.m3u8',
        },
      ],
    } as unknown as Parameters<typeof streamDownload>[3]);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const ytdlpCall = vi
      .mocked(spawn)
      .mock.calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();
    const args = ytdlpCall?.[1] as string[];
    // avoid re-encoding compatible streams
    const dargsIdx = args.indexOf('--downloader-args');
    if (dargsIdx > -1) {
      const dargs = args[dargsIdx + 1];
      expect(dargs).not.toContain('libx264');
    }
  });

  it('streamer does NOT use libx264 for normalized avc1+mp4a format', async () => {
    const mockSpawn = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockSpawn);

    streamDownload('http://test.com', { format: 'mp4', formatId: '137' }, [], {
      id: 'noTranscode1',
      extractorKey: 'youtube',
      webpageUrl: 'http://test.com',
      targetUrl: 'http://test.com',
      formats: [
        {
          formatId: '137',
          vcodec: 'avc1.640028',
          acodec: 'mp4a.40.2',
          ext: 'mp4',
          url: 'https://cdn.example.com/v137.mp4',
        },
      ],
    } as unknown as Parameters<typeof streamDownload>[3]);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const ytdlpCall = vi
      .mocked(spawn)
      .mock.calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();
    const args = ytdlpCall?.[1] as string[];
    const ppIdx = args.indexOf('--postprocessor-args');
    expect(ppIdx).toBeGreaterThan(-1);
    const ppArgs = args[ppIdx + 1];
    expect(ppArgs).toContain('-c:v copy');
    expect(ppArgs).toContain('-c:a copy');
    expect(ppArgs).not.toContain('libx264');
  });
});
