import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';

// e2e: mock yt-dlp writes temp file

const VIDEO_PAYLOAD = Buffer.alloc(2 * 1024 * 1024, 0xab);

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process'
    );
  return {
    ...actual,
    spawn: (cmd: string, args: readonly string[], opts: unknown) => {
      if (cmd !== 'yt-dlp') {
        return (
          actual.spawn as unknown as (
            c: string,
            a: readonly string[],
            o: unknown
          ) => unknown
        )(cmd, args, opts);
      }
      // mock: write file then exit
      const argsArray = args as string[];
      const oIdx = argsArray.lastIndexOf('-o');
      const outputPath = oIdx >= 0 ? argsArray[oIdx + 1] : '-';
      if (outputPath !== '-') {
        // real file write — emulates native dl
        try {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, VIDEO_PAYLOAD);
        } catch {
          // ignore
        }
      }
      // run quick `true` to exit cleanly
      return (
        actual.spawn as unknown as (
          c: string,
          a: readonly string[],
          o: unknown
        ) => unknown
      )('true', [], opts);
    },
  };
});

vi.mock('../../src/services/extractors/youtube/index.js', () => ({
  getInfo: vi.fn().mockResolvedValue({
    type: 'video',
    id: 'e2eMergeTest',
    title: 'E2E Merge Test',
    uploader: 'Test',
    webpageUrl: 'https://www.youtube.com/watch?v=e2eMergeTest',
    duration: 60,
    extractorKey: 'youtube',
    isJsInfo: true,
    isPartial: false,
    isFullData: true,
    formats: [
      {
        formatId: '137',
        url: null,
        extension: 'mp4',
        resolution: '1080p',
        height: 1080,
        vcodec: 'avc1.640028',
        acodec: 'none',
        isMuxed: false,
        isVideo: true,
        isAudio: false,
      },
    ],
    videoFormats: [
      {
        formatId: '137',
        url: null,
        extension: 'mp4',
        resolution: '1080p',
        height: 1080,
        vcodec: 'avc1.640028',
        acodec: 'none',
        isMuxed: false,
        isVideo: true,
      },
    ],
  }),
  getStream: vi.fn(),
}));

import app from '../../src/app.js';

describe('/convert E2E — temp file flow (Phase 1.5.7)', () => {
  it('downloads merge format via temp file and pipes real bytes to client', async () => {
    const res = await request(app)
      .get('/convert')
      .query({
        url: 'https://www.youtube.com/watch?v=e2eMergeTest',
        format: 'mp4',
        formatId: '137',
        id: 'e2eMergeClient',
        token: 'e2eMergeClient',
        title: 'E2E Merge Test',
        artist: 'Test',
      })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);

    // headers
    expect(res.headers['content-type']).toMatch(/video|octet-stream/u);
    expect(res.headers['content-disposition']).toContain('attachment');

    // body matches what yt-dlp wrote
    const body = res.body as Buffer;
    expect(body).toHaveLength(VIDEO_PAYLOAD.length);
    expect(body.equals(VIDEO_PAYLOAD)).toBe(true);
  }, 30_000);
});
