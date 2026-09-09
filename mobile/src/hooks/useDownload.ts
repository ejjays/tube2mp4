import { useState } from 'react';
import type { Format, VideoInfo } from '@phantom/extractors';
import {
  prettyName,
  formatLabel,
  type DownloadMeta,
  type DownloadState,
} from '../lib/format';
import { getFilenameFormat, getNotify, formatName } from '../lib/settings';
import { notifyDownloadComplete } from '../lib/notify';
import {
  startDownloadService,
  stopDownloadService,
  updateDownloadProgress,
  setDownloadCancelHandler,
} from '../lib/fgservice';
import { tapSuccess } from '../lib/haptics';
import { runDownload } from '../lib/download/downloadPipeline';
import { error as logError, log } from '../lib/log';

export type StartDownloadResult =
  | { status: 'saved'; uri?: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

type DownloadMap = Record<string, DownloadState>;

export function useDownload(info: VideoInfo | null) {
  const [downloads, setDownloads] = useState<DownloadMap>({});

  const setOne = (id: string, state: DownloadState): void => {
    setDownloads((prev) => ({ ...prev, [id]: state }));
  };

  const clearDownloads = (): void => setDownloads({});

  const startDownload = async (
    format: Format,
    meta?: DownloadMeta
  ): Promise<StartDownloadResult> => {
    if (!info) return { status: 'cancelled' };
    const id = format.formatId;
    setOne(id, { status: 'downloading', progress: 0 });
    log(
      'useDownload',
      `[Download] ${info.extractorKey} ${formatLabel(format)}`
    );

    const controller = new AbortController();
    setDownloadCancelHandler(() => controller.abort());

    try {
      await startDownloadService();
      const fmt = await getFilenameFormat();
      const rawTitle = meta?.title?.trim() || info.title;
      const rawAuthor = meta?.author?.trim() || info.uploader;
      const stem = prettyName(
        formatName(fmt, rawTitle, rawAuthor, info.extractorKey ?? '')
      );

      const outcome = await runDownload({
        info,
        format,
        stem,
        tag: { title: rawTitle, artist: rawAuthor },
        signal: controller.signal,
        onState: (state) => {
          setOne(id, state);
          updateDownloadProgress(state.progress);
        },
      });

      if (outcome.status === 'denied') {
        setOne(id, { status: 'error', progress: 0 });
        return {
          status: 'error',
          message: 'Save canceled — media access was not granted.',
        };
      }

      setOne(id, { status: 'saved', progress: 100 });
      tapSuccess();
      if (await getNotify()) {
        await notifyDownloadComplete(
          stem,
          info.thumbnail,
          info.extractorKey,
          format.extension || 'mp4',
          outcome.uri
        ).catch(() => undefined);
      }
      return { status: 'saved', uri: outcome.uri };
    } catch (e) {
      if (controller.signal.aborted) {
        log('useDownload', '[Download] cancelled');
        setDownloads((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        return { status: 'cancelled' };
      }
      const message = e instanceof Error ? e.message : 'Download failed';
      const stack = e instanceof Error && e.stack ? e.stack : '(no stack)';
      logError('useDownload', `[Download] failed: ${message}`);
      logError('useDownload', `[Download] stack: ${stack}`);
      setOne(id, { status: 'error', progress: 0 });
      return { status: 'error', message: `Download failed: ${message}` };
    } finally {
      setDownloadCancelHandler(null);
      stopDownloadService().catch(() => undefined);
    }
  };

  return { downloads, startDownload, clearDownloads };
}
