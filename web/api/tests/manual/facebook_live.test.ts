import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { facebook } from '../../src/services/extractors/index.js';

// live test, real facebook fetch
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

const FB_URL = process.env.FB_LIVE_URL || liveUrls.facebook?.url;

ldescribe('facebook extractor (live)', () => {
  it('resolves a real facebook video to playable formats', async () => {
    expect(FB_URL, 'no facebook url in fixtures').toBeTruthy();
    const info = await facebook.getInfo(FB_URL, {});

    expect(info, 'extractor returned null — likely broken').toBeTruthy();
    expect(info?.title, 'no title resolved').toBeTruthy();
    // canary for facebook page changes
    expect(
      info?.formats?.length ?? 0,
      'no formats — facebook likely changed, extractor needs a fix'
    ).toBeGreaterThan(0);

    console.log(
      `[live] facebook OK: "${info?.title}" — ${info?.formats?.length} format(s)`
    );
  }, 60000);
});
