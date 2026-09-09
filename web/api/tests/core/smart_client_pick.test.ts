import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
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

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(() => {
    throw new Error('mock: direct fetch unavailable');
  }),
}));

const mockedSpawn = vi.mocked(spawn);

function getClientFromCall(callIndex: number): string | undefined {
  const args = mockedSpawn.mock.calls[callIndex]?.[1] as string[] | undefined;
  if (!args) return undefined;
  const arg = args.find((item) => item.includes('player-client='));
  return arg?.split('=')[1];
}

async function runWithFormat(
  formatId: string,
  height: number,
  vcodec = 'avc1'
) {
  const proc = createMockChildProcess();
  mockedSpawn.mockReturnValue(proc);

  streamDownload(
    'https://www.youtube.com/watch?v=smartTest',
    { format: 'mp4', formatId },
    [],
    {
      id: 'smartTest',
      extractorKey: 'youtube',
      formats: [{ formatId, vcodec, acodec: 'none', ext: 'mp4', height }],
      targetUrl: 'https://www.youtube.com/watch?v=smartTest',
    } as unknown as Parameters<typeof streamDownload>[3]
  );

  await new Promise((resolve) => setTimeout(resolve, 500));
}

describe('Smart client selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses tv for 1080p formats (default)', async () => {
    await runWithFormat('137', 1080);
    expect(getClientFromCall(0)).toBe('tv');
  });

  it('uses tv for 720p formats', async () => {
    await runWithFormat('22', 720);
    expect(getClientFromCall(0)).toBe('tv');
  });

  it('uses mweb for 4K AV1 (format 401)', async () => {
    await runWithFormat('401', 2160, 'av01');
    expect(getClientFromCall(0)).toBe('mweb');
  });

  it('uses mweb for 8K formats by height', async () => {
    await runWithFormat('571', 4320, 'av01');
    expect(getClientFromCall(0)).toBe('mweb');
  });

  it('uses tv for VP9 4K (format 313)', async () => {
    await runWithFormat('313', 2160, 'vp9');
    expect(getClientFromCall(0)).toBe('tv');
  });

  it('uses mweb for 1080p AV1 (format 399) — av1 codec gates path', async () => {
    await runWithFormat('399', 1080, 'av01.0.08M.08');
    expect(getClientFromCall(0)).toBe('mweb');
  });

  it('uses mweb for 720p AV1 (format 398) regardless of height', async () => {
    await runWithFormat('398', 720, 'av01.0.05M.08');
    expect(getClientFromCall(0)).toBe('mweb');
  });
});
