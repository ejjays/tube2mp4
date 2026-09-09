import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.unmock('youtubei.js');
vi.unmock('got');
vi.unmock('undici');
vi.unmock('@libsql/client');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUN = process.env.VITEST_INCLUDE_E2E === '1' || process.env.E2E === '1';
const ldescribe = RUN ? describe : describe.skip;

const casesPath = path.join(__dirname, 'cases.json');
const rawCases = JSON.parse(fs.readFileSync(casesPath, 'utf8')) as import('./helpers.js').E2ECase[];

import { assertE2EMeta, isTransientBotError, shouldSkipForEnv, selectCases } from './helpers.js';

let getInfo: (url: string, opts?: Record<string, unknown>) => Promise<import('../../src/types/index.js').VideoInfo | null>;
let getExtractor: (url: string) => unknown;

beforeAll(async () => {
  try {
    const { server } = await import('../setup.js');
    server.close();
  } catch {
    // msw not started in e2e mode — expected
  }
  const mod = await import('../../src/services/extractors/index.js');
  getInfo = mod.getInfo;
  getExtractor = mod.getExtractor;
});

function tierMode(): string {
  if (process.env.TIER_MODE) return process.env.TIER_MODE;
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') return 'solid';
  return 'all';
}

function dispatchUrl(): string | undefined {
  return process.env.DISPATCH_URL || process.env.TEST_URL || undefined;
}

ldescribe('backend e2e probe (direct extractor, real network)', () => {
  const tier = tierMode();
  const single = dispatchUrl();
  const shardIndex = Number(process.env.SHARD_INDEX || '0');
  const shardTotal = Number(process.env.SHARD_TOTAL || '1');
  const cases = selectCases(rawCases, {
    tierMode: tier,
    shardIndex,
    shardTotal,
    singleUrl: single,
  });

  if (cases.length === 0) {
    it('no cases selected for shard/tier', () => {
      expect(cases.length).toBeGreaterThan(0);
    });
    return;
  }

  it.each(cases)(
    '$id [$tier] $url',
    async ({ id, url, tier: caseTier, expect: exp }) => {
      const skipReason = shouldSkipForEnv(id);
      if (skipReason) {
        console.warn(`[probe] skip ${id}: ${skipReason}`);
        return;
      }

      const hasExtractor = getExtractor(url);
      expect(hasExtractor, `no extractor for ${id} url=${url}`).toBeTruthy();

      const doRun = async (attempt = 1): Promise<import('../../src/types/index.js').VideoInfo | null> => {
        try {
          const opts: Record<string, unknown> = {};
          if (process.env.LIVE_PROXY) (opts as Record<string, string>).proxy = process.env.LIVE_PROXY;
          if (process.env.IG_COOKIE) (opts as Record<string, string>).cookie = process.env.IG_COOKIE;
          if (process.env.BILIBILI_COOKIE) (opts as Record<string, string>).cookie = process.env.BILIBILI_COOKIE;
          const info = await getInfo(url, opts as never);
          return info;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (isTransientBotError(message) && attempt < 3) {
            console.warn(`[probe] ${id} transient "${message.slice(0,120)}" retry ${attempt}`);
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
            return doRun(attempt + 1);
          }
          throw error;
        }
      };

      let info: import('../../src/types/index.js').VideoInfo | null = null;
      let threw: Error | null = null;
      try {
        info = await doRun();
      } catch (error) {
        threw = error instanceof Error ? error : new Error(String(error));
      }

      if (threw) {
        const message = threw.message;
        if (isTransientBotError(message)) {
          if (caseTier === 'soft') {
            console.warn(`[probe] soft ${id} transient fail ignored: ${message.slice(0,200)}`);
            return;
          }
          console.warn(`[probe] solid transient but will fail: ${message.slice(0,200)}`);
        }
        throw threw;
      }

      if (!info) {
        if (caseTier === 'soft') {
          console.warn(`[probe] soft ${id} returned null — ignored`);
          return;
        }
        expect(info, `probe ${id} returned null`).toBeTruthy();
        return;
      }

      const result = assertE2EMeta(info as never, exp, id);
      if (!result.passed) {
        console.error(`[probe] ${id} META FAIL: ${result.failures.join('; ')}`);
        console.error(`[probe] ${id} title="${result.title}" uploader="${result.uploader}" formats=${result.formats} thumb=${result.thumb.slice(0,80)}`);
      }
      if (caseTier === 'soft' && !result.passed) {
        console.warn(`[probe] soft ${id} failures ignored for gating`);
        return;
      }
      expect(result.failures, `[probe] ${id} ${result.failures.join(', ')}`).toEqual([]);
      console.log(`[probe] ${id} PASS title="${result.title.slice(0,60)}" uploader="${result.uploader}" fmts=${result.formats}`);
    },
    120_000
  );
});
