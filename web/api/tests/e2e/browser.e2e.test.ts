import { describe, it, expect, vi } from 'vitest';

vi.unmock('youtubei.js');
vi.unmock('got');
vi.unmock('undici');
vi.unmock('@libsql/client');

const RUN =
  (process.env.VITEST_INCLUDE_E2E === '1' || process.env.E2E === '1') &&
  process.env.BROWSER_E2E === '1';
const ldescribe = RUN ? describe : describe.skip;

ldescribe('backend e2e browser smoke (Playwright on GH, puppeteer-core on Termux)', () => {
  it(
    'GET /info returns json via real browser',
    async () => {
      const targetUrl = process.env.BROWSER_E2E_URL || 'https://vimeo.com/76979871';
      const backendUrl =
        process.env.BACKEND_URL || `http://127.0.0.1:${process.env.PORT || 5000}`;
      const apiUrl = `${backendUrl}/info?url=${encodeURIComponent(targetUrl)}`;

      const isTermux = process.platform === 'android';

      let body: string;

      if (isTermux) {
        const puppeteer = await import('puppeteer-core');
        const browser = await puppeteer.default.launch({
          headless: true,
          executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        });
        try {
          const page = await browser.newPage();
          await page.goto(apiUrl, { waitUntil: 'networkidle2', timeout: 60000 });
          body = await page.evaluate(() => document.body.innerText);
        } finally {
          await browser.close();
        }
      } else {
        const { chromium } = await import('playwright-core');
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.goto(apiUrl, { waitUntil: 'networkidle', timeout: 60000 });
          body = await page.evaluate(() => document.body.innerText);
        } finally {
          await browser.close();
        }
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error(`invalid json from ${apiUrl}: ${body.slice(0, 300)}`);
      }

      expect(data.title, 'missing title').toBeTruthy();
      expect(data.thumbnail || data.cover, 'missing thumbnail').toBeTruthy();
      const fmts = (data.formats as unknown[]) ?? [];
      expect(fmts.length, 'expected at least 1 format').toBeGreaterThan(0);
    },
    90_000
  );
});
