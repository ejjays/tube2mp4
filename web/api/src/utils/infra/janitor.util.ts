import fs from 'node:fs';
import { logger } from './logger.util.js';
import path from 'node:path';
import { type Client } from '@libsql/client';

const fsp = fs.promises;
const HOUR_MS = 3600000;

// sweep this node's stale temp files
export async function cleanupLocalTemp(
  tempDir: string,
  maxAgeMs = HOUR_MS
): Promise<void> {
  let files: string[];
  try {
    files = await fsp.readdir(tempDir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const file of files) {
    const filePath = path.join(tempDir, file);
    try {
      const stats = await fsp.lstat(filePath);
      if (stats.isFile() && now - stats.mtimeMs > maxAgeMs) {
        await fsp.unlink(filePath).catch(() => {
          /* ignore */
        });
      }
    } catch {
      // ignore per-file errors
    }
  }
}

interface JanitorOpts {
  tempDir: string;
  db: Client | null;
}

// local sweep only
export async function runJanitor(opts: JanitorOpts): Promise<void> {
  try {
    await cleanupLocalTemp(opts.tempDir);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Janitor] tick error: ${message}`);
  }
}

// periodic housekeeping
export function startJanitor(opts: JanitorOpts): NodeJS.Timeout {
  const timer = setInterval(() => {
    runJanitor(opts).catch(() => {
      /* ignore */
    });
  }, HOUR_MS);
  timer.unref?.();
  return timer;
}
