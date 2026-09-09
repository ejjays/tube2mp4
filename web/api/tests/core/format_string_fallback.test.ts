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
  getVideoInfo: vi.fn(() => Promise.resolve({ formats: [] })),
}));

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(() => {
    throw new Error('mock: direct fetch unavailable');
  }),
}));

const mockedSpawn = vi.mocked(spawn);

function getFormatString(args: string[]): string | undefined {
  const idx = args.indexOf('-f');
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function runWithFormat(formatId: string, height: number) {
  const proc = createMockChildProcess();
  mockedSpawn.mockReturnValue(proc);

  streamDownload(
    'https://www.youtube.com/watch?v=fmtTest',
    { format: 'mp4', formatId },
    [],
    {
      id: 'fmtTest',
      extractorKey: 'youtube',
      formats: [
        {
          formatId,
          vcodec: 'avc1.640028',
          acodec: 'none',
          ext: 'mp4',
          height,
        },
      ],
      targetUrl: 'https://www.youtube.com/watch?v=fmtTest',
    } as unknown as Parameters<typeof streamDownload>[3]
  );

  await new Promise((resolve) => setTimeout(resolve, 200));
  const args = mockedSpawn.mock.calls[0]?.[1] as string[] | undefined;
  return getFormatString(args || []);
}

describe('Resolution-aware format string (Phase 1.5.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1080p format includes height<=1080 fallback (NOT bare /best)', async () => {
    const fStr = await runWithFormat('137', 1080);
    expect(fStr).toBeDefined();
    expect(fStr).toContain('137+bestaudio');
    expect(fStr).toContain('[height<=1080]');
    // no /best raw fallback (allows 360p)
    expect(fStr).not.toMatch(/\/best$/u);
  });

  it('720p format respects 720p ceiling on fallback', async () => {
    const fStr = await runWithFormat('136', 720);
    expect(fStr).toContain('[height<=720]');
    expect(fStr).not.toMatch(/\/best$/u);
  });

  it('4K format respects 2160p ceiling on fallback', async () => {
    const fStr = await runWithFormat('401', 2160);
    expect(fStr).toContain('[height<=2160]');
    expect(fStr).not.toMatch(/\/best$/u);
  });

  it('format with no known height falls back to bv*+ba/b (no degradation)', async () => {
    const proc = createMockChildProcess();
    mockedSpawn.mockReturnValue(proc);

    streamDownload(
      'https://www.youtube.com/watch?v=fmtTest',
      { format: 'mp4', formatId: '999' },
      [],
      {
        id: 'fmtTest',
        extractorKey: 'youtube',
        formats: [
          {
            formatId: '999',
            vcodec: 'avc1.640028',
            acodec: 'none',
            ext: 'mp4',
          },
        ],
        targetUrl: 'https://www.youtube.com/watch?v=fmtTest',
      } as unknown as Parameters<typeof streamDownload>[3]
    );

    await new Promise((resolve) => setTimeout(resolve, 200));
    const args = mockedSpawn.mock.calls[0]?.[1] as string[];
    const fStr = getFormatString(args);
    expect(fStr).toBe('999+bestaudio/bv*+ba');
  });
});
