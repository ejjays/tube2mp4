import { useEffect, useRef, useCallback, useMemo } from 'react';
import TerminalView from './terminal/TerminalView';
import { useAppStore } from '../store/useAppStore';

interface DesktopProgressProps {
  onCancel?: () => void;
}

const DesktopProgress = ({ onCancel }: DesktopProgressProps) => {
  const loading = useAppStore((state) => state.loading);
  const progress = useAppStore((state) => state.progress);
  const status = useAppStore((state) => state.status);
  const desktopLogs = useAppStore((state) => state.desktopLogs) ?? [];
  const selectedFormat = useAppStore((state) => state.selectedFormat);
  const error = useAppStore((state) => state.error);
  const isPickerOpen = useAppStore((state) => state.isPickerOpen);
  const emePhase = useAppStore((state) => state.emePhase);
  const emeProgress = useAppStore((state) => state.emeProgress);
  const emeBytes = useAppStore((state) => state.emeBytes);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollPinnedRef = useRef(true);

  const showSuccess = useMemo(() => {
    return status === 'completed';
  }, [status]);

  // human readable text
  const humanize = useCallback((text: string) => {
    if (!text) return '';
    if (text.includes('ISRC_IDENTIFIED:')) {
      const isrc = text.split('ISRC_IDENTIFIED:')[1].trim();
      return `FINGERPRINT: ${isrc}`;
    }

    let cleaned = text
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/(^\w|\s\w)/g, (letter) => letter.toUpperCase())
      .trim();

    cleaned = cleaned
      .replace(/Api/gi, 'API')
      .replace(/Isrc/gi, 'ISRC')
      .replace(/Tls/gi, 'TLS')
      .replace(/Sse/gi, 'SSE')
      .replace(/Youtube/gi, 'YouTube')
      .replace(/Spotify/gi, 'Spotify')
      .replace(/\bId\b/gi, 'ID')
      .replace(/\bAi\b/gi, 'AI')
      .replace(/Cdn/gi, 'CDN')
      .replace(/Dns/gi, 'DNS')
      .replace(/Muxer/gi, 'MUXER')
      .replace(/Http/gi, 'HTTP');

    return cleaned;
  }, []);

  // format for terminal
  const formatLogForDisplay = useCallback(
    (text: string) => {
      if (!text) return '';
      if (text.toUpperCase().includes('ISRC_IDENTIFIED:')) {
        const isrc = text.split(/:/)[1].trim();
        return `FINGERPRINT: ${isrc}`;
      }
      const withoutPrefix = text.replace(/^[A-Za-z0-9_\-\s]+:\s*/, '');
      return humanize(withoutPrefix);
    },
    [humanize]
  );

  // map logs directly
  const displayLogs = useMemo(() => {
    return (desktopLogs || [])
      .map((log, index) => {
        if (typeof log !== 'string')
          return { id: `log-${index}`, text: '', timestamp: '', type: 'info' };

        const match = log.match(/^(\[[\d:.]+\])\s*(.*)/);
        const rawText = match ? match[2] : log;
        const timestamp = match ? match[1] : '';
        const text = formatLogForDisplay(rawText);

        // stable ID
        const logId = `${timestamp}-${rawText.substring(0, 20)}-${index}`;

        return {
          id: logId,
          text,
          timestamp,
          type: log.includes('SYSTEM_ALERT') ? 'error' : 'info',
        };
      })
      .filter((logItem) => logItem.text);
  }, [desktopLogs, formatLogForDisplay]);

  useEffect(() => {
    if (desktopLogs.length > 0) {
      console.log(`[DesktopProgress] Received ${desktopLogs.length} logs`);
    }
  }, [desktopLogs.length]);

  // auto scroll terminal
  useEffect(() => {
    if (scrollRef.current && isAutoScrollPinnedRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayLogs, showSuccess]);

  // track scroll position
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
      isAutoScrollPinnedRef.current = isAtBottom;
    }
  };

  // compute status text
  const getStatusText = () => {
    if (error) return 'SYSTEM_FAILURE';
    if (status === 'completed') return 'TASK_COMPLETED';
    if (isPickerOpen) return 'AWAITING_SELECTION';
    const formatName = selectedFormat === 'mp4' ? 'VIDEO' : 'AUDIO';

    switch (status) {
      case 'fetching_info':
        return `ANALYZING_${formatName}`;
      case 'initializing':
        return 'BOOTING_CORE';
      case 'downloading':
        return 'EXTRACTING_STREAM';
      case 'merging':
        return 'COMPILING_ASSETS';
      case 'sending':
        return 'BUFFERING_TO_CLIENT';
      case 'eme_initializing':
        return 'EME_BOOTING_CORE';
      case 'eme_downloading':
        return 'DOWNLOADING_IN_BROWSER';
      case 'eme_muxing':
        return 'MUXING_ON_DEVICE';
      default:
        return 'SYSTEM_IDLE';
    }
  };

  // visibility check
  const isVisible = Boolean(
    status !== 'idle' || loading || error || isPickerOpen
  );

  return (
    <TerminalView
      isVisible={isVisible}
      progress={progress}
      statusText={getStatusText()}
      displayLogs={displayLogs}
      showSuccess={showSuccess}
      getTimestamp={() => ''}
      scrollRef={scrollRef as React.RefObject<HTMLDivElement>}
      handleScroll={handleScroll}
      error={error}
      isPickerOpen={isPickerOpen}
      emePhase={emePhase}
      emeProgress={emeProgress}
      emeBytes={emeBytes}
      onCancel={onCancel}
    />
  );
};

export default DesktopProgress;
