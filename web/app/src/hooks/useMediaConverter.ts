import { isHost } from '../lib/utils';
import { useCallback, useState, useEffect } from 'react';
import { useProgress } from './useProgress';
import { useNativeBridge } from './useNativeBridge';
import { useVideoInfo } from './useVideoInfo';
import { useDownloadOrchestrator } from './useDownloadOrchestrator';
import { useAppStore } from '../store/useAppStore';

export interface MediaConverterHook {
  isMobile: boolean;
  isSpotifySession: boolean;
  handleDownloadTrigger: (inputUrl?: string) => Promise<void>;
  handleDownload: (
    format?: string,
    quality?: string,
    metadata?: { title?: string; artist?: string; album?: string }
  ) => Promise<void>;
  cancelDownload: () => void;
  handlePaste: (input: string) => Promise<void>;
  requestClipboard: () => boolean;
}

export const useMediaConverter = (): MediaConverterHook => {
  const setUrl = useAppStore((state) => state.setUrl);
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);
  const setStatus = useAppStore((state) => state.setStatus);
  const setSubStatus = useAppStore((state) => state.setSubStatus);
  const setDesktopLogs = useAppStore((state) => state.setDesktopLogs);
  const setVideoTitle = useAppStore((state) => state.setVideoTitle);
  const setIsPickerOpen = useAppStore((state) => state.setIsPickerOpen);
  const setVideoData = useAppStore((state) => state.setVideoData);
  const setShowPlayer = useAppStore((state) => state.setShowPlayer);
  const setPlayerData = useAppStore((state) => state.setPlayerData);
  const isPickerOpen = useAppStore((state) => state.isPickerOpen);
  const url = useAppStore((state) => state.url);

  const { setProgress, setTargetProgress, setPendingSubStatuses } =
    useProgress();

  const isSpotifySession =
    typeof url === 'string' && isHost(url, 'spotify.com');

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    // skipcq: JS-0045
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // bridge
  const { requestClipboard } = useNativeBridge({
    setUrl,
    setLoading,
    setError,
    setProgress,
    setTargetProgress,
    setStatus,
    setSubStatus,
    setDesktopLogs,
    setPendingSubStatuses,
    setVideoTitle,
    setIsPickerOpen,
    setVideoData,
    setShowPlayer,
    setPlayerData,
    isPickerOpen,
  });

  // actions
  const { fetchInfo } = useVideoInfo();
  const { startDownload, cancelDownload } = useDownloadOrchestrator();

  const handlePaste = useCallback(
    async (input: string): Promise<void> => {
      if (input) {
        setUrl(input);
        await fetchInfo(input);
      }
    },
    [fetchInfo, setUrl]
  );

  const wrappedDownload = useCallback(
    async (
      format?: string,
      quality?: string,
      metadata?: Record<string, string | undefined>
    ) => {
      await startDownload(quality || 'mp3', {
        ...metadata,
        extension: format,
      });
    },
    [startDownload]
  );

  return {
    isMobile,
    isSpotifySession,
    handleDownloadTrigger: fetchInfo,
    handleDownload: wrappedDownload,
    cancelDownload,
    handlePaste,
    requestClipboard,
  };
};
