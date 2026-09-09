import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Music, SquarePen, ListMusic } from 'lucide-react';
import { createPortal } from 'react-dom';
import FormatIcon from '../../assets/icons/FormatIcon';
import ModalHeader from './ModalHeader';
import {
  QualitySelectionShared,
  EditModeUIShared,
  tagOriginalMaster,
  DubSelector,
  deriveAudioTracks,
  type AudioTrackOption,
} from './SharedComponents';
import { useModalA11y } from '../../hooks/useModalA11y';
import VideoPreviewOverlay from './VideoPreviewOverlay';
import { useAppStore } from '../../store/useAppStore';
import { BACKEND_URL } from '../../lib/config';
import { prefetchStreamUrls } from '../../lib/previewStream';

interface VideoFormat {
  formatId: string;
  quality?: string;
  filesize?: number;
  extension?: string;
  ext?: string;
  fps?: string | number;
  note?: string;
  height?: number;
  language?: string;
  languageName?: string;
  isOriginal?: boolean;
}

interface VideoData {
  [key: string]: unknown;
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  thumbnail?: string;
  duration?: number | string;
  formats?: VideoFormat[];
  audioFormats?: VideoFormat[];
  isPartial?: boolean;
  webpageUrl?: string;
}

interface StandardQualityPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFormat?: string;
  videoData: VideoData | null;
  onSelect: (
    qualityId: string,
    metadata: {
      title: string;
      artist: string;
      album: string;
      extension?: string;
      audioLang?: string;
    }
  ) => void;
  onRetry?: () => void;
}

export const getInitialOptions = (
  selectedFormat = 'mp3',
  videoData: VideoData | null = {}
) => {
  try {
    if (!videoData) return [];

    const formats = Array.isArray(videoData?.formats) ? videoData.formats : [];
    const audioFormats = Array.isArray(videoData?.audioFormats)
      ? videoData.audioFormats
      : [];

    if (selectedFormat === 'mp4') return [...formats];

    const currentOptions = tagOriginalMaster([...audioFormats]);
    const hasMp3 = currentOptions.some(
      (option) => option?.ext === 'mp3' || option?.extension === 'mp3'
    );

    if (!hasMp3) {
      const calculatedSize =
        videoData?.duration && !Number.isNaN(Number(videoData.duration))
          ? Math.round(Number(videoData.duration) * 24000)
          : currentOptions[0]?.filesize || 0;

      const mp3Option: VideoFormat = {
        formatId: 'mp3_synthetic',
        quality: '192kbps',
        filesize: calculatedSize,
        extension: 'mp3',
        ext: 'mp3',
        note: 'Universal Compatibility',
      };
      return [...currentOptions, mp3Option];
    }
    return currentOptions;
  } catch (err) {
    console.error('[Picker] Safety fallback triggered:', err);
    return [];
  }
};

const ThumbnailSection = ({
  thumbnail,
  selectedFormat,
  onPlay,
  onPrefetch,
}: {
  thumbnail?: string;
  selectedFormat: string;
  onPlay?: () => void;
  onPrefetch?: () => void;
}) => {
  const canPlay = selectedFormat === 'mp4' && Boolean(onPlay);
  return (
    <div className="relative w-full aspect-video overflow-hidden group rounded-t-3xl">
      <img
        src={thumbnail || '/logo.webp'}
        alt="Thumbnail"
        referrerPolicy="no-referrer"
        onError={(event: React.SyntheticEvent<HTMLImageElement, Event>) => {
          if (event.currentTarget.src !== '/logo.webp') {
            event.currentTarget.src = '/logo.webp';
          }
        }}
        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-16 h-16 bg-cyan-500/20 backdrop-blur-md rounded-full flex items-center justify-center border border-cyan-500/30 transition-transform group-hover:scale-105">
          {selectedFormat === 'mp4' ? (
            <Play className="text-cyan-400 fill-cyan-400 ml-1" size={32} />
          ) : (
            <ListMusic className="text-cyan-400 fill-cyan-400 ml-1" size={32} />
          )}
        </div>
      </div>
      {canPlay && (
        <button
          type="button"
          onClick={onPlay}
          onPointerEnter={onPrefetch}
          onFocus={onPrefetch}
          aria-label="Play preview"
          className="absolute inset-0 z-10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-inset"
        />
      )}
    </div>
  );
};

