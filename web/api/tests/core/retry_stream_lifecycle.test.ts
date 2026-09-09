import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import { createMockChildProcess } from '../utils/mocks.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock('../../src/services/extractors/index.js', () => ({
  getExtractor: vi.fn(() => null),
  shouldJSStream: vi.fn(() => false),
}));

vi.mock('../../src/services/ytdlp/info.js', () => ({
  getVideoInfo: vi.fn(() =>
    Promise.resolve({
      id: 'retryStream',
      title: 'Retry Stream Lifecycle Test',
      formats: [
        {
          formatId: '22',
          url: null,
          vcodec: 'avc1.640028',
          acodec: 'mp4a.40.2',
          ext: 'mp4',
          isMuxed: true,
        },
      ],
      targetUrl: 'https://www.youtube.com/watch?v=retryStream',
    })
  ),
}));

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(() => {
    throw new Error('mock: direct fetch unavailable');
  }),
}));

const mockedSpawn = vi.mocked(spawn);

function makeFailProc(stderrText: string) {
  const proc = createMockChildProcess();
  process.nextTick(() => {
    (proc.stderr as PassThrough).write(stderrText);
    proc.emit('close', 1);
  });
  return proc;
}

function makeSuccessProc(stdoutText: string) {
  const proc = createMockChildProcess();
  process.nextTick(() => {
    (proc.stdout as PassThrough).write(stdoutText);
    (proc.stdout as PassThrough).end();
    proc.emit('close', 0);
  });
  return proc;
}

describe('Stream lifecycle across retries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps output stream alive across client rotation (real lifecycle)', async () => {
    // first attempt: format error → must rotate
    const failProc = makeFailProc('ERROR: Requested format is not available');
    // second attempt (tv): succeeds
    const successProc = makeSuccessProc('video bytes here');

    mockedSpawn.mockReturnValueOnce(failProc).mockReturnValueOnce(successProc);

    const stream = streamDownload(
      'https://www.youtube.com/watch?v=retryStream',
      { format: 'mp4', formatId: '22' }
    );

    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));

    await new Promise((resolve) => setTimeout(resolve, 800));

    const calls = mockedSpawn.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // verify rotation happened
    const secondArgs = calls[1][1] as string[];
    const clientArg = secondArgs.find((arg) => arg.includes('player-client='));
    expect(clientArg).toBe('youtube:player-client=android_vr');

    // second attempt data reached output
    const total = Buffer.concat(chunks).toString();
    expect(total).toContain('video bytes here');
  });

  it('closes output stream after all clients exhausted', async () => {
    let spawnCount = 0;
    mockedSpawn.mockImplementation(() => {
      spawnCount++;
      return makeFailProc('ERROR: Requested format is not available');
    });

    const stream = streamDownload(
      'https://www.youtube.com/watch?v=retryStream',
      { format: 'mp4', formatId: '22' }
    );

    const ended = new Promise<void>((resolve) => {
      stream.on('end', () => resolve());
      stream.on('close', () => resolve());
    });

    await Promise.race([
      ended,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);

    // all 4 clients should have been tried
    expect(spawnCount).toBeGreaterThanOrEqual(4);
  });
});
