import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { getVideoInfo } from '../../src/services/ytdlp/info.js';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import type { VideoInfo, Format } from '../../src/types/index.js';
import { createMockChildProcess } from '../utils/mocks.js';

// raw shape never reaches streamer

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
  // empty JS task forces yt-dlp slow-path
  getInfo: vi.fn().mockResolvedValue(null),
  getInFlightJsResult: vi.fn().mockReturnValue(null),
  getExtractor: vi.fn().mockReturnValue(null),
  shouldJSStream: vi.fn().mockReturnValue(false),
}));

const RAW_YTDLP_DUMP = {
  id: 'pollGuard11',
  title: 'Pollution Guard E2E',
  uploader: 'guard',
  duration: 60,
  webpage_url: 'https://www.youtube.com/watch?v=pollGuard11',
  formats: [
    {
      format_id: 'sb3',
      vcodec: 'none',
      acodec: 'none',
      url: 'https://i.ytimg.com/sb/x/storyboard.jpg',
      ext: 'mhtml',
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
      filesize: 18000000,
    },
    {
      format_id: '137',
      ext: 'mp4',
      vcodec: 'avc1.640028',
      acodec: 'none',
      url: 'https://cdn.example.com/v137.mp4',
      width: 1920,
      height: 1080,
      fps: 30,
      tbr: 4500,
      filesize: 90000000,
    },
    {
      format_id: '140',
      ext: 'm4a',
      vcodec: 'none',
      acodec: 'mp4a.40.2',
      url: 'https://cdn.example.com/a140.m4a',
      tbr: 128,
      filesize: 1000000,
    },
  ],
};

function fakeYtdlpProcess(payload: string) {
  const proc = new EventEmitter() as unknown as Record<string, unknown> & {
    stdout: PassThrough;
    stderr: PassThrough;
  };
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.pid = 99996;
  proc.exitCode = null as number | null;
  setImmediate(() => {
    proc.stdout.write(payload);
    proc.stdout.end();
    proc.stderr.end();
    (proc as unknown as EventEmitter).emit('close', 0);
  });
  return proc as unknown as ReturnType<typeof spawn>;
}

describe('cache pollution: full chain integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cached formats[0] has camelCase formatId after yt-dlp slow-path', async () => {
    vi.mocked(spawn).mockImplementation(
      () => fakeYtdlpProcess(JSON.stringify(RAW_YTDLP_DUMP)) as never
    );

    const url = 'https://www.youtube.com/watch?v=pollGuard11_1';
    const info: VideoInfo = await getVideoInfo(url, []);

    expect(info).toBeDefined();
    expect(Array.isArray(info.formats)).toBe(true);
    expect(info.formats.length).toBeGreaterThan(0);

    const first = info.formats[0];
    // critical: camelCase populated
    expect(first.formatId).toBeTruthy();
    expect(typeof first.formatId).toBe('string');
    // critical: snake_case never leaks
    expect(
      (first as unknown as { format_id?: unknown }).format_id
    ).toBeUndefined();
    // critical: storyboard never first
    expect(first.vcodec).not.toBe('none');
  });

  it('every cached video format has formatId; no raw shape leaks', async () => {
    vi.mocked(spawn).mockImplementation(
      () => fakeYtdlpProcess(JSON.stringify(RAW_YTDLP_DUMP)) as never
    );

    const url = 'https://www.youtube.com/watch?v=pollGuard11_2';
    const info: VideoInfo = await getVideoInfo(url, []);

    for (const fmt of info.formats) {
      expect(fmt.formatId).toBeTruthy();
      expect(
        (fmt as unknown as { format_id?: unknown }).format_id
      ).toBeUndefined();
    }
  });

  it('streamDownload with cached info never invokes libx264 for avc1 source', async () => {
    vi.mocked(spawn).mockImplementation(
      () => fakeYtdlpProcess(JSON.stringify(RAW_YTDLP_DUMP)) as never
    );

    const url = 'https://www.youtube.com/watch?v=pollGuard11_3';
    const info: VideoInfo = await getVideoInfo(url, []);

    // re-arm spawn for streamDownload's call
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // force engine processing
    const target = info.formats.find(
      (fmt) => String(fmt.vcodec || '').startsWith('avc1') && !fmt.isMuxed
    );
    expect(target).toBeDefined();
    const formatId = String(target?.formatId);
    streamDownload(url, { format: 'mp4', formatId }, [], info);

    await new Promise((resolve) => setTimeout(resolve, 250));

    const ytdlpCall = vi
      .mocked(spawn)
      .mock.calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();

    const args = ytdlpCall?.[1] as string[];
    const allArgs = args.join(' ');
    // avc1 must never trigger libx264
    expect(allArgs).not.toContain('libx264');
    expect(allArgs).not.toContain('-preset ultrafast');
    expect(allArgs).not.toContain('-preset superfast');
  });

  it('matrix: common avc1 formatIds always trigger copy mode', async () => {
    vi.mocked(spawn).mockImplementation(
      () => fakeYtdlpProcess(JSON.stringify(RAW_YTDLP_DUMP)) as never
    );

    const url = 'https://www.youtube.com/watch?v=pollGuard11_4';
    const info: VideoInfo = await getVideoInfo(url, []);

    // avoid direct fetch
    const candidates: Format[] = info.formats.filter(
      (fmt) => String(fmt.vcodec || '').startsWith('avc1') && !fmt.isMuxed
    );
    expect(candidates.length).toBeGreaterThan(0);

    for (const fmt of candidates) {
      vi.mocked(spawn).mockReset();
      vi.mocked(spawn).mockReturnValue(createMockChildProcess());

      streamDownload(
        url,
        { format: 'mp4', formatId: String(fmt.formatId) },
        [],
        info
      );
      await new Promise((resolve) => setTimeout(resolve, 200));

      const call = vi
        .mocked(spawn)
        .mock.calls.find((entry) => entry[0] === 'yt-dlp');
      const args = (call?.[1] as string[]) || [];
      const joined = args.join(' ');
      expect(
        joined,
        `formatId=${fmt.formatId} (vcodec=${fmt.vcodec}) must use copy`
      ).not.toContain('libx264');
    }
  });
});