const ViewModeUI = ({
  editedTitle,
  editedArtist,
  editedAlbum,
  selectedFormat,
  setIsEditing,
  options,
  isDropdownOpen,
  setIsDropdownOpen,
  setSelectedQualityId,
  handleDownloadClick,
  dropdownRef,
  selectedQualityId,
  videoData,
  selectedOption,
  audioTracks,
  selectedLang,
  setSelectedLang,
  onRetry,
}: {
  editedTitle: string;
  editedArtist: string;
  editedAlbum: string;
  selectedFormat: string;
  setIsEditing: (val: boolean) => void;
  options: VideoFormat[];
  isDropdownOpen: boolean;
  setIsDropdownOpen: (val: boolean) => void;
  setSelectedQualityId: (val: string) => void;
  handleDownloadClick: () => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  selectedQualityId: string;
  videoData: VideoData;
  selectedOption: VideoFormat | null;
  audioTracks: AudioTrackOption[];
  selectedLang: string;
  setSelectedLang: (lang: string) => void;
  onRetry?: () => void;
}) => (
  // skipcq: JS-0415
  <motion.div
    key="view-mode"
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 20 }}
    className="flex flex-col gap-4"
  >
    <div className="flex justify-between items-start gap-3">
      <div className="flex-1 min-w-0">
        <h3
          className="text-white font-bold text-lg leading-tight line-clamp-2 break-words"
          title={editedTitle}
        >
          {editedTitle}
        </h3>
        <p className="text-gray-400 text-xs mt-1 font-medium truncate">
          {editedArtist ||
            (selectedFormat === 'mp4'
              ? 'Unknown Author'
              : 'Unknown Artist')}{' '}
          {editedAlbum ? `• ${editedAlbum}` : ''}
        </p>
        <div className="flex gap-3 items-center">
          <p className="text-gray-500 text-[10px] flex items-center gap-1 mt-2">
            {selectedFormat === 'mp4' ? (
              <FormatIcon size={14} />
            ) : (
              <Music className="text-cyan-400" size={13} />
            )}
            Format:{' '}
            <span className="text-gray-300 font-semibold">
              {selectedFormat.toUpperCase()}
            </span>
          </p>
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 bg-white/5 hover:bg-white/10 rounded-md mt-1 text-cyan-400 hover:text-cyan-300 border-[0.7px] transition-colors shrink-0 shadow-sm border border-cyan-400"
          >
            <SquarePen size={17} />
          </button>
          <DubSelector
            tracks={audioTracks}
            selectedLang={selectedLang}
            onSelectLang={setSelectedLang}
          />
        </div>
      </div>
    </div>

    <QualitySelectionShared
      options={options}
      isDropdownOpen={isDropdownOpen}
      setIsDropdownOpen={setIsDropdownOpen}
      selectedOption={selectedOption}
      setSelectedQualityId={setSelectedQualityId}
      handleDownloadClick={handleDownloadClick}
      dropdownRef={dropdownRef}
      selectedQualityId={selectedQualityId}
      isPartial={videoData?.isPartial}
      onRetry={onRetry}
    />
  </motion.div>
);

const FooterContent = ({
  videoData,
  selectedFormat,
  selectedOption,
}: {
  videoData: VideoData;
  selectedFormat: string;
  selectedOption: VideoFormat | null;
}) => (
  <p className="text-[10px] text-gray-500 text-center leading-tight">
    {videoData?.isPartial && (
      <>
        Authoritative Stream Identification in Progress...
        <br />
      </>
    )}
    {selectedFormat === 'mp3' ? (
      <span className="text-cyan-500/80">
        Learn about format differences.&nbsp;
        <a
          href="/formats.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-bold hover:text-cyan-400 transition-colors"
        >
          Read guide
        </a>
      </span>
    ) : (
      selectedOption?.height &&
      selectedOption.height >= 2160 && (
        <span className="text-cyan-500/80">
          Choosing 4k+? Let&apos;s check if your device supports it. &nbsp;
          <a
            href="/#faq"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-bold hover:text-cyan-400 transition-colors"
          >
            Read guide
          </a>
        </span>
      )
    )}
  </p>
);

const FooterSection = ({
  isEditing,
  videoData,
  selectedFormat,
  selectedOption,
}: {
  isEditing: boolean;
  videoData: VideoData;
  selectedFormat: string;
  selectedOption: VideoFormat | null;
}) => (
  <div className="p-4 border-t border-white/5 bg-black/20 flex flex-col items-center gap-1 rounded-b-3xl">
    {!isEditing ? (
      <FooterContent
        videoData={videoData}
        selectedFormat={selectedFormat}
        selectedOption={selectedOption}
      />
    ) : (
      <p className="text-[10px] text-gray-500">
        Changes will update file info when you download.
      </p>
    )}
  </div>
);

