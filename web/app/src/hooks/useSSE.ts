import { filterUnsupportedCodecs } from '../lib/codec-support';
import { useAppStore } from '../store/useAppStore';

interface SSEData {
  status?: string;
  metadata_update?: Record<string, unknown>;
  subStatus?: string;
  details?: string;
  progress?: number | string;
}

interface SSEActions {
  setStatus: (s: string) => void;
  setVideoData: (v: unknown) => void;
  setIsPickerOpen: (o: boolean) => void;
  setPendingSubStatuses: (
    updater: string[] | ((prev: string[]) => string[])
  ) => void;
  setDesktopLogs: (updater: string[] | ((prev: string[]) => string[])) => void;
  setTargetProgress: (updater: unknown) => void;
  setProgress: (p: number) => void;
  setSubStatus: (ss: string) => void;
  getTS: () => string;
}

// formats present => never partial
const resolvePartial = (
  isNowFull: boolean,
  hasFormats: boolean,
  updatePartial: unknown,
  prevPartial: unknown
): boolean => {
  if (isNowFull || hasFormats) return false;
  if (updatePartial !== undefined) return Boolean(updatePartial);
  return Boolean(prevPartial);
};

const stripTimestamp = (line: string): string =>
  line.replace(/^\[[\d:.]+\]\s*/, '');

const appendUniqueLog = (
  setDesktopLogs: SSEActions['setDesktopLogs'],
  log: string
): void => {
  setDesktopLogs((prev: string[]) => {
    const text = stripTimestamp(log);
    if (prev.some((line) => stripTimestamp(line) === text)) return prev;
    return [...prev, log].slice(-500);
  });
};

export const handleSseMessage = (
  data: SSEData,
  url: string,
  {
    setStatus,
    setVideoData,
    setIsPickerOpen,
    setPendingSubStatuses,
    setDesktopLogs,
    setTargetProgress,
    setProgress,
    setSubStatus,
    getTS,
  }: SSEActions
) => {
  // isolate branch errors
  const safe = (fn: () => void, label: string) => {
    try {
      fn();
    } catch (err) {
      console.error(
        `[SSE] handleSseMessage branch "${label}" threw:`,
        err instanceof Error ? err.message : err
      );
    }
  };

  if (data.status) {
    safe(() => {
      const incoming = data.status as string;
      // client-mux owns status; ignore stale events
      const current = useAppStore.getState().status;
      if (current.startsWith('eme_') && !incoming.startsWith('eme_')) return;
      setStatus(incoming);
    }, 'status');
  }

  if (data.metadata_update) {
    safe(() => {
      const update = data.metadata_update as Record<string, unknown>;

      setVideoData((prev: unknown) => {
        const prevData = prev as Record<string, unknown> | null;
        const isNowFull = update.isFullData === true;

        if (prevData?.isFullData === true && update.isPartial === true) {
          return prevData;
        }

        // preserve full formats
        const newFormats = Array.isArray(update.formats) ? update.formats : [];
        const newAudioFormats = Array.isArray(update.audioFormats)
          ? update.audioFormats
          : [];
        const prevFormats = Array.isArray(prevData?.formats)
          ? (prevData.formats as unknown[])
          : [];
        const prevAudioFormats = Array.isArray(prevData?.audioFormats)
          ? (prevData.audioFormats as unknown[])
          : [];

        const finalFormats =
          newFormats.length >= prevFormats.length ? newFormats : prevFormats;
        const finalAudioFormats =
          newAudioFormats.length >= prevAudioFormats.length
            ? newAudioFormats
            : prevAudioFormats;

        return {
          ...prevData,
          ...update,
          formats: filterUnsupportedCodecs(finalFormats),
          audioFormats: finalAudioFormats,
          totalSize: update.totalSize || prevData?.totalSize,
          thumbnail:
            update.cover ||
            update.thumbnail ||
            prevData?.thumbnail ||
            prevData?.cover,
          cover:
            update.cover ||
            update.thumbnail ||
            prevData?.cover ||
            prevData?.thumbnail,
          isPartial: resolvePartial(
            isNowFull,
            finalFormats.length > 0,
            update.isPartial,
            prevData?.isPartial
          ),
          spotifyMetadata:
            update.spotifyMetadata || prevData?.spotifyMetadata || null,
        };
      });
      setTimeout(() => {
        try {
          // don't reopen once a download is underway
          if (!useAppStore.getState().downloadStarted) {
            setIsPickerOpen(true);
          }
        } catch (err) {
          console.error(
            '[SSE] setIsPickerOpen threw:',
            err instanceof Error ? err.message : err
          );
        }
      }, 0);
    }, 'metadata_update');
  }

  const timestamp = getTS ? getTS() : '';

  if (data.subStatus) {
    safe(() => {
      if ((data.subStatus as string).startsWith('STREAM ESTABLISHED')) {
        setSubStatus(data.subStatus as string);
      } else {
        // filter noise from terminal view
        const sub = data.subStatus as string;
        const isNoise =
          sub.includes('Metadata locked') ||
          sub.includes('Preview Refreshed') ||
          sub.includes('Refreshing 30s') ||
          sub.includes('Initializing Handshake') ||
          sub.includes('Streaming via Turbo') ||
          sub.includes('syncing core');
        if (!isNoise) {
          setPendingSubStatuses((prev: string[]) => [...prev, sub]);
        }
      }
      const log = `${timestamp} ${data.subStatus}`.trim();
      appendUniqueLog(setDesktopLogs, log);
    }, 'subStatus');
  }

  if (data.details) {
    safe(() => {
      // skip json blobs + decorative details
      const detailsStr = String(data.details);
      if (
        detailsStr.includes('"early_metadata"') ||
        (detailsStr.startsWith('{') && detailsStr.endsWith('}'))
      ) {
        return;
      }
      if (data.subStatus) return;
      const log = `${timestamp} ${detailsStr}`.trim();
      appendUniqueLog(setDesktopLogs, log);
    }, 'details');
  }

  if (
    data.progress !== undefined &&
    !useAppStore.getState().status.startsWith('eme_')
  ) {
    safe(() => {
      const numericProgress = Number(data.progress);
      if (!isNaN(numericProgress)) {
        // guard monotonic progress
        setTargetProgress((prev: number) => {
          const current = prev || 0;
          if (numericProgress >= 100) return numericProgress;
          if (numericProgress <= current) return current;
          if (Math.abs(numericProgress - current) >= 1) {
            return numericProgress;
          }
          return current;
        });

        if (data.details?.startsWith('BRAIN_LOOKUP_SUCCESS'))
          setProgress(numericProgress);
      }
    }, 'progress');
  }
};
