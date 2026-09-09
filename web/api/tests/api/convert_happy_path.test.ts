import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

// ensure end-to-end stream delivery

const FIXTURE_PATH = new URL(
  '../fixtures/audio/minimal_sine.mp3',
  import.meta.url
).pathname;

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process'
    );
  return {
    ...actual,
    spawn: (cmd: string, args: readonly string[], opts: unknown) => {
      // mock yt-dlp source stream
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
    id: 'happyDl12345',
    title: 'Happy Path Test',
    uploader: 'Test Uploader',
    webpageUrl: 'https://www.youtube.com/watch?v=happyDl12345',
    duration: 30,
    extractorKey: 'youtube',
    isJsInfo: true,
    isPartial: false,
    isFullData: true,
    formats: [
      {
        formatId: '140',
        url: 'https://cdn.example.com/audio.m4a',
        extension: 'm4a',
        resolution: '128kbps',
        height: 0,
        vcodec: 'none',
        acodec: 'mp4a.40.2',
        isMuxed: false,
        isVideo: false,
        isAudio: true,
      },
    ],
    audioFormats: [
      {
        formatId: '140',
        url: 'https://cdn.example.com/audio.m4a',
        extension: 'm4a',
        quality: '128kbps',
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

describe('/convert — happy path', () => {
  it('returns 200 with audio Content-Type and a non-empty body', async () => {
    const targetUrl = 'https://www.youtube.com/watch?v=happyDl12345';

    const res = await request(app)
      .get('/convert')
      .query({
        url: targetUrl,
        format: 'm4a',
        formatId: '140',
        id: 'happyDlClient',
        token: 'happyDlClient',
        title: 'Happy Path Test',
        artist: 'Test Uploader',
      })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);

    // check for valid media type
    const contentType = res.headers['content-type'] || '';
    expect(contentType).toMatch(/audio|video|octet-stream/u);

    // confirm attachment disposition header
    const disposition = res.headers['content-disposition'] || '';
    expect(disposition).toContain('attachment');

    // ensure body content received
    const body = res.body as Buffer;
    expect(body).toBeInstanceOf(Buffer);
    expect(body.length).toBeGreaterThan(1024);
  }, 30_000);

  it('rejects /convert with no url', async () => {
    const res = await request(app).get('/convert');
    expect(res.status).toBe(400);
  });

  it('sets download_token cookie for safe token values', async () => {
    const res = await request(app)
      .get('/convert')
      .query({ url: 'https://www.youtube.com/watch?v=happyDl12345', token: 'abc_123-DEF' })
      .buffer(true)
      .parse((res, callback) => {
        res.on('data', () => {});
        res.on('end', () => callback(null, Buffer.alloc(0)));
      });

    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] || []).find((cookie) =>
      cookie.startsWith('download_token=')
    );
    expect(cookie).toContain('download_token=abc_123-DEF');
  });

  it('drops download_token cookie for injection-shaped tokens', async () => {
    const res = await request(app)
      .get('/convert')
      .query({
        url: 'https://www.youtube.com/watch?v=happyDl12345',
        token: 'x\r\nSet-Cookie: admin=1',
      })
      .buffer(true)
      .parse((res, callback) => {
        res.on('data', () => {});
        res.on('end', () => callback(null, Buffer.alloc(0)));
      });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    expect(
      (cookies || []).some((cookie) => cookie.startsWith('download_token='))
    ).toBe(false);
    expect(
      (cookies || []).some((cookie) => /(^|\s)admin=/u.test(cookie))
    ).toBe(false);
  });
});
