import React from 'react';
import { useLocation } from 'react-router';
import Header from './Header';
import TwinkleStars from './ui/TwinkleStars';
import ShootingStars from './ui/ShootingStars';
import ErudaLoader from './utils/ErudaLoader';
import NavTabs from './ui/NavTabs';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const isHome = location.pathname === '/';
  return (
    <div className="flex flex-col min-h-dvh w-full relative overflow-hidden">
      <ErudaLoader />
      {isHome && <TwinkleStars />}
      {isHome && <ShootingStars />}

      {isHome && <Header />}

      <main
        id="main-content"
        className="grow flex items-center justify-center pb-[50px] md:pb-0"
      >
        {children}
      </main>

      <NavTabs />

      <footer className="px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] shrink-0 relative flex flex-col items-center justify-center gap-4">
        {isHome && (
          <p className="hidden md:block text-xs text-white/90 text-center max-w-md leading-relaxed">
            use responsibly · respect copyright
          </p>
        )}
        <div className="sr-only">
          <h2>
            Free Video and Audio Downloader for YouTube, Spotify, TikTok,
            Instagram and More
          </h2>
          <p>
            Phantom is a free, ad-free online tool to download high-quality
            video and audio from YouTube, Spotify, TikTok, Instagram, Facebook,
            and SoundCloud. Convert YouTube videos to 4K MP4 or 320kbps MP3,
            download Spotify playlists, and save TikTok videos without
            watermark — all in your browser, with no registration required.
          </p>
        </div>
        {/* <div className="absolute right-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:right-4 sm:bottom-4 md:left-1/2 md:translate-x-[50px] md:bottom-auto md:top-1/2 md:-translate-y-1/2">
          <SupportButton />
        </div> */}
      </footer>
    </div>
  );
};

export default Layout;
