import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Download, Languages } from 'lucide-react';
import FormatIcon from '../../assets/icons/FormatIcon';
import { formatSize, getQualityLabel } from '../../lib/utils';

// hide fps badge for audio streams
export const getFpsBadgeLabel = (
  fps?: string | number,
  suffix = 'fps'
): string | null => {
  if (!fps) return null;
  return fps === 'FAST' ? 'FAST' : `${fps}${suffix}`;
};

// tag source aac as original master
export const tagOriginalMaster = <
  T extends { ext?: string; extension?: string; quality?: string },
>(
  options: T[]
): T[] =>
  options.map((option) =>
    (option.ext === 'm4a' || option.extension === 'm4a') &&
    !option.quality?.includes('(Original Master)')
      ? { ...option, quality: `${option.quality ?? 'Audio'} (Original Master)` }
      : option
  );

const Shimmer = () => (
  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_1.5s_infinite]" />
);

interface QualityDropdownPlaceholderProps {
  isMobile?: boolean;
}

const QualityDropdownPlaceholder = ({
  isMobile,
}: QualityDropdownPlaceholderProps) => (
  <div className="w-full h-[58px] bg-white/5 border border-white/10 rounded-2xl flex items-center px-4 justify-between">
    <div className="flex flex-col gap-1.5 w-full">
      <div className="h-3.5 w-[60%] bg-white/10 rounded-lg relative overflow-hidden">
        <Shimmer />
      </div>
      <div className="h-2.5 w-[30%] bg-white/5 rounded-lg relative overflow-hidden">
        <Shimmer />
      </div>
    </div>
    <ChevronDown className="text-gray-600 shrink-0" size={isMobile ? 18 : 20} />
  </div>
);

interface OptionBadgeProps {
  label: string;
  type?: 'default' | 'amber';
}

