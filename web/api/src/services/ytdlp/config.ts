import path from 'node:path';
import { logger } from '../../utils/infra/logger.util.js';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { secureFetch } from '../../utils/network/security.util.js';

export const TEMP_DIR = path.join(__dirname, '../../../temp');
export const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');

export const COMMON_ARGS = [
  '--ignore-config',
  '--no-playlist',
  '--force-ipv4',
  '--no-check-certificates',
  '--no-warnings',
  '--socket-timeout',
  '30',
  '--retries',
  '30',
  '--fragment-retries',
  '30',
  '--retry-sleep',
  '2',
  '--buffer-size',
  '1M',
  '--http-chunk-size',
  '10M',
  '--concurrent-fragments',
  '8',
  '--throttled-rate',
  '100K',
  '--no-colors',
  '--mark-watched',
  '--geo-bypass',
  '--no-video-multistreams',
  '--no-check-formats',
  '--format',
  'bestvideo+bestaudio/best',
  '--extractor-args',
  'youtube:player-skip=web',
];

// skip plugins when pot disabled
if (process.env.ENABLE_POT_PLUGIN !== '1') {
  COMMON_ARGS.push('--no-plugin-dirs');
}

const defaultCookiesPath = path.join(TEMP_DIR, 'cookies.txt');
const envCookiesPath = process.env.YTDLP_COOKIES_FILE;

// separate cookie env for yt-dlp
const cookieHeader = process.env.YT_DLP_COOKIE?.trim();
if (cookieHeader && !envCookiesPath) {
  try {
    const netscape = ['# Netscape HTTP Cookie File'];
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      netscape.push(
        `.youtube.com\tTRUE\t/\tTRUE\t1799999999\t${trimmed.slice(0, eq)}\t${trimmed.slice(eq + 1)}`
      );
    }
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    fs.writeFileSync(defaultCookiesPath, `${netscape.join('\n')}\n`);
    logger.info('[YtdlpConfig] Cookie file written from YT_DLP_COOKIE');
  } catch (error) {
    logger.info(
      `[YtdlpConfig] YT_COOKIE conversion failed: ${(error as Error).message}`
    );
  }
}

if (envCookiesPath && fs.existsSync(envCookiesPath)) {
  logger.info(`[YtdlpConfig] Using cookies from ENV: ${envCookiesPath}`);
  COMMON_ARGS.push('--cookies', envCookiesPath);
} else if (fs.existsSync(defaultCookiesPath)) {
  logger.info(
    `[YtdlpConfig] Using cookies from DEFAULT: ${defaultCookiesPath}`
  );
  COMMON_ARGS.push('--cookies', defaultCookiesPath);
} else {
  logger.info('[YtdlpConfig] No cookies file found');
}

export async function bootstrapCookies(): Promise<void> {
  if (COMMON_ARGS.includes('--cookies')) return;
  const url = process.env.COOKIES_URL;
  if (!url) return;
  try {
    let cleanUrl = url;
    while (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    let res = await secureFetch(`${cleanUrl}/youtube_cookies.txt`);
    if (!res.ok) res = await secureFetch(cleanUrl);
    if (!res.ok) return;
    let text = await res.text();
    if (!/\byoutube\.com\b/u.test(text)) return;
    // fix malformed header for yt-dlp compatibility
    if (!text.startsWith('# Netscape HTTP Cookie File')) {
      text = text.replace(/^#[^\n]*\n/, '# Netscape HTTP Cookie File\n');
    }
    fs.mkdirSync(path.dirname(defaultCookiesPath), { recursive: true });
    fs.writeFileSync(defaultCookiesPath, text);
    COMMON_ARGS.push('--cookies', defaultCookiesPath);
    logger.info('[YtdlpConfig] Cookies fetched from remote');
  } catch {
    // non-critical, proceed without
  }
}

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export const REFERER_MAP: Record<string, string> = {
  'facebook.com': 'https://www.facebook.com/',
  'bilibili.com': 'https://www.bilibili.com/',
  'x.com': 'https://x.com/',
};
