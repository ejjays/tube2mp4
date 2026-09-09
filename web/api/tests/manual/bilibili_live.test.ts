import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bilibili } from '../../src/services/extractors/index.js';

// live test, real bilibili.tv fetch
// run on a residential ip not a datacenter
const RUN = process.env.LIVE_TEST === '1';
const ldescribe = RUN ? describe : describe.skip;

interface LiveUrlEntry {
  url: string;
  note?: string;
}

const liveUrls = JSON.parse(
  readFileSync(
    new URL('../fixtures/live-extractor-urls.json', import.meta.url),
    'utf8'
  )
) as Record<string, LiveUrlEntry>;

const BILI_URL = process.env.BILIBILI_LIVE_URL || liveUrls.bilibili?.url;

ldescribe('bilibili extractor (live)', () => {
  it('resolves a real bilibili.tv video to a DASH ladder with paired audio', async () => {
    expect(BILI_URL, 'no bilibili url in fixtures').toBeTruthy();
    const info = await bilibili.getInfo(BILI_URL, {});

    expect(info, 'extractor returned null — likely broken').toBeTruthy();
    if (!info) return;

    expect(info.title, 'no title resolved').toBeTruthy();
    expect(info.extractorKey).toBe('bilibili');

    // canary for bilibili.tv playurl api changes
    expect(
      info.formats?.length ?? 0,
      'no video formats — bilibili api likely changed'
    ).toBeGreaterThan(0);
    expect(
      info.audioFormats?.length ?? 0,
      'no audio formats — bilibili api likely changed'
    ).toBeGreaterThan(0);

    // every video stream must be avc1, video-only, and paired with audio for mux
    for (const format of info.formats) {
      expect(format.vcodec?.startsWith('avc1')).toBe(true);
      expect(format.acodec).toBe('none');
      expect(format.url).toContain('http');
      expect(format.audioUrl, 'video format missing audioUrl').toContain(
        'http'
      );
    }

    console.log(
      `[live] bilibili OK: "${info.title}" — ${info.formats.length} video / ${info.audioFormats?.length} audio, top=${info.formats[0].resolution}, dur=${info.duration}s`
    );
  }, 60000);
});
