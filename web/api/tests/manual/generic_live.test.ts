import { describe, it, expect } from 'vitest';
import { getInfo } from '../../src/services/extractors/generic.js';

// live test against real pages — run: LIVE_TEST=1 npx vitest run tests/manual/generic_live.test.ts
const RUN = process.env.LIVE_TEST === '1';
const ldescribe = RUN ? describe : describe.skip;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function probe(
  url: string,
  referer?: string,
  range?: string
): Promise<{ status: number; length: number; bytes: number }> {
  // archive.org rate-limits bursts with 500s and its cdn nodes flap:
  // treat 500 + connect failures as transient and retry with backoff
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: range ? 'GET' : 'HEAD',
        headers: {
          'User-Agent': UA,
          ...(referer ? { Referer: referer } : {}),
          ...(range ? { Range: range } : {}),
        },
      });
      if (res.status !== 500) {
        const length =
          res.status === 206
            ? (res.headers.get('content-range')?.match(/\/(\d+)$/u) ?? [])[1]
            : res.headers.get('content-length');
        const bytes = range ? (await res.arrayBuffer()).byteLength : 0;
        return {
          status: res.status,
          length: Number(length || 0),
          bytes,
        };
      }
    } catch {
      // connect timeout / dns flap — retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
  }
  return { status: 500, length: 0, bytes: 0 };
}

async function expectMediaReachable(formatUrl: string, referer?: string): Promise<void> {
  const head = await probe(formatUrl, referer);
  expect(head.status, `HEAD ${formatUrl}`).toBe(200);
  expect(head.length).toBeGreaterThan(1_000_000);
  const range = await probe(formatUrl, referer, 'bytes=0-1023');
  expect(range.status, `RANGE ${formatUrl}`).toBe(206);
  expect(range.bytes).toBe(1024);
}

ldescribe('generic extractor (live)', () => {
  it(
    'mdn direct mp4: pasted file url resolves without yt-dlp and downloads',
    { timeout: 60_000 },
    async () => {
      const url =
        'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
      const info = await getInfo(url, {});
      expect(info, 'direct mp4 should resolve in probeDirect').toBeTruthy();
      expect(info?.formats[0].url).toBe(url);
      await expectMediaReachable(url);
    }
  );

  it(
    'archive.org: js-rendered details page yields the real mp4 and range works',
    { timeout: 90_000 },
    async () => {
      const url = 'https://archive.org/details/BigBuckBunny_124';
      const info = await getInfo(url, {});
      expect(info, 'archive.org should resolve via yt-dlp generic').toBeTruthy();
      expect(info?.formats.length ?? 0).toBeGreaterThan(0);
      const video =
        info?.formats.find(
          (format) => format.isVideo && format.extension !== 'm3u8'
        ) ?? info?.formats[0];
      expect(video, 'expected a video format').toBeTruthy();
      await expectMediaReachable(video?.url ?? '', new URL(url).origin);
    }
  );

  it(
    'cbc: player page yields real stream formats reachable with referer',
    { timeout: 120_000 },
    async () => {
      const url = 'https://www.cbc.ca/player/play/video/9.7305466';
      const info = await getInfo(url, {});
      expect(info, 'cbc should resolve').toBeTruthy();
      expect(info?.formats.length ?? 0).toBeGreaterThan(0);
      const candidate =
        info?.formats.find((format) => format.extension !== 'm3u8') ??
        info?.formats[0];
      await expectMediaReachable(candidate?.url ?? '', new URL(url).origin);
    }
  );
});