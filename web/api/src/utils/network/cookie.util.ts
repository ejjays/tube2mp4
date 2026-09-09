import fs from 'node:fs';
import { logger } from '../infra/logger.util.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { secureFetch } from './security.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COOKIES_DIR = path.join(__dirname, '../../../temp/cookies');

export async function downloadCookies(type: string): Promise<string | null> {
  const sanitizedType = path.basename(type).replace(/[^a-zA-Z0-9_-]/g, '');
  const cookiePath = path.join(COOKIES_DIR, `${sanitizedType}_cookies.txt`);

  if (fs.existsSync(cookiePath)) {
    const stats = fs.statSync(cookiePath);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs < 86400000) return cookiePath; // 24h cache
  }

  try {
    const cookiesUrl = process.env.COOKIES_URL;
    if (!cookiesUrl) return null;

    if (!fs.existsSync(COOKIES_DIR))
      fs.mkdirSync(COOKIES_DIR, { recursive: true });

    const response = await secureFetch(`${cookiesUrl}/${type}_cookies.txt`);
    if (!response.ok) {
      let stripped = cookiesUrl;
      while (stripped.endsWith('/')) stripped = stripped.slice(0, -1);
      const fallback = await secureFetch(stripped);
      if (!fallback.ok) return null;
      let text = await fallback.text();
      if (!text.startsWith('# Netscape HTTP Cookie File')) {
        text = text.replace(/^#[^\n]*\n/, '# Netscape HTTP Cookie File\n');
      }
      fs.writeFileSync(cookiePath, text);
      return cookiePath;
    }

    let text = await response.text();
    if (!text.startsWith('# Netscape HTTP Cookie File')) {
      text = text.replace(/^#[^\n]*\n/, '# Netscape HTTP Cookie File\n');
    }
    fs.writeFileSync(cookiePath, text);
    return cookiePath;
  } catch (error) {
    logger.error(
      `[Cookies] Download failed for ${type}:`,
      (error as Error).message
    );
    return null;
  }
}

export function parseCookieFile(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const pairs: string[] = [];

  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
    }
  }
  return pairs.join('; ');
}
