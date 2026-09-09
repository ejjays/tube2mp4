import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import { COMMON_ARGS } from '../../src/services/ytdlp/config.js';
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
      id: 'cookieDedupe',
      title: 'Cookie Dedupe Test',
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
      targetUrl: 'https://www.youtube.com/watch?v=cookieDedupe',
    })
  ),
}));

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(() => {
    throw new Error('mock: direct fetch unavailable');
  }),
}));

const mockedSpawn = vi.mocked(spawn);
const FAKE_COMMON_COOKIES = path.join(os.tmpdir(), 'common-cookies.txt');
const FAKE_CTRL_COOKIES = path.join(os.tmpdir(), 'controller-cookies.txt');

function countCookieFlags(args: readonly string[]): number {
  return args.filter((arg) => arg === '--cookies').length;
}

function ensureCookiesInCommonArgs(): void {
  if (!COMMON_ARGS.includes('--cookies')) {
    COMMON_ARGS.push('--cookies', FAKE_COMMON_COOKIES);
  }
}

function removeCookiesFromCommonArgs(): void {
  while (true) {
    const idx = COMMON_ARGS.indexOf('--cookies');
    if (idx === -1) break;
    COMMON_ARGS.splice(idx, 2);
  }
}

async function runAndGetArgs(cookieArgs: string[]): Promise<string[]> {
  const mockProc = createMockChildProcess();
  mockedSpawn.mockReturnValue(mockProc);

  streamDownload(
    'https://www.youtube.com/watch?v=cookieDedupe',
    { format: 'mp4', formatId: '22' },
    cookieArgs
  );

  await new Promise((resolve) => setTimeout(resolve, 200));
  const args = mockedSpawn.mock.calls[0]?.[1] as string[] | undefined;
  return args || [];
}

describe('Cookie deduplication (Phase 1.5.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    removeCookiesFromCommonArgs();
  });

  it('passes only ONE --cookies flag when both COMMON_ARGS and cookieArgs have it', async () => {
    ensureCookiesInCommonArgs();
    const args = await runAndGetArgs(['--cookies', FAKE_CTRL_COOKIES]);
    expect(args.length).toBeGreaterThan(0);
    expect(countCookieFlags(args)).toBe(1);
  });

  it('uses cookieArgs when COMMON_ARGS has no --cookies', async () => {
    removeCookiesFromCommonArgs();
    const args = await runAndGetArgs(['--cookies', FAKE_CTRL_COOKIES]);
    expect(args.length).toBeGreaterThan(0);
    expect(countCookieFlags(args)).toBe(1);
    const cookieIdx = args.indexOf('--cookies');
    expect(args[cookieIdx + 1]).toBe(FAKE_CTRL_COOKIES);
  });

  it('uses COMMON_ARGS cookies when cookieArgs is empty', async () => {
    ensureCookiesInCommonArgs();
    const args = await runAndGetArgs([]);
    expect(args.length).toBeGreaterThan(0);
    expect(countCookieFlags(args)).toBe(1);
    const cookieIdx = args.indexOf('--cookies');
    expect(args[cookieIdx + 1]).toBe(FAKE_COMMON_COOKIES);
  });
});
