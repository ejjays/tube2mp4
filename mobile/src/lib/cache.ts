import { VideoInfo } from '@phantom/extractors';

/* in-memory only; cdn urls expire */
const TTL_MS = 30 * 60 * 1000;

type Entry = { info: VideoInfo; expiresAt: number };

const store = new Map<string, Entry>();

export function getCachedInfo(key: string): VideoInfo | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.info;
}

export function setCachedInfo(key: string, info: VideoInfo): void {
  store.set(key, { info, expiresAt: Date.now() + TTL_MS });
}
