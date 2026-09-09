import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { instagram } from '../../src/services/extractors/index.js';

// live test, real instagram fetch
// run on residential ip not datacenter
const RUN = process.env.LIVE_TEST === '1';
const ldescribe = RUN ? describe : describe.skip;

// cookie OPTIONAL now — extractor resolves public posts logged-out
const IG_COOKIE = process.env.IG_LIVE_COOKIE;

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

const IG_URL = process.env.IG_LIVE_URL || liveUrls.instagram?.url;

ldescribe('instagram extractor (live)', () => {
  it('resolves a real instagram reel without a login cookie', async () => {
    expect(IG_URL, 'no instagram url in fixtures').toBeTruthy();
    const info = await instagram.getInfo(
      IG_URL,
      IG_COOKIE ? { cookie: IG_COOKIE } : {}
    );

    expect(info, 'extractor returned null — likely broken').toBeTruthy();
    expect(info?.title, 'no title resolved').toBeTruthy();
    // canary: IG changed logged-out query or gated post
    expect(
      info?.formats?.length ?? 0,
      'no formats — instagram changed or post is gated'
    ).toBeGreaterThan(0);

    console.log(
      `[live] instagram OK (cookie=${Boolean(IG_COOKIE)}): "${info?.title}" — ${info?.formats?.length} format(s)`
    );
  }, 60000);
});
