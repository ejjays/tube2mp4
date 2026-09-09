import { useEffect, useLayoutEffect, useRef } from 'react';
import { VideoInfo, FinalResponse } from '@phantom/shared/schemas/media.schema';

interface NativeBridgeProps {
  setUrl: (url: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setProgress: (progress: number) => void;
  setTargetProgress: (progress: number) => void;
  setStatus: (status: string) => void;
  setSubStatus: (subStatus: string) => void;
  setDesktopLogs: (logs: string[]) => void;
  setPendingSubStatuses: (statuses: string[]) => void;
  setVideoTitle: (title: string) => void;
  setIsPickerOpen: (open: boolean) => void;
  setVideoData: (data: VideoInfo | null) => void;
  setShowPlayer: (show: boolean) => void;
  setPlayerData: (data: FinalResponse | null) => void;
  isPickerOpen: boolean;
  setIsSpotifySession?: (isSpotify: boolean) => void;
}

export const useNativeBridge = (props: NativeBridgeProps) => {
  const propsRef = useRef(props);

  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'SET_REFRESH_ENABLED',
          payload: !props.isPickerOpen,
        })
      );
    }
  }, [props.isPickerOpen]);

  useLayoutEffect(() => {
    window.onNativePaste = (text: string) => {
      if (text) propsRef.current.setUrl(text);
    };

    window.onDownloadProgress = (percentage: number) => {
      if (percentage !== undefined) {
        propsRef.current.setProgress(percentage);
        propsRef.current.setTargetProgress(percentage);
        if (percentage === 100) {
          setTimeout(() => {
            propsRef.current.setLoading(false);
            propsRef.current.setStatus('completed');
          }, 1000);
        }
      }
    };

    window.onNativeRefresh = () => {
      const pInstance = propsRef.current;
      pInstance.setUrl('');
      pInstance.setLoading(false);
      pInstance.setError('');
      pInstance.setProgress(0);
      pInstance.setTargetProgress(0);
      pInstance.setStatus('');
      pInstance.setSubStatus('');
      if (pInstance.setDesktopLogs) pInstance.setDesktopLogs([]);
      if (pInstance.setPendingSubStatuses) pInstance.setPendingSubStatuses([]);
      if (pInstance.setVideoTitle) pInstance.setVideoTitle('');
      if (pInstance.setIsPickerOpen) pInstance.setIsPickerOpen(false);
      if (pInstance.setVideoData) pInstance.setVideoData(null);
      if (pInstance.setIsSpotifySession) pInstance.setIsSpotifySession(false);
      if (pInstance.setShowPlayer) pInstance.setShowPlayer(false);
      if (pInstance.setPlayerData) pInstance.setPlayerData(null);
    };
  }, []);

  const requestClipboard = (): boolean => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'REQUEST_CLIPBOARD',
        })
      );
      return true;
    }
    return false;
  };

  const triggerMobileDownload = (payload: Record<string, unknown>): boolean => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'DOWNLOAD_FILE',
          payload,
        })
      );
      return true;
    }
    return false;
  };

  return { requestClipboard, triggerMobileDownload };
};
