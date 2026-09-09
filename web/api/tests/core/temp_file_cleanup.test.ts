import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import { CACHE_DIR } from '../../src/services/ytdlp/config.js';
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
  getVideoInfo: vi.fn(() =>
    Promise.resolve({
      id: 'cleanupTest',
      title: 'Cleanup Test',
      formats: [
        {
          formatId: '137',
          url: null,
          vcodec: 'avc1.640028',
          acodec: 'none',
          ext: 'mp4',
          height: 1080,
        },
      ],
      targetUrl: 'https://www.youtube.com/watch?v=cleanupTest',
    })
  ),
}));

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(() => {
    throw new Error('mock: direct fetch unavailable');
  }),
}));

const mockedSpawn = vi.mocked(spawn);
const TMP_DIR = path.join(CACHE_DIR, 'tmp');

async function getTempPath(): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const args = mockedSpawn.mock.calls[0][1] as string[];
  return args[args.lastIndexOf('-o') + 1];
}

describe('temp file cleanup on abort/failure (H1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    try {
      for (const file of fs.readdirSync(TMP_DIR)) {
        if (file.includes('cleanupTest'))
          fs.unlinkSync(path.join(TMP_DIR, file));
      }
    } catch {
      // ignore
    }
  });

  it('removes temp + partial siblings when yt-dlp exits non-zero', async () => {
    const proc = createMockChildProcess();
    mockedSpawn.mockReturnValue(proc);

    const stream = streamDownload(
      'https://www.youtube.com/watch?v=cleanupTest',
      {
        format: 'mp4',
        formatId: '137',
      }
    );
    stream.on('data', () => {});
    stream.on('error', () => {});

    const tempPath = await getTempPath();
    const ext = path.extname(tempPath);
    const sibling = `${tempPath.slice(0, -ext.length)}.f137${ext}`;
    fs.writeFileSync(tempPath, 'PARTIAL');
    fs.writeFileSync(sibling, 'PARTIAL_VIDEO');

    // non-retryable failure (empty stderr)
    proc.emit('close', 1);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(fs.existsSync(tempPath)).toBe(false);
    expect(fs.existsSync(sibling)).toBe(false);
  });

  it('removes temp file when the download is killed (code null)', async () => {
    const proc = createMockChildProcess();
    mockedSpawn.mockReturnValue(proc);

    const stream = streamDownload(
      'https://www.youtube.com/watch?v=cleanupTest',
      {
        format: 'mp4',
        formatId: '137',
      }
    );
    stream.on('data', () => {});
    stream.on('error', () => {});

    const tempPath = await getTempPath();
    fs.writeFileSync(tempPath, 'PARTIAL');

    proc.emit('close', null);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(fs.existsSync(tempPath)).toBe(false);
  });
});
