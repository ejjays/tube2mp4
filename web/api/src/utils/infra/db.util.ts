import { createClient } from '@libsql/client';
import { logger } from './logger.util.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../.env') });

// native libsql binding is stubbed to empty for termux/android — a file: url
// would crash cryptically. throw loud, keep file:test.db test exception.
export function resolveDbUrl(isTest: boolean): string | undefined {
  if (isTest) return 'file:test.db';
  const url = process.env.TURSO_URL?.replace('libsql://', 'https://');
  if (url?.startsWith('file:')) {
    throw new Error(
      'libsql native binding is overridden for termux — use an https (turso) url'
    );
  }
  return url;
}

const client = (() => {
  // android bypass
  if (process.platform === 'android') {
    logger.info('[DB] Mocking LibSQL for Termux compatibility');
    return {
      execute: () => Promise.resolve({ rows: [] }),
      batch: () => Promise.resolve([]),
      close: () => {},
    } as unknown as ReturnType<typeof createClient>;
  }

  const isTest = process.env.NODE_ENV === 'test';
  const url = resolveDbUrl(isTest);
  const authToken = isTest ? undefined : process.env.TURSO_AUTH_TOKEN;

  try {
    if (url && (authToken || isTest)) {
      const dbClient = createClient({
        url,
        authToken,
      });
      logger.info(`[DB] Connected to ${isTest ? 'Local SQLite' : 'Turso'}`);
      return dbClient;
    } else {
      logger.warn(
        '[DB] Turso credentials missing, running in local-only mode'
      );
    }
  } catch (error) {
    logger.error('[DB] Connection failed:', (error as Error).message);
  }
  return null;
})();

export default client;

export async function queryConfig(key: string): Promise<string | null> {
  if (!client) return null;
  try {
    const result = await client.execute({
      sql: 'SELECT value FROM configs WHERE key = ? LIMIT 1',
      args: [key],
    });
    return result.rows[0]?.value as string;
  } catch (error) {
    logger.error(
      `[DB] Config lookup failed for ${key}:`,
      (error as Error).message
    );
    return null;
  }
}

export async function queryConfigWithMeta(
  key: string
): Promise<{ value: string; updatedAt: number } | null> {
  if (!client) return null;
  try {
    const result = await client.execute({
      sql: 'SELECT value, updated_at FROM configs WHERE key = ? LIMIT 1',
      args: [key],
    });
    const row = result.rows[0];
    if (!row?.value) return null;
    return {
      value: row.value as string,
      updatedAt: Number(row.updated_at) || 0,
    };
  } catch (error) {
    logger.error(
      `[DB] Config meta lookup failed for ${key}:`,
      (error as Error).message
    );
    return null;
  }
}

export async function saveSession(
  sessionId: string,
  url: string
): Promise<void> {
  if (!client) return;
  try {
    await client.execute({
      sql: 'INSERT INTO sessions (id, url, created_at) VALUES (?, ?, ?)',
      args: [sessionId, url, Date.now()],
    });
  } catch (error) {
    logger.error('[DB] Session save failed:', (error as Error).message);
  }
}

export async function cleanupOldSessions(): Promise<void> {
  if (!client) return;
  try {
    const dayAgo = Date.now() - 86400000;
    await client.execute({
      sql: 'DELETE FROM sessions WHERE created_at < ?',
      args: [dayAgo],
    });
  } catch (error) {
    logger.error('[DB] Session cleanup failed:', (error as Error).message);
  }
}
