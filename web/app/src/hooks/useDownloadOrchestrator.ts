import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OrchestratorService } from '../lib/orchestrator.service';
import { getOpfsCeiling } from '../lib/emeStorage';

interface Format {
  formatId: string | number;
  [key: string]: string | number | boolean | undefined;
}

interface SpotifyMetadata {
  targetUrl?: string;
}

interface VideoData {
  title?: string;
  artist?: string;
  formats: Format[];
  audioFormats: Format[];
  targetUrl?: string;
  spotifyMetadata?: SpotifyMetadata;
}

type MetadataOverrides = {
  title?: string;
  artist?: string;
  extension?: string;
  audioLang?: string;
};

const EME_RAM_CAP_BYTES = 50 * 1024 * 1024;
const EME_HARD_CAP_BYTES = 400 * 1024 * 1024;
const EME_DISK_CAP_BYTES = 4 * 1024 * 1024 * 1024;
const EME_TRUSTED_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
const EME_OPFS_HEADROOM_MULTIPLIER = 2.5;

export function shouldUseEdgeMux(
  selectedFormat: string,
  filesize: number
): boolean {
  if (selectedFormat !== 'mp4') return false;
  if (!filesize) return true;
  return filesize <= EME_RAM_CAP_BYTES;
}

async function opfsStorage(): Promise<{ quota: number; free: number } | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage;
  if (!storage?.getDirectory || !storage.estimate) return null;
  try {
    const { quota, usage } = await storage.estimate();
    if (typeof quota !== 'number') return null;
    return { quota, free: Math.max(0, quota - (usage ?? 0)) };
  } catch {
    return null;
  }
}

export async function resolveEdgeMuxEligibility(
  selectedFormat: string,
  filesize: number
): Promise<boolean> {
  if (selectedFormat !== 'mp4') return false;
  if (!filesize) return true;
  // respect device opfs ceiling
  const ceiling = getOpfsCeiling();
  if (ceiling !== null && filesize * EME_OPFS_HEADROOM_MULTIPLIER > ceiling) {
    return false;
  }
  const storage = await opfsStorage();
  if (storage === null) return shouldUseEdgeMux(selectedFormat, filesize);
  // big quota means real disk
  const cap =
    storage.quota >= EME_TRUSTED_QUOTA_BYTES
      ? EME_DISK_CAP_BYTES
      : EME_HARD_CAP_BYTES;
  if (filesize > cap) return false;
  return storage.free >= filesize * EME_OPFS_HEADROOM_MULTIPLIER;
}

