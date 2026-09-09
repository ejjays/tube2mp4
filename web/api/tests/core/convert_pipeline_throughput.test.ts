import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// benchmark end-to-end stream performance

const MB = 1024 * 1024;
const FIXTURE_SIZE_MB = 16;
const FIXTURE_PATH = path.join(
  os.tmpdir(),
  `phantom_throughput_${process.pid}.bin`
);

beforeAll(() => {
  // create large file for throughput testing
  const buf = Buffer.alloc(FIXTURE_SIZE_MB * MB);
  // sparse byte pattern for integrity check
  for (let i = 0; i < buf.length; i += 1024) buf[i] = i & 0xff;
  fs.writeFileSync(FIXTURE_PATH, buf);
});

afterAll(() => {
  if (fs.existsSync(FIXTURE_PATH)) fs.unlinkSync(FIXTURE_PATH);
});

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process'
    );
  return {
    ...actual,
    spawn: (cmd: string, args: readonly string[], opts: unknown) => {
      // simulate stream source with fixture
      if (cmd === 'yt-dlp') {
        return actual.spawn(
          'cat',
          [FIXTURE_PATH],
          opts as Parameters<typeof actual.spawn>[2]
        );
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

vi.mock('../../src/services/extractors/youtube/index.js', () => ({
  getInfo: vi.fn().mockResolvedValue({
    type: 'video',
    id: 'throughput123',
    title: 'Throughput Bench',
    uploader: 'Bench',
    webpageUrl: 'https://www.youtube.com/watch?v=throughput123',
    duration: 60,
    extractorKey: 'youtube',
    isJsInfo: true,
    isFullData: true,
    formats: [
      {
        formatId: '140',
        url: 'https://cdn.example.com/audio.m4a',
        extension: 'm4a',
        vcodec: 'none',
        acodec: 'mp4a.40.2',
        isAudio: true,
      },
    ],
    audioFormats: [
      {
        formatId: '140',
        url: 'https://cdn.example.com/audio.m4a',
        extension: 'm4a',
        vcodec: 'none',
        acodec: 'mp4a.40.2',
        isAudio: true,
      },
    ],
  }),
  getStream: vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(EventEmitter as unknown as Readable)
    ),
}));

import app from '../../src/app.js';

describe('/convert — end-to-end pipeline throughput', () => {
  it(`pipes ${FIXTURE_SIZE_MB}MB end-to-end and logs MB/s + TTFB`, async () => {
    let firstByteAt = 0;
    let lastByteAt = 0;
    let totalReceived = 0;
    const t0 = Date.now();

    const res = await request(app)
      .get('/convert')
      .query({
        url: 'https://www.youtube.com/watch?v=throughput123',
        format: 'm4a',
        formatId: '140',
        id: 'throughputClient',
        token: 'throughputClient',
        title: 'Throughput Bench',
        artist: 'Bench',
      })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          if (firstByteAt === 0) firstByteAt = Date.now();
          lastByteAt = Date.now();
          totalReceived += chunk.length;
          chunks.push(chunk);
        });
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    const totalMs = Math.max(1, Date.now() - t0);
    const ttfbMs = firstByteAt > 0 ? firstByteAt - t0 : -1;
    const streamingMs = Math.max(1, lastByteAt - firstByteAt);
    const wallMbps = totalReceived / MB / (totalMs / 1000);
    const streamMbps = totalReceived / MB / (streamingMs / 1000);

    console.log(
      `[Throughput][/convert] size=${FIXTURE_SIZE_MB}MB total=${totalMs}ms TTFB=${ttfbMs}ms streamingOnly=${streamingMs}ms => wall=${wallMbps.toFixed(2)} MB/s, stream=${streamMbps.toFixed(2)} MB/s`
    );

    expect(res.status).toBe(200);
    expect(totalReceived).toBe(FIXTURE_SIZE_MB * MB);
    // streaming-only throughput floor
    expect(streamMbps).toBeGreaterThan(20);
    expect(ttfbMs).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