const OptionBadge = ({ label, type = 'default' }: OptionBadgeProps) => {
  const styles =
    type === 'amber'
      ? 'bg-amber-500/20 text-amber-300'
      : 'bg-cyan-500/20 text-cyan-300';
  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter shrink-0 ${styles}`}
    >
      {label}
    </span>
  );
};

interface QualityOptionData {
  quality?: string;
  fps?: string | number;
  filesize?: number;
  extension?: string;
  ext?: string;
  formatId: string;
}

interface QualityOptionProps {
  option: QualityOptionData;
  isSelected: boolean;
  onSelect: () => void;
}

const QualityOption = ({
  option,
  isSelected,
  onSelect,
}: QualityOptionProps) => {
  const fileExtension = (option.ext || option.extension || 'RAW').toUpperCase();
  const fpsLabel = getFpsBadgeLabel(option.fps, ' FPS');
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const finalId = option.formatId ? String(option.formatId) : '';
        if (finalId && finalId !== 'undefined') {
          onSelect();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={`w-full px-4 py-3 text-left hover:bg-cyan-500/5 transition-all flex items-center justify-between group relative ${isSelected ? 'text-cyan-400' : 'text-gray-300'}`}
    >
      {isSelected && (
        <motion.div
          layoutId="active-bg"
          className="absolute inset-0 bg-cyan-500/10 border-l-2 border-cyan-500"
        />
      )}
      <div className="flex flex-col relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold whitespace-nowrap">
            {getQualityLabel(option.quality)}
          </span>
          {option.quality?.includes('(Original Master)') && (
            <OptionBadge label="Original Master" type="amber" />
          )}
          {fpsLabel && <OptionBadge label={fpsLabel} />}
        </div>
        <span className="text-[10px] text-cyan-400/40 group-hover:text-cyan-400/70 transition-colors font-medium mt-0.5">
          {formatSize(option.filesize)} • {fileExtension}
        </span>
      </div>
      {isSelected && (
        <div className="bg-cyan-500/20 p-1 rounded-full relative z-10">
          <Check size={12} strokeWidth={4} />
        </div>
      )}
    </button>
  );
};

interface QualitySelectionSharedProps {
  options: QualityOptionData[];
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  selectedOption: QualityOptionData | null;
  setSelectedQualityId: (id: string) => void;
  handleDownloadClick: () => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  selectedQualityId: string;
  isPartial?: boolean;
  isMobile?: boolean;
  onRetry?: () => void;
}

export const QualitySelectionShared = ({
  options,
  isDropdownOpen,
  setIsDropdownOpen,
  selectedOption,
  setSelectedQualityId,
  handleDownloadClick,
  dropdownRef,
  selectedQualityId,
  isPartial,
  isMobile = false,
  onRetry,
}: QualitySelectionSharedProps) => {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!isPartial) {
      setStalled(false);
      return undefined;
    }
    setStalled(false);
    const timer = setTimeout(() => setStalled(true), 60000);
    return () => clearTimeout(timer);
  }, [isPartial]);

  const getOutputLabel = () => {
    if (isPartial) return stalled ? 'Resolution is slow' : 'Syncing...';
    return 'Select Output Quality';
  };

  const selectedFpsLabel = getFpsBadgeLabel(selectedOption?.fps);

  // prevent arrow-key scroll when open
  useEffect(() => {
    if (!isDropdownOpen) return undefined;

    const listbox = dropdownRef.current?.querySelector(
      '[role="listbox"]'
    ) as HTMLElement;
    if (listbox) {
      setTimeout(() => listbox.focus(), 100);
    }

    const preventArrowScroll = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // skip when inside the listbox
        const target = e.target as HTMLElement;
        const isInsideListbox = target.closest('[role="listbox"]');
        if (!isInsideListbox) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', preventArrowScroll, { capture: true });
    return () =>
      window.removeEventListener('keydown', preventArrowScroll, {
        capture: true,
      });
  }, [isDropdownOpen, dropdownRef]);

  return (
    <div className="space-y-2 mt-2 relative">
      <p className="text-cyan-400 text-[10px] font-black uppercase tracking-[0.15em] ml-1 opacity-80">
        {getOutputLabel()}
      </p>
      <div className="flex gap-2.5 relative">
        <div className="relative flex-1" ref={dropdownRef}>
          {isPartial && stalled && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="w-full h-[58px] bg-white/5 border border-amber-500/30 rounded-2xl flex items-center justify-between px-4 text-amber-300 hover:bg-white/10 transition-all"
            >
              <span className="text-xs font-bold">
                Taking longer than usual
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider">
                Retry
              </span>
            </button>
          ) : isPartial ? (
            <QualityDropdownPlaceholder isMobile={isMobile} />
          ) : options.length > 0 ? (
            // skipcq: JS-0415
            <>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (!isDropdownOpen) {
                      setIsDropdownOpen(true);
                    }
                  }
                }}
                aria-haspopup="listbox"
                aria-expanded={isDropdownOpen}
                className={`w-full h-full bg-white/5 border ${isDropdownOpen ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'border-white/10'} rounded-2xl py-3.5 px-4 text-white text-left focus:outline-none hover:bg-white/10 transition-all ${isMobile ? 'text-xs sm:text-sm' : 'text-sm'} font-bold flex items-center justify-between group overflow-hidden`}
              >
                <div className="flex flex-col min-w-0 flex-1 mr-2">
                  <div className="flex items-center gap-2">
                    <span className="tracking-tight truncate">
                      {getQualityLabel(selectedOption?.quality)}
                    </span>
                    {selectedOption?.quality?.includes('(Original Master)') && (
                      <OptionBadge label="Original Master" type="amber" />
                    )}
                    {selectedFpsLabel && (
                      <OptionBadge label={selectedFpsLabel} />
                    )}
                  </div>
                  <span className="text-[10px] text-cyan-400/60 font-medium mt-0.5 truncate">
                    {formatSize(selectedOption?.filesize)} •{' '}
                    {(
                      selectedOption?.ext ||
                      selectedOption?.extension ||
                      'RAW'
                    ).toUpperCase()}
                  </span>
                </div>
                <ChevronDown
                  className={`text-gray-400 shrink-0 transition-all duration-500 ${isDropdownOpen ? 'rotate-180 text-cyan-400 scale-110' : 'group-hover:text-white'}`}
                  size={isMobile ? 18 : 20}
                />
              </motion.button>

              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className="absolute bottom-full left-0 w-full mb-3 bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/20 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_20px_rgba(6,182,212,0.1)] z-[100] overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-white/5 bg-white/5 backdrop-blur-md">
                      <span className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]">
                        Available Streams
                      </span>
                    </div>
                    <div
                      role="listbox"
                      tabIndex={0}
                      className="max-h-44 overflow-y-auto custom-scrollbar mb-4 mt-1 mx-1.5 py-1 focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();

                          const currentIndex = options.findIndex(
                            (opt) =>
                              String(opt.formatId) === String(selectedQualityId)
                          );

                          let nextIndex = currentIndex;
                          if (e.key === 'ArrowDown') {
                            nextIndex =
                              currentIndex < options.length - 1
                                ? currentIndex + 1
                                : 0;
                          } else if (e.key === 'ArrowUp') {
                            nextIndex =
                              currentIndex > 0
                                ? currentIndex - 1
                                : options.length - 1;
                          }

                          if (options[nextIndex]) {
                            setSelectedQualityId(
                              String(options[nextIndex].formatId)
                            );
                            const container = e.currentTarget;
                            const buttons = container.querySelectorAll(
                              'button[role="option"]'
                            );
                            buttons[nextIndex]?.scrollIntoView({
                              block: 'nearest',
                              behavior: 'smooth',
                            });
                          }
                        } else if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDropdownOpen(false);
                        }
                      }}
                    >
                      {options.map((option) => (
                        <QualityOption
                          key={option.formatId}
                          option={option}
                          isSelected={
                            String(selectedQualityId) ===
                            String(option.formatId)
                          }
                          onSelect={() => {
                            setSelectedQualityId(String(option.formatId));
                            setIsDropdownOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="w-full h-[58px] bg-white/5 rounded-2xl flex items-center px-4 border border-dashed border-white/10">
              <p className="text-gray-500 text-[10px] italic">
                No formats found.
              </p>
            </div>
          )}
        </div>

        <motion.button
          whileHover={!isPartial ? { scale: 1.02 } : {}}
          whileTap={!isPartial ? { scale: 0.98 } : {}}
          disabled={isPartial}
          onClick={handleDownloadClick}
          className={`${isPartial ? 'bg-gray-800 border-gray-700 cursor-not-allowed text-gray-500' : 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-[0_10px_20px_rgba(6,182,212,0.3)] border-cyan-400/30'} ${isMobile ? 'px-4 sm:px-7' : 'px-7'} py-3 rounded-2xl flex items-center gap-2 font-black transition-all border shrink-0`}
        >
          {isPartial ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <FormatIcon size={20} className="opacity-50" />
            </motion.div>
          ) : (
            <Download size={22} strokeWidth={2.5} />
          )}
          <span className="hidden sm:inline uppercase text-xs tracking-wider">
            {isPartial ? 'Syncing...' : 'Get File'}
          </span>
        </motion.button>
      </div>
    </div>
  );
};

