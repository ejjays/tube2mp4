import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { X, VideoOff } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { BACKEND_URL } from '../../lib/config';
import { useModalA11y } from '../../hooks/useModalA11y';
import { resolveStreamUrls } from '../../lib/previewStream';
import MatrixLoader from '../ui/MatrixLoader';

interface VideoPreviewOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  pageUrl?: string;
  formatId?: string;
  title?: string;
  poster?: string;
}

type PreviewState =
  | { phase: 'loading' }
  | { phase: 'ready'; src: string }
  | { phase: 'unsupported' }
  | { phase: 'error' };

// swipe distance/velocity that dismisses
const DISMISS_OFFSET = 130;
const DISMISS_VELOCITY = 600;

const PreviewMessage = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center gap-3 text-gray-300 px-6 text-center pointer-events-none">
    <VideoOff className="text-gray-500" size={40} />
    <p className="text-sm font-medium">{text}</p>
  </div>
);

const VideoPreviewOverlay = ({
  isOpen,
  onClose,
  pageUrl,
  formatId,
  title,
  poster,
}: VideoPreviewOverlayProps) => {
  const backendUrl = useAppStore((state) => state.backendUrl) || BACKEND_URL;
  const clientId = useAppStore((state) => state.clientId);

  const [state, setState] = useState<PreviewState>({ phase: 'loading' });
  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // drag offset drives backdrop fade + shrink
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform([dragX, dragY], ([x, y]: number[]) => {
    const distance = Math.min(Math.hypot(x, y), 300);
    return 1 - (distance / 300) * 0.85;
  });
  const contentScale = useTransform([dragX, dragY], ([x, y]: number[]) => {
    const distance = Math.min(Math.hypot(x, y), 360);
    return 1 - (distance / 360) * 0.1;
  });

  // pause on close; unmount releases the stream
  const stopVideo = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const handleClose = useCallback(() => {
    stopVideo();
    onClose();
  }, [stopVideo, onClose]);

  const handleDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      const distance = Math.hypot(info.offset.x, info.offset.y);
      const speed = Math.hypot(info.velocity.x, info.velocity.y);
      if (distance > DISMISS_OFFSET || speed > DISMISS_VELOCITY) handleClose();
    },
    [handleClose]
  );

  useModalA11y(isOpen, handleClose, panelRef);

  // resolve via shared cache
  useEffect(() => {
    if (!isOpen) return undefined;
    if (!pageUrl || !formatId) {
      setState({ phase: 'unsupported' });
      return undefined;
    }

    let active = true;
    setState({ phase: 'loading' });

    resolveStreamUrls(backendUrl, pageUrl, formatId, clientId)
      .then((data) => {
        if (!active) return;
        // separate audio means not single-playable
        if (data.videoUrl && !data.audioUrl) {
          const tagged = `${data.videoUrl}${data.videoUrl.includes('?') ? '&' : '?'}via=preview`;
          setState({ phase: 'ready', src: tagged });
        } else {
          setState({ phase: 'unsupported' });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('[VideoPreview] resolve failed:', error);
        setState({ phase: 'error' });
      });

    return () => {
      active = false;
    };
  }, [isOpen, pageUrl, formatId, backendUrl, clientId]);

  // reset drag on open; stop on close
  useEffect(() => {
    if (isOpen) {
      dragX.set(0);
      dragY.set(0);
    } else {
      stopVideo();
    }
  }, [isOpen, stopVideo, dragX, dragY]);

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title ? `Preview: ${title}` : 'Video preview'}
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 flex items-center justify-center outline-none"
          style={{ zIndex: 2147483647 }}
        >
          <motion.div
            aria-hidden="true"
            onClick={handleClose}
            className="absolute inset-0 bg-black"
            style={{ opacity: backdropOpacity }}
          />

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={(event) => {
              event.stopPropagation();
              handleClose();
            }}
            aria-label="Close preview"
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X size={24} />
          </motion.button>

          <div className="relative flex items-center justify-center w-full h-full p-4 sm:p-8 pointer-events-none">
            {state.phase === 'loading' && <MatrixLoader />}

            {state.phase === 'ready' && (
              <motion.video
                ref={videoRef}
                key={state.src}
                src={state.src}
                poster={poster}
                controls
                autoPlay
                playsInline
                drag
                dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
                dragElastic={0.9}
                dragMomentum={false}
                onDragEnd={handleDragEnd}
                style={{ x: dragX, y: dragY, scale: contentScale }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="max-w-full max-h-full rounded-xl shadow-2xl bg-black pointer-events-auto cursor-grab active:cursor-grabbing"
              />
            )}

            {state.phase === 'unsupported' && (
              <PreviewMessage text="Inline preview isn't available for this source." />
            )}

            {state.phase === 'error' && (
              <PreviewMessage text="Couldn't load the preview. Please try again." />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
};

export default VideoPreviewOverlay;
