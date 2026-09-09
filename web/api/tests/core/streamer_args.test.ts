import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamDownload } from '../../src/services/ytdlp/streamer';
import { buildYtdlpArgs } from '../../src/services/ytdlp/ytdlp-process';
import type { Format } from '../../src/types/index.js';
import { spawn } from 'node:child_process';
import { createMockChildProcess } from '../utils/mocks.js';

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

vi.mock('../../src/services/extractors/index.js', () => ({
  getExtractor: vi.fn(() => null),
  shouldJSStream: vi.fn(() => false),
}));

vi.mock('../../src/services/ytdlp/info.js', () => ({
  getVideoInfo: vi.fn(() => Promise.resolve({ formats: [] })),
}));

describe('streamDownload FFmpeg arguments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should include -bsf:a aac_adtstoasc filter when format is mp4 and shouldCopy is true', async () => {
    const mockSpawn = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockSpawn);

    const mockInfo = {
      id: 'test',
      extractorKey: 'youtube',
      formats: [
        {
          formatId: '137',
          url: 'https://test.com/file.mp4',
          vcodec: 'avc1.640028',
          acodec: 'mp4a.40.2',
          ext: 'mp4',
        },
      ],
      targetUrl: 'http://test.com',
    };

    streamDownload(
      'http://test.com',
      { format: 'mp4', formatId: '137' },
      [],
      mockInfo
    );

    // wait IIFE
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(spawn).toHaveBeenCalledWith(
      'yt-dlp',
      expect.arrayContaining([expect.stringContaining('-bsf:a aac_adtstoasc')]),
      { detached: true }
    );

    const calls = vi.mocked(spawn).mock.calls;
    const ytdlpCall = calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();

    if (ytdlpCall) {
      const args = ytdlpCall[1] as string[];
      // copy mode now uses --postprocessor-args (native dl)
      const ppIdx = args.indexOf('--postprocessor-args');
      expect(ppIdx).toBeGreaterThan(-1);
      const ppArgs = args[ppIdx + 1];
      expect(ppArgs).toContain('-bsf:a aac_adtstoasc');
      expect(ppArgs).toContain('-c:v copy');
      expect(ppArgs).toContain('-c:a copy');
      // faststart keeps moov readable on truncation
      expect(ppArgs).toContain('-movflags +faststart');
      expect(ppArgs).not.toContain('frag_keyframe');
      expect(ppArgs).not.toContain('empty_moov');
    }
  });

  it('vp9+opus now takes copy path (no aac bsf, no transcode)', async () => {
    const mockSpawn = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockSpawn);

    const mockInfo = {
      id: 'test',
      extractorKey: 'youtube',
      formats: [
        {
          formatId: '303',
          vcodec: 'vp09.00.50.08',
          acodec: 'opus',
        },
      ],
      targetUrl: 'http://test.com',
    };

    streamDownload(
      'http://test.com',
      { format: 'mp4', formatId: '303' },
      [],
      mockInfo
    );

    await new Promise((resolve) => setTimeout(resolve, 500));

    const calls = vi.mocked(spawn).mock.calls;
    const ytdlpCall = calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();

    if (ytdlpCall) {
      const args = ytdlpCall[1] as string[];
      // fast copy path, not transcode
      const ppIdx = args.indexOf('--postprocessor-args');
      expect(ppIdx).toBeGreaterThan(-1);
      const ppArgs = args[ppIdx + 1];
      expect(ppArgs).toContain('-c:v copy');
      expect(ppArgs).toContain('-c:a copy');
      // opus paired audio: no aac bsf
      expect(ppArgs).not.toContain('aac_adtstoasc');
      // never falls back to slow transcode
      const downloaderIdx = args.indexOf('--downloader');
      if (downloaderIdx > -1) {
        expect(args[downloaderIdx + 1]).not.toBe('ffmpeg');
      }
    }
  });
});

describe('buildYtdlpArgs copy/transcode selection', () => {
  it('copies a merge when the codec is unknown (bare format) instead of transcoding', () => {
    const args = buildYtdlpArgs(
      { format: 'mp4', formatId: '313' },
      undefined as unknown as Format,
      [],
      0,
      []
    );
    const ppIdx = args.indexOf('--postprocessor-args');
    expect(ppIdx).toBeGreaterThan(-1);
    expect(args[ppIdx + 1]).toContain('-c:v copy');
    expect(args[ppIdx + 1]).toContain('-c:a copy');
    // must not drop into a slow transcode
    expect(args.indexOf('--downloader')).toBe(-1);
  });

  it('still transcodes a merge when the codec is known and mp4-incompatible', () => {
    const theora = {
      formatId: '999',
      vcodec: 'theora',
      acodec: 'vorbis',
    } as unknown as Format;
    const args = buildYtdlpArgs(
      { format: 'mp4', formatId: '999' },
      theora,
      [],
      0,
      [theora]
    );
    const dIdx = args.indexOf('--downloader');
    expect(dIdx).toBeGreaterThan(-1);
    expect(args[dIdx + 1]).toBe('ffmpeg');
  });
});
