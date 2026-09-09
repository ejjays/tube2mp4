import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
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

vi.mock('../../src/services/ytdlp/info.js', () => ({
  getVideoInfo: vi.fn(() =>
    Promise.resolve({
      id: 'tempFileTest',
      title: 'Temp File Flow Test',
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
      targetUrl: 'https://www.youtube.com/watch?v=tempFileTest',
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
const FAKE_VIDEO_BYTES = Buffer.from('FAKE_MP4_VIDEO_PAYLOAD_FOR_TEST');

describe('Temp file flow (Phase 1.5.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    // cleanup leftover temp files
    try {
      const files = fs.readdirSync(TMP_DIR);
      for (const file of files) {
        if (file.includes('tempFileTest') || file.includes('Date')) {
          fs.unlinkSync(path.join(TMP_DIR, file));
        }
      }
    } catch {
      // ignore
    }
  });

  it('uses temp file path (not stdout) when format requires merging', async () => {
    const mockProc = createMockChildProcess();
    mockedSpawn.mockReturnValue(mockProc);

    streamDownload('https://www.youtube.com/watch?v=tempFileTest', {
      format: 'mp4',
      formatId: '137',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const args = mockedSpawn.mock.calls[0]?.[1] as string[] | undefined;
    expect(args).toBeDefined();
    if (!args) return;

    const oFlagIdx = args.lastIndexOf('-o');
    const outputPath = args[oFlagIdx + 1];

    // not stdout, has temp path
    expect(outputPath).not.toBe('-');
    expect(outputPath).toMatch(/tmp\/.*\.mp4$/u);
  });

  it('pipes temp file contents to client after yt-dlp succeeds', async () => {
    const mockProc = createMockChildProcess();
    mockedSpawn.mockReturnValue(mockProc);

    const stream = streamDownload(
      'https://www.youtube.com/watch?v=tempFileTest',
      { format: 'mp4', formatId: '137' }
    );

    // wait for spawn to be called
    await new Promise((resolve) => setTimeout(resolve, 150));

    const args = mockedSpawn.mock.calls[0][1] as string[];
    const tempPath = args[args.lastIndexOf('-o') + 1];

    // simulate yt-dlp writing the file then exiting
    fs.writeFileSync(tempPath, FAKE_VIDEO_BYTES);
    mockProc.emit('close', 0);

    // collect bytes from client stream
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));

    await new Promise((resolve) => {
      stream.on('end', resolve);
      stream.on('close', resolve);
      setTimeout(resolve, 1000);
    });

    const total = Buffer.concat(chunks);
    expect(total.toString()).toBe(FAKE_VIDEO_BYTES.toString());
  });

  it('cleans up temp file after successful streaming', async () => {
    const mockProc = createMockChildProcess();
    mockedSpawn.mockReturnValue(mockProc);

    const stream = streamDownload(
      'https://www.youtube.com/watch?v=tempFileTest',
      { format: 'mp4', formatId: '137' }
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    const args = mockedSpawn.mock.calls[0][1] as string[];
    const tempPath = args[args.lastIndexOf('-o') + 1];

    fs.writeFileSync(tempPath, FAKE_VIDEO_BYTES);
    mockProc.emit('close', 0);

    stream.on('data', () => {
      /* drain */
    });
    await new Promise((resolve) => {
      stream.on('end', resolve);
      stream.on('close', resolve);
      setTimeout(resolve, 1000);
    });

    // give cleanup a moment
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('triggers retry rotation when yt-dlp fails before writing temp file', async () => {
    const failProc = createMockChildProcess();
    const successProc = createMockChildProcess();

    mockedSpawn.mockReturnValueOnce(failProc).mockReturnValueOnce(successProc);

    streamDownload('https://www.youtube.com/watch?v=tempFileTest', {
      format: 'mp4',
      formatId: '137',
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    // first attempt fails with format error
    (failProc.stderr as PassThrough).write(
      'ERROR: Requested format is not available'
    );
    failProc.emit('close', 1);

    await new Promise((resolve) => setTimeout(resolve, 200));

    // second spawn used different client
    expect(mockedSpawn.mock.calls.length).toBeGreaterThanOrEqual(2);
    const secondArgs = mockedSpawn.mock.calls[1][1] as string[];
    const clientArg = secondArgs.find((arg) => arg.includes('player-client='));
    expect(clientArg).not.toBe('youtube:player-client=tv');
  });
});