interface EditModeUISharedProps {
  editedTitle: string;
  setEditedTitle: (val: string) => void;
  editedArtist: string;
  setEditedArtist: (val: string) => void;
  editedAlbum: string;
  setEditedAlbum: (val: string) => void;
  selectedFormat?: string;
  videoData: {
    title?: string;
    artist?: string;
    album?: string;
    [key: string]: unknown;
  } | null;
  setIsEditing: (val: boolean) => void;
  isSpotify?: boolean;
}

const FormField = ({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  hint?: string;
}) => (
  <div className="space-y-1 flex-1">
    <div className="flex gap-1 text-gray-400 items-center">
      <label className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider ml-1">
        {label}
      </label>
      {hint && <p className="text-[9px]">{hint}</p>}
    </div>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:bg-black/40 transition-all placeholder-gray-600"
    />
  </div>
);

export const EditModeUIShared = ({
  editedTitle,
  setEditedTitle,
  editedArtist,
  setEditedArtist,
  editedAlbum,
  setEditedAlbum,
  selectedFormat,
  videoData,
  setIsEditing,
  isSpotify = false,
}: EditModeUISharedProps) => {
  const isAudio = isSpotify || selectedFormat !== 'mp4';
  const handleCancel = () => {
    if (!videoData) return;
    setEditedTitle(videoData.title || '');
    setEditedArtist(videoData.artist || '');
    setEditedAlbum(videoData.album || '');
    setIsEditing(false);
  };

  return (
    <motion.div
      key="edit-mode"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-3">
        <FormField
          label="Title"
          value={editedTitle}
          onChange={setEditedTitle}
          placeholder="Enter title"
        />
        <div className="flex gap-3 items-center">
          <FormField
            label={isAudio ? 'Artist' : 'Author'}
            value={editedArtist}
            onChange={setEditedArtist}
            placeholder={isAudio ? 'Enter artist' : 'Enter author'}
          />
          {isAudio && (
            <FormField
              label="Album"
              value={editedAlbum}
              onChange={setEditedAlbum}
              placeholder="Enter album"
              hint="(optional)"
            />
          )}
        </div>
      </div>
      <div className="flex gap-3 mt-2">
        <button
          onClick={handleCancel}
          className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={() => setIsEditing(false)}
          className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-cyan-500/20 text-sm flex items-center justify-center gap-1"
        >
          <Check size={16} strokeWidth={4} />
          Save Changes
        </button>
      </div>
    </motion.div>
  );
};

