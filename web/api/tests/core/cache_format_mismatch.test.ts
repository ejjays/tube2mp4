import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from '../../src/services/ytdlp/config.js';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import { createMockChildProcess } from '../utils/mocks.js';

// guards innertube/yt-dlp format mismatch

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

const META_DIR = path.join(CACHE_DIR, 'metadata');
const VIDEO_ID = 'fmtMismatch';
const CACHE_FILE = path.join(META_DIR, `${VIDEO_ID}.json`);

// limited yt-dlp cache fixture
const LIMITED_CACHE = {
  id: VIDEO_ID,
  title: 'Cache Mismatch Guard',
  formats: [
    { format_id: 'sb3', vcodec: 'none', acodec: 'none' },
    {
      format_id: '18',
      ext: 'mp4',
      vcodec: 'avc1.42001E',
      acodec: 'mp4a.40.2',
      url: 'https://cdn.example.com/v18.mp4',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  fs.mkdirSync(META_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(LIMITED_CACHE), 'utf8');
});

afterEach(() => {
  vi.restoreAllMocks();
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
});

const STREAM_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

function buildMockInfo(formatId: string, vcodec: string, acodec: string) {
  return {
    id: VIDEO_ID,
    extractorKey: 'youtube',
    webpageUrl: STREAM_URL,
    targetUrl: STREAM_URL,
    formats: [
      {
        formatId,
        vcodec,
        acodec,
        ext: 'mp4',
      },
    ],
  } as unknown as Parameters<typeof streamDownload>[3];
}

describe('streamer disk-cache format-availability guard', () => {
  it('skips --load-info-json when cache lacks the requested formatId (Innertube-only)', async () => {
    vi.mocked(spawn).mockReturnValue(createMockChildProcess());

    // 96 not in cache, 18 only
    streamDownload(
      STREAM_URL,
      { format: 'mp4', formatId: '96-20' },
      [],
      buildMockInfo('96-20', 'avc1.640020', 'mp4a.40.2')
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    const ytdlpCall = vi
      .mocked(spawn)
      .mock.calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();
    const args = ytdlpCall?.[1] as string[];
    expect(args).not.toContain('--load-info-json');
  });

  it('still uses --load-info-json when cache HAS the requested formatId', async () => {
    vi.mocked(spawn).mockReturnValue(createMockChildProcess());

    // formatId 18 IS in cache
    streamDownload(
      STREAM_URL,
      { format: 'mp4', formatId: '18' },
      [],
      buildMockInfo('18', 'avc1.42001E', 'mp4a.40.2')
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    const ytdlpCall = vi
      .mocked(spawn)
      .mock.calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();
    const args = ytdlpCall?.[1] as string[];
    expect(args).not.toContain('--load-info-json');
  });

  it('skips --load-info-json when cache JSON is malformed', async () => {
    fs.writeFileSync(CACHE_FILE, 'not-valid-json{{{', 'utf8');
    vi.mocked(spawn).mockReturnValue(createMockChildProcess());

    streamDownload(
      STREAM_URL,
      { format: 'mp4', formatId: '137' },
      [],
      buildMockInfo('137', 'avc1.640028', 'mp4a.40.2')
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    const ytdlpCall = vi
      .mocked(spawn)
      .mock.calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();
    const args = ytdlpCall?.[1] as string[];
    expect(args).not.toContain('--load-info-json');
  });
});

// reactive retry on stderr
describe('streamer disk-cache reactive retry', () => {
  it('retries without --load-info-json when stderr says format not available', async () => {
    let spawnCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      spawnCount += 1;
      const proc = new EventEmitter() as unknown as Record<string, unknown> & {
        stdout: PassThrough;
        stderr: PassThrough;
      };
      proc.stdout = new PassThrough();
      proc.stderr = new PassThrough();
      proc.pid = 80000 + spawnCount;
      proc.exitCode = null as number | null;
      proc.killed = false;
      proc.kill = () => true;

      // first spawn fails, second idles
      if (spawnCount === 1) {
        setImmediate(() => {
          proc.stderr.write(
            'ERROR: [youtube] X: Requested format is not available\n'
          );
          proc.stderr.end();
          proc.stdout.end();
          (proc as unknown as EventEmitter).emit('close', 1);
        });
      }
      return proc as unknown as ReturnType<typeof spawn>;
    });

    // 18 in cache, first spawn uses cache
    streamDownload(
      STREAM_URL,
      { format: 'mp4', formatId: '18' },
      [],
      buildMockInfo('18', 'avc1.42001E', 'mp4a.40.2')
    );

    await new Promise((resolve) => setTimeout(resolve, 400));

    const ytdlpCalls = vi
      .mocked(spawn)
      .mock.calls.filter((call) => call[0] === 'yt-dlp');
    expect(ytdlpCalls.length).toBeGreaterThanOrEqual(2);

    const firstArgs = ytdlpCalls[0][1] as string[];
    const secondArgs = ytdlpCalls[1][1] as string[];

    // verify rotation on retry
    expect(firstArgs).not.toContain('--load-info-json');
    expect(secondArgs).not.toContain('--load-info-json');
    const firstClient = firstArgs.find((arg: string) =>
      arg.includes('player-client=')
    );
    const secondClient = secondArgs.find((arg: string) =>
      arg.includes('player-client=')
    );
    expect(firstClient).not.toBe(secondClient);
  });
});
