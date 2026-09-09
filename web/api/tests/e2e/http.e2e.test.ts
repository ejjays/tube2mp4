import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

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

let app: import('express').Express;

beforeAll(async () => {
  try {
    const { server } = await import('../setup.js');
    server.close();
  } catch {
    // msw not started in e2e mode — expected
  }
  const mod = await import('../../src/app.js');
  app = (mod.default ?? mod) as unknown as import('express').Express;
});

function tierMode(): string {
  if (process.env.TIER_MODE) return process.env.TIER_MODE;
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') return 'solid';
  return 'all';
}

function dispatchUrl(): string | undefined {
  return process.env.DISPATCH_URL || process.env.TEST_URL || undefined;
}

ldescribe('backend e2e http (GET /info, real network)', () => {
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
        console.warn(`[http] skip ${id}: ${skipReason}`);
        return;
      }

      const res = await request(app)
        .get(`/info?url=${encodeURIComponent(url)}`)
        .set('Accept', 'application/json')
        .timeout(65000);

      if (res.status === 504 || res.status === 429) {
        const message = JSON.stringify(res.body).slice(0, 300);
        if (caseTier === 'soft') {
          console.warn(`[http] soft ${id} transient ${res.status} ignored: ${message}`);
          return;
        }
        if (isTransientBotError(message)) {
          console.warn(`[http] solid transient ${res.status} will fail: ${message}`);
        }
        expect(res.status, `[http] ${id} status ${res.status} body=${message}`).toBe(200);
        return;
      }

      if (res.status !== 200) {
        const body = JSON.stringify(res.body).slice(0, 500);
        if (caseTier === 'soft') {
          console.warn(`[http] soft ${id} status ${res.status} ignored: ${body}`);
          return;
        }
        expect(res.status, `[http] ${id} expected 200 got ${res.status} body=${body}`).toBe(200);
        return;
      }

      const body = res.body as Record<string, unknown>;
      if (!body || typeof body.title !== 'string') {
        if (caseTier === 'soft') {
          console.warn(`[http] soft ${id} missing title, ignored`);
          return;
        }
        expect(body.title, `[http] ${id} missing title`).toBeTruthy();
        return;
      }

      const result = assertE2EMeta(body as never, exp, id);
      if (!result.passed) {
        console.error(`[http] ${id} META FAIL: ${result.failures.join('; ')}`);
        console.error(`[http] ${id} title="${result.title}" uploader="${result.uploader}" fmts=${result.formats} thumb=${String(body.thumbnail ?? body.cover ?? '').slice(0, 80)}`);
      }
      if (caseTier === 'soft' && !result.passed) {
        console.warn(`[http] soft ${id} failures ignored for gating`);
        return;
      }
      expect(result.failures, `[http] ${id} ${result.failures.join(', ')}`).toEqual([]);
      console.log(`[http] ${id} PASS title="${result.title.slice(0, 60)}" uploader="${result.uploader}" fmts=${result.formats}`);
    },
    120_000
  );
});
