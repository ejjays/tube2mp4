import { isHost } from '../lib/utils';
import { lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link as LinkIcon } from 'lucide-react';
import MusicIcon from '../assets/icons/MusicIcon';
import PasteIcon from '../assets/icons/PasteIcon';
import GlowButton from './ui/GlowButton';
import VideoIcon from '../assets/icons/VideoIcon';
import PurpleBackground from './ui/PurpleBackground';
import MobileProgress from './MobileProgress';
import DesktopProgress from './DesktopProgress';
import { useMediaConverter } from '../hooks/useMediaConverter';
import { useAppStore } from '../store/useAppStore';
import StandardQualityPicker from './modals/StandardQualityPicker';
import MobileSpotifyPicker from './modals/MobileSpotifyPicker';
import SEO from './utils/SEO';
import { PlayerData } from '../types/player';

const MusicPlayerCard = lazy(() => import('./MusicPlayerCard'));
import PhantomHero from '../assets/icons/PhantomHero';

type HeroProps = {
  isVisible: boolean;
};

const HeroSection = ({ isVisible }: HeroProps) => (
  <div className="relative flex flex-col items-center justify-center gap-4">
    <div className="relative">
      <PhantomHero isVisible={isVisible} />
      {/* <div className="absolute -right-4 -top-2 sm:-right-6 sm:-top-4 md:-right-14 md:-top-2 z-20">
        <DocsButton />
      </div> */}
    </div>

    <div className="sr-only">
      <h1>Phantom | 4K Media Converter</h1>
      <p>Ultimate Youtube & Spotify Downloader</p>
    </div>
  </div>
);

const FormatButton = ({
  active,
  onClick,
  disabled,
  icon: Icon,
  label,
  'aria-label': ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ElementType;
  label: string;
  'aria-label'?: string;
}) => (
  <button
    disabled={disabled}
    onClick={onClick}
    aria-label={ariaLabel}
    aria-pressed={active}
    aria-disabled={disabled}
    className={`btns flex-1 relative overflow-hidden transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset ${
      active
        ? 'scale-105 z-10 shadow-inner !text-white'
        : 'hover:bg-white/10 text-black'
    } ${disabled ? 'opacity-40 filter grayscale-[0.8] cursor-not-allowed' : ''}`}
  >
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0"
        >
          <PurpleBackground />
        </motion.div>
      )}
    </AnimatePresence>
    <div className="relative z-10 flex items-center gap-2">
      {typeof Icon === 'function' ? (
        <Icon
          size={label === 'Video' ? 29 : 24}
          className={label === 'Video' ? 'text-cyan-900' : undefined}
          color={label === 'Audio' ? (active ? '#fff' : '#000') : undefined}
          aria-hidden="true"
        />
      ) : (
        Icon
      )}
      <span className="truncate">{label}</span>
    </div>
  </button>
);

const FormatPicker = ({
  url,
  selectedFormat,
  setSelectedFormat,
  handlePaste,
}: {
  url: string;
  selectedFormat: string;
  setSelectedFormat: (format: string) => void;
  handlePaste: () => void | Promise<void>;
}) => (
  <div className="w-full max-w-md mt-1">
    <div className="flex bg-cyan-500 w-full rounded-2xl divide-x divide-white/30 overflow-hidden shadow-lg border-[0.5px] border-cyan-400/50">
      <FormatButton
        label="Video"
        active={selectedFormat === 'mp4'}
        disabled={isHost(url, 'spotify.com')}
        onClick={() => setSelectedFormat('mp4')}
        icon={VideoIcon}
        aria-label={
          isHost(url, 'spotify.com')
            ? 'Video format (unavailable for Spotify links)'
            : selectedFormat === 'mp4'
              ? 'Video (MP4) format selected'
              : 'Select Video (MP4) format'
        }
      />
      <FormatButton
        label="Audio"
        active={selectedFormat === 'mp3'}
        onClick={() => setSelectedFormat('mp3')}
        icon={MusicIcon}
        aria-label={
          selectedFormat === 'mp3'
            ? 'Audio (MP3) format selected'
            : 'Select Audio (MP3) format'
        }
      />
      <button
        className="btns flex-1 hover:bg-white/10 transition-all text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
        onClick={() => handlePaste()}
        aria-label="Paste URL from clipboard"
      >
        <PasteIcon size={24} />
        <span className="truncate">Paste</span>
      </button>
    </div>
  </div>
);

const SearchInput = ({
  url,
  setUrl,
}: {
  url: string;
  setUrl: (url: string) => void;
}) => (
  <div className="w-full max-w-md flex items-center relative">
    <label htmlFor="url-input" className="sr-only">
      Media URL (YouTube, Spotify, TikTok, Instagram, Facebook, SoundCloud)
    </label>
    <div className="absolute inset-y-0 left-1 flex items-center pl-1">
      <div className="relative flex items-center justify-center">
        <span className="animate-ping absolute inline-flex h-2/3 w-2/3 rounded-full bg-cyan-500 opacity-50"></span>
        <span className="relative p-1 rounded-full flex items-center justify-center">
          <LinkIcon className="w-5 h-5 text-cyan-500" aria-hidden="true" />
        </span>
      </div>
    </div>
    <input
      id="url-input"
      className="border-cyan-400 border-2 p-2 w-full rounded-xl placeholder-gray-400 pl-10 focus:outline-none bg-black/30 text-white"
      type="url"
      placeholder="paste your link here"
      value={url}
      onChange={(e) => setUrl(e.target.value)}
      aria-label="Paste media URL from YouTube, Spotify, TikTok, Instagram, Facebook, or SoundCloud"
    />
  </div>
);

