import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export const useProgress = () => {
  const setProgress = useAppStore((state) => state.setProgress);
  const targetProgress = useAppStore((state) => state.targetProgress);
  const setTargetProgress = useAppStore((state) => state.setTargetProgress);
  const status = useAppStore((state) => state.status);
  const setPendingSubStatuses = useAppStore(
    (state) => state.setPendingSubStatuses
  );
  const videoData = useAppStore((state) => state.videoData);
  const isPickerOpen = useAppStore((state) => state.isPickerOpen);

  // set progress milestones
  useEffect(() => {
    if (!isPickerOpen || !videoData) return;
    const data = videoData as {
      title?: string;
      formats?: unknown[];
      isFullData?: boolean;
    };
    const hasUsableFormats =
      Array.isArray(data.formats) && data.formats.length > 0;
    const hasTitle = Boolean(data.title);

    let bump = 0;
    if (data.isFullData === true && targetProgress < 95) bump = 95;
    else if (hasUsableFormats && targetProgress < 90) bump = 90;
    else if (hasTitle && targetProgress < 70) bump = 70;

    if (bump > 0) setTargetProgress(bump);
  }, [isPickerOpen, videoData, targetProgress, setTargetProgress]);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    if (status === 'idle') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    lastFrameRef.current = performance.now();

    // use RAF animation
    const tick = (now: number) => {
      const dt = Math.max(0, now - lastFrameRef.current);
      lastFrameRef.current = now;
      setProgress((prev: number) => {
        if (targetProgress >= 100 || status === 'completed') {
          if (prev >= 100) return 100;
          if (status === 'completed') return 100;
          // terminal sweep
          return Math.min(prev + dt * 0.06, 100);
        }

        if (prev >= targetProgress) return prev;

        const diff = targetProgress - prev;

        // scale by delta
        let perSecond;
        if (diff >= 20) perSecond = diff * 4;
        else if (diff >= 5) perSecond = diff * 1.5;
        else perSecond = Math.max(diff * 1, 8);
        let next = prev + (perSecond * dt) / 1000;

        // final-phase nudge
        if (
          status === 'fetching_info' &&
          targetProgress >= 90 &&
          next < targetProgress
        ) {
          next = Math.max(next, prev + (4 * dt) / 1000);
        }

        return Math.min(next, targetProgress);
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // skipcq: JS-0045
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [status, targetProgress, setProgress]);

  return {
    setProgress,
    setTargetProgress,
    setPendingSubStatuses,
  };
};