const StandardQualityPicker = ({
  isOpen,
  onClose,
  selectedFormat = 'mp4',
  videoData,
  onSelect,
  onRetry,
}: StandardQualityPickerProps) => {
  const audioTracks = useMemo(
    () => deriveAudioTracks(videoData?.audioFormats),
    [videoData]
  );

  const [selectedLang, setSelectedLang] = useState('');

  const effectiveLang = useMemo(() => {
    if (audioTracks.length === 0) return '';
    const isValid = audioTracks.some(
      (track) => track.language === selectedLang
    );
    if (isValid) return selectedLang;
    return (audioTracks.find((track) => track.isOriginal) || audioTracks[0])
      .language;
  }, [audioTracks, selectedLang]);

  const options = useMemo(() => {
    const base = getInitialOptions(selectedFormat, videoData);
    if (selectedFormat === 'mp3' && audioTracks.length > 1 && effectiveLang) {
      return base.filter(
        (opt) =>
          !opt.language ||
          opt.language === effectiveLang ||
          String(opt.formatId) === 'mp3_synthetic'
      );
    }
    return base;
  }, [selectedFormat, videoData, audioTracks, effectiveLang]);

  const backendUrl = useAppStore((state) => state.backendUrl) || BACKEND_URL;
  const clientId = useAppStore((state) => state.clientId);

  const [selectedQualityId, setSelectedQualityId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedArtist, setEditedArtist] = useState('');
  const [editedAlbum, setEditedAlbum] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // overlay handles its own esc/focus while open
  useModalA11y(isOpen && !isPreviewOpen, onClose, panelRef);

  // reset transient ui on picker open
  useEffect(() => {
    if (isOpen) {
      setIsEditing(false);
      setIsDropdownOpen(false);
      setIsPreviewOpen(false);
    }
  }, [isOpen]);

  // seed editable fields from current metadata
  useEffect(() => {
    if (isOpen && videoData) {
      setEditedTitle(videoData.title || '');
      setEditedArtist(videoData.artist || '');
      setEditedAlbum(videoData.album || '');
    }
  }, [isOpen, videoData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // user pick if valid, else first
  const effectiveQualityId = useMemo(() => {
    const firstId = options[0]?.formatId ? String(options[0].formatId) : '';
    const isValid = options.some(
      (option) => String(option.formatId) === String(selectedQualityId)
    );
    return isValid ? selectedQualityId : firstId;
  }, [options, selectedQualityId]);

  const selectedOption = useMemo(() => {
    const safeOptions = Array.isArray(options) ? options : [];
    return safeOptions.length > 0
      ? safeOptions.find(
          (option) => String(option?.formatId) === String(effectiveQualityId)
        ) || safeOptions[0]
      : null;
  }, [options, effectiveQualityId]);

  if (!videoData) return null;

  const handleDownloadClick = () => {
    onSelect(effectiveQualityId, {
      title: editedTitle,
      artist: editedArtist,
      album: editedAlbum,
      extension: selectedOption?.ext || selectedOption?.extension,
      audioLang: audioTracks.length > 1 ? effectiveLang : undefined,
    });
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60"
            style={{ zIndex: -1, willChange: 'opacity' }}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-lg bg-gray-900 border border-cyan-500/30 rounded-3xl overflow-visible shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col max-h-[90vh] outline-none"
            style={{ willChange: 'transform, opacity' }}
          >
            <ModalHeader onClose={onClose} />
            <ThumbnailSection
              thumbnail={videoData.thumbnail}
              selectedFormat={selectedFormat}
              onPlay={() => setIsPreviewOpen(true)}
              onPrefetch={() => {
                if (videoData.webpageUrl && effectiveQualityId) {
                  prefetchStreamUrls(
                    backendUrl,
                    videoData.webpageUrl,
                    effectiveQualityId,
                    clientId
                  );
                }
              }}
            />

            <div className="p-6 flex flex-col gap-4 overflow-y-visible relative">
              <AnimatePresence mode="wait">
                {!isEditing ? (
                  <ViewModeUI
                    editedTitle={editedTitle}
                    editedArtist={editedArtist}
                    editedAlbum={editedAlbum}
                    selectedFormat={selectedFormat}
                    setIsEditing={setIsEditing}
                    options={options}
                    isDropdownOpen={isDropdownOpen}
                    setIsDropdownOpen={setIsDropdownOpen}
                    setSelectedQualityId={setSelectedQualityId}
                    handleDownloadClick={handleDownloadClick}
                    dropdownRef={dropdownRef}
                    selectedQualityId={effectiveQualityId}
                    videoData={videoData}
                    selectedOption={selectedOption}
                    audioTracks={audioTracks}
                    selectedLang={effectiveLang}
                    setSelectedLang={setSelectedLang}
                    onRetry={onRetry}
                  />
                ) : (
                  <EditModeUIShared
                    editedTitle={editedTitle}
                    setEditedTitle={setEditedTitle}
                    editedArtist={editedArtist}
                    setEditedArtist={setEditedArtist}
                    editedAlbum={editedAlbum}
                    setEditedAlbum={setEditedAlbum}
                    selectedFormat={selectedFormat}
                    videoData={videoData}
                    setIsEditing={setIsEditing}
                  />
                )}
              </AnimatePresence>
            </div>

            <FooterSection
              isEditing={isEditing}
              videoData={videoData}
              selectedFormat={selectedFormat}
              selectedOption={selectedOption}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(
    <>
      {modalContent}
      <VideoPreviewOverlay
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pageUrl={videoData.webpageUrl}
        formatId={effectiveQualityId || undefined}
        title={editedTitle}
        poster={videoData.thumbnail}
      />
    </>,
    document.body
  );
};

export default StandardQualityPicker;