const A11yAnnouncement = ({
  loading,
  status,
  error,
}: {
  loading: boolean;
  status: string;
  error: string;
}) => {
  const progress = useAppStore((state) => state.progress);
  const subStatus = useAppStore((state) => state.subStatus);
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {loading && status && (subStatus ? `${status}: ${subStatus}` : status)}
      {error && `Error: ${error}`}
      {progress > 0 &&
        progress < 100 &&
        `Download progress: ${Math.round(progress)}%`}
    </div>
  );
};

const MainContent = () => {
  const url = useAppStore((state) => state.url);
  const setUrl = useAppStore((state) => state.setUrl);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const status = useAppStore((state) => state.status);
  const videoData = useAppStore((state) => state.videoData);
  const isPickerOpen = useAppStore((state) => state.isPickerOpen);
  const setIsPickerOpen = useAppStore((state) => state.setIsPickerOpen);
  const selectedFormat = useAppStore((state) => state.selectedFormat);
  const setSelectedFormat = useAppStore((state) => state.setSelectedFormat);
  const showPlayer = useAppStore((state) => state.showPlayer);
  const setShowPlayer = useAppStore((state) => state.setShowPlayer);
  const playerData = useAppStore(
    (state) => state.playerData
  ) as PlayerData | null;

  const {
    isMobile,
    isSpotifySession,
    handleDownloadTrigger,
    handleDownload,
    cancelDownload,
    requestClipboard,
  } = useMediaConverter();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          try {
            const text = await navigator.clipboard.readText();
            setUrl(text);
            // focus the input after pasting
            document.getElementById('url-input')?.focus();
          } catch (err) {
            console.error('Failed to read clipboard:', err);
          }
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const demoUrl =
          'https://open.spotify.com/track/5dbNhoJHwTFykNZJnCBMuL?si=bJUpF9PvSmGFkyaM3Rontg';
        setUrl(demoUrl);
      }

      if (e.key === 'Enter' && !loading && url) {
        e.preventDefault();
        handleDownloadTrigger();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [url, loading, setUrl, handleDownloadTrigger]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl =
      params.get('url') || params.get('text') || params.get('title');

    if (sharedUrl) {
      const urlMatch = sharedUrl.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        const finalUrl = urlMatch[0];
        setUrl(finalUrl);
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        setTimeout(() => {
          handleDownloadTrigger(finalUrl);
        }, 100);
      }
    }
  }, [handleDownloadTrigger, setUrl]);

  const isVisible = Boolean(
    status !== 'idle' || loading || error || isPickerOpen
  );

  return (
    <>
      <SEO
        title="YouTube, Spotify, TikTok & Instagram Downloader · 4K MP3"
        description="Free downloader & converter for YouTube, Spotify, TikTok, Instagram, Facebook, SoundCloud. 4K video, 320kbps MP3, AI stem separation. No ads, no signup."
        canonicalUrl="/"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Phantom',
          operatingSystem: 'All',
          applicationCategory: 'MultimediaApplication',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
          description:
            'Free downloader & converter for YouTube, Spotify, TikTok, Instagram, Facebook, and SoundCloud. 4K video, 320kbps MP3, AI stem separation, no signup.',
        }}
      />
      {/* screen reader announcements */}
      <A11yAnnouncement
        loading={loading}
        status={status}
        error={error}
      />
      <div className="flex flex-col justify-center items-center w-full gap-3 px-4 transition-transform duration-500 ease-in-out">
        <HeroSection isVisible={isVisible} />
        <SearchInput url={url} setUrl={setUrl} />
        <FormatPicker
          url={url}
          selectedFormat={selectedFormat}
          setSelectedFormat={setSelectedFormat}
          handlePaste={async () => {
            const isMobileApp = requestClipboard();
            if (!isMobileApp) {
              try {
                const text = await navigator.clipboard.readText();
                setUrl(text);
              } catch (err) {
                console.error('Failed to read clipboard:', err);
              }
            }
          }}
        />
        <div className="pt-2">
          <GlowButton
            text={loading ? 'Processing...' : 'Convert & Download'}
            onClick={() => handleDownloadTrigger()}
            disabled={loading}
          />
        </div>

        <Suspense fallback={null}>
          {isSpotifySession && isMobile ? (
            <MobileSpotifyPicker
              isOpen={isPickerOpen}
              onClose={() => setIsPickerOpen(false)}
              videoData={videoData as Record<string, unknown>}
              onSelect={(qualityId, metadata) =>
                handleDownload(
                  metadata?.extension || 'mp3',
                  qualityId,
                  metadata
                )
              }
            />
          ) : (
            <StandardQualityPicker
              isOpen={isPickerOpen}
              onClose={() => setIsPickerOpen(false)}
              selectedFormat={selectedFormat}
              videoData={videoData as Record<string, unknown>}
              onSelect={(qualityId, metadata) =>
                handleDownload(
                  metadata?.extension || selectedFormat,
                  qualityId,
                  metadata
                )
              }
              onRetry={() => handleDownloadTrigger()}
            />
          )}

          <MusicPlayerCard
            isVisible={showPlayer}
            data={playerData}
            onClose={() => setShowPlayer(false)}
          />
        </Suspense>

        <MobileProgress onCancel={cancelDownload} />

        <DesktopProgress onCancel={cancelDownload} />
      </div>
      {/* <FloatingMenu /> */}
    </>
  );
};

export default MainContent;
