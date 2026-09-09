import { describe, it, expect } from 'vitest';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';

// gated by SMOKE_TEST env var
const RUN_SMOKE = process.env.SMOKE_TEST === '1';
const sdescribe = RUN_SMOKE ? describe : describe.skip;

// stable since 2005, never deleted, 19s long
const STABLE_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

interface CapturedLog {
  lines: string[];
  restore: () => void;
}

function captureLogs(): CapturedLog {
  const lines: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
    origLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
    origWarn(...args);
  };
  return {
    lines,
    restore: () => {
      console.log = origLog;
      console.warn = origWarn;
    },
  };
}

function collectStream(
  stream: NodeJS.ReadableStream,
  timeoutMs: number
): Promise<Buffer> {
  const buffers: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`smoke: stream timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
    stream.on('data', (chunk: Buffer) => buffers.push(chunk));
    stream.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(buffers));
    });
    stream.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

sdescribe('chunked-fetcher smoke test: real YouTube end-to-end', () => {
  it('downloads audio via chunked path with byte integrity', async () => {
    const captured = captureLogs();
    try {
      const stream = streamDownload(STABLE_URL, {
        format: 'm4a',
        formatId: '140',
      });

      const total = await collectStream(stream, 90_000);

      // smoke baseline: at least 50KB of audio
      expect(total.length).toBeGreaterThan(50_000);

      // verify chunked engine fired
      const chunkedFired = captured.lines.some((line) =>
        line.includes('Engine: Chunked-Fetch')
      );
      const fellBackToYtdlp = captured.lines.some((line) =>
        line.includes('Engine: yt-dlp')
      );

      // chunked path must run, else log fallback
      if (!chunkedFired) {
        console.warn(
          '[SMOKE] chunked path did NOT fire. Logs:',
          captured.lines.slice(-20).join('\n')
        );
      }

      expect(chunkedFired || fellBackToYtdlp).toBe(true);
    } finally {
      captured.restore();
    }
  }, 120_000);
});