export const useDownloadOrchestrator = () => {
  const url = useAppStore((state) => state.url);
  const videoData = useAppStore((state) => state.videoData) as
    | VideoData
    | undefined;
  const selectedFormat = useAppStore((state) => state.selectedFormat);
  const backendUrl = useAppStore((state) => state.backendUrl);
  const clientId = useAppStore((state) => state.clientId);

  const setStatus = useAppStore((state) => state.setStatus);
  const setTargetProgress = useAppStore((state) => state.setTargetProgress);
  const setProgress = useAppStore((state) => state.setProgress);
  const setSubStatus = useAppStore((state) => state.setSubStatus);
  const setPendingSubStatuses = useAppStore(
    (state) => state.setPendingSubStatuses
  );
  const setDesktopLogs = useAppStore((state) => state.setDesktopLogs);
  const setIsPickerOpen = useAppStore((state) => state.setIsPickerOpen);
  const setDownloadStarted = useAppStore((state) => state.setDownloadStarted);
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);
  const setVideoTitle = useAppStore((state) => state.setVideoTitle);
  const lastDownloadRef = useRef(0);

  const service = useMemo(
    () =>
      new OrchestratorService({
        onStatus: (s: string) => setStatus(s),
        onProgress: (progressVal: number) => setTargetProgress(progressVal),
        onSubStatus: (s: string) => {
          if (s.startsWith('STREAM ESTABLISHED')) {
            setSubStatus(s);
            setProgress(100);
            setTargetProgress(100);
          } else {
            setPendingSubStatuses((prev: string[]) => [...prev, s]);
          }
        },
        onLog: (msg: string) =>
          setDesktopLogs((prev: string[]) => [...prev, msg].slice(-500)),
        onError: (err: unknown): void => {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError(String(err));
          }
          setLoading(false);
        },
        onComplete: () => {
          setProgress(100);
          setTargetProgress(100);
          setTimeout(() => {
            setLoading(false);
            setStatus('completed');
          }, 1500);
        },
      }),
    [
      setStatus,
      setTargetProgress,
      setSubStatus,
      setProgress,
      setPendingSubStatuses,
      setDesktopLogs,
      setError,
      setLoading,
    ]
  );

  const cancelDownload = useCallback(() => {
    service.cancel();
  }, [service]);

  useEffect(() => () => service.cancel(), [service]);

  const startDownload = useCallback(
    async (formatId: string, metadataOverrides: MetadataOverrides = {}) => {
      // ignore re-fire within 2s window
      const now = Date.now();
      if (now - lastDownloadRef.current < 2000) return;
      lastDownloadRef.current = now;
      setDownloadStarted(true);
      setIsPickerOpen(false);
      setLoading(true);
      setError('');
      setStatus('initializing');
      setTargetProgress(5);
      setPendingSubStatuses(['Resolving High-Speed Stream Manifests...']);
      setSubStatus('');

      const finalTitle = metadataOverrides.title ?? videoData?.title ?? '';
      const artist = metadataOverrides.artist ?? videoData?.artist ?? '';
      const audioLang = metadataOverrides.audioLang;
      setVideoTitle(finalTitle);

      const selectedOption = (
        selectedFormat === 'mp4' ? videoData?.formats : videoData?.audioFormats
      )?.find((f: Format) => String(f.formatId) === formatId);

      const targetUrl =
        videoData?.targetUrl ?? videoData?.spotifyMetadata?.targetUrl ?? '';

      const emeEligible = await resolveEdgeMuxEligibility(
        selectedFormat,
        Number(selectedOption?.filesize) || 0
      );

      // try client mux first
      if (emeEligible) {
        const success = await service.startEdgeMuxing({
          url,
          clientId,
          formatId,
          targetUrl,
          videoData,
          selectedFormat,
          finalTitle,
          artist,
          backendUrl,
          videoBytes: Number(selectedOption?.filesize) || 0,
          audioLang,
        });
        if (success) return;
        // prevent server fallback if aborted
        if (service.wasCancelled()) {
          setLoading(false);
          setStatus('idle');
          setDownloadStarted(false);
          return;
        }
      }

      if (emeEligible) {
        const success = await service.startDirectDownload({
          url,
          finalTitle,
          artist,
          selectedOption,
          formatId,
          clientId,
          backendUrl,
          audioLang,
        });
        if (success) return;
      }

      const serverBytes = Number(selectedOption?.filesize) || 0;
      if (serverBytes > EME_HARD_CAP_BYTES) {
        setError(
          'This file is too large to process on the server. Try a lower resolution.'
        );
        setLoading(false);
        setStatus('idle');
        setDownloadStarted(false);
        return;
      }

      await service.startServerDownload({
        url,
        finalTitle,
        artist,
        selectedOption,
        formatId,
        serverClientId: clientId,
        targetUrl,
        selectedFormat,
        backendUrl,
        audioLang,
      });
    },
    [
      videoData,
      selectedFormat,
      url,
      clientId,
      setIsPickerOpen,
      setDownloadStarted,
      setLoading,
      setError,
      setStatus,
      setTargetProgress,
      setSubStatus,
      setPendingSubStatuses,
      setVideoTitle,
      service,
      backendUrl,
    ]
  );

  return { startDownload, cancelDownload };
};
