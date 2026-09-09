import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest';
import { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';

/**
 * Lightweight-goal guarantee: a successful TikTok pure-JS extraction must
 * NOT spawn yt-dlp. The universal-data ladder is authoritative, so
 * handleYoutubeTiktokInfo treats any TikTok JS result with formats as
 * healthy and skips both the enhancement and speculative yt-dlp passes.
 */

let ytdlpSpawnCount = 0;

function buildFakeYtdlpProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & Readable;
    stderr: EventEmitter & Readable;
    pid: number;
    exitCode: number | null;
  };
  proc.stdout = new EventEmitter() as EventEmitter & Readable;
  proc.stderr = new EventEmitter() as EventEmitter & Readable;
  proc.pid = 99999;
  proc.exitCode = null;
  setImmediate(() => {
    proc.exitCode = 0;
    proc.emit('close', 0);
  });
  return proc;
}

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process'
    );
  return {
    ...actual,
    spawn: (cmd: string, args: readonly string[], opts: unknown) => {
      if (cmd === 'yt-dlp') {
        ytdlpSpawnCount += 1;
        return buildFakeYtdlpProcess();
      }
      return (
        actual.spawn as unknown as (
          c: string,
          a: readonly string[],
          o: unknown
        ) => unknown
      )(cmd, args, opts);
    },
  };
});

const tkExtractorMock = vi.fn();
vi.mock('../../src/services/extractors/tiktok.js', () => ({
  getInfo: (...args: unknown[]) => tkExtractorMock(...args),
  getStream: vi.fn(),
}));

let getVideoInfo: (
  url: string,
  cookieArgs?: string[],
  forceRefresh?: boolean,
  signal?: AbortSignal | null,
  clientId?: string | null
) => Promise<unknown>;

beforeAll(async () => {
  ({ getVideoInfo } = await import('../../src/services/ytdlp/info.js'));
});

beforeEach(() => {
  ytdlpSpawnCount = 0;
  tkExtractorMock.mockReset();
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});

const TIKTOK_URL = 'https://www.tiktok.com/@test/video/123456';

// 2 formats: healthy for tiktok
function tiktokJsResult() {
  return {
    type: 'video',
    id: '123456',
    title: 'TikTok Healthy',
    uploader: 'Test Author',
    webpageUrl: TIKTOK_URL,
    thumbnail: 'https://thumb.jpg',
    duration: 15,
    formats: [
      {
        formatId: 'normal_720_0',
        url: 'https://video.tiktok.com/v/test720.mp4',
        extension: 'mp4',
        width: 720,
        height: 1280,
        resolution: '720x1280',
        quality: '720p',
        vcodec: 'h264',
        acodec: 'aac',
        isMuxed: true,
        isVideo: true,
        isAudio: false,
      },
      {
        formatId: 'lowest_540_0',
        url: 'https://video.tiktok.com/v/test540.mp4',
        extension: 'mp4',
        width: 576,
        height: 1024,
        resolution: '576x1024',
        quality: '576p',
        vcodec: 'h264',
        acodec: 'aac',
        isMuxed: true,
        isVideo: true,
        isAudio: false,
      },
    ],
    audioFormats: [],
    extractorKey: 'tiktok',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: true,
  };
}

describe('TikTok info path — JS success never spawns yt-dlp', () => {
  it('returns JS formats directly with zero yt-dlp spawns', async () => {
    tkExtractorMock.mockResolvedValue(tiktokJsResult());

    const info = (await getVideoInfo(TIKTOK_URL)) as {
      formats: unknown[];
      isPartial?: boolean;
    };

    expect(info.formats.length).toBeGreaterThan(0);
    expect(info.isPartial).toBeFalsy();
    expect(ytdlpSpawnCount).toBe(0);
  });
});
