import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { Format, VideoInfo } from '@phantom/extractors';

const INFLIGHT_KEY = 'phantom.download.inflight';

type DownloadInfoSubset = Pick<
  VideoInfo,
  | 'title'
  | 'uploader'
  | 'album'
  | 'thumbnail'
  | 'duration'
  | 'extractorKey'
  | 'downloadHeaders'
>;

export type InflightItem = {
  id: string;
  title: string;
  author?: string;
  platform: string;
  ext: string;
  isAudio: boolean;
  thumbnail?: string;
  progress: number;
  updatedAt: number;
  info: DownloadInfoSubset;
  format: Format;
  tag?: { title?: string; artist?: string };
};

let memory: InflightItem[] = [];
AsyncStorage.getItem(INFLIGHT_KEY)
  .then((raw) => {
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as InflightItem[];
        if (Array.isArray(parsed)) memory = parsed;
      } catch {
        /* ignore */
      }
    }
  })
  .catch(() => {
    /* ignore */
  });

function read(): Promise<InflightItem[]> {
  return AsyncStorage.getItem(INFLIGHT_KEY)
    .then((raw) => {
      if (!raw) return [];
      const parsed = JSON.parse(raw) as InflightItem[];
      return Array.isArray(parsed) ? parsed : [];
    })
    .catch(() => []);
}

const write = (items: InflightItem[]): Promise<void> =>
  AsyncStorage.setItem(INFLIGHT_KEY, JSON.stringify(items)).catch(
    () => undefined
  );

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function subscribeInflight(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function upsertInflight(item: InflightItem): Promise<void> {
  const items = await read();
  const next = [item, ...items.filter((it) => it.id !== item.id)].sort(
    (x, y) => y.updatedAt - x.updatedAt
  );
  await write(next);
  emit();
}

export async function removeInflight(id: string): Promise<void> {
  const items = await read();
  const next = items.filter((it) => it.id !== id);
  if (next.length === items.length) return;
  await write(next);
  emit();
}

export function useInflight(): {
  items: InflightItem[];
  refresh: () => Promise<void>;
} {
  const [items, setItems] = useState<InflightItem[]>(memory);

  const refresh = async (): Promise<void> => {
    const fresh = await read();
    memory = fresh;
    setItems(fresh);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-mount inflight refresh
    void refresh();
    return subscribeInflight(() => void refresh());
  }, []);

  return { items, refresh };
}
