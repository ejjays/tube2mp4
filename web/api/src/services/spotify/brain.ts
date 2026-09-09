import db from '../../utils/infra/db.util.js';
import { logger } from '../../utils/infra/logger.util.js';
import { SpotifyMetadata, Format } from '../../types/index.js';
import { isHost } from '../../utils/network/host.util.js';

interface RawMapping {
  url: string;
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
  duration: number;
  isrc: string;
  previewUrl: string;
  youtubeUrl: string;
  formats: string;
  audioFormats: string;
  audioFeatures: string;
  year: string;
  timestamp: number;
}

// strip poisoned/volatile cached formats
export function cleanFormats(raw: unknown): Format[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (fmt): fmt is Format =>
      !!fmt &&
      typeof (fmt as Format).formatId === 'string' &&
      (fmt as Format).formatId !== 'undefined' &&
      !String((fmt as { url?: unknown }).url ?? '').includes('PENDING_DECIPHER')
  );
}

// validated mapping or null to re-resolve
export function parseCachedMapping(row: {
  youtubeUrl?: string | null;
  formats?: unknown;
  audioFormats?: unknown;
}): { formats: Format[]; audioFormats: Format[] } | null {
  if (!row.youtubeUrl || !/^https?:\/\//u.test(row.youtubeUrl)) return null;
  const formats = cleanFormats(row.formats);
  if (formats.length === 0) return null;
  return { formats, audioFormats: cleanFormats(row.audioFormats) };
}

if (db) {
  (async () => {
    try {
      await db.execute(`
                CREATE TABLE IF NOT EXISTS spotify_mappings (
                    url TEXT PRIMARY KEY,
                    title TEXT,
                    artist TEXT,
                    album TEXT,
                    imageUrl TEXT,
                    duration INTEGER,
                    isrc TEXT,
                    previewUrl TEXT,
                    youtubeUrl TEXT,
                    formats TEXT,
                    audioFormats TEXT,
                    audioFeatures TEXT,
                    year TEXT,
                    timestamp INTEGER
                )
            `);
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_spotify_isrc ON spotify_mappings(isrc)'
      );
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_spotify_youtube ON spotify_mappings(youtubeUrl)'
      );
      logger.info('[Turso] Database initialized.');
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('[Turso] Database bootstrap failed:', error.message);
    }
  })();
}

export function saveToBrain(spotifyUrl: string, data: SpotifyMetadata): void {
  const activeDb = db;
  if (!activeDb) return;

  const isrc = data.isrc && data.isrc !== 'NONE' ? data.isrc : null;
  const isIsrcMatch =
    data.isIsrcMatch === true || (data.isrc && data.isrc !== 'NONE');

  if (!isIsrcMatch || !isrc) {
    return;
  }

  const youtubeUrl = data.targetUrl || null;
  if (!youtubeUrl || !/^https?:\/\//u.test(youtubeUrl)) {
    return;
  }

  process.nextTick(() => {
    try {
      const cleanUrl = spotifyUrl.split('?')[0];
      const args = [
        cleanUrl,
        data.title || 'Unknown Title',
        data.artist || 'Unknown Artist',
        data.album || '',
        data.imageUrl || data.cover || data.thumbnail || null,
        data.duration || 0,
        isrc,
        data.previewUrl || null,
        youtubeUrl,
        JSON.stringify(cleanFormats(data.formats)),
        JSON.stringify(cleanFormats(data.audioFormats)),
        JSON.stringify(data.audioFeatures || null),
        data.year || 'Unknown',
        Date.now(),
      ];

      activeDb
        .execute({
          sql:
            'INSERT OR REPLACE INTO spotify_mappings ' +
            '(url, title, artist, album, imageUrl, duration, isrc, previewUrl, youtubeUrl, formats, audioFormats, audioFeatures, year, timestamp) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args,
        })
        .catch((err: unknown) => {
          const error = err as Error;
          logger.warn('[Turso] Failed to save to database:', error.message);
        });

      if (
        data.previewUrl &&
        (isHost(data.previewUrl, 'scdn.co') ||
          isHost(data.previewUrl, 'dzcdn.net') ||
          isHost(data.previewUrl, 'itunes.apple.com'))
      ) {
        activeDb
          .execute({
            sql: 'INSERT OR REPLACE INTO volatile_links (url, expires_at, provider) VALUES (?, ?, ?)',
            args: [cleanUrl, Date.now() + 55 * 60 * 1000, 'spotify_preview'],
          })
          .catch((err: Error) => {
            logger.debug(
              '[Turso] Volatile link save failed:',
              (err as Error).message
            );
          });
      }
    } catch (err: unknown) {
      logger.warn(
        '[Turso] Synchronous error preparing database save:',
        (err as Error).message
      );
    }
  });
}

export async function getFromBrain(
  cleanUrl: string
): Promise<RawMapping | null> {
  if (!db) return null;
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM spotify_mappings WHERE url = ?',
      args: [cleanUrl],
    });
    return (result.rows?.[0] as unknown as RawMapping) || null;
  } catch (err) {
    logger.debug('[Turso] Brain lookup failed:', (err as Error).message);
    return null;
  }
}

export async function updatePreviewInBrain(
  cleanUrl: string,
  previewUrl: string
): Promise<void> {
  const activeDb = db;
  if (!activeDb) return;
  try {
    await activeDb.execute({
      sql: 'UPDATE spotify_mappings SET previewUrl = ? WHERE url = ?',
      args: [previewUrl, cleanUrl],
    });

    if (
      previewUrl &&
      (isHost(previewUrl, 'scdn.co') ||
        isHost(previewUrl, 'dzcdn.net') ||
        isHost(previewUrl, 'itunes.apple.com'))
    ) {
      await activeDb.execute({
        sql: 'INSERT OR REPLACE INTO volatile_links (url, expires_at, provider) VALUES (?, ?, ?)',
        args: [cleanUrl, Date.now() + 55 * 60 * 1000, 'spotify_preview'],
      });
    }
  } catch (err: unknown) {
    const error = err as Error;
    logger.warn(
      '[Turso] Failed to update preview in database:',
      error.message
    );
  }
}

if (db) {
  const activeDb = db;
  setInterval(() => {
    (async () => {
      try {
        const threshold = Date.now() + 5 * 60 * 1000;
        const result = await activeDb.execute({
          sql: 'SELECT url, provider FROM volatile_links WHERE expires_at < ?',
          args: [threshold],
        });

        if (result.rows && result.rows.length > 0) {
          const { refreshPreviewIfNeeded } = await import('./index.js');
          let refreshed = 0;
          for (const row of result.rows) {
            if (row.provider === 'spotify_preview') {
              const url = row.url as string;
              const brainData = await getFromBrain(url);
              if (brainData) {
                await refreshPreviewIfNeeded(
                  url,
                  brainData as unknown as SpotifyMetadata
                );
                refreshed++;
              }
            }
          }
          if (refreshed > 0) {
            logger.info(`[JIT Worker] refreshed ${refreshed} preview link(s)`);
          }
        }
      } catch (err: unknown) {
        logger.warn(
          '[JIT Worker] Error scanning volatile_links:',
          (err as Error).message
        );
      }
    })();
  }, 60000).unref();
}
