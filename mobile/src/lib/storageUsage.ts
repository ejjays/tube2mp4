import { File, Paths } from 'expo-file-system';

export function cacheSize(): number {
  try {
    let total = 0;
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File) total += entry.size ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
}

export function clearCache(): void {
  try {
    for (const entry of Paths.cache.list()) {
      entry.delete();
    }
  } catch {
    /* best-effort */
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
