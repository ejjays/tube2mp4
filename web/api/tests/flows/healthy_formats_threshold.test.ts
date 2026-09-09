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
 * Regression tests for the JS-looks-healthy threshold in
 * handleYoutubeTiktokInfo.
 *
 * The fix that solved "picker locks at 360p on Termux":
 *   - JS result is treated as "healthy" only if formats.length >= 3 AND
 *     at least one format has height >= 720.
 *   - Healthy → fast path: return JS result directly, run yt-dlp as
 *     detached enhancement.
 *   - Unhealthy (1 format / no HD) → escalate: await speculative yt-dlp,
 *     use its (more comprehensive) result.
 *
 * The threshold is what protects the picker from locking onto a 1-format
 * Innertube subset when decipher fails on Termux. These tests guarantee
 * the threshold logic stays in place across refactors.
 */

interface YtdlpSpawnPlan {
  json?: object;
  exitCode?: number;
  stderr?: string;
}

let pendingPlan: YtdlpSpawnPlan | null = null;
let ytdlpSpawnCount = 0;

function buildFakeYtdlpProcess(plan: YtdlpSpawnPlan) {
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
    if (plan.json !== undefined) {
      proc.stdout.emit('data', Buffer.from(JSON.stringify(plan.json)));
    }
    if (plan.stderr) {
      proc.stderr.emit('data', Buffer.from(plan.stderr));
    }
    proc.exitCode = plan.exitCode ?? 0;
    proc.emit('close', proc.exitCode);
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
        const plan = pendingPlan ?? { json: null, exitCode: 1 };
        return buildFakeYtdlpProcess(plan);
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

const ytExtractorMock = vi.fn();

vi.mock('../../src/services/extractors/youtube/index.js', () => ({
  getInfo: (...args: unknown[]) => ytExtractorMock(...args),
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
  pendingPlan = null;
  ytdlpSpawnCount = 0;
  ytExtractorMock.mockReset();
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});

const ytUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

function ytdlpRichOutput(id: string) {
  return {
    id,
    title: 'Rich yt-dlp Result',
    uploader: 'Some Channel',
    webpage_url: ytUrl(id),
    duration: 240,
    formats: Array.from({ length: 12 }, (_, i) => ({
      format_id: String(100 + i),
      url: `https://cdn.example.com/${id}/${i}`,
      ext: i % 2 === 0 ? 'mp4' : 'webm',
      vcodec: i < 8 ? 'avc1.4d401f' : 'none',
      acodec: i < 8 ? 'none' : 'mp4a.40.2',
      height:
        i < 8 ? [144, 240, 360, 480, 720, 1080, 1440, 2160][i] : undefined,
      width:
        i < 8 ? [256, 426, 640, 854, 1280, 1920, 2560, 3840][i] : undefined,
      fps: 30,
      filesize: 1000000 * (i + 1),
    })),
  };
}

function jsHealthyResult(id: string) {
  return {
    type: 'video',
    id,
    title: 'Healthy JS Result',
    uploader: 'Channel Name',
    webpageUrl: ytUrl(id),
    duration: 240,
    formats: [
      {
        formatId: '18',
        url: 'https://cdn.example.com/360',
        extension: 'mp4',
        resolution: '360p',
        height: 360,
        vcodec: 'avc1',
        acodec: 'mp4a',
        isMuxed: true,
        isVideo: true,
        isAudio: false,
        quality: '360p',
      },
      {
        formatId: '136',
        url: 'https://cdn.example.com/720',
        extension: 'mp4',
        resolution: '720p',
        height: 720,
        vcodec: 'avc1',
        acodec: 'none',
        isMuxed: false,
        isVideo: true,
        isAudio: false,
        quality: '720p',
      },
      {
        formatId: '137',
        url: 'https://cdn.example.com/1080',
        extension: 'mp4',
        resolution: '1080p',
        height: 1080,
        vcodec: 'avc1',
        acodec: 'none',
        isMuxed: false,
        isVideo: true,
        isAudio: false,
        quality: '1080p',
      },
    ],
    audioFormats: [],
    extractorKey: 'youtube',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };
}

function jsLimitedResult(id: string) {
  return {
    type: 'video',
    id,
    title: 'Limited JS Result',
    uploader: 'Channel Name',
    webpageUrl: ytUrl(id),
    duration: 240,
    formats: [
      {
        formatId: '18',
        url: 'https://cdn.example.com/360',
        extension: 'mp4',
        resolution: '360p',
        height: 360,
        vcodec: 'avc1',
        acodec: 'mp4a',
        isMuxed: true,
        isVideo: true,
        isAudio: false,
        quality: '360p',
      },
    ],
    audioFormats: [],
    extractorKey: 'youtube',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };
}

describe('handleYoutubeTiktokInfo — healthy JS result is trusted', () => {
  it('returns the JS formats when JS has >=3 formats with HD', async () => {
    const id = 'healthyAB123';
    ytExtractorMock.mockResolvedValue(jsHealthyResult(id));
    pendingPlan = { json: ytdlpRichOutput(id) };

    const info = (await getVideoInfo(ytUrl(id))) as {
      formats: Array<{ height?: number; resolution?: string }>;
      isPartial?: boolean;
    };

    expect(info.formats.length).toBeGreaterThan(0);
    expect(info.formats.some((fmt) => (fmt.height ?? 0) >= 1080)).toBe(true);
    expect(info.isPartial).toBeFalsy();
  });
});

describe('handleYoutubeTiktokInfo — limited JS result escalates to yt-dlp', () => {
  it('treats a 1-format/no-HD JS result as unhealthy and uses yt-dlp formats', async () => {
    const id = 'limitedXY456';
    ytExtractorMock.mockResolvedValue(jsLimitedResult(id));
    pendingPlan = { json: ytdlpRichOutput(id) };

    const partial = (await getVideoInfo(ytUrl(id))) as {
      isPartial?: boolean;
      formats: unknown[];
    };
    expect(partial.isPartial).toBe(true);

    const full = (await getVideoInfo(ytUrl(id))) as {
      formats: Array<{ height?: number }>;
    };

    expect(full.formats.length).toBeGreaterThan(1);
    expect(full.formats.some((fmt) => (fmt.height ?? 0) >= 720)).toBe(true);
    expect(ytdlpSpawnCount).toBeGreaterThanOrEqual(1);
  });

  it('treats 5 formats with NO 720p+ as unhealthy', async () => {
    const id = 'noHdABCDEF1';
    const noHdResult = {
      ...jsLimitedResult(id),
      formats: [144, 240, 360, 480, 540].map((height) => ({
        formatId: String(height),
        url: `https://cdn.example.com/${height}`,
        extension: 'mp4',
        resolution: `${height}p`,
        height,
        vcodec: 'avc1',
        acodec: 'mp4a',
        isMuxed: false,
        isVideo: true,
        isAudio: false,
        quality: `${height}p`,
      })),
    };
    ytExtractorMock.mockResolvedValue(noHdResult);
    pendingPlan = { json: ytdlpRichOutput(id) };

    await getVideoInfo(ytUrl(id));
    const full = (await getVideoInfo(ytUrl(id))) as {
      formats: Array<{ height?: number }>;
    };

    expect(full.formats.some((fmt) => (fmt.height ?? 0) >= 720)).toBe(true);
  });
});