export interface AudioTrackOption {
  language: string;
  languageName: string;
  isOriginal?: boolean;
}

interface AudioFormatLike {
  language?: string;
  languageName?: string;
  isOriginal?: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  'es-419': 'Spanish (Latin America)',
  'es-us': 'Spanish (US)',
  pt: 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  fr: 'French',
  de: 'German',
  hi: 'Hindi',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  ar: 'Arabic',
  tr: 'Turkish',
  vi: 'Vietnamese',
  th: 'Thai',
  pl: 'Polish',
  nl: 'Dutch',
  fil: 'Filipino',
  tl: 'Tagalog',
  bn: 'Bengali',
  zh: 'Chinese',
  uk: 'Ukrainian',
};

const labelForLanguage = (code: string, fallbackName?: string): string => {
  if (fallbackName) return fallbackName;
  const lower = code.toLowerCase();
  return (
    LANGUAGE_LABELS[lower] ||
    LANGUAGE_LABELS[lower.split('-')[0]] ||
    code.toUpperCase()
  );
};

// empty list hides the dub control
export const deriveAudioTracks = (
  audioFormats: AudioFormatLike[] = []
): AudioTrackOption[] => {
  const byLang = new Map<string, AudioTrackOption>();
  for (const format of audioFormats) {
    if (!format?.language) continue;
    const existing = byLang.get(format.language);
    if (!existing) {
      byLang.set(format.language, {
        language: format.language,
        languageName: labelForLanguage(format.language, format.languageName),
        isOriginal: format.isOriginal,
      });
    } else if (format.isOriginal && !existing.isOriginal) {
      existing.isOriginal = true;
    }
  }
  return Array.from(byLang.values()).sort((trackA, trackB) => {
    const origA = trackA.isOriginal ? 1 : 0;
    const origB = trackB.isOriginal ? 1 : 0;
    if (origA !== origB) return origB - origA;
    return trackA.languageName.localeCompare(trackB.languageName);
  });
};

interface DubSelectorProps {
  tracks: AudioTrackOption[];
  selectedLang: string;
  onSelectLang: (lang: string) => void;
}

export const DubSelector = ({
  tracks,
  selectedLang,
  onSelectLang,
}: DubSelectorProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (tracks.length < 2) return null;

  const selected =
    tracks.find((track) => track.language === selectedLang) || tracks[0];

  return (
    // skipcq: JS-0415
    <div className="relative mt-1" ref={ref}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Audio language"
        title={`Audio: ${selected.languageName}`}
        className={`relative p-1 rounded-md border border-cyan-400 shrink-0 shadow-sm transition-colors ${
          open || !selected.isOriginal
            ? 'bg-cyan-500/15 text-cyan-300'
            : 'bg-white/5 hover:bg-white/10 text-cyan-400 hover:text-cyan-300'
        }`}
      >
        <Languages size={17} />
        {!selected.isOriginal && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.9)]" />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="absolute bottom-full left-0 mb-2 w-52 origin-bottom bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] z-[110] overflow-hidden"
          >
            <div className="px-4 pt-2.5 pb-2 border-b border-white/5">
              <span className="text-[9px] font-bold text-cyan-400/70 uppercase tracking-[0.18em] whitespace-nowrap">
                Available Dubs
              </span>
            </div>
            <div
              role="listbox"
              className="max-h-48 overflow-y-auto custom-scrollbar p-1.5"
            >
              {tracks.map((track) => {
                const isSelected = track.language === selected.language;
                return (
                  <button
                    key={track.language}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelectLang(track.language);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between gap-2 transition-colors ${isSelected ? 'bg-cyan-500/10 text-cyan-300' : 'text-gray-300 hover:bg-white/5'}`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold truncate">
                        {track.languageName}
                      </span>
                      {track.isOriginal && (
                        <OptionBadge label="Original" type="amber" />
                      )}
                    </span>
                    {isSelected && (
                      <Check size={13} strokeWidth={3} className="shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
