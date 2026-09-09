import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { Request, Response } from 'express';
import type { Format } from '../../src/types/index.js';

// stub upstream fetch; no real network
vi.mock('../../src/utils/network/proxy.util.js', async (importActual) => {
  const actual =
    await importActual<
      typeof import('../../src/utils/network/proxy.util.js')
    >();
  return {
    ...actual,
    pipeWebStream: vi.fn((_url: string, res: Response): Promise<boolean> => {
      res.status(200);
      res.end('FAKE_MP4_BYTES');
      return Promise.resolve(true);
    }),
  };
});

import app from '../../src/app.js';
import { buildProxyUrl } from '../../src/utils/media/stream.util.js';
import { pipeWebStream } from '../../src/utils/network/proxy.util.js';

const req = {
  headers: {},
  get: () => 'localhost:5000',
  protocol: 'http',
} as unknown as Request;

// direct format yields an encoded rawUrl
const directFormat = {
  formatId: '22',
  extension: 'mp4',
  url: 'https://r1.googlevideo.com/videoplayback?id=xyz&n=abc',
} as unknown as Format;

const pathOf = (signed: string): string => {
  const parsed = new URL(signed);
  return parsed.pathname + parsed.search;
};

describe('signed /proxy end-to-end', () => {
  it('streams a validly signed proxy URL', async () => {
    vi.mocked(pipeWebStream).mockClear();
    const signed = buildProxyUrl(
      req,
      directFormat,
      'https://youtube.com/watch?v=abc'
    );
    const res = await request(app).get(pathOf(signed as string));
    expect(res.status).toBe(200);
    expect(vi.mocked(pipeWebStream)).toHaveBeenCalledTimes(1);
  });

  it('blocks a tampered signature before fetching upstream', async () => {
    vi.mocked(pipeWebStream).mockClear();
    const signed = buildProxyUrl(
      req,
      directFormat,
      'https://youtube.com/watch?v=abc'
    );
    const tampered = pathOf(signed as string).replace(
      /sig=[^&]+/u,
      'sig=forged'
    );
    const res = await request(app).get(tampered);
    expect(res.status).toBe(403);
    expect(vi.mocked(pipeWebStream)).not.toHaveBeenCalled();
  });
});
