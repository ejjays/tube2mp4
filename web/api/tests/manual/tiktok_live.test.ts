import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { getGlobalDispatcher, setGlobalDispatcher, ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';
import { tiktok } from '../../src/services/extractors/index.js';

// live test, real tiktok fetch
// run on residential ip not datacenter
const RUN = process.env.LIVE_TEST === '1';
const ldescribe = RUN ? describe : describe.skip;

// tiktok captchas direct ips; proxy unblocks
const PROXY = process.env.LIVE_PROXY;
const TT_ENABLED = Boolean(PROXY) || process.env.TIKTOK_LIVE === '1';

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

const TT_URL = process.env.TIKTOK_LIVE_URL || liveUrls.tiktok?.url;

ldescribe('tiktok extractor (live)', () => {
  let original: Dispatcher | undefined;

  // route extractor fetches through residential proxy
  beforeAll(() => {
    if (PROXY) {
      original = getGlobalDispatcher();
      setGlobalDispatcher(new ProxyAgent(PROXY));
    }
  });

  // restore so proxy never leaks to siblings
  afterAll(() => {
    if (original) setGlobalDispatcher(original);
  });

  it('resolves a real tiktok video (needs LIVE_PROXY; direct ip gets captcha)', async (ctx) => {
    if (!TT_ENABLED) {
      ctx.skip();
      return;
    }
    expect(TT_URL, 'no tiktok url in fixtures').toBeTruthy();
    const info = await tiktok.getInfo(TT_URL, {});

    expect(
      info,
      'null — tiktok served captcha (ip flagged, try a proxy)'
    ).toBeTruthy();
    expect(info?.title, 'no title resolved').toBeTruthy();
    // canary for tiktok page changes
    expect(
      info?.formats?.length ?? 0,
      'no formats — tiktok changed or captcha'
    ).toBeGreaterThan(0);

    console.log(
      `[live] tiktok OK${PROXY ? ' (via proxy)' : ''}: "${info?.title}" — ${info?.formats?.length} format(s)`
    );
  }, 60000);
});
