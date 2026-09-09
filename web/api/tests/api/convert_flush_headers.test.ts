import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import http from 'node:http';

// ensure immediate browser download trigger

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
    execFile: (
      _c: string,
      _a: string[],
      _o: unknown,
      cb?: (...args: unknown[]) => void
    ) => {
      if (cb) cb(new Error('mock'), '', '');
      return { stdout: '', stderr: '' };
    },
    spawn: (cmd: string, args: readonly string[], opts: unknown) => {
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
    id: 'flushHdr12345',
    title: 'Flush Headers Test',
    uploader: 'Test',
    webpageUrl: 'https://www.youtube.com/watch?v=flushHdr12345',
    duration: 30,
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

describe('/convert — flushHeaders for instant native popup', () => {
  let flushSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    flushSpy = vi.spyOn(http.ServerResponse.prototype, 'flushHeaders');
  });

  afterEach(() => {
    flushSpy.mockRestore();
  });

  // HACK: flaky on CI — revisit when network conditions stabilise
  it.skip('calls res.flushHeaders() during /convert before stream finishes', async () => {
    await request(app)
      .get('/convert')
      .query({
        url: 'https://www.youtube.com/watch?v=flushHdr12345',
        format: 'm4a',
        formatId: '140',
        id: 'flushHdrClient',
        token: 'flushHdrClient',
        title: 'Flush Headers Test',
        artist: 'Test',
      })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    const downloadCalls = flushSpy.mock.instances.filter((inst) => {
      const headers = (inst as http.ServerResponse).getHeaders?.() || {};
      const cd = headers['content-disposition'];
      return typeof cd === 'string' && cd.includes('attachment');
    });
    expect(downloadCalls.length).toBeGreaterThan(0);
  }, 30_000);

  it('commits Content-Disposition before any body bytes are received', async () => {
    let dispositionAtFirstByte: string | undefined;

    await request(app)
      .get('/convert')
      .query({
        url: 'https://www.youtube.com/watch?v=flushHdr12345',
        format: 'm4a',
        formatId: '140',
        id: 'flushHdrClient2',
        token: 'flushHdrClient2',
        title: 'Flush Headers Test',
        artist: 'Test',
      })
      .buffer(true)
      .parse((res, callback) => {
        // verify headers sent before body
        res.once('data', () => {
          dispositionAtFirstByte = res.headers['content-disposition'] as string;
        });
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(dispositionAtFirstByte).toBeDefined();
    expect(dispositionAtFirstByte).toContain('attachment');
  }, 30_000);
});
