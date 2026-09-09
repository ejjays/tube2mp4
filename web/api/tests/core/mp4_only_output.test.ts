import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import { processVideoFormats } from '../../src/utils/media/format.util.js';
import { createMockChildProcess } from '../utils/mocks.js';

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

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(() => {
    throw new Error('mock: direct fetch unavailable');
  }),
}));

const mockedSpawn = vi.mocked(spawn);

beforeEach(() => {
  vi.clearAllMocks();
});

function getYtdlpArgs() {
  const calls = mockedSpawn.mock.calls;
  const ytdlpCall = calls.find((call) => call[0] === 'yt-dlp');
  return ytdlpCall?.[1] as string[] | undefined;
}

const sampleVP9Raw = [
  {
    format_id: '303',
    url: 'https://googlevideo.com/v303',
    vcodec: 'vp09.00.50.08',
    acodec: 'none',
    ext: 'webm',
    height: 1080,
    width: 1920,
    fps: 60,
    tbr: 4000,
  },
  {
    format_id: '251',
    url: 'https://googlevideo.com/a251',
    vcodec: 'none',
    acodec: 'opus',
    ext: 'webm',
    abr: 160,
  },
];

describe('mp4-only output: vp9 webm sources remux to mp4', () => {
  it('processVideoFormats reports mp4 extension for vp9 webm formats', () => {
    const result = processVideoFormats({
      duration: 200,
      formats: sampleVP9Raw,
    });
    const vp9Format = result.find((format) => format.formatId === '303');
    expect(vp9Format).toBeDefined();
    expect(vp9Format?.extension).toBe('mp4');
  });

  it('streamer always passes --merge-output-format mp4 (never webm)', async () => {
    mockedSpawn.mockReturnValue(createMockChildProcess());

    streamDownload(
      'https://www.youtube.com/watch?v=mp4Test',
      { format: 'mp4', formatId: '303' },
      [],
      {
        id: 'mp4Test',
        extractorKey: 'youtube',
        formats: [
          {
            formatId: '303',
            vcodec: 'vp09.00.50.08',
            acodec: 'none',
            extension: 'mp4',
            height: 1080,
            url: '',
            isVideo: true,
            isAudio: false,
            isMuxed: false,
          },
        ],
        targetUrl: 'https://www.youtube.com/watch?v=mp4Test',
      } as unknown as Parameters<typeof streamDownload>[3]
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    const args = getYtdlpArgs();
    expect(args).toBeDefined();
    if (!args) return;

    const mergeIdx = args.indexOf('--merge-output-format');
    expect(mergeIdx).toBeGreaterThan(-1);
    expect(args[mergeIdx + 1]).toBe('mp4');
    // never the dead live-streaming flags
    expect(args.join(' ')).not.toContain('-live 1');
  });

  it('vp9 takes the fast stream-copy postprocessor path (faststart)', async () => {
    mockedSpawn.mockReturnValue(createMockChildProcess());

    streamDownload(
      'https://www.youtube.com/watch?v=vp9Test',
      { format: 'mp4', formatId: '303' },
      [],
      {
        id: 'vp9Test',
        extractorKey: 'youtube',
        formats: [
          {
            formatId: '303',
            vcodec: 'vp09.00.50.08',
            acodec: 'none',
            extension: 'mp4',
            height: 1080,
            url: '',
            isVideo: true,
            isAudio: false,
            isMuxed: false,
          },
          {
            formatId: '251',
            vcodec: 'none',
            acodec: 'opus',
            extension: 'webm',
            url: '',
            isVideo: false,
            isAudio: true,
            isMuxed: false,
          },
        ],
        targetUrl: 'https://www.youtube.com/watch?v=vp9Test',
      } as unknown as Parameters<typeof streamDownload>[3]
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    const args = getYtdlpArgs();
    expect(args).toBeDefined();
    if (!args) return;

    const ppIdx = args.indexOf('--postprocessor-args');
    expect(ppIdx).toBeGreaterThan(-1);
    const ppArgs = args[ppIdx + 1];
    expect(ppArgs).toContain('-c:v copy');
    expect(ppArgs).toContain('-c:a copy');
    expect(ppArgs).toContain('-movflags +faststart');
    // opus paired audio: no aac bsf needed
    expect(ppArgs).not.toContain('aac_adtstoasc');
    // vp9 must avoid ffmpeg downloader fallback
    const downloaderIdx = args.indexOf('--downloader');
    if (downloaderIdx > -1) {
      expect(args[downloaderIdx + 1]).not.toBe('ffmpeg');
    }
  });
});
