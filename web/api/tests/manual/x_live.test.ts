import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { x } from '../../src/services/extractors/index.js';

// live test, real x fetch
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

const X_URL = process.env.X_LIVE_URL || liveUrls.x?.url;

ldescribe('x extractor (live)', () => {
  it('resolves a real x video to playable formats', async () => {
    expect(X_URL, 'no x url in fixtures').toBeTruthy();
    const info = await x.getInfo(X_URL, {});

    expect(info, 'extractor returned null — likely broken').toBeTruthy();
    expect(info?.title, 'no title resolved').toBeTruthy();
    // canary for x page changes
    expect(
      info?.formats?.length ?? 0,
      'no formats — x likely changed, extractor needs a fix'
    ).toBeGreaterThan(0);

    console.log(
      `[live] x OK: "${info?.title}" — ${info?.formats?.length} format(s)`
    );
  }, 60000);
});
