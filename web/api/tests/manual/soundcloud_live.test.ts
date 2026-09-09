import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { soundcloud } from '../../src/services/extractors/index.js';

// live test, real soundcloud fetch
// run on residential ip not datacenter
const RUN = process.env.LIVE_TEST === '1';
const ldescribe = RUN ? describe : describe.skip;

interface LiveUrlEntry {
  url: string;
  note?: string;
}

// volatile urls live in one editable json
const liveUrls = JSON.parse(
  readFileSync(
    new URL('../fixtures/live-extractor-urls.json', import.meta.url),
    'utf8'
  )
) as Record<string, LiveUrlEntry>;

const SC_URL = process.env.SOUNDCLOUD_LIVE_URL || liveUrls.soundcloud?.url;

ldescribe('soundcloud extractor (live)', () => {
  it('resolves a real soundcloud track to playable formats', async () => {
    expect(SC_URL, 'no soundcloud url in fixtures').toBeTruthy();
    const info = await soundcloud.getInfo(SC_URL, {});

    expect(info, 'extractor returned null — likely broken').toBeTruthy();
    expect(info?.title, 'no title resolved').toBeTruthy();
    // canary for soundcloud api changes
    expect(
      info?.formats?.length ?? 0,
      'no formats — soundcloud likely changed, extractor needs a fix'
    ).toBeGreaterThan(0);

    console.log(
      `[live] soundcloud OK: "${info?.title}" — ${info?.formats?.length} format(s)`
    );
  }, 60000);
});
