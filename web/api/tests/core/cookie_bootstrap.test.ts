import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMMON_ARGS,
  TEMP_DIR,
  bootstrapCookies,
} from '../../src/services/ytdlp/config.js';

const COOKIES_PATH = path.join(TEMP_DIR, 'cookies.txt');

function resetCommonArgs(): void {
  // remove any --cookies flag and its value
  while (true) {
    const idx = COMMON_ARGS.indexOf('--cookies');
    if (idx === -1) break;
    COMMON_ARGS.splice(idx, 2);
  }
}

vi.mock('../../src/utils/network/security.util.js', () => ({
  secureFetch: vi.fn(),
  getSecureUndiciAgent: vi.fn(() => null),
  resolveAndValidateHost: vi.fn(),
}));

import { secureFetch } from '../../src/utils/network/security.util.js';
const mockedFetch = vi.mocked(secureFetch);

const SAMPLE_BAD_HEADER = `# Netscape NEW COKKIE
# https://curl.haxx.se/rfc/cookie_spec.html
.youtube.com\tTRUE\t/\tTRUE\t1814451931\tPREF\ttz=Asia.Manila
.youtube.com\tTRUE\t/\tTRUE\t1791420556\t__Secure-BUCKET\tCNkB
`;

const SAMPLE_GOOD_HEADER = `# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t1814451931\tPREF\ttz=Asia.Manila
`;

describe('Cookie bootstrap (Phase 1.5.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommonArgs();
    process.env.COOKIES_URL = 'https://example.com/cookies-host';
    if (fs.existsSync(COOKIES_PATH)) fs.unlinkSync(COOKIES_PATH);
  });

  afterEach(() => {
    resetCommonArgs();
    delete process.env.COOKIES_URL;
    if (fs.existsSync(COOKIES_PATH)) fs.unlinkSync(COOKIES_PATH);
  });

  it('rewrites malformed "Netscape NEW COKKIE" header to "Netscape HTTP Cookie File"', async () => {
    mockedFetch.mockImplementation((url: string) => {
      if (url.endsWith('/youtube_cookies.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }
      return Promise.resolve(new Response(SAMPLE_BAD_HEADER, { status: 200 }));
    });

    await bootstrapCookies();

    const written = fs.readFileSync(COOKIES_PATH, 'utf8');
    expect(written.split('\n')[0]).toBe('# Netscape HTTP Cookie File');
    expect(written).not.toContain('NEW COKKIE');
    expect(written).toContain('.youtube.com');
  });

  it('preserves valid "Netscape HTTP Cookie File" header unchanged', async () => {
    mockedFetch.mockImplementation((url: string) => {
      if (url.endsWith('/youtube_cookies.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }
      return Promise.resolve(new Response(SAMPLE_GOOD_HEADER, { status: 200 }));
    });

    await bootstrapCookies();

    const written = fs.readFileSync(COOKIES_PATH, 'utf8');
    expect(written.split('\n')[0]).toBe('# Netscape HTTP Cookie File');
    expect(written).toContain('.youtube.com');
  });

  it('skips download when content does not contain youtube.com (invalid cookies)', async () => {
    mockedFetch.mockResolvedValue(
      new Response('not a cookie file', { status: 200 })
    );

    await bootstrapCookies();

    expect(fs.existsSync(COOKIES_PATH)).toBe(false);
  });

  it('falls back to base URL when /youtube_cookies.txt returns 404', async () => {
    const calls: string[] = [];
    mockedFetch.mockImplementation((url: string) => {
      calls.push(url);
      if (url.endsWith('/youtube_cookies.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }
      return Promise.resolve(new Response(SAMPLE_BAD_HEADER, { status: 200 }));
    });

    await bootstrapCookies();

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('/youtube_cookies.txt');
    expect(calls[1]).not.toContain('/youtube_cookies.txt');
    expect(fs.existsSync(COOKIES_PATH)).toBe(true);
  });
});
