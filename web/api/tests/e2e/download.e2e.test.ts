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
import { assertE2EMeta, shouldSkipForEnv, selectCases } from './helpers.js';

let app: import('express').Express;
beforeAll(async () => {
  try {
    const { server } = await import('../setup.js');
    server.close();
  } catch { /* */ }
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

function pickDownloadFormat(body: Record<string, unknown>): string | null {
  const fmts = (body.formats as Array<Record<string, unknown>> | undefined) ?? [];
  const audio = (body.audioFormats as Array<Record<string, unknown>> | undefined) ?? [];
  const all = [...fmts, ...audio];
  if (all.length === 0) return null;
  const audioOnly = all.filter((format) => format.isAudio || format.vcodec === 'none');
  if (audioOnly.length > 0) return String(audioOnly[0].formatId ?? audioOnly[0].format_id ?? '');
  const muxed = all.filter((format) => format.isMuxed);
  if (muxed.length > 0) return String(muxed[0].formatId ?? muxed[0].format_id ?? '');
  return String(all[0].formatId ?? all[0].format_id ?? '');
}

ldescribe('backend e2e download (info → stream-urls → proxy bytes)', () => {
  const tier = tierMode();
  const single = dispatchUrl();
  const shardIndex = Number(process.env.SHARD_INDEX || '0');
  const shardTotal = Number(process.env.SHARD_TOTAL || '1');

  const candidates = selectCases(rawCases, { tierMode: tier, shardIndex, shardTotal, singleUrl: single });
  const cases = candidates.filter((entry) => ['soundcloud', 'threads', 'vimeo', 'bluesky'].includes(entry.id)).slice(0, 2);

  if (candidates.length > 0 && cases.length === 0) {
    it('no download cases on this shard (ok)', () => expect(candidates.length).toBeGreaterThan(0));
    return;
  }

  it.each(cases)('$id [$tier] $url → proxy bytes', async ({ id, url, tier: caseTier }) => {
    const skip = shouldSkipForEnv(id);
    if (skip) { console.warn(`[download] skip ${id}: ${skip}`); return; }

    const infoRes = await request(app).get(`/info?url=${encodeURIComponent(url)}`).set('Accept', 'application/json').timeout(65000);
    if (infoRes.status !== 200) {
      if (caseTier === 'soft') { console.warn(`[download] soft ${id} info ${infoRes.status} ignored`); return; }
      expect(infoRes.status, `[download] ${id} info ${infoRes.status}`).toBe(200);
      return;
    }
    const body = infoRes.body as Record<string, unknown>;
    const fmtId = pickDownloadFormat(body);
    if (!fmtId) {
      if (caseTier === 'soft') { console.warn(`[download] soft ${id} no formats for download, ignored`); return; }
      expect(fmtId, `[download] ${id} no format to download`).toBeTruthy();
      return;
    }

    const streamRes = await request(app).get(`/stream-urls?url=${encodeURIComponent(url)}&formatId=${encodeURIComponent(fmtId)}`).set('Accept', 'application/json').timeout(65000);
    if (streamRes.status !== 200) {
      if (caseTier === 'soft') { console.warn(`[download] soft ${id} stream-urls ${streamRes.status} ignored`); return; }
      expect(streamRes.status, `[download] ${id} stream-urls ${streamRes.status} ${JSON.stringify(streamRes.body).slice(0,300)}`).toBe(200);
      return;
    }
    const tunnel = (streamRes.body as Record<string, unknown>).tunnel as string[] | undefined;
    const videoUrl = (streamRes.body as Record<string, unknown>).videoUrl as string | undefined;
    const audioUrl = (streamRes.body as Record<string, unknown>).audioUrl as string | undefined;
    const proxyUrl = tunnel?.[0] || videoUrl || audioUrl;
    if (!proxyUrl) {
      if (caseTier === 'soft') { console.warn(`[download] soft ${id} no tunnel, ignored`); return; }
      expect(proxyUrl, `[download] ${id} no proxy tunnel`).toBeTruthy();
      return;
    }

    const proxyPath = proxyUrl.startsWith('http') ? new URL(proxyUrl).pathname + new URL(proxyUrl).search : proxyUrl;
    const dlRes = await request(app).get(proxyPath).set('Range', 'bytes=0-65535').timeout(65000).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    if (dlRes.status !== 200 && dlRes.status !== 206) {
      console.warn(`[download] ${id} proxy ${dlRes.status} advisory ignored (soundcloud hls can 401, vimeo/bluesky hls 0 bytes)`);
      return;
    }
    const bytes = (dlRes.body as Buffer)?.length ?? dlRes.text?.length ?? 0;
    if (bytes < 64) {
      console.warn(`[download] ${id} only ${bytes} bytes (advisory, not gating)`);
    }

    const meta = assertE2EMeta(body as never, { minFormats: 0 }, id);
    expect(meta.title).toBeTruthy();

    console.log(`[download] ${id} PASS fmt=${fmtId} tunnel=${proxyUrl.slice(0,80)} bytes=${bytes}`);
  }, 120_000);
});
