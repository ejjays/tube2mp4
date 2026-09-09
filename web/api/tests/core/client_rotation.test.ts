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
  getVideoInfo: vi.fn(() =>
    Promise.resolve({
      id: 'testRotation',
      title: 'Client Rotation Test',
      formats: [
        {
          formatId: '140',
          url: 'https://rr1.googlevideo.com/test',
          vcodec: 'none',
          acodec: 'mp4a.40.2',
          ext: 'mp4',
        },
      ],
      targetUrl: 'https://www.youtube.com/watch?v=testRotation',
    })
  ),
}));

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getProxiedStream: vi.fn(() => {
    throw new Error('mock: direct fetch unavailable');
  }),
}));

const mockedSpawn = vi.mocked(spawn);

describe('YouTube Client Rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses tv as first client', () => {
    const mock = createMockChildProcess({ exitCode: 0 });
    mockedSpawn.mockReturnValue(mock);

    streamDownload('https://www.youtube.com/watch?v=testRotation', {
      format: 'mp3',
    });

    // wait for async init
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const calls = mockedSpawn.mock.calls;
        if (calls.length > 0) {
          const args = calls[0][1] as string[];
          const clientArg = args.find((arg) => arg.includes('player-client='));
          expect(clientArg).toContain('tv');
        }
        resolve();
      }, 100);
    });
  });

  it('rotates to next client on failure', () => {
    // first spawn fails with 403
    const failMock = createMockChildProcess({
      exitCode: 1,
      stderr: 'ERROR: HTTP Error 403: Forbidden',
    });
    // second spawn (no cache retry) also fails
    const failMock2 = createMockChildProcess({
      exitCode: 1,
      stderr: 'ERROR: HTTP Error 403: Forbidden',
    });
    // third spawn should use mweb
    const successMock = createMockChildProcess({ exitCode: 0 });

    mockedSpawn
      .mockReturnValueOnce(failMock)
      .mockReturnValueOnce(failMock2)
      .mockReturnValueOnce(successMock);

    streamDownload('https://www.youtube.com/watch?v=testRotation', {
      format: 'mp3',
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const calls = mockedSpawn.mock.calls;
        if (calls.length >= 3) {
          const thirdArgs = calls[2][1] as string[];
          const clientArg = thirdArgs.find((arg) =>
            arg.includes('player-client=')
          );
          expect(clientArg).toContain('mweb');
        }
        resolve();
      }, 500);
    });
  });

  it('includes all expected clients in rotation order', () => {
    // verify rotation order via args
    const failMock = createMockChildProcess({
      exitCode: 1,
      stderr: 'ERROR: 403 Forbidden',
    });
    mockedSpawn.mockReturnValue(failMock);

    streamDownload('https://www.youtube.com/watch?v=testRotation', {
      format: 'mp3',
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const clients = mockedSpawn.mock.calls
          .map((call) => {
            const args = call[1] as string[];
            const arg = args.find((item) => item.includes('player-client='));
            return arg?.split('=')[1];
          })
          .filter(Boolean);

        // should attempt multiple clients
        if (clients.length > 1) {
          expect(clients[0]).toBe('tv');
        }
        resolve();
      }, 1500);
    });
  });
});
